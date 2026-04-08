import { useEffect, useState } from 'react';

import type { GeneralSettings } from '../../shared/types.js';

interface GeneralSettingsPageProps {
  settings: GeneralSettings;
  onSave: (settings: GeneralSettings) => Promise<void>;
}

export function GeneralSettingsPage({ settings, onSave }: GeneralSettingsPageProps) {
  const [draft, setDraft] = useState<GeneralSettings>(settings);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const updateDraft = (patch: Partial<GeneralSettings>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const saveSettings = async () => {
    setIsBusy(true);
    setError(null);
    setStatusMessage(null);
    try {
      await onSave(draft);
      setStatusMessage('General settings saved');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save general settings');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h2 className="text-lg font-semibold mb-1">General Settings</h2>
      <p className="text-sm text-gray-400 mb-6">Application behavior.</p>

      <div className="space-y-4">
        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5 space-y-4">
          <ToggleRow
            title="Start on login"
            description="Open automatically when the computer starts"
            checked={draft.startOnLogin}
            onChange={(checked) => updateDraft({ startOnLogin: checked })}
          />
          <ToggleRow
            bordered
            title="Minimize to tray"
            description="Keep the app running in the background when the window closes"
            checked={draft.minimizeToTray}
            onChange={(checked) => updateDraft({ minimizeToTray: checked })}
          />
          <ToggleRow
            bordered
            title="Event notifications"
            description="System notifications for raids and subscriptions"
            checked={draft.eventNotifications}
            onChange={(checked) => updateDraft({ eventNotifications: checked })}
          />
        </div>

        <div className="bg-gray-800/40 rounded-xl border border-gray-700 p-5">
          <h3 className="text-sm font-medium mb-3">Diagnostic Log</h3>
          <div className="flex gap-2">
            <select defaultValue="Info" className="flex-1 bg-gray-700 border border-gray-600 rounded text-sm text-gray-300 px-3 py-2 focus:outline-none focus:border-violet-500">
              <option>Info</option>
              <option>Debug</option>
              <option>Warn</option>
            </select>
            <button type="button" className="px-3 py-2 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors">
              Open Logs Folder
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void saveSettings()}
            className="px-3 py-2 rounded bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors disabled:opacity-60"
          >
            Save settings
          </button>
          {statusMessage ? <p className="text-sm text-gray-400">{statusMessage}</p> : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
        </div>

        <div className="text-center text-xs text-gray-600 pt-2">Streamer Copilot v0.1.0 · Electron 35</div>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  bordered = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  bordered?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${bordered ? 'border-t border-gray-700 pt-4' : ''}`}>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <label className="toggle-switch">
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}
