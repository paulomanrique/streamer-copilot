import { useEffect, useState } from 'react';

import type { PermissionLevel, SoundCommand, SoundCommandUpsertInput } from '../../shared/types.js';
import { PermissionPicker } from '../components/PermissionPicker.js';
import { SettingsInfoTile, SettingsPageShell, SettingsSurface } from '../components/SettingsScaffold.js';
import { styles } from '../components/app-styles.js';

const EMPTY_FORM: SoundCommandUpsertInput = {
  trigger: '!drumroll',
  filePath: '',
  permissions: ['everyone'],
  cooldownSeconds: 0,
  enabled: true,
};

function getFileName(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || filePath;
}

export function SoundCommandsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [levels, setLevels] = useState<PermissionLevel[]>(EMPTY_FORM.permissions);
  const [rows, setRows] = useState<SoundCommand[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [trigger, setTrigger] = useState(EMPTY_FORM.trigger);
  const [filePath, setFilePath] = useState(EMPTY_FORM.filePath);
  const [cooldownSeconds, setCooldownSeconds] = useState(EMPTY_FORM.cooldownSeconds);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const commands = await window.copilot.listSoundCommands();
        setRows(commands);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load sound commands');
      }
    };

    void load();
  }, []);

  const resetForm = () => {
    setDraftId(undefined);
    setTrigger(EMPTY_FORM.trigger);
    setFilePath(EMPTY_FORM.filePath);
    setLevels(EMPTY_FORM.permissions);
    setCooldownSeconds(EMPTY_FORM.cooldownSeconds);
    setEnabled(EMPTY_FORM.enabled);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (command: SoundCommand) => {
    setDraftId(command.id);
    setTrigger(command.trigger);
    setFilePath(command.filePath);
    setLevels(command.permissions);
    setCooldownSeconds(command.cooldownSeconds);
    setEnabled(command.enabled);
    setError(null);
    setIsModalOpen(true);
  };

  const saveCommand = async () => {
    setIsBusy(true);

    try {
      const commands = await window.copilot.upsertSoundCommand({
        id: draftId,
        trigger: trigger.trim(),
        filePath,
        permissions: levels,
        cooldownSeconds,
        enabled,
      });
      setRows(commands);
      setIsModalOpen(false);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save sound command');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteCommand = async (id: string) => {
    try {
      const commands = await window.copilot.deleteSoundCommand({ id });
      setRows(commands);
      if (draftId === id) {
        setIsModalOpen(false);
        resetForm();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete sound command');
    }
  };

  const pickSoundFile = async () => {
    try {
      const selectedPath = await window.copilot.pickSoundFile();
      if (selectedPath) setFilePath(selectedPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to pick sound file');
    }
  };

  const previewCommand = async (targetPath?: string) => {
    const nextPath = targetPath ?? filePath;
    if (!nextPath) {
      setError('Pick a sound file before previewing');
      return;
    }

    try {
      await window.copilot.previewSoundPlay({ filePath: nextPath });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to preview sound command');
    }
  };

  return (
    <SettingsPageShell
      title="Sound Commands"
      description="Configure chat triggers that play copied audio files."
      action={<button type="button" style={styles.primaryButton} onClick={openCreate}>+ New Command</button>}
      maxWidth="1160px"
    >
      <div style={styles.settingsColumn}>
        <div style={styles.settingsInfoGrid}>
          <SettingsInfoTile label="File picker" text="Import .mp3, .ogg, or .wav into the app sounds folder." />
          <SettingsInfoTile label="Permissions" text="Use compact permission chips to define who can trigger playback." />
          <SettingsInfoTile label="Test action" text="Preview sound playback before going live." />
        </div>

        <div style={styles.settingsSurfaceTable}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeadCell}>Command</th>
                <th style={styles.tableHeadCell}>File</th>
                <th style={styles.tableHeadCell}>Permissions</th>
                <th style={styles.tableHeadCell}>Cooldown</th>
                <th style={styles.tableHeadCell}>Active</th>
                <th style={styles.tableHeadCell}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td style={styles.tableCell}><span style={styles.codeText}>{row.trigger}</span></td>
                  <td style={styles.tableCell}>{getFileName(row.filePath)}</td>
                  <td style={styles.tableCell}>{row.permissions.join(', ')}</td>
                  <td style={styles.tableCell}>{row.cooldownSeconds}s</td>
                  <td style={styles.tableCell}>{row.enabled ? 'Yes' : 'No'}</td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionsRowCompact}>
                      <button type="button" style={styles.secondaryButton} onClick={() => void previewCommand(row.filePath)}>
                        Test
                      </button>
                      <button type="button" style={styles.secondaryButton} onClick={() => openEdit(row)}>
                        Edit
                      </button>
                      <button type="button" style={styles.dangerButton} onClick={() => void deleteCommand(row.id)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td style={styles.tableCell} colSpan={6}>No sound commands saved yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {isModalOpen ? (
          <SettingsSurface>
            <h3 style={styles.settingsSubsectionTitle}>{draftId ? 'Edit Sound Command' : 'New Sound Command'}</h3>
            <div style={styles.settingsColumn}>
              <label style={styles.label}>
                Command trigger
                <input
                  type="text"
                  value={trigger}
                  onChange={(event) => setTrigger(event.target.value)}
                  style={styles.searchInput}
                  placeholder="!drumroll"
                />
              </label>
              <label style={styles.label}>
                Sound file
                <div style={styles.buttonRow}>
                  <input type="text" value={filePath} readOnly style={{ ...styles.searchInput, flex: 1 }} />
                  <button type="button" style={styles.secondaryButton} onClick={() => void pickSoundFile()}>
                    Pick file
                  </button>
                </div>
              </label>
              <PermissionPicker selectedLevels={levels} onChange={setLevels} />
              <label style={styles.label}>
                Cooldown in seconds
                <input
                  type="number"
                  min="0"
                  value={cooldownSeconds}
                  onChange={(event) => setCooldownSeconds(Number(event.target.value))}
                  style={styles.searchInput}
                />
              </label>
              <label style={styles.checkboxLabel}>
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                Active command
              </label>
              <div style={styles.settingsFooterRow}>
                <button type="button" style={styles.secondaryButton} onClick={() => void previewCommand()}>
                  Test
                </button>
                <button type="button" style={styles.secondaryButton} onClick={() => { setIsModalOpen(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="button" style={styles.primaryButton} disabled={isBusy} onClick={() => void saveCommand()}>
                  {draftId ? 'Save changes' : 'Create command'}
                </button>
              </div>
            </div>
            {error ? <p style={styles.error}>{error}</p> : null}
          </SettingsSurface>
        ) : null}
      </div>
    </SettingsPageShell>
  );
}
