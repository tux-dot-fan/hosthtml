import type { Env } from "../env";

/** R2 key for a user's page content. */
export function pageKey(userId: string, pageId: string): string {
  return `users/${userId}/${pageId}.html`;
}

export async function getHtml(env: Env, key: string): Promise<string | null> {
  const obj = await env.HTML_BUCKET.get(key);
  if (!obj) return null;
  return await obj.text();
}

export async function putHtml(env: Env, key: string, content: string): Promise<number> {
  await env.HTML_BUCKET.put(key, content, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  return new TextEncoder().encode(content).length;
}

export async function deleteHtml(env: Env, key: string): Promise<void> {
  await env.HTML_BUCKET.delete(key);
}

// --- Cover images ---

/** R2 key for a page's cover image. */
export function coverKey(pageId: string, ext: string): string {
  return `covers/${pageId}.${ext}`;
}

/** Store a cover image (base64 data URL or raw base64) and return its R2 key. */
export async function putCover(env: Env, pageId: string, dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
  if (!m) throw new Error("invalid cover image");
  const contentType = m[1];
  const base64 = m[2];
  const ext = contentType === "image/png" ? "png" : contentType === "image/gif" ? "gif" : contentType === "image/webp" ? "webp" : "jpg";
  const key = coverKey(pageId, ext);
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  await env.HTML_BUCKET.put(key, bytes, { httpMetadata: { contentType } });
  return key;
}

export async function getCover(env: Env, key: string): Promise<{ body: ReadableStream; contentType: string } | null> {
  const obj = await env.HTML_BUCKET.get(key);
  if (!obj) return null;
  return { body: obj.body, contentType: obj.httpMetadata?.contentType || "image/jpeg" };
}

export async function deleteCover(env: Env, key: string): Promise<void> {
  await env.HTML_BUCKET.delete(key);
}
