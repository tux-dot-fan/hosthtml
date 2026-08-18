// Cloudflare Workers bindings + env vars
export interface Env {
  // bindings
  DB: D1Database;
  HTML_BUCKET: R2Bucket;
  ASSETS: Fetcher;

  // secrets (set via `wrangler secret put`)
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  GOOGLE_CLIENT_SECRET: string;

  // vars (from wrangler.toml [vars])
  GOOGLE_CLIENT_ID: string;
}
