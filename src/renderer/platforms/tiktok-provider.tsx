import { registerPlatformProvider, type AuthStepProps } from './registry.js';

function normalizeTikTokUsername(raw: string): string {
  let value = raw.trim().toLowerCase();
  // Accept full URLs (https://www.tiktok.com/@user, www.tiktok.com/@user, tiktok.com/@user)
  value = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
  value = value.replace(/^tiktok\.com\//, '');
  // Strip leading @, leading/trailing slashes
  value = value.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
  // Cut at first slash (eg "user/live") or query string
  value = value.split(/[/?#]/)[0] ?? '';
  return value;
}

function TikTokAuthStep({ channel, setChannel }: AuthStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">TikTok username</label>
        <input
          type="text"
          placeholder="username (without @)"
          value={channel}
          onChange={(e) => setChannel(normalizeTikTokUsername(e.target.value))}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
        <p className="text-xs text-gray-500 mt-2">
          Read-only access. The user must be live for the connection to succeed. Paste the URL or just the handle —
          everything except the username is stripped automatically.
        </p>
      </div>
    </div>
  );
}

registerPlatformProvider({
  id: 'tiktok',
  displayName: 'TikTok',
  accentClass: 'border-l-pink-500',
  supportsMultipleAccounts: true,
  AuthStep: TikTokAuthStep,
  validate(channel) {
    if (!channel) return 'TikTok username is required';
    return null;
  },
  defaultLabel(channel) { return `@${channel}`; },
});
