// Server-rendered HTML for HostHTML. The client JS (public/app.js) is inlined
// into CLIENT_JS by scripts/inline.mjs before deploy.

// This placeholder is replaced by scripts/inline.mjs.
export const CLIENT_JS = `// HostHTML app shell: login / pages list / create / edit / visibility.
const root = document.getElementById("root");
const toastEl = document.getElementById("toast");

const escapeHtml = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

async function api(path, init = {}) {
  const timeout = init.timeout ?? 15000;
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
  try {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      credentials: "include",
      ...(ctrl ? { signal: ctrl.signal } : {}),
    });
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(\`\${res.status}: \${body}\`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toast.__t);
  toast.__t = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

async function signInWith(provider) {
  try {
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, callbackURL: "/app" }),
      credentials: "include",
    });
    const data = await res.json();
    if (data.redirect && data.url) {
      window.location.href = data.url;
      return;
    }
    throw new Error(data.message || data.error || \`sign-in failed (\${res.status})\`);
  } catch (err) {
    renderLogin(err.message || String(err));
  }
}

function renderLogin(error = null) {
  const errBlock = error ? \`<p class="muted" style="color:#ef4444">⚠ \${escapeHtml(error)}</p>\` : "";
  root.innerHTML = \`
    <section class="card login-box">
      <h2>Sign in</h2>
      <p class="muted">Sign in with Google to host and manage your HTML pages.</p>
      \${errBlock}
      <div style="margin-top:14px;">
        <button id="sign-in-google" class="provider-btn" style="width:100%;">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.1 0-9.5-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.4 35.7 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </section>\`;
  document.getElementById("sign-in-google").onclick = () => signInWith("google");
}

function renderShell(user) {
  root.innerHTML = \`
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h2 style="margin:0;">My Pages</h2>
      <div class="row">
        <button id="upload-page" class="btn" style="padding:8px 14px;">⬆ 上传</button>
        <button id="blank-page" class="btn ghost" style="padding:8px 14px;">+ 空白</button>
        <button id="sign-out" class="btn ghost" style="padding:8px 14px;">Sign out</button>
      </div>
    </div>
    <p class="muted">\${escapeHtml(user.email)}</p>
    <ul class="pages" id="page-list"></ul>\`;
  document.getElementById("upload-page").onclick = uploadPage;
  document.getElementById("blank-page").onclick = blankPage;
  document.getElementById("sign-out").onclick = async () => {
    await api("/api/auth/sign-out", { method: "POST", body: JSON.stringify({}) });
    location.href = "/";
  };
  loadPages();
}

async function loadPages() {
  const list = document.getElementById("page-list");
  list.innerHTML = \`<li class="muted">Loading…</li>\`;
  try {
    const { pages } = await api("/api/pages");
    if (!pages.length) {
      list.innerHTML = \`<li class="muted">No pages yet. Click "+ New" to create one.</li>\`;
      return;
    }
    list.innerHTML = pages
      .map(
        (p) => \`
        <li>
          <div>
            <a href="#" data-id="\${p.id}" class="page-title">\${escapeHtml(p.title)}</a>
            <div class="muted" style="font-size:12px;">
              <span class="vis \${p.isPublic ? "pub" : "priv"}">\${p.isPublic ? "🌍 Public" : "🔒 Private"}</span>
              \${fmtSize(p.size)} · \${new Date(p.updatedAt).toLocaleString()}
              \${p.isPublic ? \` · <a href="/p/\${p.id}" target="_blank">open ↗</a>\` : ""}
              \${p.isPublic && p.subdomain ? \` · <a href="https://\${escapeHtml(p.subdomain)}.hosthtml.online" target="_blank">\${escapeHtml(p.subdomain)}.hosthtml.online ↗</a>\` : ""}
            </div>
          </div>
          <div class="page-actions">
            <button class="edit" data-id="\${p.id}">✏️ Edit</button>
            <button class="view" data-id="\${p.id}">👁 Open</button>
            <button class="pub-toggle" data-id="\${p.id}" data-pub="\${p.isPublic}">\${p.isPublic ? "🔒 Make private" : "🌍 Publish"}</button>
            <button class="del" data-id="\${p.id}">🗑</button>
          </div>
        </li>\`,
      )
      .join("");
    list.querySelectorAll(".page-title, .view").forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        const id = el.dataset.id;
        location.href = "/p/" + id;
      };
    });
    list.querySelectorAll(".edit").forEach((b) => {
      b.onclick = () => { location.href = "/app/editor?pageId=" + b.dataset.id; };
    });
    list.querySelectorAll(".pub-toggle").forEach((b) => {
      b.onclick = async () => {
        const isPublic = b.dataset.pub === "true" ? false : true;
        try {
          await api(\`/api/pages/\${b.dataset.id}\`, { method: "PUT", body: JSON.stringify({ isPublic }) });
          toast(isPublic ? "Published 🌍" : "Made private 🔒");
          loadPages();
        } catch (err) { toast("Failed: " + err.message); }
      };
    });
    list.querySelectorAll(".del").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Delete this page?")) return;
        try {
          await api(\`/api/pages/\${b.dataset.id}\`, { method: "DELETE" });
          toast("Deleted");
          loadPages();
        } catch (err) { toast("Failed: " + err.message); }
      };
    });
  } catch (err) {
    list.innerHTML = \`<li>Error: \${escapeHtml(err.message)}</li>\`;
  }
}

// Upload an existing HTML file (default action).
function uploadPage() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".html,.htm,text/html";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast("文件太大（上限 2MB）"); return; }
    const content = await file.text();
    const title = file.name.replace(/\\.(html?)$/i, "") || "Untitled";
    try {
      const { page } = await api("/api/pages", {
        method: "POST",
        body: JSON.stringify({ title, content }),
        timeout: 60000,
      });
      toast("已上传，打开编辑器 ✏️");
      location.href = "/app/editor?pageId=" + page.id;
    } catch (err) { toast("上传失败: " + err.message); }
  };
  input.click();
}

// Create a blank page and open the editor.
async function blankPage() {
  const title = prompt("Page title?");
  if (!title) return;
  try {
    const { page } = await api("/api/pages", {
      method: "POST",
      body: JSON.stringify({ title, content: "<!doctype html>\\n<html>\\n<head>\\n<meta charset=\\"utf-8\\" />\\n<title>" + title + "</title>\\n</head>\\n<body>\\n\\n</body>\\n</html>" }),
    });
    location.href = "/app/editor?pageId=" + page.id;
  } catch (err) { toast("Failed: " + err.message); }
}

// --- Editor view (loaded on /app/editor?pageId=...) ---
async function renderEditor(pageId) {
  let page = null;
  try {
    const res = await api(\`/api/pages/\${pageId}\`, { timeout: 30000 });
    page = res.page;
  } catch (err) {
    root.innerHTML = \`<p>Error loading page: \${escapeHtml(err.message)}</p>\`;
    return;
  }
  root.innerHTML = \`
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h2 style="margin:0;">Edit · \${escapeHtml(page.title)}</h2>
      <div class="row">
        <button id="ed-open" class="btn ghost" style="padding:8px 14px;">Open ↗</button>
        <button id="ed-back" class="btn ghost" style="padding:8px 14px;">← Back</button>
        <button id="ed-save" class="btn" style="padding:8px 14px;">💾 Save</button>
      </div>
    </div>
    <div class="muted" style="margin-bottom:10px;">
      <span class="vis \${page.isPublic ? "pub" : "priv"}">\${page.isPublic ? "🌍 Public" : "🔒 Private"}</span>
      <label style="margin-left:12px;"><input type="checkbox" id="ed-pub" \${page.isPublic ? "checked" : ""} /> Public</label>
    </div>
    <div class="muted" style="margin-bottom:12px;">
      <label>专属网址：<input id="ed-sub" style="width:220px;" value="\${escapeHtml(page.subdomain || "")}" placeholder="my-page" /> .hosthtml.online</label>
      <button id="ed-copy-sub" style="margin-left:8px; padding:5px 11px; font-size:12.5px; border-radius:7px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer;">📋 复制</button>
    </div>
    <textarea id="ed-content" spellcheck="false">\${escapeHtml(page.content || "")}</textarea>\`;
  document.getElementById("ed-copy-sub").onclick = () => {
    const sub = (document.getElementById("ed-sub").value.trim() || "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const url = sub ? "https://" + sub + ".hosthtml.online" : window.location.origin + "/p/" + pageId;
    const text = page.isPublic ? url : url + " (页面未公开，公开后才可访问)";
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast("已复制链接 📋")).catch(() => toast(text));
    } else {
      toast(text);
    }
  };
  document.getElementById("ed-save").onclick = async () => {
    const content = document.getElementById("ed-content").value;
    const isPublic = document.getElementById("ed-pub").checked;
    const title = page.title;
    const subdomain = document.getElementById("ed-sub").value.trim();
    try {
      await api(\`/api/pages/\${pageId}\`, { method: "PUT", body: JSON.stringify({ content, isPublic, title, subdomain }), timeout: 60000 });
      toast("Saved 💾");
    } catch (err) { toast("Save failed: " + err.message); }
  };
  document.getElementById("ed-open").onclick = () => { location.href = "/p/" + pageId; };
  document.getElementById("ed-back").onclick = () => { location.href = "/app"; };
  // Ctrl/Cmd+S to save
  document.getElementById("ed-content").addEventListener("keydown", (e) => {
    if (e.key === "s" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); document.getElementById("ed-save").click(); }
  });
}

async function main() {
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const oauthError = params.get("error") || params.get("error_description");

  if (path === "/") return;
  // /p/:id is served server-side (raw HTML), no client shell needed.
  if (path.startsWith("/p/")) return;

  if (path.startsWith("/app")) {
    // Editor page needs auth + a page id.
    const pageId = params.get("pageId");
    if (path === "/app/editor" && pageId) {
      let user;
      try {
        const res = await api("/api/me");
        user = res.user;
      } catch (e) {
        if (e?.status === 401) return renderLogin(oauthError || null);
        return renderLogin(oauthError || (e?.message || null));
      }
      return renderEditor(pageId);
    }
    let user;
    try {
      const res = await api("/api/me");
      user = res.user;
      sessionStorage.setItem("user", JSON.stringify(user));
    } catch (e) {
      if (e?.status === 401) return renderLogin(oauthError || null);
      return renderLogin(oauthError || (e?.message || null));
    }
    return renderShell(user);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
`;

const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// --- SEO ---
export const SITE_URL = "https://hosthtml.online";
export const SITE_NAME = "HostHTML";

const SEO_KEYWORDS =
  "html hosting, free html hosting, host html page, share html online, html editor online, publish html, html web hosting, online html host, static html hosting, hosthtml";

/** Standard meta + Open Graph + Twitter + canonical for a page. */
function seoMeta(opts: { title: string; desc: string; path: string; type?: string }): string {
  const url = SITE_URL + opts.path;
  const type = opts.type || "website";
  const img = SITE_URL + "/og-image.png";
  return `\n<meta name="keywords" content="${SEO_KEYWORDS}" />
<link rel="canonical" href="${url}" />
<meta property="og:site_name" content="${SITE_NAME}" />
<meta property="og:title" content="${esc(opts.title)}" />
<meta property="og:description" content="${esc(opts.desc)}" />
<meta property="og:type" content="${type}" />
<meta property="og:url" content="${url}" />
<meta property="og:image" content="${img}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(opts.title)}" />
<meta name="twitter:description" content="${esc(opts.desc)}" />
<meta name="twitter:image" content="${img}" />`;
}

/** JSON-LD WebSite structured data. */
const JSONLD_WEBSITE = `<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "HostHTML",
  "url": "${SITE_URL}",
  "description": "Free HTML hosting & sharing. Upload, edit and publish HTML pages; keep them private or public.",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "${SITE_URL}/?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
</script>`;

const BASE_CSS = `
  :root { color-scheme: light; --bg:#fff; --fg:#1f2328; --text:#1f2328; --border:#d8dee4; --muted:#59636e; --accent:#0969da; --bg-elev:#fff; --bg-soft:rgba(0,0,0,.04); --nav-bg:rgba(255,255,255,.85); --hero-grad:linear-gradient(90deg,#4f8cff,#7c5cff); }
  @media (prefers-color-scheme: dark) { :root { color-scheme: dark; --bg:#0d1117; --fg:#e6edf3; --text:#e6edf3; --border:#30363d; --muted:#8b949e; --accent:#4f8cff; --bg-elev:#161b22; --bg-soft:rgba(255,255,255,.05); --nav-bg:rgba(13,17,23,.85); } }
  html[data-theme="light"] { color-scheme: light; --bg:#fff; --fg:#1f2328; --text:#1f2328; --border:#d8dee4; --muted:#59636e; --accent:#0969da; --bg-elev:#fff; --bg-soft:rgba(0,0,0,.04); }
  html[data-theme="dark"] { color-scheme: dark; --bg:#0d1117; --fg:#e6edf3; --text:#e6edf3; --border:#30363d; --muted:#8b949e; --accent:#4f8cff; --bg-elev:#161b22; --bg-soft:rgba(255,255,255,.05); }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif; line-height:1.6; -webkit-font-smoothing:antialiased; }
  a { color: var(--accent); }
  .nav-wrap { position: sticky; top: 0; z-index: 50; background: var(--nav-bg); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
  nav { width: 100%; padding: 12px 24px; display: flex; align-items: center; gap: 10px; }
  nav .brand { font-weight: 700; font-size: 16px; color: var(--text); text-decoration: none; display: flex; align-items: center; gap: 8px; }
  nav .brand .logo { width: 26px; height: 26px; border-radius: 7px; background: var(--hero-grad); display: inline-flex; align-items: center; justify-content: center; font-size: 14px; color: #fff; font-weight: 800; }
  nav .center { margin: 0 auto; display: flex; gap: 4px; }
  nav .right { display: flex; gap: 8px; align-items: center; }
  .btn { display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #fff !important; border: 0; border-radius: 9px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none !important; }
  .btn:hover { filter: brightness(1.08); }
  .btn.ghost { background: transparent; color: var(--text) !important; border: 1px solid var(--border); }
  .wrap { max-width: 860px; margin: 0 auto; padding: 32px 24px 60px; }
  .card { border: 1px solid var(--border); border-radius: 12px; padding: 20px; background: var(--bg-elev); }
  .muted { opacity: .7; font-size: 13px; }
  textarea, input { padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border); background: transparent; color: inherit; font-family: inherit; font-size: 14px; }
  textarea { width: 100%; min-height: 60vh; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.6; resize: vertical; }
  .row { display: flex; gap: 10px; align-items: center; }
  ul.pages { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  ul.pages li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; }
  ul.pages a { font-weight: 600; color: var(--text); text-decoration: none; }
  ul.pages a:hover { color: var(--accent); }
  .vis { font-size: 12px; padding: 2px 8px; border-radius: 20px; }
  .vis.pub { background: rgba(46,160,67,.15); color: #2da44e; }
  .vis.priv { background: rgba(177,186,196,.2); color: var(--muted); }
  .page-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .page-actions button { padding: 5px 11px; font-size: 12.5px; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer; }
  .page-actions button:hover { background: var(--bg-soft); }
  .page-actions button.edit { border-color: rgba(47,129,247,.5); color: #2f81f7; }
  .page-actions button.pub-toggle { border-color: rgba(46,160,67,.5); color: #2da44e; }
  .page-actions button.del { border-color: rgba(248,81,73,.5); color: #f85149; }
  .hero { text-align: center; padding: 60px 20px 40px; }
  .hero h1 { font-size: 40px; margin: 0 0 12px; letter-spacing: -.02em; }
  .hero p { font-size: 17px; color: var(--muted); max-width: 640px; margin: 0 auto 28px; }
  .provider-btn { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 11px 16px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); text-decoration: none; font-weight: 500; cursor: pointer; font-size: 15px; }
  .provider-btn:hover { background: var(--bg-soft); }
  .login-box { max-width: 380px; margin: 40px auto; }
  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #161b22; color: #e6edf3; padding: 12px 20px; border-radius: 10px; font-size: 14px; box-shadow: 0 8px 30px rgba(0,0,0,.4); display: none; z-index: 100; }
  .toast.show { display: block; }
  .features { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; margin-top: 30px; }
  .feature { border: 1px solid var(--border); border-radius: 14px; padding: 22px; background: var(--bg-elev); }
  .feature h3 { margin: 0 0 8px; font-size: 17px; }
  .feature p { margin: 0; color: var(--muted); font-size: 14px; }
  .feature .icon { font-size: 22px; margin-bottom: 10px; }
  .subdomain-demo { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-soft); border-radius: 8px; padding: 3px 10px; font-family: ui-monospace, monospace; font-size: 13px; color: var(--accent); }
  @media (max-width: 640px) { .hero h1 { font-size: 30px; } ul.pages li { flex-direction: column; align-items: flex-start; } }
`;

export interface AppProps {
  path: string;
}

const NAVBAR = `
  <div class="nav-wrap">
    <nav>
      <a href="/" class="brand"><span class="logo">&lt;/&gt;</span> HostHTML</a>
      <div class="center"></div>
      <div class="right">
        <a class="btn ghost" href="/app">App</a>
      </div>
    </nav>
  </div>`;

/** Generic app shell — the client app.js decides login vs dashboard. */
export function renderApp(props: AppProps): string {
  const title = "HostHTML App · Manage Your Hosted HTML Pages";
  const desc = "Sign in and manage your hosted HTML pages on HostHTML: create, edit, publish or make pages private.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
<meta name="robots" content="noindex, nofollow" />
${seoMeta({ title, desc, path: props.path, type: "webapp" })}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234f8cff'/%3E%3Cstop offset='1' stop-color='%237c5cff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='url(%23g)'/%3E%3Cpath d='M20 20h24v6H26v6h14v6H26v6h18v6H20z' fill='%23fff'/%3E%3C/svg%3E" />
<script>
(function () {
  try {
    var t = localStorage.getItem("hh-theme");
    if (t !== "light" && t !== "dark") t = (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
</script>
<style>
${BASE_CSS}
</style>
</head>
<body>
  ${NAVBAR}
  <main id="root" class="wrap">Loading…</main>
  <div class="toast" id="toast"></div>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
}

/** Landing page. */
export function renderLanding(): string {
  const title = "HostHTML · Free HTML Hosting, Editor & Sharing";
  const desc =
    "Free HTML hosting & sharing. Upload, edit and publish HTML pages online — keep them private or share publicly with anyone. No server setup, works in any browser.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
${seoMeta({ title, desc, path: "/" })}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234f8cff'/%3E%3Cstop offset='1' stop-color='%237c5cff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='url(%23g)'/%3E%3Cpath d='M20 20h24v6H26v6h14v6H26v6h18v6H20z' fill='%23fff'/%3E%3C/svg%3E" />
${JSONLD_WEBSITE}
<style>
${BASE_CSS}
</style>
</head>
<body>
  ${NAVBAR}
  <main class="wrap">
    <section class="hero">
      <h1>HostHTML</h1>
      <p>Upload, edit and share HTML pages. Sign in with Google, keep your pages private or publish them for the world, and open them in any browser.</p>
      <a class="btn" href="/app">Open app →</a>
    </section>

    <section class="features">
      <div class="feature">
        <div class="icon">🌐</div>
        <h3>Your own subdomain</h3>
        <p>Every public page gets a unique address like <span class="subdomain-demo">my-page.hosthtml.online</span>. Share it anywhere.</p>
      </div>
      <div class="feature">
        <div class="icon">🔒</div>
        <h3>Private or public</h3>
        <p>Keep pages private for yourself, or publish them publicly with one click. Private pages are never served.</p>
      </div>
      <div class="feature">
        <div class="icon">✏️</div>
        <h3>Edit in the browser</h3>
        <p>Edit your HTML right in the app with a source editor. Ctrl/Cmd+S to save, instant updates.</p>
      </div>
      <div class="feature">
        <div class="icon">🚀</div>
        <h3>No server setup</h3>
        <p>Hosted on Cloudflare's global edge. No servers to manage, no builds, just upload and go.</p>
      </div>
    </section>
  </main>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
}

/** Public page: renders the hosted HTML. This returns the HTML *content* inline
 *  when the user opens /p/:id, so the document is fully served. */
export function renderPublicShell(title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · HostHTML</title>
<script>${CLIENT_JS}</script>
</head>
<body>
</body>
</html>`;
}
