import { useEffect, useRef, useState } from 'react';
import type { TwitchConnectionStatus, TwitchCredentials, YouTubeSettings } from '../../shared/types.js';

interface LiveCheckResult {
  handle: string;
  videoIds: string[];
}

const STATUS_LABEL: Record<TwitchConnectionStatus, string> = {
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Connection error',
};

const STATUS_COLOR: Record<TwitchConnectionStatus, string> = {
  disconnected: 'text-gray-400',
  connecting: 'text-yellow-400',
  connected: 'text-green-400',
  error: 'text-red-400',
};

const STATUS_DOT: Record<TwitchConnectionStatus, string> = {
  disconnected: 'bg-gray-500',
  connecting: 'bg-yellow-400 animate-pulse',
  connected: 'bg-green-400',
  error: 'bg-red-500',
};

type Step = 'idle' | 'waiting-browser' | 'confirm-channel';

export function PlatformsSettingsPage() {
  const channelRef = useRef<HTMLInputElement>(null);

  // Twitch state
  const [status, setStatus] = useState<TwitchConnectionStatus>('disconnected');
  const [savedCreds, setSavedCreds] = useState<TwitchCredentials | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [pendingToken, setPendingToken] = useState('');
  const [pendingUsername, setPendingUsername] = useState('');
  const [channel, setChannel] = useState('');
  const [isEditingChannel, setIsEditingChannel] = useState(false);

  // YouTube state
  const [ytConnected, setYtConnected] = useState(0);
  const [ytSettings, setYtSettings] = useState<YouTubeSettings>({ channels: [], autoConnect: true });
  const [newChannelHandle, setNewChannelHandle] = useState('');

  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingHandle, setCheckingHandle] = useState<string | null>(null);
  const [liveCheckResult, setLiveCheckResult] = useState<LiveCheckResult | null>(null);

  useEffect(() => {
    void (async () => {
      const [currentStatus, creds, ytConnectedStatus, ytSavedSettings] = await Promise.all([
        window.copilot.twitchGetStatus(),
        window.copilot.twitchGetCredentials(),
        window.copilot.youtubeGetStatus(),
        window.copilot.youtubeGetSettings(),
      ]);
      setStatus(currentStatus);
      setSavedCreds(creds);
      setYtConnected(ytConnectedStatus);
      setYtSettings(ytSavedSettings);
    })();

    const unsubTwitch = window.copilot.onTwitchStatus((s) => setStatus(s));
    const unsubYt = window.copilot.onYoutubeStatus((s) => setYtConnected(s));

    return () => {
      unsubTwitch();
      unsubYt();
    };
  }, []);

  // ── Twitch Actions ────────────────────────────────────────────────
  const startOAuth = async () => {
    setError(null);
    setStep('waiting-browser');
    try {
      const { accessToken, username } = await window.copilot.twitchStartOAuth();
      setPendingToken(accessToken);
      setPendingUsername(username);
      setChannel(username);
      setStep('confirm-channel');
      requestAnimationFrame(() => channelRef.current?.focus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'OAuth failed');
      setStep('idle');
    }
  };

  const confirmConnect = async () => {
    if (!channel.trim()) { setError('Channel is required'); return; }
    setIsBusy(true);
    setError(null);
    try {
      await window.copilot.twitchConnect({
        channel: channel.trim().replace(/^#/, '').toLowerCase(),
        username: pendingUsername,
        oauthToken: `oauth:${pendingToken}`,
      });
      const creds = await window.copilot.twitchGetCredentials();
      setSavedCreds(creds);
      setStep('idle');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to connect');
    } finally { setIsBusy(false); }
  };

  const saveEditedChannel = async () => {
    if (!channel.trim()) { setError('Channel is required'); return; }
    if (!savedCreds) return;
    setIsBusy(true);
    setError(null);
    try {
      await window.copilot.twitchConnect({
        channel: channel.trim().replace(/^#/, '').toLowerCase(),
        username: savedCreds.username,
        oauthToken: savedCreds.oauthToken,
      });
      const creds = await window.copilot.twitchGetCredentials();
      setSavedCreds(creds);
      setIsEditingChannel(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to update channel');
    } finally { setIsBusy(false); }
  };

  const disconnectTwitch = async () => {
    setIsBusy(true);
    try {
      await window.copilot.twitchDisconnect();
      setSavedCreds(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to disconnect');
    } finally { setIsBusy(false); }
  };

  // ── YouTube Actions ───────────────────────────────────────────────
  const saveYtSettings = async (next: YouTubeSettings) => {
    setYtSettings(next);
    await window.copilot.youtubeSaveSettings(next);
  };

  const addYouTubeChannel = () => {
    const handle = newChannelHandle.trim();
    if (!handle) return;
    const next: YouTubeSettings = {
      ...ytSettings,
      channels: [
        ...ytSettings.channels,
        { id: crypto.randomUUID(), handle, enabled: true }
      ]
    };
    void saveYtSettings(next);
    setNewChannelHandle('');
  };

  const removeYouTubeChannel = (id: string) => {
    const next: YouTubeSettings = {
      ...ytSettings,
      channels: ytSettings.channels.filter(c => c.id !== id)
    };
    void saveYtSettings(next);
  };

  const toggleYouTubeChannel = (id: string) => {
    const next: YouTubeSettings = {
      ...ytSettings,
      channels: ytSettings.channels.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c)
    };
    void saveYtSettings(next);
  };

  const disconnectYoutube = async () => {
    await window.copilot.youtubeDisconnect();
  };

  const checkChannelLive = async (handle: string) => {
    setCheckingHandle(handle);
    try {
      const result = await window.copilot.youtubeCheckLive(handle);
      setLiveCheckResult({ handle, videoIds: result.videoIds });
    } finally {
      setCheckingHandle(null);
    }
  };

  return (
    <>
    <div className="p-6 max-w-lg">
      <h2 className="text-lg font-semibold mb-1">Platforms</h2>
      <p className="text-sm text-gray-400 mb-6">Connect your streaming accounts to enable chat integration.</p>

      <div className="bg-gray-800/40 rounded-xl border border-gray-700 divide-y divide-gray-700">

        {/* Twitch */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">Twitch</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
                  <span className={`text-xs ${STATUS_COLOR[status]}`}>
                    {STATUS_LABEL[status]}
                    {status === 'connected' && savedCreds && !isEditingChannel ? ` · #${savedCreds.channel}` : ''}
                  </span>
                  {status === 'connected' && !isEditingChannel && (
                    <button type="button" onClick={() => setIsEditingChannel(true)} className="text-[10px] text-violet-400 hover:text-violet-300 ml-1 underline">Edit channel</button>
                  )}
                </div>
              </div>
            </div>

            {step === 'idle' && !isEditingChannel && (
              <div className="flex gap-2">
                {status === 'connected' ? (
                  <button type="button" onClick={disconnectTwitch} className="text-xs px-3 py-1.5 rounded bg-gray-700 text-gray-300">Disconnect</button>
                ) : (
                  <button type="button" onClick={startOAuth} className="text-xs px-3 py-1.5 rounded bg-purple-600 text-white">Connect</button>
                )}
              </div>
            )}
          </div>

          {/* Step: waiting for browser */}
          {step === 'waiting-browser' && (
            <div className="mt-4 flex items-center justify-between bg-gray-800/60 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse shrink-0" />
                <p className="text-sm text-gray-300">Waiting for Twitch authorization in browser…</p>
              </div>
              <button type="button" onClick={() => setStep('idle')} className="text-xs text-gray-500 hover:text-gray-300">Cancel</button>
            </div>
          )}

          {/* Inline Edit Channel */}
          {isEditingChannel && (
            <div className="mt-4 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
              <label className="block text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">Join Different Channel</label>
              <div className="flex gap-2">
                <input
                  ref={channelRef}
                  type="text"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void saveEditedChannel()}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 px-3 py-1.5 focus:outline-none focus:border-violet-500 font-mono"
                />
                <button type="button" onClick={() => setIsEditingChannel(false)} className="px-3 py-1.5 rounded bg-gray-700 text-xs text-gray-300">Cancel</button>
                <button type="button" disabled={isBusy} onClick={() => void saveEditedChannel()} className="px-3 py-1.5 rounded bg-violet-600 text-xs font-medium text-white disabled:opacity-50">Save</button>
              </div>
            </div>
          )}

          {/* Step: confirm channel */}
          {step === 'confirm-channel' && (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-400 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                Authorized as <span className="font-mono font-medium">{pendingUsername}</span>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Channel to join <span className="text-violet-400">*</span></label>
                <input
                  ref={channelRef}
                  type="text"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void confirmConnect()}
                  placeholder="mychannel"
                  className="w-full bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 px-3 py-2 focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setStep('idle')} className="flex-1 px-3 py-2 rounded bg-gray-700 text-sm">Cancel</button>
                <button type="button" disabled={isBusy} onClick={() => void confirmConnect()} className="flex-1 px-3 py-2 rounded bg-purple-600 text-sm font-medium disabled:opacity-60">{isBusy ? 'Connecting…' : 'Connect'}</button>
              </div>
            </div>
          )}

          {error && step === 'idle' && <p className="mt-3 text-xs text-red-400">{error}</p>}
        </div>

        {/* YouTube Scraper & Monitor */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-600/20 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium">YouTube Auto-Monitor</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${ytConnected > 0 ? 'bg-green-400' : 'bg-gray-500'}`} />
                  <span className={`text-xs ${ytConnected > 0 ? 'text-green-400' : 'text-gray-400'}`}>
                    {ytConnected > 0 ? `${ytConnected} Scraper${ytConnected > 1 ? 's' : ''} Active` : 'Monitoring for Lives'}
                  </span>
                </div>
              </div>
            </div>
            {ytConnected > 0 && (
              <button type="button" onClick={disconnectYoutube} className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50">Stop Scrapers</button>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Channel handle (e.g. @MrBeast)"
                value={newChannelHandle}
                onChange={(e) => setNewChannelHandle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addYouTubeChannel()}
                className="flex-1 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 px-3 py-1.5 focus:outline-none focus:border-red-500"
              />
              <button type="button" onClick={addYouTubeChannel} className="px-3 py-1.5 rounded bg-gray-700 text-xs font-medium hover:bg-gray-600">Add</button>
            </div>

            <div className="space-y-1.5">
              {ytSettings.channels.map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 bg-gray-900/50 rounded border border-gray-700/50">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={c.enabled} onChange={() => toggleYouTubeChannel(c.id)} className="accent-red-500" />
                    <span className={`text-xs font-mono ${c.enabled ? 'text-gray-200' : 'text-gray-500'}`}>{c.handle}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={checkingHandle === c.handle}
                      onClick={() => void checkChannelLive(c.handle)}
                      className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 flex items-center gap-1"
                    >
                      {checkingHandle === c.handle ? (
                        <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                      ) : (
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      )}
                      Check
                    </button>
                    <button type="button" onClick={() => removeYouTubeChannel(c.id)} className="text-gray-500 hover:text-red-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>
                </div>
              ))}
              {ytSettings.channels.length === 0 && (
                <p className="text-[10px] text-gray-500 italic text-center py-2">No channels registered. Add one to auto-connect.</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input 
                type="checkbox" 
                id="yt-auto-connect" 
                checked={ytSettings.autoConnect} 
                onChange={(e) => saveYtSettings({ ...ytSettings, autoConnect: e.target.checked })}
                className="accent-red-500"
              />
              <label htmlFor="yt-auto-connect" className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold cursor-pointer">Auto-connect when live detected</label>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-gray-700/50">
             <button type="button" onClick={() => void window.copilot.youtubeOpenLogin()} className="text-[10px] text-gray-500 hover:text-gray-400 underline decoration-gray-500/30 underline-offset-2">YouTube Login (for members chat)</button>
          </div>
        </div>

        {/* Kick — coming soon */}
        <div className="px-5 py-4 opacity-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-600/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z"/>
              </svg>
            </div>
            <div><p className="text-sm font-medium">Kick</p><p className="text-xs text-gray-500">Coming soon</p></div>
          </div>
        </div>

      </div>
    </div>

    {/* Live check modal */}
    {liveCheckResult && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setLiveCheckResult(null)}>
        <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-6 w-80 text-center" onClick={(e) => e.stopPropagation()}>
          {liveCheckResult.videoIds.length > 0 ? (
            <>
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-green-400 mb-1">
                {liveCheckResult.videoIds.length === 1 ? 'Live detected!' : `${liveCheckResult.videoIds.length} lives detected!`}
              </p>
              <p className="text-xs text-gray-400 mb-2">{liveCheckResult.handle}</p>
              <div className="space-y-1">
                {liveCheckResult.videoIds.map((id) => (
                  <p key={id} className="text-[10px] font-mono text-gray-500 bg-gray-800 rounded px-2 py-1">{id}</p>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-300 mb-1">No live found</p>
              <p className="text-xs text-gray-500">{liveCheckResult.handle} doesn't appear to be streaming right now.</p>
            </>
          )}
          <button type="button" onClick={() => setLiveCheckResult(null)} className="mt-4 px-4 py-1.5 rounded bg-gray-700 text-xs text-gray-300 hover:bg-gray-600">Close</button>
        </div>
      </div>
    )}
    </>
  );
}
