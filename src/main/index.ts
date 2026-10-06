import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, Menu, Tray, nativeImage, net, protocol, session, shell } from 'electron';

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'copilot-local', privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

import { openDatabase, type DatabaseHandle } from '../db/database.js';
import { createAppContext } from './app-context.js';
import { AppSettingsRepository } from '../modules/settings/app-settings-repository.js';
import { GeneralSettingsStore } from '../modules/settings/general-settings-store.js';
import { StateHub } from './state-hub.js';
import { startAutoUpdater } from './updater.js';
import type { AppLanguage } from '../shared/types.js';
import { DEFAULT_APP_LANGUAGE } from '../shared/constants.js';

const TRAY_LABELS: Record<AppLanguage, { show: string; quit: string }> = {
  'en-US': { show: 'Show', quit: 'Quit' },
  'pt-BR': { show: 'Mostrar', quit: 'Sair' },
};

let trayLanguage: AppLanguage = DEFAULT_APP_LANGUAGE;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_ROOT = path.resolve(__dirname, '..');
const PRELOAD_PATH = path.join(DIST_ROOT, 'preload', 'index.cjs');
const RENDERER_INDEX_PATH = path.join(DIST_ROOT, 'renderer', 'index.html');
const USER_DATA_DIR_NAME = 'streamer-copilot';
const APP_ICON_FILE = 'icon.png';

app.setName(USER_DATA_DIR_NAME);

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let teardownContext: (() => Promise<void>) | null = null;
let stopAutoUpdater: (() => void) | null = null;
let databaseHandle: DatabaseHandle | null = null;
let generalSettingsStore: GeneralSettingsStore | null = null;
let isQuitting = false;
let isRunningQuitCleanup = false;
let didFinishQuitCleanup = false;
const stateHub = new StateHub();

function createAppWindow(size: { width: number; height: number; minWidth: number; minHeight: number }): BrowserWindow {
  const window = new BrowserWindow({
    ...size,
    show: false,
    backgroundColor: '#0b1020',
    icon: getAppIconPath(),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // App windows only ever render the renderer bundle; window.open is never
  // legitimate (the settings window is opened by main over IPC). Route any
  // window.open / target=_blank to the OS browser (http(s) only) and block
  // stray top-level navigations, opening external links externally instead.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const appUrl = process.env.VITE_DEV_SERVER_URL;
    const isAppNavigation = appUrl ? url.startsWith(appUrl) : url.startsWith('file://');
    if (isAppNavigation) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  return window;
}

/** Loads the renderer bundle. `role` picks which UI the renderer mounts
 *  (see src/renderer/window-role.ts); the main window passes none. */
async function loadRenderer(window: BrowserWindow, role?: 'settings'): Promise<void> {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const url = new URL(devServerUrl);
    if (role) url.searchParams.set('window', role);
    await window.loadURL(url.toString());
  } else {
    await window.loadFile(RENDERER_INDEX_PATH, role ? { query: { window: role } } : undefined);
  }
}

async function openSettingsWindow(): Promise<void> {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  const window = createAppWindow({ width: 1180, height: 800, minWidth: 900, minHeight: 600 });
  settingsWindow = window;
  stateHub.attachAuxWindow(window);
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    stateHub.detachAuxWindow(window);
    if (settingsWindow === window) settingsWindow = null;
  });
  try {
    await loadRenderer(window, 'settings');
  } catch (cause) {
    // Don't cache a window that never loaded — the next click must retry.
    window.destroy();
    throw cause;
  }
}

async function createMainWindow(): Promise<void> {
  mainWindow = createAppWindow({ width: 1280, height: 800, minWidth: 1024, minHeight: 680 });

  stateHub.attachWindow(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting || !mainWindow) return;
    if (generalSettingsStore?.load().minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    // minimizeToTray=false: drive a full quit ourselves. The Kick adapter
    // holds offscreen BrowserWindows for its chat client, so letting the OS
    // close just the main window leaves those alive and `window-all-closed`
    // never fires — the app would sit invisibly behind the tray icon and the
    // tray "Show" handler can't recover the now-null mainWindow. Routing
    // through app.quit() lets before-quit tear those down via
    // chatService.disconnectAll() and the process actually exits.
    isQuitting = true;
    event.preventDefault();
    app.quit();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    stateHub.detachWindow();
    // Settings is a satellite of the main window — it has no media host or
    // dashboard of its own, so it never outlives it.
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
  });

  await loadRenderer(mainWindow);
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await migrateLegacyProfilesIfNeeded();
  setDockIcon();

  protocol.handle('copilot-local', (request) => {
    const filePath = request.url.slice('copilot-local://'.length);
    return net.fetch(`file://${filePath}`);
  });

  // Strip "Electron/x.x.x" from the UA so YouTube iframes load normally
  session.defaultSession.setUserAgent(
    session.defaultSession.getUserAgent().replace(/ Electron\/[^\s]+/, ''),
  );

  databaseHandle = openDatabase(app.getPath('userData'));
  generalSettingsStore = new GeneralSettingsStore(new AppSettingsRepository(databaseHandle.db));
  await applyGeneralSettings(generalSettingsStore.load());
  ensureTray();

  teardownContext = createAppContext({
    appVersion: app.getVersion(),
    databaseHandle: databaseHandle,
    generalSettingsStore,
    onGeneralSettingsChanged: (settings) => applyGeneralSettings(settings),
    onAppLanguageChanged: (language) => setTrayLanguage(language),
    stateHub,
    userDataPath: app.getPath('userData'),
    getWindow: () => mainWindow,
    openSettingsWindow,
  });

  await createMainWindow();
  stopAutoUpdater = startAutoUpdater({
    getWindow: () => mainWindow,
    onLog: (level, message, metadata) => {
      const payload = metadata ? JSON.stringify(metadata) : '';
      const formatted = payload ? `${message} ${payload}` : message;
      if (level === 'error') console.error(formatted);
      else if (level === 'warn') console.warn(formatted);
      else console.info(formatted);
    },
  });

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

async function migrateLegacyProfilesIfNeeded(): Promise<void> {
  const currentUserDataPath = app.getPath('userData');
  const legacyUserDataPath = path.join(app.getPath('appData'), 'Electron');
  if (path.resolve(currentUserDataPath) === path.resolve(legacyUserDataPath)) return;

  const currentProfilesPath = path.join(currentUserDataPath, 'profiles.json');
  const legacyProfilesPath = path.join(legacyUserDataPath, 'profiles.json');

  const [currentHasProfiles, legacyHasProfiles] = await Promise.all([
    profilesFileHasProfiles(currentProfilesPath),
    profilesFileHasProfiles(legacyProfilesPath),
  ]);

  if (currentHasProfiles || !legacyHasProfiles) return;

  await fs.mkdir(currentUserDataPath, { recursive: true });
  await fs.copyFile(legacyProfilesPath, currentProfilesPath);
}

async function profilesFileHasProfiles(filePath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as { profiles?: unknown[] };
    return Array.isArray(parsed.profiles) && parsed.profiles.length > 0;
  } catch {
    return false;
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  isQuitting = true;
  if (didFinishQuitCleanup) return;
  event.preventDefault();
  if (isRunningQuitCleanup) return;
  isRunningQuitCleanup = true;

  void (async () => {
    try {
      if (teardownContext) {
        await teardownContext();
        teardownContext = null;
      }
      stopAutoUpdater?.();
      stopAutoUpdater = null;
      databaseHandle?.close();
      databaseHandle = null;
    } catch (error) {
      console.error('Quit cleanup failed', error);
    } finally {
      didFinishQuitCleanup = true;
      isRunningQuitCleanup = false;
      app.quit();
    }
  })();
});

function ensureTray(): void {
  if (tray) return;

  const icon = nativeImage.createFromPath(getAppIconPath()).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Streamer Copilot');
  applyTrayMenu();
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function applyTrayMenu(): void {
  if (!tray) return;
  const labels = TRAY_LABELS[trayLanguage] ?? TRAY_LABELS[DEFAULT_APP_LANGUAGE];
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: labels.show,
        click: () => {
          if (!mainWindow) return;
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: labels.quit,
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function setTrayLanguage(language: AppLanguage): void {
  if (trayLanguage === language) return;
  trayLanguage = language;
  applyTrayMenu();
}

function setDockIcon(): void {
  if (process.platform !== 'darwin') return;
  app.dock?.setIcon(nativeImage.createFromPath(getAppIconPath()));
}

function getAppIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, APP_ICON_FILE)
    : path.join(process.cwd(), 'build', APP_ICON_FILE);
}

async function applyGeneralSettings(settings: import('../shared/types.js').GeneralSettings): Promise<void> {
  if ((process.platform === 'darwin' || process.platform === 'win32') && app.isPackaged) {
    try {
      app.setLoginItemSettings({ openAtLogin: settings.startOnLogin });
    } catch (error) {
      console.warn(
        `Failed to update login item settings: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (process.platform === 'linux' && generalSettingsStore) {
    await generalSettingsStore.syncStartOnLogin(app.getName(), process.execPath, app.isPackaged);
  }

  if (!settings.minimizeToTray && mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
  }
}
