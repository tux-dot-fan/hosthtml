# HostHTML

A simple HTML hosting site on Cloudflare Workers: users sign in with Google,
upload/edit HTML pages, mark them public or private, and open them in a
browser. Pages are stored in R2, metadata in D1.

## Features
- **Google OAuth** sign-in (Better Auth)
- **Upload / create** HTML pages
- **Edit** HTML in a browser (plain `<textarea>` source editor, Ctrl/Cmd+S to save)
- **Public / private** toggle per page
- **Open** a public page at `/p/:id` (served as raw HTML)
- Pages are self-contained (JS/CSS inline), no build step

## Stack
- Cloudflare Workers (Hono)
- D1 (metadata) + R2 (HTML content)
- Better Auth (Google social login)
- TypeScript, no framework on the client (vanilla JS, inlined by `scripts/inline.mjs`)

## Local dev
```bash
npm install
# 1. Create resources
wrangler d1 create hosthtml-db     # paste returned database_id into wrangler.toml
wrangler r2 bucket create hosthtml
# 2. Set secrets
wrangler secret put BETTER_AUTH_SECRET     # openssl rand -base64 32
wrangler secret put BETTER_AUTH_URL        # e.g. http://localhost:8787 (dev) / https://hosthtml.workers.dev
wrangler secret put GOOGLE_CLIENT_SECRET
# 3. Set public var
#    GOOGLE_CLIENT_ID in wrangler.toml [vars]
# 4. Migrate DB
npm run db:migrate:local    # local
npm run db:migrate:remote   # remote
# 5. Run
npm run dev
```

## Google OAuth setup
1. Go to Google Cloud Console → Credentials → Create OAuth Client ID (Web app)
2. Authorized redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`
3. Put the client ID in `wrangler.toml [vars] GOOGLE_CLIENT_ID`
4. `wrangler secret put GOOGLE_CLIENT_SECRET`

## Deploy
```bash
npm run deploy
```
