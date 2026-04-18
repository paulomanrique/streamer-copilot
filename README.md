# Streamer Copilot

**Seu painel de comando para lives em varias plataformas.** Streamer Copilot e um app desktop para centralizar chat, automatizar comandos, disparar sons e voz, acompanhar o OBS e rodar sorteios sem trocar de janela durante a transmissao.

[![Latest release](https://img.shields.io/github/v/release/paulomanrique/streamer-copilot?label=latest%20release)](https://github.com/paulomanrique/streamer-copilot/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/paulomanrique/streamer-copilot/total?label=downloads)](https://github.com/paulomanrique/streamer-copilot/releases)
[![Package workflow](https://github.com/paulomanrique/streamer-copilot/actions/workflows/package.yml/badge.svg)](https://github.com/paulomanrique/streamer-copilot/actions/workflows/package.yml)

## Download

Baixe a versao mais recente em **[GitHub Releases](https://github.com/paulomanrique/streamer-copilot/releases/latest)**.

Instaladores publicados:

- **macOS**: `.dmg`
- **Windows**: `.exe`
- **Linux**: `.AppImage` e `.deb`

Todas as versoes ficam no historico de **[releases](https://github.com/paulomanrique/streamer-copilot/releases)**. Builds novas sao geradas automaticamente quando uma tag `v*` e publicada.

## Por Que Usar

Streaming fica mais dificil quando cada plataforma exige uma aba, cada comando mora em uma ferramenta diferente e o OBS fica separado do chat. Streamer Copilot junta as operacoes mais repetitivas em um unico app desktop, com perfis por canal e automacoes pensadas para lives reais.

## Recursos

- **Chat unificado** para Twitch, YouTube, Kick e TikTok.
- **Comandos de som** com permissao por nivel de usuario, cooldown global e cooldown por usuario.
- **Comandos de voz/TTS** com selecao de idioma e voz.
- **Comandos de texto** para respostas automaticas e mensagens programadas.
- **Sorteios** com comando de entrada no chat, gatilho de staff e overlay de roleta para OBS.
- **Sugestoes do chat** em listas persistentes ou por sessao.
- **Painel OBS** com cena atual, status da stream, FPS, bitrate e frames perdidos.
- **Perfis separados** para manter configuracoes por canal, evento ou cliente.
- **Logs de chat e atividade** para revisar sessoes e diagnosticar automacoes.
- **Tray, start-on-login e auto-update** para uso diario como app desktop.

## Plataformas

| Plataforma | Leitura de chat | Envio de mensagem | Observacoes |
| --- | --- | --- | --- |
| Twitch | Sim | Sim | OAuth com escopos de chat e informacoes do canal |
| YouTube | Sim | Sim | Polling via YouTube Data API e suporte a multiplos canais monitorados |
| Kick | Sim | Sim | Leitura publica e autorizacao opcional para enviar como usuario Kick |
| TikTok | Sim | Em progresso | Integracao via live connector e chave EulerStream para chat |
| OBS | Stats e overlay | N/A | Requer OBS WebSocket v5 habilitado |

## Sorteios Com Overlay

Crie um sorteio em `Settings -> Raffles`, abra as entradas e adicione a URL exibida como **Browser Source** no OBS. O overlay roda localmente em `127.0.0.1` e acompanha a roleta em tempo real.

Modos disponiveis:

- `single-winner`: escolhe um vencedor em um unico giro.
- `survivor-final`: elimina participantes por rodada ate chegar ao top 2, depois finaliza com um gatilho separado.

## Status Do Projeto

Streamer Copilot esta em desenvolvimento ativo. O app ja tem shell Electron, renderer React, integracoes runtime, empacotamento com Electron Builder e publicacao por GitHub Releases.

Roadmap publico:

- [GitHub Project](https://github.com/users/paulomanrique/projects/4)
- [Issues](https://github.com/paulomanrique/streamer-copilot/issues)
- [Releases](https://github.com/paulomanrique/streamer-copilot/releases)

## Requisitos Para Rodar Do Codigo

- Node.js 20+
- npm 10+
- OBS Studio 28+ com WebSocket habilitado
- Native modules recompilados para Electron com `npm run rebuild:native`

## Desenvolvimento

```bash
npm install
npm run rebuild:native
npm run dev
```

Comandos uteis:

```bash
npm run build
npm test
npm run test:e2e
npm run package
npm run package:mac
npm run package:win
npm run package:linux
```

## Configuracao De Ambiente

Copie `.env.example` para `.env` e preencha somente o que for usar. Os adapters toleram configuracao parcial: se uma plataforma nao estiver pronta, o app pula aquele destino e registra o motivo no log.

### Twitch

- `TWITCH_CHANNEL` ou `TWITCH_CHANNELS`
- `TWITCH_USERNAME`
- `TWITCH_OAUTH_TOKEN`

### YouTube

- `YOUTUBE_LIVE_CHAT_ID`
- `YOUTUBE_ACCESS_TOKEN`
- `YOUTUBE_REFRESH_TOKEN`
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_API_KEY`
- `YOUTUBE_CHANNEL_TITLE`

### Kick

- `KICK_CHANNEL_SLUG`
- `KICK_CHATROOM_ID`
- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`

## Empacotamento E Updates

- Configuracao de build: [`electron-builder.yml`](electron-builder.yml)
- Workflow de pacote: [`.github/workflows/package.yml`](.github/workflows/package.yml)
- Publicacao: [GitHub Releases](https://github.com/paulomanrique/streamer-copilot/releases)
- Auto-updater: ativo apenas em builds empacotados
- Artefatos: `Streamer Copilot-${version}-${os}-${arch}.${ext}`

## Arquitetura

```text
src/main/               Processo principal do Electron
src/preload/            Ponte IPC segura via contextBridge
src/shared/             Tipos, schemas e contratos IPC compartilhados
src/modules/            Servicos de dominio e repositorios
src/platforms/          Adapters Twitch, YouTube, Kick e TikTok
src/renderer/           Interface React
tests/unit/             Testes Vitest
tests/e2e/              Testes Playwright
```

## Licenca

Veja os termos no arquivo de licenca do repositorio quando disponivel.
