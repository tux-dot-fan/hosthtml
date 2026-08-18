// Server-rendered HTML for HostHTML. The client JS (public/app.js) is inlined
// into CLIENT_JS by scripts/inline.mjs before deploy.

// This placeholder is replaced by scripts/inline.mjs.
export const CLIENT_JS = `// HostHTML app shell: login / pages list / create / edit / visibility.
const root = document.getElementById("root");
const toastEl = document.getElementById("toast");

// --- i18n (driven by ?lang=zh, falls back to English) ---
const LANG = new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en";
const I18N = {
  en: {
    loginTitle: "Sign in", loginSub: "Sign in with Google to host and manage your HTML pages.",
    loginGoogle: "Continue with Google",
    myPages: "My Pages", newUpload: "⬆ Upload", newBlank: "+ Blank", signOut: "Sign out",
    noPages: "No pages yet. Click upload or blank to create one.", loading: "Loading…",
    pub: "🌍 Public", priv: "🔒 Private", open: "Open ↗",
    actEdit: "✏️ Edit", actView: "👁 Open", actPub: "🌍 Publish", actPriv: "🔒 Make private",
    delConfirm: "Delete this page?", error: "Error: ", noTitle: "Page title?",
    editorTitle: "Edit · ", save: "💾 Save", back: "← Back",
    subLabel: "Custom URL", subPlaceholder: "my-page", subCopy: "📋 Copy",
    descLabel: "Description", descPlaceholder: "Short description (shown on home cards)",
    coverLabel: "Cover", coverUpload: "🖼 Upload cover", coverRemove: "✕ Remove",
    coverReady: "Cover ready — save to apply 🖼", copied: "Link copied 📋",
    pubNotYet: " (not public — will be accessible after publishing)",
    saved: "Saved 💾", saveFailed: "Save failed: ", loadFailed: "Error loading page: ",
    uploadTooBig: "File too big (limit 2MB)", uploaded: "Uploaded, opening editor ✏️", uploadFailed: "Upload failed: ",
    coverFailed: "Cover processing failed: ", saveCoverErr: "Cover ready",
  },
  zh: {
    loginTitle: "登录", loginSub: "使用 Google 登录，托管和管理你的 HTML 页面。",
    loginGoogle: "使用 Google 继续",
    myPages: "我的页面", newUpload: "⬆ 上传", newBlank: "+ 空白", signOut: "退出登录",
    noPages: "还没有页面。点击上传或空白创建。", loading: "加载中…",
    pub: "🌍 公开", priv: "🔒 私有", open: "打开 ↗",
    actEdit: "✏️ 编辑", actView: "👁 打开", actPub: "🌍 发布", actPriv: "🔒 设为私有",
    delConfirm: "删除此页面？", error: "错误：", noTitle: "页面标题？",
    editorTitle: "编辑 · ", save: "💾 保存", back: "← 返回",
    subLabel: "专属网址", subPlaceholder: "my-page", subCopy: "📋 复制",
    descLabel: "描述", descPlaceholder: "简短描述（首页卡片显示）",
    coverLabel: "封面", coverUpload: "🖼 上传封面", coverRemove: "✕ 移除",
    coverReady: "封面已就绪，保存后生效 🖼", copied: "已复制链接 📋",
    pubNotYet: "（未公开，发布后才可访问）",
    saved: "已保存 💾", saveFailed: "保存失败：", loadFailed: "页面加载失败：",
    uploadTooBig: "文件太大（上限 2MB）", uploaded: "已上传，打开编辑器 ✏️", uploadFailed: "上传失败：",
    coverFailed: "封面处理失败：", saveCoverErr: "封面已就绪",
  },
}[LANG];
const t = I18N;

const escapeHtml = (s) =>
  String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

// Copy text to the clipboard with a toast.
function copyText(text, okMsg) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(okMsg)).catch(() => toast(text));
  } else {
    toast(text);
  }
}

function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  return (n / (1024 * 1024 * 1024)).toFixed(1) + " GB";
}

// Compress an image file to a small data URL (JPEG/WebP, max 800px) for covers.
function compressImage(file, maxW = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const useWebp = typeof canvas.toDataURL === "function" && canvas.toDataURL("image/webp").length < canvas.toDataURL("image/jpeg").length;
      resolve(canvas.toDataURL(useWebp ? "image/webp" : "image/jpeg", quality));
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法读取图片")); };
    img.src = url;
  });
}

// Extract a description and cover-image URL from raw HTML.
function extractPageMeta(html) {
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim().slice(0, 200) : "";
  // Prefer an og:image, else the first <img> src.
  let cover = "";
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const src = og ? og[1] : (html.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1];
  if (src) cover = src.trim();
  return { description, cover };
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
      body: JSON.stringify({ provider, callbackURL: "/app" + (LANG === "zh" ? "?lang=zh" : "") }),
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
      <h2>\${t.loginTitle}</h2>
      <p class="muted">\${t.loginSub}</p>
      \${errBlock}
      <div style="margin-top:14px;">
        <button id="sign-in-google" class="provider-btn" style="width:100%;">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.1 0-9.5-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.4 35.7 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          \${t.loginGoogle}
        </button>
      </div>
    </section>\`;
  document.getElementById("sign-in-google").onclick = () => signInWith("google");
}

function renderShell(user) {
  root.innerHTML = \`
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h2 style="margin:0;">\${t.myPages}</h2>
      <div class="row">
        <button id="upload-page" class="btn" style="padding:8px 14px;">\${t.newUpload}</button>
        <button id="blank-page" class="btn ghost" style="padding:8px 14px;">\${t.newBlank}</button>
        <button id="sign-out" class="btn ghost" style="padding:8px 14px;">\${t.signOut}</button>
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
  list.innerHTML = \`<li class="muted">\${t.loading}</li>\`;
  try {
    const { pages } = await api("/api/pages");
    if (!pages.length) {
      list.innerHTML = \`<li class="muted">\${t.noPages}</li>\`;
      return;
    }
    const copiedMsg = LANG === "zh" ? "链接已复制 📋" : "Link copied 📋";
    list.innerHTML = pages
      .map(
        (p) => {
          const pageUrl = p.subdomain ? "https://" + p.subdomain + ".hosthtml.online" : window.location.origin + "/p/" + p.id;
          return \`
        <li class="my-card">
          <div class="my-card-cover" \${p.cover ? \`style="background-image:url('/covers/\${p.id}')"\` : ""}>\${p.cover ? "" : '<span class="my-card-cover-ph">&lt;/&gt;</span>'}</div>
          <div class="my-card-body">
            <div class="my-card-top">
              <a href="#" data-id="\${p.id}" class="my-card-title" title="\${escapeHtml(p.title)}">\${escapeHtml(p.title) || "(untitled)"}</a>
              <span class="vis \${p.isPublic ? "pub" : "priv"}">\${p.isPublic ? t.pub : t.priv}</span>
            </div>
            \${p.description ? \`<div class="my-card-desc">\${escapeHtml(p.description)}</div>\` : ""}
            <div class="my-card-url">
              <span class="my-url-text" title="\${escapeHtml(pageUrl)}">\${escapeHtml(pageUrl)}</span>
              <button class="my-url-copy" data-url="\${escapeHtml(pageUrl)}" title="copy">📋</button>
            </div>
            <div class="my-card-meta">\${fmtSize(p.size)} · \${new Date(p.updatedAt).toLocaleString()}</div>
            <div class="page-actions">
              <button class="edit" data-id="\${p.id}">\${t.actEdit}</button>
              <button class="view" data-id="\${p.id}">\${t.actView}</button>
              <button class="pub-toggle" data-id="\${p.id}" data-pub="\${p.isPublic}">\${p.isPublic ? t.actPriv : t.actPub}</button>
              <button class="del" data-id="\${p.id}">🗑</button>
            </div>
          </div>
        </li>\`;
        },
      )
      .join("");
    list.querySelectorAll(".my-card-title, .view").forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        const id = el.dataset.id;
        location.href = "/p/" + id;
      };
    });
    list.querySelectorAll(".my-url-copy").forEach((b) => {
      b.onclick = () => copyText(b.dataset.url, copiedMsg);
    });
    list.querySelectorAll(".edit").forEach((b) => {
      b.onclick = () => { location.href = "/app/editor?pageId=" + b.dataset.id + (LANG === "zh" ? "&lang=zh" : ""); };
    });
    list.querySelectorAll(".pub-toggle").forEach((b) => {
      b.onclick = async () => {
        const isPublic = b.dataset.pub === "true" ? false : true;
        try {
          await api(\`/api/pages/\${b.dataset.id}\`, { method: "PUT", body: JSON.stringify({ isPublic }) });
          toast(isPublic ? (LANG === "zh" ? "已发布 🌍" : "Published 🌍") : (LANG === "zh" ? "已设为私有 🔒" : "Made private 🔒"));
          loadPages();
        } catch (err) { toast(t.error + err.message); }
      };
    });
    list.querySelectorAll(".del").forEach((b) => {
      b.onclick = async () => {
        if (!confirm(t.delConfirm)) return;
        try {
          await api(\`/api/pages/\${b.dataset.id}\`, { method: "DELETE" });
          toast(LANG === "zh" ? "已删除" : "Deleted");
          loadPages();
        } catch (err) { toast(t.error + err.message); }
      };
    });
  } catch (err) {
    list.innerHTML = \`<li>\${t.error} \${escapeHtml(err.message)}</li>\`;
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
    if (file.size > 2 * 1024 * 1024) { toast(t.uploadTooBig); return; }
    const content = await file.text();
    const title = file.name.replace(/\\.(html?)$/i, "") || "Untitled";
    // Auto-extract description + cover image from the HTML.
    const { description, cover } = extractPageMeta(content);
    let coverData = null;
    if (cover) {
      try {
        if (cover.startsWith("data:image/")) {
          // Inline image already — use it directly (it's already small enough).
          coverData = cover;
        } else {
          // External URL — fetch (same-origin/relative resolved) and compress.
          const abs = new URL(cover, window.location.origin).href;
          const blob = await (await fetch(abs)).blob();
          coverData = await compressImage(new File([blob], "cover", { type: blob.type || "image/png" }));
        }
      } catch (e) { /* cover extraction failed — ignore */ }
    }
    try {
      const { page } = await api("/api/pages", {
        method: "POST",
        body: JSON.stringify({ title, content, description, cover: coverData || undefined }),
        timeout: 60000,
      });
      toast(t.uploaded);
      location.href = "/app/editor?pageId=" + page.id + (LANG === "zh" ? "&lang=zh" : "");
    } catch (err) { toast(t.uploadFailed + err.message); }
  };
  input.click();
}

// Create a blank page and open the editor.
async function blankPage() {
  const title = prompt(t.noTitle);
  if (!title) return;
  try {
    const { page } = await api("/api/pages", {
      method: "POST",
      body: JSON.stringify({ title, content: "<!doctype html>\\n<html>\\n<head>\\n<meta charset=\\"utf-8\\" />\\n<title>" + title + "</title>\\n</head>\\n<body>\\n\\n</body>\\n</html>" }),
    });
    location.href = "/app/editor?pageId=" + page.id + (LANG === "zh" ? "&lang=zh" : "");
  } catch (err) { toast(t.error + err.message); }
}

// --- Editor view (loaded on /app/editor?pageId=...) ---
async function renderEditor(pageId) {
  let page = null;
  try {
    const res = await api(\`/api/pages/\${pageId}\`, { timeout: 30000 });
    page = res.page;
  } catch (err) {
    root.innerHTML = \`<p>\${t.loadFailed} \${escapeHtml(err.message)}</p>\`;
    return;
  }
  const moreLabel = LANG === "zh" ? "更多设置 ▾" : "More settings ▾";
  root.innerHTML = \`
    <div class="row" style="justify-content:space-between; align-items:center;">
      <input id="ed-title" class="ed-title-input" value="\${escapeHtml(page.title)}" placeholder="\${LANG === "zh" ? "页面标题" : "Page title"}" />
      <div class="row">
        <button id="ed-open" class="btn ghost" style="padding:8px 14px;">\${t.open}</button>
        <button id="ed-back" class="btn ghost" style="padding:8px 14px;">\${t.back}</button>
        <button id="ed-save" class="btn" style="padding:8px 14px;">\${t.save}</button>
      </div>
    </div>
    <div class="muted" style="margin-bottom:10px;">
      <span class="vis \${page.isPublic ? "pub" : "priv"}">\${page.isPublic ? t.pub : t.priv}</span>
      <label style="margin-left:12px;"><input type="checkbox" id="ed-pub" \${page.isPublic ? "checked" : ""} /> \${LANG === "zh" ? "公开" : "Public"}</label>
    </div>
    <button id="ed-more" class="btn ghost" style="padding:6px 12px; font-size:13px; margin-bottom:12px;">\${moreLabel}</button>
    <div id="ed-advanced" class="ed-advanced" style="display:none;">
      <div class="muted" style="margin-bottom:12px;">
        <label>\${t.subLabel}：<input id="ed-sub" style="width:220px;" value="\${escapeHtml(page.subdomain || "")}" placeholder="\${t.subPlaceholder}" /> .hosthtml.online</label>
        <button id="ed-copy-sub" style="margin-left:8px; padding:5px 11px; font-size:12.5px; border-radius:7px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer;">\${t.subCopy}</button>
      </div>
      <div class="muted" style="margin-bottom:12px;">
        <label>\${t.descLabel}：<input id="ed-desc" style="width:70%;" value="\${escapeHtml(page.description || "")}" placeholder="\${t.descPlaceholder}" maxlength="200" /></label>
      </div>
      <div class="muted" style="margin-bottom:12px; display:flex; align-items:center; gap:12px;">
        <span>\${t.coverLabel}：</span>
        <img id="ed-cover-preview" style="width:120px; height:68px; object-fit:cover; border-radius:8px; border:1px solid var(--border); \${page.cover ? "" : "display:none;"}" src="/covers/\${page.id}" alt="" />
        <button id="ed-cover-pick" style="padding:5px 11px; font-size:12.5px; border-radius:7px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer;">\${t.coverUpload}</button>
        <button id="ed-cover-remove" style="padding:5px 11px; font-size:12.5px; border-radius:7px; border:1px solid var(--border); background:transparent; color:#f85149; cursor:pointer; \${page.cover ? "" : "display:none;"}">\${t.coverRemove}</button>
      </div>
    </div>
    <textarea id="ed-content" spellcheck="false">\${escapeHtml(page.content || "")}</textarea>\`;
  // Toggle the advanced settings (subdomain, description, cover).
  const adv = document.getElementById("ed-advanced");
  const advBtn = document.getElementById("ed-more");
  let advOpen = false;
  advBtn.onclick = () => {
    advOpen = !advOpen;
    adv.style.display = advOpen ? "" : "none";
    advBtn.textContent = advOpen ? (LANG === "zh" ? "收起设置 ▴" : "Hide settings ▴") : moreLabel;
  };
  document.getElementById("ed-copy-sub").onclick = () => {
    const sub = (document.getElementById("ed-sub").value.trim() || "").toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const url = sub ? "https://" + sub + ".hosthtml.online" : window.location.origin + "/p/" + pageId;
    const text = page.isPublic ? url : url + t.pubNotYet;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => toast(t.copied)).catch(() => toast(text));
    } else {
      toast(text);
    }
  };
  // Track a newly-picked cover (data URL) so save can upload it; '' removes.
  let coverDataUrl = null; // null = unchanged, '' = remove, else new data URL
  document.getElementById("ed-cover-pick").onclick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      try { coverDataUrl = await compressImage(f); }
      catch (e) { toast(t.coverFailed + e.message); return; }
      const img = document.getElementById("ed-cover-preview");
      img.src = coverDataUrl; img.style.display = "";
      document.getElementById("ed-cover-remove").style.display = "";
      toast(t.coverReady);
    };
    input.click();
  };
  document.getElementById("ed-cover-remove").onclick = () => {
    coverDataUrl = "";
    const img = document.getElementById("ed-cover-preview");
    img.style.display = "none";
    document.getElementById("ed-cover-remove").style.display = "none";
  };

  document.getElementById("ed-save").onclick = async () => {
    const content = document.getElementById("ed-content").value;
    const isPublic = document.getElementById("ed-pub").checked;
    const title = (document.getElementById("ed-title").value.trim() || page.title) ;
    const subdomain = document.getElementById("ed-sub").value.trim();
    const description = document.getElementById("ed-desc").value.trim();
    const payload = { content, isPublic, title, subdomain, description };
    if (coverDataUrl !== null) payload.cover = coverDataUrl; // new data URL or '' to remove
    try {
      await api(\`/api/pages/\${pageId}\`, { method: "PUT", body: JSON.stringify(payload), timeout: 60000 });
      toast(t.saved);
      coverDataUrl = null;
    } catch (err) { toast(t.saveFailed + err.message); }
  };
  document.getElementById("ed-open").onclick = () => { location.href = "/p/" + pageId; };
  document.getElementById("ed-back").onclick = () => { location.href = "/app" + (LANG === "zh" ? "?lang=zh" : ""); };
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

// --- i18n ---
const LANG_EN = {
  htmlLang: "en",
  navManage: "My Pages",
  heroTagline:
    "Upload, edit and share HTML pages. Sign in with Google, keep your pages private or publish them for the world, and open them in any browser.",
  heroCta: "Sign in to upload / manage →",
  pubTitle: "Recently published",
  pubEmpty: "No public pages yet. Sign in and publish your first HTML page.",
  prev: "← Prev",
  next: "Next →",
  fSubdomainT: "Your own subdomain",
  fSubdomainD: "Every public page gets a unique address like my-page.hosthtml.online. Share it anywhere.",
  fPrivT: "Private or public",
  fPrivD: "Keep pages private for yourself, or publish them publicly with one click. Private pages are never served.",
  fEditT: "Edit in the browser",
  fEditD: "Edit your HTML right in the app with a source editor. Ctrl/Cmd+S to save, instant updates.",
  fNoServerT: "No server setup",
  fNoServerD: "Hosted on Cloudflare's global edge. No servers to manage, no builds, just upload and go.",
  appTitle: "HostHTML App · Manage Your Hosted HTML Pages",
  appDesc: "Sign in and manage your hosted HTML pages on HostHTML: create, edit, publish or make pages private.",
  appLoading: "Loading…",
  dateLocale: "en-US",
};
const LANG_ZH: typeof LANG_EN = {
  htmlLang: "zh-CN",
  navManage: "我的页面",
  heroTagline: "上传、编辑和分享 HTML 页面。用 Google 登录，页面可设为私有或公开，任何浏览器都能打开。",
  heroCta: "登录后上传 / 管理 →",
  pubTitle: "最新发布",
  pubEmpty: "还没有公开页面。登录并发布你的第一个 HTML 页面吧。",
  prev: "← 上一页",
  next: "下一页 →",
  fSubdomainT: "专属子域名",
  fSubdomainD: "每个公开页面都有专属地址，如 my-page.hosthtml.online。随处分享。",
  fPrivT: "私有或公开",
  fPrivD: "页面可设为仅自己可见，也可一键公开分享。私有页面永不被访问。",
  fEditT: "浏览器内编辑",
  fEditD: "在应用内用源码编辑器直接编辑 HTML。Ctrl/Cmd+S 保存，即时生效。",
  fNoServerT: "无需服务器",
  fNoServerD: "托管在 Cloudflare 全球边缘。无需管理服务器、无需构建，上传即用。",
  appTitle: "HostHTML 应用 · 管理你的托管页面",
  appDesc: "登录 HostHTML 管理你的托管 HTML 页面：创建、编辑、发布或设为私有。",
  appLoading: "加载中…",
  dateLocale: "zh-CN",
};

// Redirect to the persisted language (localStorage "hh-lang") if the current
// URL doesn't carry a ?lang= override and the persisted language differs from
// the server-rendered one. Runs early in <head> to avoid a flash.
const LANG_REDIRECT_JS = `(function () {
  try {
    var saved = localStorage.getItem("hh-lang");
    if (saved !== "zh" && saved !== "en") return;
    var params = new URLSearchParams(location.search);
    if (params.has("lang")) return; // explicit override wins
    var cur = ${JSON.stringify("${IS_ZH}")} === "zh" ? "zh" : "en";
    if (saved !== cur) {
      params.set("lang", saved);
      location.replace(location.pathname + "?" + params.toString());
    }
  } catch (e) {}
})();`;

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
  .icon-btn { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; height: 34px; padding: 0 10px; border-radius: 9px; border: 1px solid var(--border); background: var(--bg-elev); color: var(--text); font-size: 12.5px; font-weight: 600; cursor: pointer; text-decoration: none !important; transition: background .12s; }
  .icon-btn:hover { background: var(--bg-soft); }
  .wrap { max-width: 860px; margin: 0 auto; padding: 32px 24px 60px; }
  .card { border: 1px solid var(--border); border-radius: 12px; padding: 20px; background: var(--bg-elev); }
  .muted { opacity: .7; font-size: 13px; }
  textarea, input { padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border); background: transparent; color: inherit; font-family: inherit; font-size: 14px; }
  textarea { width: 100%; min-height: 60vh; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; line-height: 1.6; resize: vertical; }
  .row { display: flex; gap: 10px; align-items: center; }
  /* my pages card grid */
  ul.pages { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  ul.pages a { font-weight: 600; color: var(--text); text-decoration: none; }
  ul.pages a:hover { color: var(--accent); }
  .my-card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-elev); transition: transform .12s, box-shadow .12s, border-color .12s; display: flex; flex-direction: column; }
  .my-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.08); border-color: var(--accent); }
  .my-card-cover { height: 130px; background-color: var(--bg-soft); background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; flex: none; }
  .my-card-cover-ph { font-size: 26px; color: var(--muted); font-family: ui-monospace, monospace; }
  .my-card-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .my-card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .my-card-title { font-weight: 650; font-size: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .my-card-desc { color: var(--muted); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .my-card-url { display: flex; align-items: center; gap: 6px; background: var(--bg-soft); border-radius: 7px; padding: 4px 8px; }
  .my-url-text { font-size: 11.5px; color: var(--muted); font-family: ui-monospace, monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .my-url-copy { flex: none; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; padding: 2px; }
  .my-url-copy:hover { color: var(--accent); }
  .my-card-meta { font-size: 12px; color: var(--muted); }
  .vis { font-size: 12px; padding: 2px 8px; border-radius: 20px; flex: none; }
  .vis.pub { background: rgba(46,160,67,.15); color: #2da44e; }
  .vis.priv { background: rgba(177,186,196,.2); color: var(--muted); }
  .page-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .page-actions button { padding: 5px 11px; font-size: 12.5px; border-radius: 7px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer; }
  .page-actions button:hover { background: var(--bg-soft); }
  .page-actions button.edit { border-color: rgba(47,129,247,.5); color: #2f81f7; }
  .page-actions button.pub-toggle { border-color: rgba(46,160,67,.5); color: #2da44e; }
  .page-actions button.del { border-color: rgba(248,81,73,.5); color: #f85149; }
  /* editor title input + advanced settings */
  .ed-title-input { flex: 1; font-size: 20px; font-weight: 700; border: 1px solid var(--border); border-radius: 9px; padding: 8px 12px; background: transparent; color: var(--text); min-width: 0; }
  .ed-advanced { border: 1px dashed var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
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
  /* recently published cards */
  .pub-section { margin-top: 44px; }
  .pub-section h2 { font-size: 20px; margin: 0 0 14px; }
  .pub-list { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
  .pub-card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-elev); transition: transform .12s, box-shadow .12s, border-color .12s; }
  .pub-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.08); border-color: var(--accent); }
  .pub-card-link { text-decoration: none !important; display: block; }
  .pub-cover { height: 130px; background-color: var(--bg-soft); background-size: cover; background-position: center; display: flex; align-items: center; justify-content: center; }
  .pub-cover-placeholder { font-size: 28px; color: var(--muted); font-family: ui-monospace, monospace; }
  .pub-card-body { padding: 12px 14px 14px; }
  .pub-card-title { font-weight: 650; color: var(--text); font-size: 15px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pub-card-desc { color: var(--muted); font-size: 13px; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .pub-card-meta { font-size: 12px; color: var(--muted); }
  .pub-card-meta code { font-family: ui-monospace, monospace; }
  .pub-list li.empty { grid-column: 1 / -1; justify-self: center; color: var(--muted); padding: 20px; }
  .pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 22px; }
  .pager .pg { padding: 6px 14px; border: 1px solid var(--border); border-radius: 8px; color: var(--text); text-decoration: none; font-size: 13px; }
  .pager .pg:hover { background: var(--bg-soft); border-color: var(--accent); color: var(--accent); }
  .pager .pg.off { opacity: .4; pointer-events: none; }
  .pager .pg-now { font-size: 13px; color: var(--muted); }
  @media (max-width: 640px) { .hero h1 { font-size: 30px; } ul.pages { grid-template-columns: 1fr; } }
`;

export interface AppProps {
  path: string;
  lang?: string;
}

function NAVBAR(isZh: boolean): string {
  const L = isZh ? LANG_ZH : LANG_EN;
  const other = isZh ? "en" : "zh";
  return `
  <div class="nav-wrap">
    <nav>
      <a href="/" class="brand"><span class="logo">&lt;/&gt;</span> HostHTML</a>
      <div class="center"></div>
      <div class="right">
        <a class="btn ghost" href="/app${isZh ? "?lang=zh" : ""}">⬆ ${L.navManage}</a>
        <a class="icon-btn lang-btn" id="lang-toggle" href="#" title="${other === "zh" ? "中文" : "English"}" aria-label="language">${isZh ? "EN" : "中文"}</a>
      </div>
    </nav>
  </div>
  <script>
  (function () {
    var btn = document.getElementById("lang-toggle");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var to = ${JSON.stringify(other)};
      try { localStorage.setItem("hh-lang", to); } catch (err) {}
      var p = location.pathname;
      var q = new URLSearchParams(location.search);
      q.set("lang", to);
      location.href = p + "?" + q.toString();
    });
  })();
  </script>`;
}

/** Generic app shell — the client app.js decides login vs dashboard. */
export function renderApp(props: AppProps): string {
  const isZh = props.lang === "zh";
  const L = isZh ? LANG_ZH : LANG_EN;
  const title = L.appTitle;
  const desc = L.appDesc;
  return `<!doctype html>
<html lang="${L.htmlLang}">
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
<script>${LANG_REDIRECT_JS.replace(/\$\{IS_ZH\}/g, isZh ? "zh" : "en")}</script>
<style>
${BASE_CSS}
</style>
</head>
<body>
  ${NAVBAR(isZh)}
  <main id="root" class="wrap">${L.appLoading}</main>
  <div class="toast" id="toast"></div>
  <script>${CLIENT_JS}</script>
</body>
</html>`;
}

export interface PublicPage {
  id: string;
  title: string;
  subdomain: string | null;
  cover: string | null;
  description: string | null;
  updatedAt: number;
}

/** Landing page. */
export function renderLanding(
  opts: { pages: PublicPage[]; page: number; totalPages: number; lang?: string } = { pages: [], page: 1, totalPages: 1 },
): string {
  const isZh = opts.lang === "zh";
  const L = isZh ? LANG_ZH : LANG_EN;
  const title = isZh ? "HostHTML · 免费 HTML 托管、编辑与分享" : "HostHTML · Free HTML Hosting, Editor & Sharing";
  const desc = isZh
    ? "免费 HTML 托管与分享。在线上传、编辑、发布 HTML 页面，可设为私有或公开分享给任何人。无需服务器，任何浏览器都能打开。"
    : "Free HTML hosting & sharing. Upload, edit and publish HTML pages online — keep them private or share publicly with anyone. No server setup, works in any browser.";

  // Paginated list of recently published pages, shown as cards.
  const listItems = opts.pages.length
    ? opts.pages
        .map(
          (p) => `
        <li class="pub-card">
          <a class="pub-card-link" href="/p/${esc(p.id)}">
            <div class="pub-cover" ${p.cover ? `style="background-image:url('/covers/${esc(p.id)}')"` : ""}>${p.cover ? "" : '<span class="pub-cover-placeholder">&lt;/&gt;</span>'}</div>
            <div class="pub-card-body">
              <div class="pub-card-title">${esc(p.title) || "(untitled)"}</div>
              ${p.description ? `<div class="pub-card-desc">${esc(p.description)}</div>` : ""}
              <div class="pub-card-meta">${p.subdomain ? `<code>${esc(p.subdomain)}.hosthtml.online</code>` : ""} · ${new Date(p.updatedAt).toLocaleDateString(L.dateLocale)}</div>
            </div>
          </a>
        </li>`,
        )
        .join("")
    : `<li class="empty">${L.pubEmpty}</li>`;

  // Pagination controls.
  let pager = "";
  if (opts.totalPages > 1) {
    const prevHref = opts.page > 1 ? `/?lang=${isZh ? "zh" : "en"}&page=${opts.page - 1}` : null;
    const nextHref = opts.page < opts.totalPages ? `/?lang=${isZh ? "zh" : "en"}&page=${opts.page + 1}` : null;
    pager = `<div class="pager">
      ${prevHref ? `<a class="pg" href="${prevHref}">${L.prev}</a>` : `<span class="pg off">${L.prev}</span>`}
      <span class="pg-now">${opts.page} / ${opts.totalPages}</span>
      ${nextHref ? `<a class="pg" href="${nextHref}">${L.next}</a>` : `<span class="pg off">${L.next}</span>`}
    </div>`;
  }

  return `<!doctype html>
<html lang="${L.htmlLang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<meta name="description" content="${desc}" />
${seoMeta({ title, desc, path: "/" })}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%234f8cff'/%3E%3Cstop offset='1' stop-color='%237c5cff'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='url(%23g)'/%3E%3Cpath d='M20 20h24v6H26v6h14v6H26v6h18v6H20z' fill='%23fff'/%3E%3C/svg%3E" />
${JSONLD_WEBSITE}
<script>${LANG_REDIRECT_JS.replace(/\$\{IS_ZH\}/g, isZh ? "zh" : "en")}</script>
<style>
${BASE_CSS}
</style>
</head>
<body>
  ${NAVBAR(isZh)}
  <main class="wrap">
    <section class="hero">
      <h1>HostHTML</h1>
      <p>${L.heroTagline}</p>
      <a class="btn" href="/app${isZh ? "?lang=zh" : ""}">${L.heroCta}</a>
    </section>

    <section class="pub-section">
      <h2>${L.pubTitle}</h2>
      <ul class="pub-list">${listItems}</ul>
      ${pager}
    </section>

    <section class="features">
      <div class="feature">
        <div class="icon">🌐</div>
        <h3>${L.fSubdomainT}</h3>
        <p>${L.fSubdomainD}</p>
      </div>
      <div class="feature">
        <div class="icon">🔒</div>
        <h3>${L.fPrivT}</h3>
        <p>${L.fPrivD}</p>
      </div>
      <div class="feature">
        <div class="icon">✏️</div>
        <h3>${L.fEditT}</h3>
        <p>${L.fEditD}</p>
      </div>
      <div class="feature">
        <div class="icon">🚀</div>
        <h3>${L.fNoServerT}</h3>
        <p>${L.fNoServerD}</p>
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
