import { registerPlatformProvider, type AuthStepProps } from './registry.js';

function YouTubeAuthStep({ channel, setChannel }: AuthStepProps) {
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
    </div>
  );
}

registerPlatformProvider({
  id: 'youtube',
  displayName: 'YouTube',
  accentClass: 'border-l-red-500',
  supportsMultipleAccounts: true,
  AuthStep: YouTubeAuthStep,
  validate(channel) {
    if (!channel) return 'Channel handle or ID is required';
    return null;
  },
  defaultLabel(channel) { return channel.replace(/^@/, ''); },
});
