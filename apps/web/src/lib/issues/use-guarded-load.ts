"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createRequestGuard } from "@/lib/projects/project-detail";
import type { LoadState } from "./issue-loading";

/**
 * Loads data for one request key and keeps it bound to that key.
 *
 * When `baseKey` changes (another workspace, project, issue or filter) the
 * state derives as loading again, so data fetched for one key is never shown
 * under another, and a late response from a superseded request is dropped by
 * the guard. Mutations use the same `guard`, so a response that arrives after
 * the screen moved on can't touch it either.
 */
export function useGuardedLoad<T>(
  baseKey: string,
  load: () => Promise<LoadState<T>>,
) {
  const [retryToken, setRetryToken] = useState(0);
  const key = `${baseKey}|${retryToken}`;

  const [result, setResult] = useState<{ key: string; state: LoadState<T> } | null>(
    null,
  );
  const guard = useRef(createRequestGuard());

  const runLoad = useEffectEvent(() => load());

  useEffect(() => {
    const token = guard.current.start();

    void runLoad().then((state) => {
      if (guard.current.accept(token)) setResult({ key, state });
    });
  }, [key]);

  const state: LoadState<T> =
    result && result.key === key ? result.state : { kind: "loading" };

  /** Replaces the loaded data, only if it still belongs to `forKey`. */
  function update(forKey: string, change: (data: T) => T) {
    setResult((current) =>
      current && current.key === forKey && current.state.kind === "ready"
        ? { key: forKey, state: { kind: "ready", data: change(current.state.data) } }
        : current,
    );
  }

  return {
    key,
    state,
    // Read through functions, so the ref is only touched in handlers.
    guard: {
      start: () => guard.current.start(),
      accept: (token: number) => guard.current.accept(token),
    },
    retry: () => setRetryToken((token) => token + 1),
    update,
  };
}
