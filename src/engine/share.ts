import type { FamilyPlan } from "./types";

/**
 * Encodes a plan into a URL-safe string so a partner can open the same plan
 * with no account and no server: JSON, deflate-compressed when the browser
 * supports CompressionStream, then base64url.
 */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodePlan(plan: FamilyPlan): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(plan));
  if (typeof CompressionStream === "undefined") return `j.${toBase64Url(json)}`;
  return `z.${toBase64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
}

export async function decodePlan(token: string): Promise<unknown> {
  const [kind, body] = [token.slice(0, 2), token.slice(2)];
  const bytes = fromBase64Url(body);
  const json = kind === "z." ? await pipe(bytes, new DecompressionStream("deflate-raw")) : bytes;
  return JSON.parse(new TextDecoder().decode(json));
}
