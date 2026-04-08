import { useState } from 'react';

import { SCHEDULED_MESSAGE_ROWS } from '../settings-mock-data.js';

const PLATFORM_LABELS: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YT Horizontal',
  'youtube-v': 'YT Vertical',
  kick: 'Kick',
  tiktok: 'TikTok (planned)',
};

const PLATFORM_TEXT_CLASSES: Record<string, string> = {
  twitch: 'text-purple-400',
  youtube: 'text-red-400',
  'youtube-v': 'text-rose-400',
  kick: 'text-green-400',
  tiktok: 'text-pink-500',
};

export function ScheduledMessagesPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [message, setMessage] = useState('Remember to follow the channel! 💜');
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [randomWindowMinutes, setRandomWindowMinutes] = useState(0);
  const [platforms, setPlatforms] = useState(['twitch', 'youtube', 'youtube-v', 'kick']);

  const togglePlatform = (platform: string) => {
    if (platform === 'tiktok') return;

    if (platforms.includes(platform)) {
      setPlatforms(platforms.filter((item) => item !== platform));
      return;
    }

    setPlatforms([...platforms, platform]);
  };

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold">Scheduled Messages</h2>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            + New Message
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">Messages automatically sent in chat at configured intervals.</p>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Interval</p>
            <p className="text-sm text-gray-300">Send on a fixed cadence in minutes.</p>
          </div>
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Random Window</p>
            <p className="text-sm text-gray-300">Add jitter so repeated promos feel less robotic.</p>
          </div>
          <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-4">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Platforms</p>
            <p className="text-sm text-gray-300">Choose which connected live outputs receive the message.</p>
          </div>
        </div>

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 bg-gray-800/60">
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Message</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Interval</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Random Window</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Platforms</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Last Sent</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Active</th>
                <th className="text-left px-4 py-3 text-xs text-gray-400 font-semibold uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {SCHEDULED_MESSAGE_ROWS.map((row) => (
                <tr key={row.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3 text-gray-300 text-sm max-w-xs truncate">{row.message}</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{row.intervalMinutes} min</td>
                  <td className="px-4 py-3 text-gray-400 text-sm">{row.randomWindowMinutes > 0 ? `±${row.randomWindowMinutes} min` : 'Exact'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {row.platforms.map((platform) => (
                        <span
                          key={platform}
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            platform === 'twitch'
                              ? 'bg-purple-500/20 text-purple-300'
                              : platform === 'youtube'
                                ? 'bg-red-500/20 text-red-300'
                                : platform === 'youtube-v'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : platform === 'kick'
                                    ? 'bg-green-500/20 text-green-300'
                                    : 'bg-pink-500/20 text-pink-300'
                          }`}
                        >
                          {platform}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{row.lastSentLabel || '—'}</td>
                  <td className="px-4 py-3">
                    <label className="toggle-switch">
                      <input type="checkbox" checked={row.enabled} readOnly />
                      <span className="toggle-slider" />
                    </label>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors">✏️</button>
                      <button type="button" className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-red-700 text-gray-300 hover:text-white transition-colors">🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <h3 className="font-semibold">New Scheduled Message</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">
                  Message <span className="text-violet-400">*</span>
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Remember to follow the channel! 💜"
                  className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500 placeholder-gray-600 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Interval (min) <span className="text-violet-400">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={intervalMinutes}
                    onChange={(event) => setIntervalMinutes(Number(event.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Random Window (min)</label>
                  <p className="text-xs text-gray-600 mb-1">0 = exact interval</p>
                  <input
                    type="number"
                    min="0"
                    value={randomWindowMinutes}
                    onChange={(event) => setRandomWindowMinutes(Number(event.target.value))}
                    className="w-full bg-gray-800 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Platforms</label>
                <div className="flex gap-3 flex-wrap">
                  {['twitch', 'youtube', 'youtube-v', 'kick', 'tiktok'].map((platform) => {
                    const disabled = platform === 'tiktok';
                    return (
                      <label
                        key={platform}
                        className={`flex items-center gap-2 text-sm cursor-pointer ${disabled ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300'}`}
                      >
                        <input
                          type="checkbox"
                          checked={platforms.includes(platform)}
                          disabled={disabled}
                          onChange={() => togglePlatform(platform)}
                          className="accent-violet-500"
                        />
                        <span className={PLATFORM_TEXT_CLASSES[platform]}>{PLATFORM_LABELS[platform]}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-600 mt-1.5">Message is sent only to connected and live platforms.</p>
              </div>
            </div>
            <div className="flex gap-3 px-5 py-4 border-t border-gray-700">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
                Cancel
              </button>
              <button type="button" className="flex-1 px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors">
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
