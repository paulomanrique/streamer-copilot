import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, Menu, Tray, nativeImage, net, protocol, session } from 'electron';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_ROOT = path.resolve(__dirname, '..');
const PRELOAD_PATH = path.join(DIST_ROOT, 'preload', 'index.cjs');
const RENDERER_INDEX_PATH = path.join(DIST_ROOT, 'renderer', 'index.html');
const USER_DATA_DIR_NAME = 'streamer-copilot';
const APP_ICON_FILE = 'icon.png';

app.setName(USER_DATA_DIR_NAME);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let teardownContext: (() => Promise<void>) | null = null;
let stopAutoUpdater: (() => void) | null = null;
let databaseHandle: DatabaseHandle | null = null;
let generalSettingsStore: GeneralSettingsStore | null = null;
let isQuitting = false;
let isRunningQuitCleanup = false;
let didFinishQuitCleanup = false;
const stateHub = new StateHub();

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b1020',
    icon: getAppIconPath(),
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  stateHub.attachWindow(mainWindow);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting || !mainWindow || !generalSettingsStore?.load().minimizeToTray) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    stateHub.detachWindow();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(RENDERER_INDEX_PATH);
  }
}

app.whenReady().then(async () => {
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
    stateHub,
    userDataPath: app.getPath('userData'),
    getWindow: () => mainWindow,
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
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => {
          if (!mainWindow) return;
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
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
