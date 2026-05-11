/**
 * Side-effect barrel that registers every renderer-side platform provider.
 *
 * Importing this module once wires every PlatformProvider into the registry
 * defined in `./registry.ts`. Consumers (ConnectedAccounts, App boot, etc.)
 * import this file rather than each provider individually, so adding a new
 * platform is a one-line change here plus the provider file itself — the
 * "two files max" rule from AGENTS.md.
 */
import './twitch-provider.js';
import './youtube-provider.js';
import './youtube-v-provider.js';
import './youtube-api-provider.js';
import './kick-provider.js';
import './tiktok-provider.js';
