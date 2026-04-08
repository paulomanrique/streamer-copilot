import { app, dialog, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateDownloadedEvent } from 'electron-updater';

const { autoUpdater } = electronUpdater;

interface AutoUpdaterOptions {
  checkIntervalMs?: number;
  getWindow: () => BrowserWindow | null;
  onLog?: (level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>) => void;
}

export function startAutoUpdater(options: AutoUpdaterOptions): () => void {
  if (!app.isPackaged) {
    options.onLog?.('info', 'Auto-updater skipped because the app is not packaged');
    return () => {};
  }

  const checkIntervalMs = options.checkIntervalMs ?? 30 * 60 * 1000;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const log = (level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>) => {
    options.onLog?.(level, message, metadata);
  };

  const onChecking = () => log('info', 'Checking for updates');
  const onAvailable = () => log('info', 'Update available');
  const onUnavailable = () => log('info', 'No updates available');
  const onError = (error: Error) => log('error', 'Auto-updater failed', { error: error.message });
  const onDownloaded = (info: UpdateDownloadedEvent) => {
    void promptForRestart(info, options.getWindow, log);
  };

  autoUpdater.on('checking-for-update', onChecking);
  autoUpdater.on('update-available', onAvailable);
  autoUpdater.on('update-not-available', onUnavailable);
  autoUpdater.on('error', onError);
  autoUpdater.on('update-downloaded', onDownloaded);

  void autoUpdater.checkForUpdates().catch((error: Error) => onError(error));
  const timer = setInterval(() => {
    void autoUpdater.checkForUpdates().catch((error: Error) => onError(error));
  }, checkIntervalMs);

  return () => {
    clearInterval(timer);
    autoUpdater.removeListener('checking-for-update', onChecking);
    autoUpdater.removeListener('update-available', onAvailable);
    autoUpdater.removeListener('update-not-available', onUnavailable);
    autoUpdater.removeListener('error', onError);
    autoUpdater.removeListener('update-downloaded', onDownloaded);
  };
}

async function promptForRestart(
  info: UpdateDownloadedEvent,
  getWindow: () => BrowserWindow | null,
  log: (level: 'info' | 'warn' | 'error', message: string, metadata?: Record<string, unknown>) => void,
): Promise<void> {
  const detail = buildReleaseNotes(info);
  const targetWindow = getWindow();
  const result = targetWindow
    ? await dialog.showMessageBox(targetWindow, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Version ${info.version} has been downloaded`,
        detail,
      })
    : await dialog.showMessageBox({
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Version ${info.version} has been downloaded`,
        detail,
      });

  if (result.response !== 0) {
    log('info', 'Update downloaded and deferred', { version: info.version });
    return;
  }

  log('info', 'Restarting to install downloaded update', { version: info.version });
  autoUpdater.quitAndInstall();
}

function buildReleaseNotes(info: UpdateDownloadedEvent): string {
  const releaseNotes = Array.isArray(info.releaseNotes)
    ? info.releaseNotes.map((entry) => `${entry.version ?? 'Release'}\n${entry.note ?? ''}`.trim()).join('\n\n')
    : typeof info.releaseNotes === 'string'
      ? info.releaseNotes
      : '';

  return releaseNotes || 'Restart the app to finish applying the downloaded update.';
}
