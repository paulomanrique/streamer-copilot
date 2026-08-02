import { useCallback, useEffect, useState } from 'react';

import type {
  LiveOutputConfig,
  LiveOutputControlInput,
  LiveOutputFeatureDescriptor,
  LiveOutputHotkeyBinding,
  LiveOutputsSnapshot,
  PlatformStreamCapability,
  PlayingNowSourceCapability,
} from '../../shared/types.js';

interface LiveOutputsController {
  catalog: LiveOutputFeatureDescriptor[];
  snapshot: LiveOutputsSnapshot | null;
  sources: PlayingNowSourceCapability[];
  platformCapabilities: PlatformStreamCapability[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  reload: () => Promise<void>;
  save: (config: LiveOutputConfig) => Promise<boolean>;
  control: (input: LiveOutputControlInput) => Promise<boolean>;
  regenerate: (id: string) => Promise<boolean>;
  reveal: (id: string, artifact?: string) => Promise<boolean>;
  pickSound: (id: string) => Promise<string | null>;
  testSource: (sourceId: string) => Promise<string>;
  saveHotkeys: (enabled: boolean, bindings: LiveOutputHotkeyBinding[]) => Promise<boolean>;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useLiveOutputs(): LiveOutputsController {
  const [catalog, setCatalog] = useState<LiveOutputFeatureDescriptor[]>([]);
  const [snapshot, setSnapshot] = useState<LiveOutputsSnapshot | null>(null);
  const [sources, setSources] = useState<PlayingNowSourceCapability[]>([]);
  const [platformCapabilities, setPlatformCapabilities] = useState<PlatformStreamCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextCatalog, nextSnapshot, sourceResult, capabilityResult] = await Promise.all([
        window.copilot.getLiveOutputCatalog(),
        window.copilot.getLiveOutputsSnapshot(),
        window.copilot.listPlayingNowSources().catch(() => []),
        window.copilot.getPlatformStreamCapabilities().catch(() => []),
      ]);
      setCatalog(nextCatalog);
      setSnapshot(nextSnapshot);
      setSources(sourceResult);
      setPlatformCapabilities(capabilityResult);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const disconnect = window.copilot.onLiveOutputsUpdate(setSnapshot);
    return () => disconnect();
  }, [reload]);

  const run = useCallback(async <T,>(operation: () => Promise<{ ok: true; value: T } | { ok: false; error: { message: string } }>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (!result.ok) {
        setError(result.error.message);
        return null;
      }
      return result.value;
    } catch (cause) {
      setError(errorMessage(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const save = useCallback(async (config: LiveOutputConfig) => {
    const next = await run(() => window.copilot.upsertLiveOutput(config));
    if (!next) return false;
    setSnapshot(next);
    return true;
  }, [run]);

  const control = useCallback(async (input: LiveOutputControlInput) => {
    const next = await run(() => window.copilot.controlLiveOutput(input));
    if (!next) return false;
    setSnapshot(next);
    return true;
  }, [run]);

  const regenerate = useCallback(async (id: string) => {
    const next = await run(() => window.copilot.regenerateLiveOutput({ id }));
    if (!next) return false;
    setSnapshot(next);
    return true;
  }, [run]);

  const reveal = useCallback(async (id: string, artifact?: string) => (
    (await run(() => window.copilot.revealLiveOutput({ id, artifact }))) !== null
  ), [run]);

  const pickSound = useCallback(async (id: string) => {
    const result = await run(() => window.copilot.pickLiveOutputSound({ id }));
    return result ?? null;
  }, [run]);

  const testSource = useCallback(async (sourceId: string) => {
    const result = await run(() => window.copilot.testPlayingNowSource({ sourceId }));
    if (!result) return '';
    return [result.artist, result.song, result.album].filter(Boolean).join(' — ') || result.state;
  }, [run]);

  const saveHotkeys = useCallback(async (enabled: boolean, bindings: LiveOutputHotkeyBinding[]) => {
    const next = await run(() => window.copilot.saveLiveOutputHotkeys({ enabled, bindings }));
    if (!next) return false;
    setSnapshot(next);
    return true;
  }, [run]);

  return {
    catalog, snapshot, sources, platformCapabilities, loading, busy, error,
    reload, save, control, regenerate, reveal, pickSound, testSource, saveHotkeys,
  };
}
