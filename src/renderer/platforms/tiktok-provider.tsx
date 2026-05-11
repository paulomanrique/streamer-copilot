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
  icon: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
  badge: {
    bg: 'bg-pink-500/20',
    text: 'text-pink-300',
    rowBorder: 'border-pink-500/20',
  },
  accentBg: 'bg-pink-500',
  bannerBorderColor: 'rgba(236,72,153,0.2)',
  card: {
    classes: 'bg-pink-500/10 border-pink-500/20 text-pink-300',
    metaClass: 'text-pink-400',
  },
  liveLink: {
    color: 'text-pink-400',
    border: 'border-pink-500/30',
    btnBg: 'bg-pink-600/30 hover:bg-pink-600/50 text-pink-300',
  },
  subscriberBadge: 'subscriber',
  authorAtPrefix: false,
  profileUrl: (handle) => {
    const username = handle.replace(/^@+/, '').trim();
    return username ? `https://www.tiktok.com/@${encodeURIComponent(username)}` : '';
  },
  AuthStep: TikTokAuthStep,
  validate(channel) {
    if (!channel) return 'TikTok username is required';
    return null;
  },
  defaultLabel(channel) { return `@${channel}`; },
});
