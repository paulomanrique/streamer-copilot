interface PlatformSettingsPreviewProps {
  activeProfileName: string;
}

const PLATFORM_PREVIEW_DATA = [
  {
    id: 'twitch',
    name: 'Twitch',
    iconBg: 'bg-purple-600/20 text-purple-400',
    icon: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
    detail: (
      <>
        mychannel • <span className="text-green-400">Connected</span>
      </>
    ),
    tags: ['chat:read', 'chat:edit', 'channel:read:subscriptions'],
    action: <button className="px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm transition-colors">Disconnect</button>,
  },
  {
    id: 'youtube-h',
    name: 'YouTube (Horizontal)',
    iconBg: 'bg-red-600/20 text-red-400',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
    detail: (
      <>
        My Channel • Live ID: <code className="text-red-300">dQw4w9WgXcQ</code> • <span className="text-green-400">Connected</span>
      </>
    ),
    note: 'Polling every 5s · Quota: 847/10000 units today',
    action: <button className="px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm transition-colors">Disconnect</button>,
  },
  {
    id: 'youtube-v',
    name: 'YouTube (Vertical)',
    iconBg: 'bg-rose-600/20 text-rose-400',
    icon: 'M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z',
    detail: (
      <>
        My Channel Shorts • Live ID: <code className="text-rose-300">AbC123Shorts</code> • <span className="text-green-400">Connected</span>
      </>
    ),
    note: 'Polling every 5s · Quota shared with the main YouTube API project',
    action: <button className="px-3 py-1.5 rounded bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm transition-colors">Disconnect</button>,
  },
  {
    id: 'kick',
    name: 'Kick',
    iconBg: 'bg-green-600/20 text-green-400',
    icon: 'M2 2h4v8l4-4h4l-6 6 6 6h-4l-4-4v4H2V2zm14 0h4v20h-4z',
    detail: (
      <>
        <span className="text-yellow-400">Not connected</span>
      </>
    ),
    input: 'Kick channel name (e.g., mychannel)',
    note: 'Kick does not require authentication for public chat read access.',
    action: <button className="px-3 py-1.5 rounded bg-green-600/20 hover:bg-green-600/30 text-green-400 text-sm transition-colors">Connect</button>,
  },
  {
    id: 'tiktok',
    name: 'TikTok Live',
    iconBg: 'bg-pink-600/20 text-pink-400',
    icon: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.67a8.17 8.17 0 0 0 4.79 1.53V6.75a4.85 4.85 0 0 1-1.02-.06z',
    detail: (
      <>
        <span className="text-pink-400">Planned (M2+)</span>
      </>
    ),
    note: 'Reserved slot so the multi-live layout stays stable while additional outputs are configured.',
    action: <button disabled className="px-3 py-1.5 rounded bg-gray-700 text-gray-500 text-sm cursor-not-allowed">Soon</button>,
  },
];

export function PlatformSettingsPreview(_: PlatformSettingsPreviewProps) {
  return (
    <div id="settings-platforms" className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold mb-1">Platform Connections</h2>
      <p className="text-sm text-gray-400 mb-6">Connect your accounts to receive chat and send messages in real time.</p>

      {PLATFORM_PREVIEW_DATA.map((platform) => (
        <div
          key={platform.id}
          className={`bg-gray-800/60 rounded-xl p-5 ${platform.id === 'tiktok' ? 'border border-pink-500/20' : 'mb-4 border border-gray-700'}`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${platform.iconBg}`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d={platform.icon} />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{platform.name}</h3>
                  <p className="text-sm text-gray-400 mt-0.5">{platform.detail}</p>
                </div>
                {platform.action}
              </div>
              {'tags' in platform ? (
                <div className="mt-3 flex gap-2 flex-wrap">
                  {platform.tags?.map((tag) => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {'input' in platform ? (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder={platform.input}
                    className="w-full bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-500"
                  />
                </div>
              ) : null}
              {'note' in platform ? <p className="text-xs text-gray-500 mt-2">{platform.note}</p> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
