import type { AppLanguage, LiveOutputKind, LiveOutputRuntimeStatus } from '../../shared/types.js';

type Copy = {
  title: string;
  description: string;
  searchPlaceholder: string;
  emptySearch: string;
  retry: string;
  back: string;
  save: string;
  saving: string;
  discard: string;
  notConfigured: string;
  preview: string;
  lastUpdate: string;
  browserClients: string;
  outputFile: string;
  browserSource: string;
  copyUrl: string;
  copied: string;
  reveal: string;
  enabled: string;
  startWithProfile: string;
  destinations: string;
  appearance: string;
  format: string;
  tokens: string;
  noTokens: string;
  runtime: string;
  noOutput: string;
  unsaved: string;
  confirmDiscard: string;
  sound: string;
  chooseSound: string;
  removeSound: string;
  saved: string;
  globalShortcuts: string;
  enableGlobalShortcuts: string;
  health: string;
  regenerate: string;
  metadata: string;
  font: string;
  noPlatformMetrics: string;
  channelMetadata: string;
  channelMetadataDescription: string;
  viewers: string;
  followers: string;
  streamState: string;
  live: string;
  offline: string;
  streamTitle: string;
  streamCategory: string;
  searchCategory: string;
  categoryResults: string;
  noCategories: string;
  refreshMetadata: string;
  saveMetadata: string;
  metadataSaved: string;
  metadataReadOnly: string;
  spotifyCredentials: string;
  spotifyCredentialsDescription: string;
  credentialStatus: string;
  configured: string;
  notConfiguredCredential: string;
  clientId: string;
  clientSecret: string;
  savedSecretHint: string;
  saveCredentials: string;
  testCredentials: string;
  removeCredentials: string;
  credentialsSaved: string;
  credentialsRemoved: string;
  confirmRemoveCredentials: string;
  fillSpotifyCredentials: string;
  categories: Record<FeatureCategory, string>;
  features: Record<LiveOutputKind, { label: string; description: string }>;
  statuses: Record<LiveOutputRuntimeStatus, string>;
  actions: Record<string, string>;
  fields: Record<string, string>;
};

export type FeatureCategory = 'clock' | 'timers' | 'content' | 'telemetry' | 'media';

const en: Copy = {
  title: 'Live Outputs',
  description: 'Text files and Browser Sources that stay synchronized with your stream.',
  searchPlaceholder: 'Search outputs',
  emptySearch: 'No live output matches this search.',
  retry: 'Try again',
  back: 'Back to outputs',
  save: 'Save changes',
  saving: 'Saving…',
  discard: 'Discard',
  notConfigured: 'Not configured',
  preview: 'Live preview',
  lastUpdate: 'Last update',
  browserClients: 'Browser clients',
  outputFile: 'Text file',
  browserSource: 'Browser Source',
  copyUrl: 'Copy URL',
  copied: 'Copied',
  reveal: 'Show in folder',
  enabled: 'Enable this output',
  startWithProfile: 'Start automatically with this profile',
  destinations: 'Destinations',
  appearance: 'Browser appearance',
  format: 'Output format',
  tokens: 'Available tokens',
  noTokens: 'This output has no template tokens.',
  runtime: 'Runtime controls',
  noOutput: 'Waiting for the first value…',
  unsaved: 'You have unsaved changes.',
  confirmDiscard: 'Discard the unsaved changes?',
  sound: 'Completion sound',
  chooseSound: 'Choose audio file',
  removeSound: 'Remove sound',
  saved: 'Saved',
  globalShortcuts: 'Global timer shortcuts',
  enableGlobalShortcuts: 'Enable global shortcuts',
  health: 'Health',
  regenerate: 'Regenerate outputs',
  metadata: 'Metadata',
  font: 'Font',
  noPlatformMetrics: 'No connected platform exposes live-output metrics yet.',
  channelMetadata: 'Channel status & metadata',
  channelMetadataDescription: 'Read live statistics and update the fields supported by this platform provider.',
  viewers: 'Viewers', followers: 'Followers', streamState: 'Stream status', live: 'Live', offline: 'Offline',
  streamTitle: 'Stream title', streamCategory: 'Category', searchCategory: 'Search categories',
  categoryResults: 'Category results', noCategories: 'No categories found.', refreshMetadata: 'Refresh status',
  saveMetadata: 'Save channel metadata', metadataSaved: 'Channel metadata saved.',
  metadataReadOnly: 'This provider exposes status as read-only.',
  spotifyCredentials: 'Spotify metadata credentials',
  spotifyCredentialsDescription: 'Used only to enrich missing album and artwork metadata. The secret is encrypted by the operating system.',
  credentialStatus: 'Credential status', configured: 'Configured', notConfiguredCredential: 'Not configured',
  clientId: 'Spotify client ID', clientSecret: 'Spotify client secret',
  savedSecretHint: 'Leave both fields empty to test the saved credentials.', saveCredentials: 'Save credentials',
  testCredentials: 'Test credentials', removeCredentials: 'Remove credentials',
  credentialsSaved: 'Spotify credentials saved.', credentialsRemoved: 'Spotify credentials removed.',
  confirmRemoveCredentials: 'Remove the saved Spotify credentials?',
  fillSpotifyCredentials: 'Enter both client ID and client secret before saving.',
  categories: {
    clock: 'Clock & date',
    timers: 'Timers',
    content: 'Content',
    telemetry: 'Telemetry',
    media: 'Media',
  },
  features: {
    time: { label: 'Time', description: 'A stream clock with 12/24-hour and timezone options.' },
    date: { label: 'Date', description: 'Localized dates with a .NET-compatible custom format.' },
    countdown: { label: 'Countdown', description: 'Count down to an exact date and time.' },
    'chrono-down': { label: 'Chrono Down', description: 'A reusable duration timer with completion actions.' },
    'chrono-up': { label: 'Chrono Up', description: 'A stopwatch with an optional initial offset.' },
    'text-rotator': { label: 'Text rotator', description: 'Cycle through text lines sequentially or shuffled.' },
    'system-info': { label: 'System info', description: 'CPU, memory, process and network telemetry.' },
    'platform-live': { label: 'Platform live', description: 'Publish metrics supplied by connected platform providers.' },
    'playing-now': { label: 'Playing Now', description: 'Expose the active system media session and artwork.' },
  },
  statuses: {
    disabled: 'Disabled', ready: 'Ready', running: 'Running', paused: 'Paused',
    completed: 'Completed', degraded: 'Degraded', error: 'Error',
  },
  actions: {
    start: 'Start', pause: 'Pause', resume: 'Resume', stop: 'Stop', reset: 'Reset',
    previous: 'Previous', next: 'Next', shuffle: 'Shuffle', adjust: 'Adjust', play: 'Play',
    increment: 'Increase', decrement: 'Decrease', test: 'Test source',
  },
  fields: {
    timezone: 'Timezone', systemTimezone: 'System timezone', use24Hour: '24-hour clock',
    removeLeadingZero: 'Remove leading hour zero', dateTemplate: 'Text template', dateFormat: 'Date format',
    locale: 'Date language', systemLocale: 'System language', target: 'Target date and time',
    todayOnLoad: 'Use today when the profile loads', doubleDigits: 'Always use two digits',
    omitZeros: 'Hide leading zero units', doneText: 'Completion text', playSound: 'Play a sound on completion',
    initialSeconds: 'Initial seconds', adjustmentMinutes: 'Adjustment step (minutes)',
    startChronoUp: 'Start Chrono Up when complete', useDays: 'Show days instead of total hours',
    resetOnStart: 'Reset whenever it starts', interval: 'Interval (seconds)', order: 'Order',
    sequential: 'Sequential', shuffle: 'Shuffle', loop: 'Loop after the last line', lines: 'Lines',
    addLine: 'Add line', lineText: 'Line text', allowEmpty: 'Allow an empty line',
    sampleInterval: 'Sample interval (seconds)', network: 'Collect network traffic',
    networkInterface: 'Network interface', automatic: 'Automatic', roundUsed: 'Round RAM used %',
    roundAvailable: 'Round RAM available %', platformTarget: 'Platform and channel', metric: 'Metric',
    refresh: 'Refresh interval (seconds)', sourceMode: 'Source selection', auto: 'Automatic', pinned: 'Pinned',
    source: 'Media source', fallback: 'Fallback to the system media session', noMedia: 'No-media text',
    artistLimit: 'Artist limit', songLimit: 'Song limit', albumLimit: 'Album limit',
    noLimitHint: '0 means no limit', separateFiles: 'Write separate artist, song and album files',
    json: 'Write metadata JSON', artwork: 'Write album artwork', layout: 'Overlay layout',
    compact: 'Compact', artworkLeft: 'Artwork on the left', artworkRight: 'Artwork on the right',
    progress: 'Show progress bar', spotify: 'Enrich missing artwork with Spotify',
    filePath: 'Profile-relative path', browserEnabled: 'Enable Browser Source',
    background: 'Background', textColor: 'Text color', accent: 'Accent', opacity: 'Background opacity',
    fontSize: 'Font size', radius: 'Corner radius',
  },
};

const pt: Copy = {
  ...en,
  title: 'Saídas ao vivo',
  description: 'Arquivos de texto e Browser Sources sincronizados com a sua transmissão.',
  searchPlaceholder: 'Buscar saídas',
  emptySearch: 'Nenhuma saída ao vivo corresponde à busca.',
  retry: 'Tentar novamente', back: 'Voltar para saídas', save: 'Salvar alterações', saving: 'Salvando…',
  discard: 'Descartar', notConfigured: 'Não configurado', preview: 'Prévia ao vivo',
  lastUpdate: 'Última atualização', browserClients: 'Clientes conectados', outputFile: 'Arquivo de texto',
  browserSource: 'Browser Source', copyUrl: 'Copiar URL', copied: 'Copiado', reveal: 'Mostrar na pasta',
  enabled: 'Habilitar esta saída', startWithProfile: 'Iniciar automaticamente com este perfil',
  destinations: 'Destinos', appearance: 'Visual da Browser Source', format: 'Formato da saída',
  tokens: 'Tokens disponíveis', noTokens: 'Esta saída não possui tokens de template.',
  runtime: 'Controles em tempo real', noOutput: 'Aguardando o primeiro valor…',
  unsaved: 'Você tem alterações não salvas.', confirmDiscard: 'Descartar as alterações não salvas?',
  sound: 'Som de conclusão', chooseSound: 'Escolher arquivo de áudio', removeSound: 'Remover som',
  saved: 'Salvo', globalShortcuts: 'Atalhos globais dos cronômetros',
  enableGlobalShortcuts: 'Habilitar atalhos globais', health: 'Integridade',
  regenerate: 'Regenerar saídas', metadata: 'Metadados', font: 'Fonte',
  noPlatformMetrics: 'Nenhuma plataforma conectada expõe métricas para saídas ao vivo.',
  channelMetadata: 'Status e metadados do canal',
  channelMetadataDescription: 'Consulte estatísticas ao vivo e altere os campos suportados pelo provider da plataforma.',
  viewers: 'Espectadores', followers: 'Seguidores', streamState: 'Status da transmissão', live: 'Ao vivo', offline: 'Offline',
  streamTitle: 'Título da transmissão', streamCategory: 'Categoria', searchCategory: 'Buscar categorias',
  categoryResults: 'Resultados de categorias', noCategories: 'Nenhuma categoria encontrada.', refreshMetadata: 'Atualizar status',
  saveMetadata: 'Salvar metadados do canal', metadataSaved: 'Metadados do canal salvos.',
  metadataReadOnly: 'Este provider expõe o status apenas para leitura.',
  spotifyCredentials: 'Credenciais de metadados do Spotify',
  spotifyCredentialsDescription: 'Usadas somente para completar álbum e capa ausentes. O secret é criptografado pelo sistema operacional.',
  credentialStatus: 'Status das credenciais', configured: 'Configuradas', notConfiguredCredential: 'Não configuradas',
  clientId: 'Client ID do Spotify', clientSecret: 'Client secret do Spotify',
  savedSecretHint: 'Deixe os dois campos vazios para testar as credenciais salvas.', saveCredentials: 'Salvar credenciais',
  testCredentials: 'Testar credenciais', removeCredentials: 'Remover credenciais',
  credentialsSaved: 'Credenciais do Spotify salvas.', credentialsRemoved: 'Credenciais do Spotify removidas.',
  confirmRemoveCredentials: 'Remover as credenciais salvas do Spotify?',
  fillSpotifyCredentials: 'Informe o client ID e o client secret antes de salvar.',
  categories: { clock: 'Relógio e data', timers: 'Temporizadores', content: 'Conteúdo', telemetry: 'Telemetria', media: 'Mídia' },
  features: {
    time: { label: 'Hora', description: 'Relógio da transmissão com opções de 12/24 horas e fuso.' },
    date: { label: 'Data', description: 'Datas localizadas com formato personalizado compatível com .NET.' },
    countdown: { label: 'Contagem regressiva', description: 'Conte até uma data e hora exatas.' },
    'chrono-down': { label: 'Cronômetro regressivo', description: 'Temporizador reutilizável com ações de conclusão.' },
    'chrono-up': { label: 'Cronômetro progressivo', description: 'Cronômetro com deslocamento inicial opcional.' },
    'text-rotator': { label: 'Rotação de textos', description: 'Alterne linhas em sequência ou ordem aleatória.' },
    'system-info': { label: 'Informações do sistema', description: 'Telemetria de CPU, memória, processos e rede.' },
    'platform-live': { label: 'Plataforma ao vivo', description: 'Publique métricas fornecidas pelas plataformas conectadas.' },
    'playing-now': { label: 'Tocando agora', description: 'Exponha a sessão de mídia ativa do sistema e sua capa.' },
  },
  statuses: {
    disabled: 'Desativado', ready: 'Pronto', running: 'Em execução', paused: 'Pausado',
    completed: 'Concluído', degraded: 'Degradado', error: 'Erro',
  },
  actions: {
    start: 'Iniciar', pause: 'Pausar', resume: 'Continuar', stop: 'Parar', reset: 'Reiniciar',
    previous: 'Anterior', next: 'Próxima', shuffle: 'Embaralhar', adjust: 'Ajustar', play: 'Reproduzir',
    increment: 'Aumentar', decrement: 'Diminuir', test: 'Testar fonte',
  },
  fields: {
    timezone: 'Fuso horário', systemTimezone: 'Fuso do sistema', use24Hour: 'Relógio de 24 horas',
    removeLeadingZero: 'Remover zero inicial da hora', dateTemplate: 'Template de texto', dateFormat: 'Formato da data',
    locale: 'Idioma da data', systemLocale: 'Idioma do sistema', target: 'Data e hora alvo',
    todayOnLoad: 'Usar a data de hoje ao carregar o perfil', doubleDigits: 'Sempre usar dois dígitos',
    omitZeros: 'Ocultar unidades iniciais zeradas', doneText: 'Texto de conclusão', playSound: 'Tocar um som ao concluir',
    initialSeconds: 'Segundos iniciais', adjustmentMinutes: 'Passo de ajuste (minutos)',
    startChronoUp: 'Iniciar cronômetro progressivo ao concluir', useDays: 'Exibir dias em vez do total de horas',
    resetOnStart: 'Reiniciar sempre que for iniciado', interval: 'Intervalo (segundos)', order: 'Ordem',
    sequential: 'Sequencial', shuffle: 'Aleatória', loop: 'Voltar ao início após a última linha', lines: 'Linhas',
    addLine: 'Adicionar linha', lineText: 'Texto da linha', allowEmpty: 'Permitir uma linha vazia',
    sampleInterval: 'Intervalo de coleta (segundos)', network: 'Coletar tráfego de rede',
    networkInterface: 'Interface de rede', automatic: 'Automática', roundUsed: 'Arredondar % de RAM usada',
    roundAvailable: 'Arredondar % de RAM disponível', platformTarget: 'Plataforma e canal', metric: 'Métrica',
    refresh: 'Intervalo de atualização (segundos)', sourceMode: 'Seleção de fonte', auto: 'Automática', pinned: 'Fixa',
    source: 'Fonte de mídia', fallback: 'Usar sessão de mídia do sistema como fallback', noMedia: 'Texto sem mídia',
    artistLimit: 'Limite do artista', songLimit: 'Limite da música', albumLimit: 'Limite do álbum',
    noLimitHint: '0 significa sem limite', separateFiles: 'Gravar arquivos separados de artista, música e álbum',
    json: 'Gravar JSON de metadados', artwork: 'Gravar capa do álbum', layout: 'Layout do overlay',
    compact: 'Compacto', artworkLeft: 'Capa à esquerda', artworkRight: 'Capa à direita',
    progress: 'Exibir barra de progresso', spotify: 'Completar capas ausentes com Spotify',
    filePath: 'Caminho relativo ao perfil', browserEnabled: 'Habilitar Browser Source',
    background: 'Fundo', textColor: 'Cor do texto', accent: 'Destaque', opacity: 'Opacidade do fundo',
    fontSize: 'Tamanho da fonte', radius: 'Raio dos cantos',
  },
};

export function getLiveOutputsCopy(language: AppLanguage): Copy {
  return language === 'en-US' ? en : pt;
}
