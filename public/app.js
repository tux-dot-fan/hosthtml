// HostHTML app shell: login / pages list / create / edit / visibility.
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
      body: JSON.stringify({ provider, callbackURL: "/app" + (LANG === "zh" ? "?lang=zh" : "") }),
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
      <h2>${t.loginTitle}</h2>
      <p class="muted">${t.loginSub}</p>
      ${errBlock}
      <div style="margin-top:14px;">
        <button id="sign-in-google" class="provider-btn" style="width:100%;">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.5 2.4-7.2 2.4-5.1 0-9.5-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C41.4 35.7 44 30.4 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          ${t.loginGoogle}
        </button>
      </div>
    </section>`;
  document.getElementById("sign-in-google").onclick = () => signInWith("google");
}

function renderShell(user) {
  root.innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:center;">
      <h2 style="margin:0;">${t.myPages}</h2>
      <div class="row">
        <button id="upload-page" class="btn" style="padding:8px 14px;">${t.newUpload}</button>
        <button id="blank-page" class="btn ghost" style="padding:8px 14px;">${t.newBlank}</button>
        <button id="sign-out" class="btn ghost" style="padding:8px 14px;">${t.signOut}</button>
      </div>
    </div>
    <p class="muted">${escapeHtml(user.email)}</p>
    <ul class="pages" id="page-list"></ul>`;
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
  list.innerHTML = `<li class="muted">${t.loading}</li>`;
  try {
    const { pages } = await api("/api/pages");
    if (!pages.length) {
      list.innerHTML = `<li class="muted">${t.noPages}</li>`;
      return;
    }
    const copiedMsg = LANG === "zh" ? "链接已复制 📋" : "Link copied 📋";
    list.innerHTML = pages
      .map(
        (p) => {
          const pageUrl = p.subdomain ? "https://" + p.subdomain + ".hosthtml.online" : window.location.origin + "/p/" + p.id;
          return `
        <li class="my-card">
          <div class="my-card-cover" ${p.cover ? `style="background-image:url('/covers/${p.id}')"` : ""}>${p.cover ? "" : '<span class="my-card-cover-ph">&lt;/&gt;</span>'}</div>
          <div class="my-card-body">
            <div class="my-card-top">
              <a href="#" data-id="${p.id}" class="my-card-title" title="${escapeHtml(p.title)}">${escapeHtml(p.title) || "(untitled)"}</a>
              <span class="vis ${p.isPublic ? "pub" : "priv"}">${p.isPublic ? t.pub : t.priv}</span>
            </div>
            ${p.description ? `<div class="my-card-desc">${escapeHtml(p.description)}</div>` : ""}
            <div class="my-card-url">
              <span class="my-url-text" title="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</span>
              <button class="my-url-copy" data-url="${escapeHtml(pageUrl)}" title="copy">📋</button>
            </div>
            <div class="my-card-meta">${fmtSize(p.size)} · ${new Date(p.updatedAt).toLocaleString()}</div>
            <div class="page-actions">
              <button class="edit" data-id="${p.id}">${t.actEdit}</button>
              <button class="view" data-id="${p.id}">${t.actView}</button>
              <button class="pub-toggle" data-id="${p.id}" data-pub="${p.isPublic}">${p.isPublic ? t.actPriv : t.actPub}</button>
              <button class="del" data-id="${p.id}">🗑</button>
            </div>
          </div>
        </li>`;
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
          await api(`/api/pages/${b.dataset.id}`, { method: "PUT", body: JSON.stringify({ isPublic }) });
          toast(isPublic ? (LANG === "zh" ? "已发布 🌍" : "Published 🌍") : (LANG === "zh" ? "已设为私有 🔒" : "Made private 🔒"));
          loadPages();
        } catch (err) { toast(t.error + err.message); }
      };
    });
    list.querySelectorAll(".del").forEach((b) => {
      b.onclick = async () => {
        if (!confirm(t.delConfirm)) return;
        try {
          await api(`/api/pages/${b.dataset.id}`, { method: "DELETE" });
          toast(LANG === "zh" ? "已删除" : "Deleted");
          loadPages();
        } catch (err) { toast(t.error + err.message); }
      };
    });
  } catch (err) {
    list.innerHTML = `<li>${t.error} ${escapeHtml(err.message)}</li>`;
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
    const title = file.name.replace(/\.(html?)$/i, "") || "Untitled";
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
      body: JSON.stringify({ title, content: "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\" />\n<title>" + title + "</title>\n</head>\n<body>\n\n</body>\n</html>" }),
    });
    location.href = "/app/editor?pageId=" + page.id + (LANG === "zh" ? "&lang=zh" : "");
  } catch (err) { toast(t.error + err.message); }
}

// --- Editor view (loaded on /app/editor?pageId=...) ---
async function renderEditor(pageId) {
  let page = null;
  try {
    const res = await api(`/api/pages/${pageId}`, { timeout: 30000 });
    page = res.page;
  } catch (err) {
    root.innerHTML = `<p>${t.loadFailed} ${escapeHtml(err.message)}</p>`;
    return;
  }
  const moreLabel = LANG === "zh" ? "更多设置 ▾" : "More settings ▾";
  root.innerHTML = `
    <div class="row" style="justify-content:space-between; align-items:center;">
      <input id="ed-title" class="ed-title-input" value="${escapeHtml(page.title)}" placeholder="${LANG === "zh" ? "页面标题" : "Page title"}" />
      <div class="row">
        <button id="ed-open" class="btn ghost" style="padding:8px 14px;">${t.open}</button>
        <button id="ed-back" class="btn ghost" style="padding:8px 14px;">${t.back}</button>
        <button id="ed-save" class="btn" style="padding:8px 14px;">${t.save}</button>
      </div>
    </div>
    <div class="muted" style="margin-bottom:10px;">
      <span class="vis ${page.isPublic ? "pub" : "priv"}">${page.isPublic ? t.pub : t.priv}</span>
      <label style="margin-left:12px;"><input type="checkbox" id="ed-pub" ${page.isPublic ? "checked" : ""} /> ${LANG === "zh" ? "公开" : "Public"}</label>
    </div>
    <button id="ed-more" class="btn ghost" style="padding:6px 12px; font-size:13px; margin-bottom:12px;">${moreLabel}</button>
    <div id="ed-advanced" class="ed-advanced" style="display:none;">
      <div class="muted" style="margin-bottom:12px;">
        <label>${t.subLabel}：<input id="ed-sub" style="width:220px;" value="${escapeHtml(page.subdomain || "")}" placeholder="${t.subPlaceholder}" /> .hosthtml.online</label>
        <button id="ed-copy-sub" style="margin-left:8px; padding:5px 11px; font-size:12.5px; border-radius:7px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer;">${t.subCopy}</button>
      </div>
      <div class="muted" style="margin-bottom:12px;">
        <label>${t.descLabel}：<input id="ed-desc" style="width:70%;" value="${escapeHtml(page.description || "")}" placeholder="${t.descPlaceholder}" maxlength="200" /></label>
      </div>
      <div class="muted" style="margin-bottom:12px; display:flex; align-items:center; gap:12px;">
        <span>${t.coverLabel}：</span>
        <img id="ed-cover-preview" style="width:120px; height:68px; object-fit:cover; border-radius:8px; border:1px solid var(--border); ${page.cover ? "" : "display:none;"}" src="/covers/${page.id}" alt="" />
        <button id="ed-cover-pick" style="padding:5px 11px; font-size:12.5px; border-radius:7px; border:1px solid var(--border); background:transparent; color:var(--text); cursor:pointer;">${t.coverUpload}</button>
        <button id="ed-cover-remove" style="padding:5px 11px; font-size:12.5px; border-radius:7px; border:1px solid var(--border); background:transparent; color:#f85149; cursor:pointer; ${page.cover ? "" : "display:none;"}">${t.coverRemove}</button>
      </div>
    </div>
    <textarea id="ed-content" spellcheck="false">${escapeHtml(page.content || "")}</textarea>`;
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
      await api(`/api/pages/${pageId}`, { method: "PUT", body: JSON.stringify(payload), timeout: 60000 });
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

  if (path === "/") {
    // Home page: bind the copy button on each published-page card.
    const copiedMsg = LANG === "zh" ? "链接已复制 📋" : "Link copied 📋";
    document.querySelectorAll(".pub-url-copy").forEach((b) => {
      b.onclick = () => copyText(b.dataset.url, copiedMsg);
    });
    return;
  }
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
