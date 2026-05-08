import { ConnectedAccounts } from '../components/ConnectedAccounts.js';

/**
 * Connections page. The legacy per-platform connect panels were removed once
 * Twitch / Kick / YouTube / TikTok all routed through the accounts:connect IPC
 * (R6 + Kick/YouTube follow-ups). The single ConnectedAccounts component now
 * owns add/connect/disconnect/delete for every provider.
 */
export function PlatformsSettingsPage() {
  return (
    <div className="min-h-full p-6 max-w-2xl">
      <header className="mb-6">
        <h2 className="text-base font-semibold mb-0.5">Connections</h2>
        <p className="text-sm text-gray-500">Connect your streaming accounts to enable chat integration. Add multiple accounts per platform.</p>
      </header>
      <ConnectedAccounts />
    </div>
  );
}
