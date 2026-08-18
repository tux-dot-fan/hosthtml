import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "./env";
import { createAuth } from "./auth";
import { createApi } from "./routes/api";
import { getDb } from "./db";
import * as schema from "./db/schema";
import { getCover, getHtml } from "./lib/storage";
import { renderApp, renderLanding, renderProfile, SITE_URL, type PublicPage } from "./ui";

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

// --- Subdomain hosting: <sub>.hosthtml.online serves a user's page ---
// MUST be registered before the concrete routes (/, /app, /p/:id, ...), else
// a request to the subdomain's "/" path would match the landing route first
// and the subdomain would never be resolved. This middleware intercepts only
// requests whose host is a real subdomain of hosthtml.online; anything else
// falls through to the normal routes.
const notFoundHtml = () =>
  "<!doctype html><html><head><meta charset='utf-8'/><title>Not found</title></head><body style='font-family:sans-serif;text-align:center;padding:60px 20px'><h1>404</h1><p>This page does not exist or is private.</p><p><a href='https://hosthtml.online/'>← hosthtml.online</a></p></body></html>";

/** Render a user's profile page from their public pages. */
async function renderUserProfile(c: import("hono").Context<AppEnv>, subdomain: string) {
  const db = getDb(c.env);
  const userRow = await db.select().from(schema.user).where(eq(schema.user.subdomain, subdomain)).get();
  if (!userRow) return null;
  const pages = await db
    .select()
    .from(schema.page)
    .where(eq(schema.page.userId, userRow.id))
    .all();
  const pubPages: PublicPage[] = pages
    .filter((p) => p.isPublic)
    .map((p) => ({
      id: p.id,
      title: p.title,
      subdomain: p.subdomain,
      cover: p.cover,
      description: p.description,
      updatedAt: p.updatedAt,
      slug: p.slug,
    }));
  return c.html(renderProfile({ name: userRow.name, image: userRow.image, subdomain, pages: pubPages }));
}

app.use("*", async (c, next) => {
  const host = c.req.header("host") || "";
  if (!host.endsWith(".hosthtml.online")) return next(); // bare domain — normal routes
  const prefix = host.slice(0, -".hosthtml.online".length);
  if (!prefix) return next();

  const db = getDb(c.env);
  const url = new URL(c.req.url);
  const path = url.pathname;

  // 1) A page-level subdomain: <pageSub>.hosthtml.online serves that page.
  const pageRow = await db.select().from(schema.page).where(eq(schema.page.subdomain, prefix)).get();
  if (pageRow && pageRow.isPublic) {
    const html = (await getHtml(c.env, pageRow.path)) ?? "<h1>(empty)</h1>";
    return c.html(html);
  }

  // 2) A user-level subdomain: <userSub>.hosthtml.online.
  //    - "/" -> the user's profile page
  //    - "/<slug>" -> that user's page with the given slug
  const userRow = await db.select().from(schema.user).where(eq(schema.user.subdomain, prefix)).get();
  if (userRow) {
    if (path === "/" || path === "") {
      const prof = await renderUserProfile(c, prefix);
      if (prof) return prof;
    }
    // A /p/:id path under a user subdomain.
    const pMatch = path.match(/^\/p\/([^/]+)/);
    if (pMatch) {
      const pid = pMatch[1];
      const pp = await db.select().from(schema.page).where(eq(schema.page.id, pid)).get();
      if (pp && pp.userId === userRow.id && pp.isPublic) {
        const html = (await getHtml(c.env, pp.path)) ?? "<h1>(empty)</h1>";
        return c.html(html);
      }
    }
    // Try a page under this user by slug.
    const slugPath = path.replace(/^\//, "").replace(/\/$/, "");
    if (slugPath && !slugPath.startsWith("p/")) {
      const userPages = await db
        .select()
        .from(schema.page)
        .where(eq(schema.page.userId, userRow.id))
        .all();
      const match = userPages.find((p) => p.slug === slugPath && p.isPublic);
      if (match) {
        const html = (await getHtml(c.env, match.path)) ?? "<h1>(empty)</h1>";
        return c.html(html);
      }
    }
  }

  return c.html(notFoundHtml(), 404);
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
// Home: render the landing page plus a paginated list of public pages.
app.get("/", async (c) => {
  const perPage = 30;
  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10) || 1);
  const offset = (page - 1) * perPage;
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(schema.page)
    .where(eq(schema.page.isPublic, true))
    .orderBy(schema.page.updatedAt)
    .limit(perPage)
    .offset(offset)
    .all();
  const total = await db
    .select({ id: schema.page.id })
    .from(schema.page)
    .where(eq(schema.page.isPublic, true))
    .all();
  const totalPages = Math.max(1, Math.ceil(total.length / perPage));
  return c.html(
    renderLanding({
      pages: rows.map((p) => ({
        id: p.id,
        title: p.title,
        subdomain: p.subdomain,
        cover: p.cover,
        description: p.description,
        updatedAt: p.updatedAt,
        slug: p.slug,
      })),
      page,
      totalPages,
      lang: c.req.query("lang") === "zh" ? "zh" : "en",
    }),
  );
});

app.get("/app", (c) => c.html(renderApp({ path: "/app", lang: c.req.query("lang") === "zh" ? "zh" : "en" })));
app.get("/app/editor", (c) => c.html(renderApp({ path: "/app/editor", lang: c.req.query("lang") === "zh" ? "zh" : "en" })));
app.get("/profile", (c) => c.html(renderApp({ path: "/profile", lang: c.req.query("lang") === "zh" ? "zh" : "en" })));

// --- Cover image: served from R2 (page id -> its cover). ---
app.get("/covers/:id", async (c) => {
  const id = c.req.param("id");
  const db = getDb(c.env);
  const row = await db.select().from(schema.page).where(eq(schema.page.id, id)).get();
  if (!row || !row.cover) return c.notFound();
  const cover = await getCover(c.env, row.cover);
  if (!cover) return c.notFound();
  return new Response(cover.body, {
    status: 200,
    headers: {
      "Content-Type": cover.contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
});

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

// --- SEO static resources ---

// sitemap.xml: home + all public pages (discovered from D1 at request time).
app.get("/sitemap.xml", async (c) => {
  const db = getDb(c.env);
  const rows = await db.select().from(schema.page).where(eq(schema.page.isPublic, true)).all();
  const urls: string[] = [`${SITE_URL}/`];
  for (const r of rows) {
    urls.push(
      `<url><loc>${SITE_URL}/p/${r.id}</loc><lastmod>${new Date(r.updatedAt).toISOString()}</lastmod><changefreq>monthly</changefreq></url>`,
    );
    if (r.subdomain) {
      urls.push(
        `<url><loc>https://${r.subdomain}.hosthtml.online</loc><lastmod>${new Date(r.updatedAt).toISOString()}</lastmod><changefreq>monthly</changefreq></url>`,
      );
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.map((u) => `<url>${u}</url>`).join("\n  ")}
</urlset>`;
  return c.body(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
});

app.get("/robots.txt", (c) => {
  const body = `User-agent: *
Allow: /
Disallow: /app
Disallow: /api/

Sitemap: ${SITE_URL}/sitemap.xml
`;
  return c.body(body, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

app.get("/llms.txt", (c) => {
  const body = `# HostHTML

> Free HTML hosting & sharing. Upload, edit and publish HTML pages — keep them private or share publicly.

## Pages
- [Home](https://hosthtml.online/): The HostHTML landing page. Free HTML hosting, editor and sharing. No server setup.
- [App](https://hosthtml.online/app): Sign in with Google to create, edit, publish or privatize your hosted HTML pages.

## How it works
HostHTML lets you upload HTML content and host it at a public URL (/p/:id). Pages can be public or private. No server configuration required.

_This file is intended for LLMs / AI agents._
`;
  return c.body(body, 200, { "Content-Type": "text/plain; charset=utf-8" });
});

export default app;
