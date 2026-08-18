import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { deleteHtml, pageKey, putHtml } from "../lib/storage";
import type { Auth } from "../auth";
import type { Env } from "../env";
import { requireAuth, type UserVar } from "../lib/auth-mw";

/** slugify a title into a URL-safe, unique-ish id fragment. */
function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page"
  );
}

type ApiApp = {
  Variables: { user: UserVar };
  Bindings: Env;
};

export function createApi(getAuth: (env: Env) => Auth) {
  const api = new Hono<ApiApp>();

  // Current user (used by the app shell to decide login vs dashboard).
  api.get("/me", async (c) => {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return c.json({ error: "unauthorized" }, 401);
    return c.json({
      user: { id: session.user.id, email: session.user.email, name: session.user.name, image: session.user.image ?? null },
    });
  });

  // ---- Pages CRUD (requires auth) ----
  api.use("/pages", requireAuth((c) => getAuth(c.env)));

  api.get("/pages", async (c) => {
    const user = c.get("user");
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(schema.page)
      .where(eq(schema.page.userId, user.id))
      .orderBy(schema.page.updatedAt);
    return c.json({
      pages: rows.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        size: p.size,
        isPublic: p.isPublic,
        updatedAt: p.updatedAt,
      })),
    });
  });

  api.post("/pages", async (c) => {
    const user = c.get("user");
    const { title, content } = await c.req.json();
    if (!title || typeof content !== "string") return c.json({ error: "title and content are required" }, 400);

    const id = ulid();
    const now = Date.now();
    const key = pageKey(user.id, id);
    const size = await putHtml(c.env, key, content);

    const db = getDb(c.env);
    await db.insert(schema.page).values({
      id,
      userId: user.id,
      title: String(title),
      slug: slugify(String(title)) + "-" + id.slice(-4),
      path: key,
      size,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ page: { id, title, isPublic: false } }, 201);
  });

  api.get("/pages/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const db = getDb(c.env);
    const row = await db.select().from(schema.page).where(eq(schema.page.id, id)).get();
    if (!row || row.userId !== user.id) return c.json({ error: "not found" }, 404);

    const obj = await c.env.HTML_BUCKET.get(row.path);
    const content = obj ? await obj.text() : "";
    return c.json({
      page: {
        id: row.id,
        title: row.title,
        slug: row.slug,
        size: row.size,
        isPublic: row.isPublic,
        updatedAt: row.updatedAt,
        content,
      },
    });
  });

  api.put("/pages/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const db = getDb(c.env);
    const row = await db.select().from(schema.page).where(eq(schema.page.id, id)).get();
    if (!row || row.userId !== user.id) return c.json({ error: "not found" }, 404);

    const body = await c.req.json();
    let size = row.size;
    if (typeof body.content === "string") {
      size = await putHtml(c.env, row.path, body.content);
    }
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : row.title;
    const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : row.isPublic;

    await db
      .update(schema.page)
      .set({ title, isPublic, size, updatedAt: Date.now() })
      .where(eq(schema.page.id, id));

    return c.json({ page: { id, title, isPublic, size } });
  });

  api.delete("/pages/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const db = getDb(c.env);
    const row = await db.select().from(schema.page).where(eq(schema.page.id, id)).get();
    if (!row || row.userId !== user.id) return c.json({ error: "not found" }, 404);

    await deleteHtml(c.env, row.path);
    await db.delete(schema.page).where(eq(schema.page.id, id));
    return c.json({ ok: true });
  });

  return api;
}
