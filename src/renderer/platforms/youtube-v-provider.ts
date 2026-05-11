/**
 * Visual identity for the YouTube scraper's vertical slot. The scraper assigns
 * `platform: 'youtube-v'` to the second concurrent live stream so the chat,
 * card, and filter chip can be told apart from the primary horizontal slot.
 *
 * This isn't a wizard-addable provider — users connect a single YouTube
 * (Scraped) account and the scraper picks up the second slot automatically.
 * The registry entry exists purely so renderer components have somewhere to
 * look up colors/icon when a youtube-v message lands.
 */

import { registerPlatformProvider } from './registry.js';
import { YOUTUBE_ICON, youtubeProfileUrl } from './youtube-shared.js';

registerPlatformProvider({
  id: 'youtube-v',
  displayName: 'YouTube Vertical',
  accentClass: 'border-l-rose-400',
  supportsMultipleAccounts: false,
  hideFromWizard: true,
  icon: YOUTUBE_ICON,
  badge: {
    bg: 'bg-rose-400/20',
    text: 'text-rose-300',
    rowBorder: 'border-rose-400/20',
  },
  accentBg: 'bg-rose-400',
  bannerBorderColor: 'rgba(244,63,94,0.2)',
  card: {
    classes: 'bg-rose-400/10 border-rose-400/20 text-rose-300',
    metaClass: 'text-rose-400',
  },
  liveLink: {
    color: 'text-rose-400',
    border: 'border-rose-500/30',
    btnBg: 'bg-rose-600/30 hover:bg-rose-600/50 text-rose-300',
  },
  subscriberBadge: 'member',
  authorAtPrefix: true,
  hasNativeBadgeUrls: false,
  profileUrl: youtubeProfileUrl,
});
