import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, Menu, Tray, nativeImage, net, protocol } from 'electron';

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'copilot-local', privileges: { secure: true, standard: true, supportFetchAPI: true } },
]);

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

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let teardownContext: (() => void) | null = null;
let stopAutoUpdater: (() => void) | null = null;
let databaseHandle: DatabaseHandle | null = null;
let generalSettingsStore: GeneralSettingsStore | null = null;
let isQuitting = false;
const stateHub = new StateHub();

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  stateHub.attachWindow(mainWindow);

  mainWindow.once('ready-to-show', () => {
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
  protocol.handle('copilot-local', (request) => {
    const filePath = request.url.slice('copilot-local://'.length);
    return net.fetch(`file://${filePath}`);
  });

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  teardownContext?.();
  teardownContext = null;
  stopAutoUpdater?.();
  stopAutoUpdater = null;
  databaseHandle?.close();
  databaseHandle = null;
});

function ensureTray(): void {
  if (tray) return;

  const icon = nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiIgdmlld0JveD0iMCAwIDE2IDE2Ij48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHJ4PSIzIiBmaWxsPSIjN2MzYWVkIi8+PHRleHQgeD0iOC41IiB5PSIxMS4yIiBmb250LXNpemU9IjcuNSIgZm9udC1mYW1pbHk9IkFyaWFsLCBzYW5zLXNlcmlmIiBmb250LXdlaWdodD0iNzAwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmZmZmIj5TQzwvdGV4dD48L3N2Zz4=',
  );
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
