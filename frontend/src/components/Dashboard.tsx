"use client";

import { useEffect, useState } from "react";
import { AppFooter, AppHeader } from "./AppChrome";
import { CompareView } from "./CompareView";
import { ManualView } from "./manual/ManualView";
import { MonitorView } from "./MonitorView";
import { useSubjectBundle } from "@/hooks/useSubjectBundle";
import { loadManifest } from "@/lib/dataset";
import { CONDITIONS, type Condition, type Manifest } from "@/lib/types";
import { MonitorProvider, useMonitor } from "@/state/monitor";

export function Dashboard() {
  return (
    <MonitorProvider>
      <Shell />
    </MonitorProvider>
  );
}

function Shell() {
  const { state, store } = useMonitor();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bundle = useSubjectBundle(state.subjectId, state.dataSource);

  useEffect(() => {
    setManifest(null);
    setError(null);
    loadManifest(state.dataSource)
      .then(setManifest)
      .catch((err) => setError(String(err)));
  }, [state.dataSource]);

  // Deep link from a case card: /monitor/?subject=S13_baseline. Read once on
  // mount only — after that the operator owns the selection, and re-applying
  // the query would fight every click on the roster.
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("subject");
    if (!param) return;
    const [subjectId, condition] = param.split("_");
    if (!subjectId) return;
    store.set({
      subjectId,
      ...(CONDITIONS.includes(condition as Condition) ? { condition: condition as Condition } : {}),
    });
  }, [store]);

  // The view is addressable: #compare opens straight on the two-patient
  // closing move, so the deck can point a QR code at it directly.
  useEffect(() => {
    const apply = () => {
      const hash = window.location.hash.slice(1);
      if (hash === "compare" || hash === "monitor" || hash === "manual") {
        store.set({ view: hash });
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [store]);

  useEffect(() => {
    if (window.location.hash.slice(1) !== state.view) {
      window.history.replaceState(null, "", `#${state.view}`);
    }
  }, [state.view]);

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader manifest={manifest} />

      <main className="flex-1 p-2">
        {error ? (
          <p className="panel p-3 metric text-2xs text-alert-text">
            data/ failed to load: {error} — run `npm run bundle:data`
          </p>
        ) : !manifest ? (
          <p className="panel p-3 metric text-2xs text-ink-3">loading cohort…</p>
        ) : state.view === "compare" ? (
          <CompareView manifest={manifest} />
        ) : state.view === "manual" ? (
          <ManualView bundle={bundle} condition={state.condition} />
        ) : (
          <MonitorView manifest={manifest} bundle={bundle} />
        )}
      </main>

      <AppFooter manifest={manifest} />
    </div>
  );
}
