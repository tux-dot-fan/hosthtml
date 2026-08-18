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
