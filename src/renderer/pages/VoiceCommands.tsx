import { useEffect, useMemo, useState } from 'react';

import type { PermissionLevel, VoiceCommand, VoiceCommandUpsertInput } from '../../shared/types.js';
import { LanguagePicker } from '../components/LanguagePicker.js';
import { PermissionPicker } from '../components/PermissionPicker.js';
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

  const previewCommand = async () => {
    try {
      await window.copilot.previewVoiceSpeak({
        text: previewText,
        lang: languageCode,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to preview voice command');
    }
  };

  return (
    <section style={styles.previewCard}>
      <div style={styles.previewHeader}>
        <div>
          <h2 style={styles.subtitle}>Voice Commands</h2>
          <p style={styles.helper}>Persisted command list, reusable editor, and renderer TTS preview wired through IPC.</p>
        </div>
        <button type="button" style={styles.primaryButton} onClick={openCreate}>
          Add command
        </button>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.tableHeadCell}>Trigger</th>
              <th style={styles.tableHeadCell}>Template</th>
              <th style={styles.tableHeadCell}>Language</th>
              <th style={styles.tableHeadCell}>Permissions</th>
              <th style={styles.tableHeadCell}>Cooldown</th>
              <th style={styles.tableHeadCell}>Enabled</th>
              <th style={styles.tableHeadCell}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={styles.tableCell}>
                  <span style={styles.codeText}>{row.trigger}</span>
                </td>
                <td style={styles.tableCell}>{row.template ?? 'Dynamic text after trigger'}</td>
                <td style={styles.tableCell}>{row.language}</td>
                <td style={styles.tableCell}>{row.permissions.join(', ')}</td>
                <td style={styles.tableCell}>{row.cooldownSeconds}s</td>
                <td style={styles.tableCell}>{row.enabled ? 'Yes' : 'No'}</td>
                <td style={styles.tableCell}>
                  <div style={styles.buttonRow}>
                    <button type="button" style={styles.secondaryButton} onClick={() => openEdit(row)}>
                      Edit
                    </button>
                    <button type="button" style={styles.secondaryButton} onClick={() => void window.copilot.previewVoiceSpeak({ text: row.template ?? 'Preview voice output', lang: row.language })}>
                      Preview
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
                <td style={styles.tableCell} colSpan={7}>
                  No voice commands saved yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <section style={styles.settingsGrid}>
        <section style={styles.previewCard}>
          <h3 style={styles.sectionTitle}>TTS Settings</h3>
          <p style={styles.helper}>Renderer playback uses the current default language, rate, and volume from this panel.</p>
          <div style={styles.settingsGrid}>
            <LanguagePicker selectedCode={languageCode} onChange={setLanguageCode} />
            <div style={styles.platformCard}>
              <span style={styles.statLabel}>Volume</span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(props.voiceVolume * 100)}
                onChange={(event) => props.onChangeVoiceVolume(Number(event.target.value) / 100)}
              />
              <span style={styles.statLabel}>Rate</span>
              <input
                type="range"
                min="50"
                max="200"
                value={Math.round(props.voiceRate * 100)}
                onChange={(event) => props.onChangeVoiceRate(Number(event.target.value) / 100)}
              />
              <div style={styles.buttonRow}>
                <button type="button" style={styles.secondaryButton} onClick={() => void previewCommand()}>
                  Preview current settings
                </button>
              </div>
            </div>
          </div>
        </section>

        {isModalOpen ? (
          <section style={styles.modalShell}>
            <input
              type="text"
              value={trigger}
              onChange={(event) => setTrigger(event.target.value)}
              style={styles.searchInput}
              placeholder="!say"
            />
            <input
              type="text"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              style={styles.searchInput}
              placeholder="Optional fixed text"
            />
            <LanguagePicker selectedCode={languageCode} onChange={setLanguageCode} />
            <PermissionPicker selectedLevels={levels} onChange={setLevels} />
            <input
              type="number"
              min="0"
              value={cooldownSeconds}
              onChange={(event) => setCooldownSeconds(Number(event.target.value))}
              style={styles.searchInput}
              placeholder="Cooldown in seconds"
            />
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
              Enabled
            </label>
            <div style={styles.buttonRow}>
              <button type="button" style={styles.secondaryButton} onClick={() => void previewCommand()}>
                Preview
              </button>
              <button type="button" style={styles.secondaryButton} onClick={() => { setIsModalOpen(false); resetForm(); }}>
                Cancel
              </button>
              <button type="button" style={styles.primaryButton} disabled={isBusy} onClick={() => void saveCommand()}>
                {draftId ? 'Save changes' : 'Create command'}
              </button>
            </div>
            {error ? <p style={styles.error}>{error}</p> : null}
          </section>
        ) : null}
      </section>
    </section>
  );
}
