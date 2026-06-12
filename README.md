# Streamer Copilot

**One desktop command center for multi-platform livestreams.** Streamer Copilot brings chat, sound commands, voice automation, scheduled messages, raffles, polls, music requests, suggestions, OBS overlays, and OBS stats into a single app so streamers can run the show without jumping between tabs and tools.

[![Latest release](https://img.shields.io/github/v/release/paulomanrique/streamer-copilot?label=latest%20release)](https://github.com/paulomanrique/streamer-copilot/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/paulomanrique/streamer-copilot/total?label=downloads)](https://github.com/paulomanrique/streamer-copilot/releases)
[![Package workflow](https://github.com/paulomanrique/streamer-copilot/actions/workflows/package.yml/badge.svg)](https://github.com/paulomanrique/streamer-copilot/actions/workflows/package.yml)

## Download

Get the latest version from **[GitHub Releases](https://github.com/paulomanrique/streamer-copilot/releases/latest)**.

Available installers:

- **macOS**: `.dmg`
- **Windows**: `.exe`
- **Linux**: `.AppImage` and `.deb`

All previous versions are available in the full **[release history](https://github.com/paulomanrique/streamer-copilot/releases)**.

## Why Streamer Copilot

Live production gets messy when every platform has its own chat window, every command lives in a different bot, and OBS stats are hidden away from the rest of the workflow. Streamer Copilot combines the daily control surface for a livestream into one desktop app built for creators who simulcast, run audience interactions, and need reliable automation while live.

## Features

- **Unified chat** for Twitch, YouTube, Kick, and TikTok, with multi-account and multi-channel support (e.g. simultaneous horizontal + vertical YouTube streams).
- **Sound commands** with permission levels, global cooldowns, and per-user cooldowns.
- **Voice commands and TTS** with language and voice selection.
- **Text commands** for automatic chat replies and scheduled messages.
- **Raffles** with chat entry commands, staff triggers, and an OBS wheel overlay.
- **Polls** voted from chat, with a live OBS results overlay.
- **Music requests** from chat (YouTube), with queue limits, skip/queue/cancel triggers, and a now-playing overlay.
- **Welcome messages** with per-user overrides and optional sounds.
- **Suggestion lists** for collecting viewer ideas during a stream.
- **OBS overlays** served as local Browser Sources: chat overlay, chat dock, now playing, raffle wheel, polls, and highlighted message (double-click a chat message to feature it on stream).
- **OBS stats panel** with scene, stream status, FPS, bitrate, and dropped frames.
- **Fine-grained permissions** with platform roles, subscriber tiers, and custom user lists.
- **Profiles** for separating settings by channel, event, or client — fully portable folders you can copy between machines.
- **Chat and activity logs** for reviewing sessions and diagnosing automations.
- **Tray support, start-on-login, and automatic updates** for daily desktop use.

## Platform Support

| Platform | Chat read | Chat send | Notes |
| --- | --- | --- | --- |
| Twitch | Yes | Yes | OAuth support for chat and channel permissions, multi-account |
| YouTube | Yes | Yes | Two drivers: built-in scraper (no API key needed) and YouTube Data API polling; multi-channel monitoring |
| Kick | Yes | Yes | Public chat read and optional user authorization for sending |
| TikTok | Yes | No (read-only) | Live connector integration with EulerStream signing support |
| OBS | Stats and overlays | N/A | Uses OBS WebSocket v5 |

## OBS Overlays

Every overlay is served by a local web server — add the generated URL as an OBS Browser Source and it updates live. Appearance (fonts, colors, position) is configurable per overlay from the app.

- **Chat overlay**: unified multi-platform chat rendered on stream.
- **Chat dock**: a chat panel made for the OBS dock area.
- **Highlighted message**: double-click a chat message (or use its context menu) to feature it on stream, with configurable anchor position.
- **Now playing**: current music request with title and artwork.
- **Polls**: live vote counts while a poll runs.
- **Raffle wheel**: animated wheel while a raffle resolves.

## Raffles

Streamer Copilot can run giveaways directly from chat: create a raffle, open entries via a chat command, and resolve it on the wheel overlay. Entries are accepted from every connected platform.

Available raffle modes:

- `single-winner`: picks one winner in a single spin.
- `survivor-final`: eliminates participants round by round until the top 2, then resolves the final winner.

## Useful Links

- [Latest Release](https://github.com/paulomanrique/streamer-copilot/releases/latest)
- [All Releases](https://github.com/paulomanrique/streamer-copilot/releases)
- [Issues](https://github.com/paulomanrique/streamer-copilot/issues)
- [Project Board](https://github.com/users/paulomanrique/projects/4)

## License

Streamer Copilot is released under the [Unlicense](https://unlicense.org/).
