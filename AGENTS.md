# AGENTS.md

Guia para agentes de IA que trabalham neste repositório.

## Projeto

- **Nome**: Streamer Copilot
- **Tipo**: Aplicativo desktop Electron para automação de streams
- **Propósito**: Chat unificado (Twitch + YouTube + Kick), comandos de som/voz, mensagens agendadas, estatísticas do OBS
- **Fase atual**: Electron + React renderer com integrações runtime

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Electron ^35 |
| UI (Phase 2) | React 19 + TypeScript |
| Build | Vite + @vitejs/plugin-react |
| Estilos | Tailwind CSS |
| Banco de dados | better-sqlite3 (SQLite) |
| Estado | Zustand |
| Validação | Zod |
| Twitch chat | tmi.js |
| YouTube chat | googleapis (polling) |
| Kick chat | pusher-js |
| OBS stats | obs-websocket-js v5 |
| Áudio | Web Audio API (nativo) |
| TTS | Web Speech API + fallback OS |
| Packaging | electron-builder |
| Testes | Vitest + Playwright |

---

## Estrutura de Pastas

```
streamer-copilot/
├── src/                       ← Electron + React
│   ├── main/                  ← Processo principal do Electron
│   │   ├── index.ts           ← BrowserWindow, lifecycle
│   │   ├── app-context.ts     ← Fiação dos serviços + handlers IPC
│   │   └── state-hub.ts       ← Push de estado para o renderer
│   ├── preload/
│   │   └── index.ts           ← contextBridge → window.copilot
│   ├── shared/
│   │   ├── types.ts           ← Todos os tipos TypeScript compartilhados
│   │   ├── ipc.ts             ← Interface CopilotApi + mapa IPC_CHANNELS
│   │   ├── schemas.ts         ← Schemas Zod para validação IPC
│   │   └── constants.ts
│   ├── db/
│   │   ├── database.ts        ← Init SQLite, resolução de path
│   │   └── migrations.ts      ← Array de migrações SQL versionadas
│   ├── modules/
│   │   ├── chat/              ← ChatService: agrega adapters, emite eventos
│   │   ├── sounds/            ← SoundService: match, permissão, cooldown
│   │   ├── voice/             ← VoiceService: match, permissão, TTS
│   │   ├── scheduled/         ← SchedulerService: loop, jitter
│   │   ├── obs/               ← ObsService: obs-websocket-js, reconexão
│   │   └── settings/          ← SettingsService
│   ├── platforms/
│   │   ├── base.ts            ← Interface PlatformChatAdapter
│   │   ├── twitch/adapter.ts  ← tmi.js
│   │   ├── youtube/adapter.ts ← googleapis polling
│   │   └── kick/adapter.ts    ← pusher-js
│   └── renderer/
│       ├── main.tsx
│       ├── App.tsx            ← Shell com navegação sidebar
│       ├── store.ts           ← Zustand root store
│       ├── pages/             ← Dashboard, SoundCommands, VoiceCommands, etc.
│       └── components/        ← ChatFeed, ObsStatsPanel, PermissionPicker, etc.
│
├── tests/
│   ├── unit/                  ← Vitest
│   └── e2e/                   ← Playwright
│
├── AGENTS.md                  ← Este arquivo
└── README.md
```

---

## Regras de Arquitetura (Phase 2)

1. **IPC é a única ponte** entre main process e renderer. Nunca importe módulos do main process no renderer.
2. **Todos os canais IPC** são declarados em `src/shared/ipc.ts`. Adicione lá primeiro, depois implemente ambos os lados.
3. **Todas as entradas IPC** do renderer são validadas com Zod (`src/shared/schemas.ts`) antes de serem processadas no main process.
4. **Adapters de plataforma** implementam a interface `PlatformChatAdapter` de `src/platforms/base.ts`. Nunca chame APIs de plataforma diretamente dos services.
5. **Arquivos de som** ficam em `app.getPath('userData')/sounds/`. Nunca bundle de mídia do usuário no pacote do app.
6. **Tokens** são criptografados com `electron.safeStorage`. Nunca armazene em texto plano no SQLite.
7. O renderer **nunca acessa o filesystem diretamente**. Use IPC para solicitar caminhos (dialog) e conteúdo de arquivos.

---

## Notas de Runtime Electron

- Limpe `ELECTRON_RUN_AS_NODE` nos scripts de dev e start.
- `better-sqlite3` deve ser recompilado para o ABI do Electron: `npm run rebuild:native`.
- Vite dev server: `127.0.0.1:5173` com `strictPort: true`.
- OBS WebSocket deve estar habilitado: Ferramentas → Configurações do Servidor WebSocket.

---

## Notas por Plataforma

### Twitch
- Usa tmi.js IRC over WebSocket.
- Escopos OAuth: `chat:read`, `chat:edit`, `channel:read:subscriptions`, `moderator:read:followers`.
- Status de seguidor requer chamada à Helix API; faça cache por sessão.
- Badges (`isModerator`, `isSubscriber`) disponíveis diretamente na mensagem tmi.js.

### YouTube
- Usa `googleapis` `youtube.liveChatMessages.list` com polling.
- Respeite `pollingIntervalMillis` da resposta da API para não esgotar a quota.
- OAuth requer projeto no Google Cloud com YouTube Data API v3 habilitado.
- Redirect URI: `http://127.0.0.1:PORT` (loopback, capturado pelo Electron).
- "Seguidor" no YouTube = channel member (nível de inscrição).

### Kick
- Usa pusher-js com a app key pública do Kick.
- Sem autenticação necessária para leitura de chat público.
- Channel do Pusher: `chatrooms.{chatroomId}.v2`.
- Channel ID resolvido via: `https://kick.com/api/v2/channels/{slug}`.
- **Atenção**: API não-oficial; pode quebrar sem aviso.
- Não há conceito nativo de "seguidor"; trate como "todos".

### OBS
- Usa obs-websocket-js v5 (protocolo OBS WebSocket v5, OBS 28+).
- Stats coletadas: `GetStreamStatus`, `GetStats`, `GetCurrentProgramScene`.
- Reconexão com backoff exponencial (máx 30s).

---

## Sistema de Permissões

```typescript
type PermissionLevel = 'everyone' | 'follower' | 'subscriber' | 'moderator' | 'broadcaster';

interface CommandPermission {
  allowedLevels: PermissionLevel[];  // ex: ['subscriber', 'moderator']
  cooldownSeconds: number;           // cooldown global do comando
  userCooldownSeconds: number;       // cooldown por usuário
}
```

Ordem de resolução (maior nível ganha):
1. `broadcaster` — sempre permitido
2. `moderator`
3. `subscriber`
4. `follower`
5. `everyone`

Cooldowns rastreados em memória no main process: `Map<commandId, lastUsed>` e `Map<commandId:userId, lastUsed>`.

---

## Comandos

```bash
npm install
npm run dev          # Electron em modo desenvolvimento
npm run build        # build de produção
npm run package      # gerar instaladores
npm test             # testes unitários (Vitest)
npm run test:e2e     # testes e2e (Playwright)
npm run lint         # ESLint
npm run rebuild:native  # recompilar módulos nativos para o Electron
```

---

## GitHub Project

Issues e milestones: https://github.com/users/paulomanrique/projects/4

Milestones:
- **M0**: Foundations (Electron + React + TS setup)
- **M1**: Initial UI Prototype
- **M2**: Platform Chat Connections
- **M3**: Sound Commands
- **M4**: Voice Commands
- **M5**: Scheduled Messages
- **M6**: OBS Stats Panel
- **M7**: Polish & Release

---

## Commits

A cada mudança de código, um commit e push devem ser feitos.
