import type { Manifest, SubjectBundle } from "./types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Prefix a public/ path with the deploy base path (GitHub Pages subpaths). */
export function assetUrl(path: string): string {
  return `${BASE}${path}`;
}

// One in-flight request per URL, kept for the session. A subject bundle is
// ~226 KB; a judge flipping through the roster on hotel wifi should pay that
// once. The manifest is loaded on boot and never refetched.
const cache = new Map<string, Promise<unknown>>();

function getJson<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  let pending = cache.get(url) as Promise<T> | undefined;
  if (!pending) {
    pending = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`${url} -> ${res.status}`);
      return res.json() as Promise<T>;
    });
    cache.set(url, pending);
  }
  return pending;
}

export function loadManifest(): Promise<Manifest> {
  return getJson<Manifest>("/data/manifest.json");
}

export function loadSubject(subject: string): Promise<SubjectBundle> {
  return getJson<SubjectBundle>(`/data/${subject}.json`);
}
