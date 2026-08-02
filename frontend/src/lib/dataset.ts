import type { DataSource, Manifest, SubjectBundle } from "./types";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Which dataset the app opens on. Every surface derives from this — the
 * workspace store, the case gallery, and the landing dive — so the three can
 * never disagree about which subject ids are valid. The two datasets do not
 * share ids, and a mismatch 404s into blank panels.
 */
export const DEFAULT_DATA_SOURCE: DataSource = "real";

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

export function loadManifest(source: DataSource = DEFAULT_DATA_SOURCE): Promise<Manifest> {
  return getJson<Manifest>(`/data/${source}/manifest.json`);
}

export function loadSubject(subject: string, source: DataSource = DEFAULT_DATA_SOURCE): Promise<SubjectBundle> {
  return getJson<SubjectBundle>(`/data/${source}/${subject}.json`);
}
