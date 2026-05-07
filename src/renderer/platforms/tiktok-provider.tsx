import { registerPlatformProvider, type AuthStepProps } from './registry.js';

function TikTokAuthStep({ channel, setChannel }: AuthStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs uppercase text-gray-500 mb-1">TikTok username</label>
        <input
          type="text"
          placeholder="username (without @)"
          value={channel}
          onChange={(e) => setChannel(e.target.value.trim().toLowerCase().replace(/^@/, ''))}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100"
        />
        <p className="text-xs text-gray-500 mt-2">
          Read-only access. The user must be live for the connection to succeed. No credentials required.
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
