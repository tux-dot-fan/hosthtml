import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { deleteCover, deleteHtml, pageKey, putCover, putHtml } from "../lib/storage";
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

/** Generate a globally unique subdomain prefix from a title. */
async function uniqueSubdomain(db: ReturnType<typeof getDb>, base: string, excludeId?: string): Promise<string> {
  let candidate = slugify(base).slice(0, 40) || "page";
  let n = 0;
  for (;;) {
    const existing = await db
      .select()
      .from(schema.page)
      .where(eq(schema.page.subdomain, candidate))
      .get();
    if (!existing || (excludeId && existing.id === excludeId)) return candidate;
    n++;
    candidate = (slugify(base).slice(0, 34) || "page") + "-" + n;
  }
}

/** Normalize a user subdomain and ensure it's unique across users AND pages. */
async function uniqueUserSubdomain(db: ReturnType<typeof getDb>, base: string, excludeUserId?: string): Promise<{ ok: boolean; value?: string; error?: string }> {
  const clean = base.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (!clean) return { ok: false, error: "invalid subdomain" };
  if (clean === "app" || clean === "api" || clean === "www" || clean === "admin") return { ok: false, error: "reserved subdomain" };
  // Must not collide with another user's subdomain.
  const user = await db.select().from(schema.user).where(eq(schema.user.subdomain, clean)).get();
  if (user && user.id !== excludeUserId) return { ok: false, error: "subdomain already taken" };
  // Also avoid colliding with a page's subdomain.
  const page = await db.select().from(schema.page).where(eq(schema.page.subdomain, clean)).get();
  if (page) return { ok: false, error: "subdomain already taken" };
  return { ok: true, value: clean };
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
    // Look up the user's stored subdomain (session.user may not include it).
    const db = getDb(c.env);
    const userRow = await db.select().from(schema.user).where(eq(schema.user.id, session.user.id)).get();
    return c.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image ?? null,
        subdomain: userRow?.subdomain ?? null,
      },
    });
  });

  // ---- Profile (requires auth): read/update the user's subdomain ----
  api.use("/profile", requireAuth((c) => getAuth(c.env)));
  api.get("/profile", async (c) => {
    const user = c.get("user");
    const db = getDb(c.env);
    const row = await db.select().from(schema.user).where(eq(schema.user.id, user.id)).get();
    return c.json({
      profile: {
        name: row?.name ?? user.name,
        email: row?.email ?? user.email,
        image: row?.image ?? user.image,
        subdomain: row?.subdomain ?? null,
        pages: 0,
      },
    });
  });
  api.put("/profile", async (c) => {
    const user = c.get("user");
    const { subdomain } = await c.req.json();
    const db = getDb(c.env);
    const row = await db.select().from(schema.user).where(eq(schema.user.id, user.id)).get();
    if (!row) return c.json({ error: "user not found" }, 404);
    if (typeof subdomain !== "string") return c.json({ error: "subdomain required" }, 400);

    if (subdomain.trim() === "") {
      // Clear the user subdomain.
      await db.update(schema.user).set({ subdomain: null, updatedAt: new Date() }).where(eq(schema.user.id, user.id));
      return c.json({ profile: { subdomain: null } });
    }

    const res = await uniqueUserSubdomain(db, subdomain, user.id);
    if (!res.ok) return c.json({ error: res.error || "invalid subdomain" }, 400);
    try {
      await db.update(schema.user).set({ subdomain: res.value, updatedAt: new Date() }).where(eq(schema.user.id, user.id));
    } catch (e) {
      // Extremely unlikely, but the DB unique index can reject a concurrent
      // duplicate even after our app-level check — surface it as "taken".
      return c.json({ error: "subdomain already taken" }, 400);
    }
    return c.json({ profile: { subdomain: res.value } });
  });

  // ---- Pages CRUD (requires auth) ----
  // Note: must use "/pages/*" so the middleware also runs for /pages/:id,
  // /pages/:id PUT/DELETE etc. A bare "/pages" only matches that exact path.
  api.use("/pages/*", requireAuth((c) => getAuth(c.env)));

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
        subdomain: p.subdomain,
        cover: p.cover,
        description: p.description,
        size: p.size,
        isPublic: p.isPublic,
        updatedAt: p.updatedAt,
      })),
    });
  });

  api.post("/pages", async (c) => {
    const user = c.get("user");
    const { title, content, cover, description } = await c.req.json();
    if (!title || typeof content !== "string") return c.json({ error: "title and content are required" }, 400);

    const id = ulid();
    const now = Date.now();
    const key = pageKey(user.id, id);
    const size = await putHtml(c.env, key, content);

    const db = getDb(c.env);
    const subdomain = await uniqueSubdomain(db, String(title));
    // Optional cover image (data URL, already compressed client-side) and description.
    let coverKey = null;
    if (typeof cover === "string" && cover.startsWith("data:image/")) {
      coverKey = await putCover(c.env, id, cover);
    }
    const descriptionVal = typeof description === "string" ? description.trim().slice(0, 200) : null;

    await db.insert(schema.page).values({
      id,
      userId: user.id,
      title: String(title),
      slug: slugify(String(title)) + "-" + id.slice(-4),
      subdomain,
      path: key,
      cover: coverKey,
      description: descriptionVal,
      size,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ page: { id, title, isPublic: false, subdomain, cover: coverKey, description: descriptionVal } }, 201);
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
        subdomain: row.subdomain,
        cover: row.cover,
        description: row.description,
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

    // Optional: user may change the subdomain. Ensure it's unique.
    let subdomain = row.subdomain;
    if (typeof body.subdomain === "string" && body.subdomain.trim()) {
      const want = body.subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
      if (want) subdomain = await uniqueSubdomain(db, want, id);
    }

    // Optional: update description.
    let description = row.description;
    if (typeof body.description === "string") description = body.description.trim().slice(0, 200) || null;

    // Optional: update cover. A new data URL replaces it; null removes it.
    let cover = row.cover;
    if (typeof body.cover === "string") {
      if (body.cover.startsWith("data:image/")) {
        const newKey = await putCover(c.env, id, body.cover);
        if (row.cover && row.cover !== newKey) await deleteCover(c.env, row.cover);
        cover = newKey;
      } else if (body.cover === "") {
        if (row.cover) await deleteCover(c.env, row.cover);
        cover = null;
      }
    }

    await db
      .update(schema.page)
      .set({ title, isPublic, size, subdomain, cover, description, updatedAt: Date.now() })
      .where(eq(schema.page.id, id));

    return c.json({ page: { id, title, isPublic, size, subdomain, cover, description } });
  });

  api.delete("/pages/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const db = getDb(c.env);
    const row = await db.select().from(schema.page).where(eq(schema.page.id, id)).get();
    if (!row || row.userId !== user.id) return c.json({ error: "not found" }, 404);

    await deleteHtml(c.env, row.path);
    if (row.cover) await deleteCover(c.env, row.cover);
    await db.delete(schema.page).where(eq(schema.page.id, id));
    return c.json({ ok: true });
  });

  return api;
}
