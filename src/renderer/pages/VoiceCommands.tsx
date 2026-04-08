import { useEffect, useMemo, useState } from 'react';

import type { PermissionLevel, VoiceCommand, VoiceCommandUpsertInput } from '../../shared/types.js';
import { LanguagePicker } from '../components/LanguagePicker.js';
import { PermissionPicker } from '../components/PermissionPicker.js';
import { SettingsInfoTile, SettingsPageShell, SettingsSurface } from '../components/SettingsScaffold.js';
import { styles } from '../components/app-styles.js';

interface VoiceCommandsPageProps {
  voiceRate: number;
  voiceVolume: number;
  onChangeVoiceRate: (value: number) => void;
  onChangeVoiceVolume: (value: number) => void;
}

const EMPTY_FORM: VoiceCommandUpsertInput = {
  trigger: '!say',
  template: null,
  language: 'en-US',
  permissions: ['everyone'],
  cooldownSeconds: 0,
  enabled: true,
};

export function VoiceCommandsPage(props: VoiceCommandsPageProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [languageCode, setLanguageCode] = useState(EMPTY_FORM.language);
  const [levels, setLevels] = useState<PermissionLevel[]>(EMPTY_FORM.permissions);
  const [rows, setRows] = useState<VoiceCommand[]>([]);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [trigger, setTrigger] = useState(EMPTY_FORM.trigger);
  const [template, setTemplate] = useState(EMPTY_FORM.template ?? '');
  const [cooldownSeconds, setCooldownSeconds] = useState(EMPTY_FORM.cooldownSeconds);
  const [enabled, setEnabled] = useState(EMPTY_FORM.enabled);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewText = useMemo(() => {
    const trimmedTemplate = template.trim();
    if (trimmedTemplate) return trimmedTemplate;
    return 'Preview voice output';
  }, [template]);

  useEffect(() => {
    const load = async () => {
      try {
        const commands = await window.copilot.listVoiceCommands();
        setRows(commands);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Failed to load voice commands');
      }
    };

    void load();
  }, []);

  const resetForm = () => {
    setDraftId(undefined);
    setTrigger(EMPTY_FORM.trigger);
    setTemplate('');
    setLanguageCode(EMPTY_FORM.language);
    setLevels(EMPTY_FORM.permissions);
    setCooldownSeconds(EMPTY_FORM.cooldownSeconds);
    setEnabled(EMPTY_FORM.enabled);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (command: VoiceCommand) => {
    setDraftId(command.id);
    setTrigger(command.trigger);
    setTemplate(command.template ?? '');
    setLanguageCode(command.language);
    setLevels(command.permissions);
    setCooldownSeconds(command.cooldownSeconds);
    setEnabled(command.enabled);
    setError(null);
    setIsModalOpen(true);
  };

  const saveCommand = async () => {
    setIsBusy(true);

    try {
      const commands = await window.copilot.upsertVoiceCommand({
        id: draftId,
        trigger: trigger.trim(),
        template: template.trim() || null,
        language: languageCode,
        permissions: levels,
        cooldownSeconds,
        enabled,
      });
      setRows(commands);
      setIsModalOpen(false);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to save voice command');
    } finally {
      setIsBusy(false);
    }
  };

  const deleteCommand = async (id: string) => {
    try {
      const commands = await window.copilot.deleteVoiceCommand({ id });
      setRows(commands);
      if (draftId === id) {
        setIsModalOpen(false);
        resetForm();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to delete voice command');
    }
  };

  const previewCommand = async (text = previewText, lang = languageCode) => {
    try {
      await window.copilot.previewVoiceSpeak({ text, lang });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to preview voice command');
    }
  };

  return (
    <SettingsPageShell
      title="Voice Commands (TTS)"
      description="Use text-to-speech to speak chat messages aloud."
      action={<button type="button" style={styles.primaryButton} onClick={openCreate}>+ New Command</button>}
      maxWidth="1160px"
    >
      <div style={styles.settingsColumn}>
        <div style={styles.settingsInfoGrid}>
          <SettingsInfoTile label="Dynamic prompts" text="Speak the text that comes after the trigger or use a fixed template." />
          <SettingsInfoTile label="Languages" text="Switch default language and per-command language." />
          <SettingsInfoTile label="Preview" text="Test the current TTS voice before saving." />
        </div>

        <div style={styles.settingsSurfaceTable}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeadCell}>Command</th>
                <th style={styles.tableHeadCell}>Fixed text</th>
                <th style={styles.tableHeadCell}>Language</th>
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
                  <td style={styles.tableCell}>{row.template ?? 'Dynamic text after trigger'}</td>
                  <td style={styles.tableCell}>{row.language}</td>
                  <td style={styles.tableCell}>{row.permissions.join(', ')}</td>
                  <td style={styles.tableCell}>{row.cooldownSeconds}s</td>
                  <td style={styles.tableCell}>{row.enabled ? 'Yes' : 'No'}</td>
                  <td style={styles.tableCell}>
                    <div style={styles.actionsRowCompact}>
                      <button type="button" style={styles.secondaryButton} onClick={() => openEdit(row)}>Edit</button>
                      <button type="button" style={styles.secondaryButton} onClick={() => void previewCommand(row.template ?? 'Preview voice output', row.language)}>
                        Preview
                      </button>
                      <button type="button" style={styles.dangerButton} onClick={() => void deleteCommand(row.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td style={styles.tableCell} colSpan={7}>No voice commands saved yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={styles.settingsTwoColumnGrid}>
          <SettingsSurface>
            <h3 style={styles.settingsSubsectionTitle}>TTS Settings</h3>
            <LanguagePicker selectedCode={languageCode} onChange={setLanguageCode} />
            <label style={styles.label}>
              Volume
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(props.voiceVolume * 100)}
                onChange={(event) => props.onChangeVoiceVolume(Number(event.target.value) / 100)}
              />
              <span style={styles.settingsSecondaryText}>{Math.round(props.voiceVolume * 100)}%</span>
            </label>
            <label style={styles.label}>
              Rate
              <input
                type="range"
                min="50"
                max="200"
                value={Math.round(props.voiceRate * 100)}
                onChange={(event) => props.onChangeVoiceRate(Number(event.target.value) / 100)}
              />
              <span style={styles.settingsSecondaryText}>{Math.round(props.voiceRate * 100)}%</span>
            </label>
            <div style={styles.settingsFooterRow}>
              <button type="button" style={styles.secondaryButton} onClick={() => void previewCommand()}>
                Preview current settings
              </button>
            </div>
          </SettingsSurface>
        </div>

        {isModalOpen ? (
          <SettingsSurface>
            <h3 style={styles.settingsSubsectionTitle}>{draftId ? 'Edit Voice Command' : 'New Voice Command'}</h3>
            <label style={styles.label}>
              Command trigger
              <input type="text" value={trigger} onChange={(event) => setTrigger(event.target.value)} style={styles.searchInput} />
            </label>
            <label style={styles.label}>
              Fixed text
              <input type="text" value={template} onChange={(event) => setTemplate(event.target.value)} style={styles.searchInput} placeholder="Optional fixed text" />
            </label>
            <LanguagePicker selectedCode={languageCode} onChange={setLanguageCode} />
            <PermissionPicker selectedLevels={levels} onChange={setLevels} />
            <label style={styles.label}>
              Cooldown in seconds
              <input type="number" min="0" value={cooldownSeconds} onChange={(event) => setCooldownSeconds(Number(event.target.value))} style={styles.searchInput} />
            </label>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              Active command
            </label>
            <div style={styles.settingsFooterRow}>
              <button type="button" style={styles.secondaryButton} onClick={() => void previewCommand()}>Preview</button>
              <button type="button" style={styles.secondaryButton} onClick={() => { setIsModalOpen(false); resetForm(); }}>Cancel</button>
              <button type="button" style={styles.primaryButton} disabled={isBusy} onClick={() => void saveCommand()}>
                {draftId ? 'Save changes' : 'Create command'}
              </button>
            </div>
            {error ? <p style={styles.error}>{error}</p> : null}
          </SettingsSurface>
        ) : null}
      </div>
    </SettingsPageShell>
  );
}
