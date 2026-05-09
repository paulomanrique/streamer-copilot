import { useState } from 'react';

import { registerPlatformProvider, type AuthStepProps } from './registry.js';

function YouTubeAuthStep({ channel, setChannel, setError }: AuthStepProps) {
  const [openingLogin, setOpeningLogin] = useState(false);

  async function openLogin() {
    setOpeningLogin(true);
    setError(null);
    try {
      await window.copilot.youtubeOpenLogin();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setOpeningLogin(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">Channel handle or ID</label>
        <input
          type="text"
          placeholder="@channelhandle"
          value={channel}
          onChange={(e) => setChannel(e.target.value.trim())}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
        <p className="text-xs text-gray-500 mt-2">
          The handle (e.g. <code className="text-gray-300">@yourchannel</code>) or the channel ID (UC…) of the YouTube channel to read live chat from.
        </p>
      </div>
      <div className="rounded border border-gray-700 bg-gray-900/50 p-3">
        <p className="text-xs text-gray-300 font-medium mb-1">Sign in to YouTube</p>
        <p className="text-xs text-gray-500 mb-3">
          Optional but required to <strong className="text-gray-300">send</strong> messages from the app. Reading chat works without
          it. Opens a Google login window; the cookies are kept inside this app's session.
        </p>
        <button
          type="button"
          disabled={openingLogin}
          onClick={() => void openLogin()}
          className="px-4 py-2 rounded bg-red-600/20 border border-red-500/40 text-red-200 hover:bg-red-600/30 disabled:opacity-50 text-sm"
        >
          {openingLogin ? 'Opening login window…' : 'Sign in to YouTube'}
        </button>
      </div>
    </div>
  );
}

registerPlatformProvider({
  id: 'youtube',
  displayName: 'YouTube (Scraped)',
  accentClass: 'border-l-red-500',
  supportsMultipleAccounts: true,
  AuthStep: YouTubeAuthStep,
  validate(channel) {
    if (!channel) return 'Channel handle or ID is required';
    return null;
  },
  defaultLabel(channel) { return channel.replace(/^@/, ''); },
  async login() {
    await window.copilot.youtubeOpenLogin();
    return { message: 'Logado com sucesso' };
  },
});
