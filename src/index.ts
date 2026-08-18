import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "./env";
import { createAuth } from "./auth";
import { createApi } from "./routes/api";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { getHtml } from "./lib/storage";
import { renderApp, renderLanding } from "./ui";

type AppEnv = {
  Bindings: Env;
  Variables: { auth: ReturnType<typeof createAuth>; user: { id: string; email: string; name: string; image?: string | null } };
};

declare module "hono" {
  interface ContextVariableMap {
    user: { id: string; email: string; name: string; image?: string | null };
  }
}

const app = new Hono<AppEnv>();

app.onError((err, c) => {
  console.error("[worker error]", err);
  return c.json({ error: "internal_error", message: err instanceof Error ? err.message : String(err) }, 500);
});

app.use("*", async (c, next) => {
  c.set("auth", createAuth(c.env));
  await next();
});

// --- Health check ---
app.get("/healthz", (c) =>
  c.json({
    ok: true,
    env: {
      BETTER_AUTH_URL: !!c.env.BETTER_AUTH_URL,
      BETTER_AUTH_SECRET: !!c.env.BETTER_AUTH_SECRET,
      GOOGLE_CLIENT_ID: !!c.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!c.env.GOOGLE_CLIENT_SECRET,
      hasDB: !!c.env.DB,
      hasBucket: !!c.env.HTML_BUCKET,
    },
  }),
);

// --- Better Auth handler at /api/auth/* ---
app.all("/api/auth/*", async (c) => c.get("auth").handler(c.req.raw));

// --- App API ---
app.route("/api", createApi((env) => createAuth(env)));

// --- Pages ---
app.get("/", (c) => c.html(renderLanding()));

app.get("/app", (c) => c.html(renderApp({ path: "/app" })));
app.get("/app/editor", (c) => c.html(renderApp({ path: "/app/editor" })));

// --- Public open page: serve the hosted HTML directly if public ---
// If the page is private, we return a minimal 404-ish HTML instead of leaking.
app.get("/p/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);
  const row = await db.select().from(schema.page).where(eq(schema.page.id, id)).get();
  if (!row || !row.isPublic) {
    return c.html(
      "<!doctype html><html><head><meta charset='utf-8'/><title>Not found</title></head><body style='font-family:sans-serif;text-align:center;padding:60px 20px'><h1>404</h1><p>This page does not exist or is private.</p><p><a href='/'>← HostHTML</a></p></body></html>",
      404,
    );
  }
  const html = (await getHtml(c.env, row.path)) ?? "<h1>(empty)</h1>";
  return c.html(html);
});

export default app;
