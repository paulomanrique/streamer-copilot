import { useEffect, useMemo, useState } from 'react';

import type { PlatformId } from '../../shared/types.js';
import type { PlatformCapabilities } from '../../shared/moderation.js';

interface PlatformOption {
  id: PlatformId;
  label: string;
}

const SUPPORTED_PLATFORMS: PlatformOption[] = [
  { id: 'twitch', label: 'Twitch' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'kick', label: 'Kick' },
  { id: 'tiktok', label: 'TikTok' },
];

type ModeKind = 'slow' | 'subscribers' | 'members' | 'followers' | 'emote' | 'unique';

const MODE_LABELS: Record<ModeKind, string> = {
  slow: 'Slow mode',
  subscribers: 'Subscribers only',
  members: 'Members only',
  followers: 'Followers only',
  emote: 'Emote only',
  unique: 'Unique chat',
};

function modeSupported(capabilities: PlatformCapabilities | null, mode: ModeKind): boolean {
  if (!capabilities) return false;
  switch (mode) {
    case 'slow': return capabilities.canSetSlowMode;
    case 'subscribers': return capabilities.canSetSubscribersOnly;
    case 'members': return capabilities.canSetMembersOnly;
    case 'followers': return capabilities.canSetFollowersOnly;
    case 'emote': return capabilities.canSetEmoteOnly;
    case 'unique': return capabilities.canSetUniqueChat;
  }
}

export function ModerationPanel() {
  const [platform, setPlatform] = useState<PlatformId>('twitch');
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [slowSeconds, setSlowSeconds] = useState(30);
  const [followMinutes, setFollowMinutes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void window.copilot.moderationGetCapabilities(platform).then((caps) => {
      if (!cancelled) setCapabilities(caps);
    });
    return () => { cancelled = true; };
  }, [platform]);

  const availableModes = useMemo<ModeKind[]>(() => {
    return (Object.keys(MODE_LABELS) as ModeKind[]).filter((m) => modeSupported(capabilities, m));
  }, [capabilities]);

  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label); setError(null); setInfo(null);
    try {
      await fn();
      setInfo(`${label} ✓`);
    } catch (cause) {
      setError(`${label}: ${cause instanceof Error ? cause.message : String(cause)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold text-gray-100">Moderation</h1>
        <p className="text-sm text-gray-400">Chat-wide controls. Per-message actions (ban / timeout author) appear in the chat context menu when supported.</p>
      </header>

      <section>
        <label className="block text-xs uppercase text-gray-500 mb-2">Platform</label>
        <div className="flex gap-2">
          {SUPPORTED_PLATFORMS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPlatform(option.id)}
              className={[
                'px-4 py-2 rounded-lg text-sm font-medium border transition',
                platform === option.id
                  ? 'bg-violet-600/20 border-violet-500/60 text-violet-200'
                  : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {capabilities === null ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {platform} is not connected, or moderation isn&apos;t available for the connected account. Connect with the proper scopes to enable actions.
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-medium text-gray-100">Chat modes</h2>
            {availableModes.length === 0 ? (
              <p className="text-sm text-gray-500">No chat-wide modes available for {platform}.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableModes.map((mode) => (
                  <div key={mode} className="rounded-lg border border-gray-700 bg-gray-900/40 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-100">{MODE_LABELS[mode]}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void run(`${MODE_LABELS[mode]} ON`, () => window.copilot.moderationSetMode({
                            platform,
                            mode,
                            enabled: true,
                            value: mode === 'slow' ? slowSeconds : mode === 'followers' ? followMinutes : undefined,
                          }))}
                          className="text-xs px-3 py-1 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-200 hover:bg-emerald-600/30 disabled:opacity-50"
                        >
                          On
                        </button>
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void run(`${MODE_LABELS[mode]} OFF`, () => window.copilot.moderationSetMode({
                            platform,
                            mode,
                            enabled: false,
                          }))}
                          className="text-xs px-3 py-1 rounded bg-gray-700/40 border border-gray-600 text-gray-300 hover:bg-gray-700/60 disabled:opacity-50"
                        >
                          Off
                        </button>
                      </div>
                    </div>
                    {mode === 'slow' && (
                      <label className="block text-xs text-gray-500">
                        Seconds between messages
                        <input
                          type="number"
                          min={1}
                          max={3600}
                          value={slowSeconds}
                          onChange={(e) => setSlowSeconds(Math.max(1, Number(e.target.value) || 1))}
                          className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100"
                        />
                      </label>
                    )}
                    {mode === 'followers' && (
                      <label className="block text-xs text-gray-500">
                        Minimum follow duration (minutes; 0 for any follower)
                        <input
                          type="number"
                          min={0}
                          max={129600}
                          value={followMinutes}
                          onChange={(e) => setFollowMinutes(Math.max(0, Number(e.target.value) || 0))}
                          className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-medium text-gray-100">Per-message actions</h2>
            <p className="text-xs text-gray-500">
              {capabilities.canBanUser
                ? 'Ban / timeout actions appear in the chat context menu when right-clicking a message (wiring in progress).'
                : 'Ban / timeout actions are not supported on this platform.'}
            </p>
          </section>
        </>
      )}

      {error && (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">{error}</div>
      )}
      {info && (
        <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{info}</div>
      )}
    </div>
  );
}
