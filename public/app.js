// HostHTML app shell: login / pages list / create / edit / visibility.
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
      const err = new Error(`${res.status}: ${body}`);
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
    throw new Error(data.message || data.error || `sign-in failed (${res.status})`);
  } catch (err) {
    renderLogin(err.message || String(err));
  }
}

function renderLogin(error = null) {
  const errBlock = error ? `<p class="muted" style="color:#ef4444">⚠ ${escapeHtml(error)}</p>` : "";
  root.innerHTML = `
    <section class="card login-box">
      <h2>Sign in</h2>
      <p class="muted">Sign in with Google to host and manage your HTML pages.</p>
      ${errBlock}
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
    </section>`;
  document.getElementById("sign-in-google").onclick = () => signInWith("google");
}

function renderShell(user) {
  root.innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h2 style="margin:0;">My Pages</h2>
      <div class="row">
        <button id="new-page" class="btn" style="padding:8px 14px;">+ New</button>
        <button id="sign-out" class="btn ghost" style="padding:8px 14px;">Sign out</button>
      </div>
    </div>
    <p class="muted">${escapeHtml(user.email)}</p>
    <ul class="pages" id="page-list"></ul>`;
  document.getElementById("new-page").onclick = newPage;
  document.getElementById("sign-out").onclick = async () => {
    await api("/api/auth/sign-out", { method: "POST", body: JSON.stringify({}) });
    location.href = "/";
  };
  loadPages();
}

async function loadPages() {
  const list = document.getElementById("page-list");
  list.innerHTML = `<li class="muted">Loading…</li>`;
  try {
    const { pages } = await api("/api/pages");
    if (!pages.length) {
      list.innerHTML = `<li class="muted">No pages yet. Click "+ New" to create one.</li>`;
      return;
    }
    list.innerHTML = pages
      .map(
        (p) => `
        <li>
          <div>
            <a href="#" data-id="${p.id}" class="page-title">${escapeHtml(p.title)}</a>
            <div class="muted" style="font-size:12px;">
              <span class="vis ${p.isPublic ? "pub" : "priv"}">${p.isPublic ? "🌍 Public" : "🔒 Private"}</span>
              ${fmtSize(p.size)} · ${new Date(p.updatedAt).toLocaleString()}
              ${p.isPublic ? ` · <a href="/p/${p.id}" target="_blank">open ↗</a>` : ""}
            </div>
          </div>
          <div class="page-actions">
            <button class="edit" data-id="${p.id}">✏️ Edit</button>
            <button class="view" data-id="${p.id}">👁 Open</button>
            <button class="pub-toggle" data-id="${p.id}" data-pub="${p.isPublic}">${p.isPublic ? "🔒 Make private" : "🌍 Publish"}</button>
            <button class="del" data-id="${p.id}">🗑</button>
          </div>
        </li>`,
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
          await api(`/api/pages/${b.dataset.id}`, { method: "PUT", body: JSON.stringify({ isPublic }) });
          toast(isPublic ? "Published 🌍" : "Made private 🔒");
          loadPages();
        } catch (err) { toast("Failed: " + err.message); }
      };
    });
    list.querySelectorAll(".del").forEach((b) => {
      b.onclick = async () => {
        if (!confirm("Delete this page?")) return;
        try {
          await api(`/api/pages/${b.dataset.id}`, { method: "DELETE" });
          toast("Deleted");
          loadPages();
        } catch (err) { toast("Failed: " + err.message); }
      };
    });
  } catch (err) {
    list.innerHTML = `<li>Error: ${escapeHtml(err.message)}</li>`;
  }
}

async function newPage() {
  const title = prompt("Page title?");
  if (!title) return;
  try {
    const { page } = await api("/api/pages", {
      method: "POST",
      body: JSON.stringify({ title, content: "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\" />\n<title>" + title + "</title>\n</head>\n<body>\n\n</body>\n</html>" }),
    });
    location.href = "/app/editor?pageId=" + page.id;
  } catch (err) { toast("Failed: " + err.message); }
}

// --- Editor view (loaded on /app/editor?pageId=...) ---
async function renderEditor(pageId) {
  let page = null;
  try {
    const res = await api(`/api/pages/${pageId}`, { timeout: 30000 });
    page = res.page;
  } catch (err) {
    root.innerHTML = `<p>Error loading page: ${escapeHtml(err.message)}</p>`;
    return;
  }
  root.innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h2 style="margin:0;">Edit · ${escapeHtml(page.title)}</h2>
      <div class="row">
        <button id="ed-open" class="btn ghost" style="padding:8px 14px;">Open ↗</button>
        <button id="ed-back" class="btn ghost" style="padding:8px 14px;">← Back</button>
        <button id="ed-save" class="btn" style="padding:8px 14px;">💾 Save</button>
      </div>
    </div>
    <div class="muted" style="margin-bottom:10px;">
      <span class="vis ${page.isPublic ? "pub" : "priv"}">${page.isPublic ? "🌍 Public" : "🔒 Private"}</span>
      <label style="margin-left:12px;"><input type="checkbox" id="ed-pub" ${page.isPublic ? "checked" : ""} /> Public</label>
    </div>
    <textarea id="ed-content" spellcheck="false">${escapeHtml(page.content || "")}</textarea>`;
  document.getElementById("ed-save").onclick = async () => {
    const content = document.getElementById("ed-content").value;
    const isPublic = document.getElementById("ed-pub").checked;
    const title = page.title;
    try {
      await api(`/api/pages/${pageId}`, { method: "PUT", body: JSON.stringify({ content, isPublic, title }), timeout: 60000 });
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
