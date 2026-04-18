# Streamer Copilot

**One desktop command center for multi-platform livestreams.** Streamer Copilot brings chat, sound commands, voice automation, scheduled messages, raffles, suggestions, and OBS stats into a single app so streamers can run the show without jumping between tabs and tools.

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

- **Unified chat** for Twitch, YouTube, Kick, and TikTok.
- **Sound commands** with permission levels, global cooldowns, and per-user cooldowns.
- **Voice commands and TTS** with language and voice selection.
- **Text commands** for automatic chat replies and scheduled messages.
- **Raffles** with chat entry commands, staff triggers, and an OBS wheel overlay.
- **Suggestion lists** for collecting viewer ideas during a stream.
- **OBS stats panel** with scene, stream status, FPS, bitrate, and dropped frames.
- **Profiles** for separating settings by channel, event, or client.
- **Chat and activity logs** for reviewing sessions and diagnosing automations.
- **Tray support, start-on-login, and automatic updates** for daily desktop use.

## Platform Support

| Platform | Chat read | Chat send | Notes |
| --- | --- | --- | --- |
| Twitch | Yes | Yes | OAuth support for chat and channel permissions |
| YouTube | Yes | Yes | YouTube Data API polling and multi-channel monitoring |
| Kick | Yes | Yes | Public chat read and optional user authorization for sending |
| TikTok | Yes | In progress | Live connector integration with EulerStream signing support |
| OBS | Stats and overlays | N/A | Uses OBS WebSocket v5 |

## Raffles And OBS Overlay

Streamer Copilot can run giveaways directly from chat. Create a raffle, open entries, and add the generated local URL as an OBS Browser Source. The overlay updates live and can display a wheel animation while the raffle runs.

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
