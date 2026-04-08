import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow } from 'electron';

import { createAppContext } from './app-context.js';
import { StateHub } from './state-hub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_ROOT = path.resolve(__dirname, '..');
const PRELOAD_PATH = path.join(DIST_ROOT, 'preload', 'index.js');
const RENDERER_INDEX_PATH = path.join(DIST_ROOT, 'renderer', 'index.html');

let mainWindow: BrowserWindow | null = null;
let teardownContext: (() => void) | null = null;
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
  teardownContext = createAppContext({
    appVersion: app.getVersion(),
    userDataPath: app.getPath('userData'),
  });

  await createMainWindow();

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
  teardownContext?.();
  teardownContext = null;
});
