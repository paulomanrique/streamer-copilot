# Privacy Policy — Streamer Copilot

_Last updated: 2026-05-11_

Streamer Copilot is a desktop application that runs locally on your computer. It connects directly from your machine to the streaming platforms you authorize (Twitch, YouTube, Kick, TikTok) so you can read chat, send messages, and run automations on your own livestream. **There is no Streamer Copilot server. We do not collect, transmit, or store your data on any infrastructure we operate.**

## What data is involved

When you use Streamer Copilot, the following data is handled entirely on your own computer:

- **Account credentials and tokens.** When you authorize a platform (e.g. Google/YouTube OAuth, Twitch OAuth, Kick OAuth), the resulting access and refresh tokens are saved inside your active profile directory and encrypted using your operating system's secure storage (macOS Keychain, Windows DPAPI, or Linux Secret Service via Electron `safeStorage`).
- **Chat messages and stream events.** Messages, follows, subscriptions, gifts, super chats and similar events that the connected platforms deliver to your machine are stored locally per profile (SQLite for diagnostic chat logs; JSON for everything else). They are never transmitted off your machine by Streamer Copilot.
- **App configuration.** Sound commands, voice commands, scheduled messages, raffles, polls and other settings live as JSON files inside the profile directory you chose.

## What data we collect

**None.** Streamer Copilot does not have analytics, telemetry, error reporting, or any other phone-home mechanism. We do not see who installs the app, what accounts you connect, or what messages flow through it.

## Third-party services

To do its job, the app talks directly from your computer to the platforms you choose to connect:

- **Google / YouTube** — uses the YouTube Data API v3 (OAuth scopes `youtube.force-ssl` and `youtube.readonly`) to read live chat, send messages, moderate, and resolve which channel you authorized. Your data is governed by [Google's Privacy Policy](https://policies.google.com/privacy).
- **Twitch** — uses tmi.js (IRC) and the Helix API. Governed by Twitch's privacy policy.
- **Kick** — uses Kick's public Pusher chat channel and the official Kick OAuth API. Governed by Kick's privacy policy.
- **TikTok** — uses the public TikTok LIVE WebSocket. Governed by TikTok's privacy policy.
- **OBS Studio (local)** — connects over OBS WebSocket on your machine when you configure it.

These services see whatever you authorize them to see, the same way any chat client or stream tool does. Streamer Copilot is the messenger; it does not add a layer of collection on top.

## Use of YouTube data

When you authorize the YouTube API driver, the app uses the requested scopes only to:

- List your active live broadcasts (`liveBroadcasts.list?mine=true`) so it can attach to the right chat automatically.
- Read live chat messages (`liveChatMessages.list`).
- Send chat messages on your behalf (`liveChatMessages.insert`).
- Perform moderation you trigger from the app — delete messages (`liveChatMessages.delete`), timeout or ban users (`liveChatBans.insert`).
- Resolve the channel id and title of the authorized account once, at consent time (`channels.list?mine=true`).

YouTube data is held in memory while the app is running and is not persisted beyond what is required to display recent chat in your local interface and chat log. The app complies with the [YouTube API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service) and Google's data use limits.

## Where your data lives

All persistent data is inside the profile directory you picked when you created the profile (default on macOS: `~/Library/Application Support/streamer-copilot/profiles/<name>/`). You can copy, back up, or delete the directory at any time — that is the complete record of everything Streamer Copilot has stored.

## Deleting your data

- **Revoke API access:** disconnect the account in the app (Settings → Connected accounts → Remove), and revoke the OAuth grant from the provider's account page (e.g. [Google account permissions](https://myaccount.google.com/permissions)).
- **Erase local data:** delete the profile directory listed above.
- **Uninstall:** removing the app does not delete profile data; delete the directory above if you want a clean wipe.

## Children

Streamer Copilot is not intended for children under 13. Do not use the app if you do not meet the minimum age required by the platforms you intend to connect.

## Changes

This policy may change as the app evolves. Material changes will be reflected in the "Last updated" date at the top and announced in the project repository.

## Contact

Questions or concerns: <paulo@manriq.dev>

Source code: <https://github.com/paulomanrique/streamer-copilot>
