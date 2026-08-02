"use client";

import { useEffect, useState } from "react";
import { loadSubject } from "@/lib/dataset";
import type { DataSource, SubjectBundle } from "@/lib/types";

/** Loads one subject's bundle. Cached in lib/dataset, so re-selecting is free. */
export function useSubjectBundle(subjectId: string | null, source: DataSource = "synthetic"): SubjectBundle | null {
  const [bundle, setBundle] = useState<SubjectBundle | null>(null);

  useEffect(() => {
    if (!subjectId) {
      setBundle(null);
      return;
    }
    let live = true;
    loadSubject(subjectId, source)
      .then((next) => {
        if (live) setBundle(next);
      })
      .catch((err) => console.error(`subject ${subjectId} (${source}) failed to load`, err));
    return () => {
      live = false;
    };
  }, [subjectId, source]);

  return bundle;
}
