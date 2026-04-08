import { useEffect, useState } from 'react';

import { styles } from './app-styles.js';

type ProfileFormMode = 'create' | 'rename' | 'clone';

interface ProfileFormModalProps {
  open: boolean;
  mode: ProfileFormMode;
  initialName?: string;
  requireDirectory: boolean;
  selectedDirectory: string;
  onChangeSelectedDirectory: (directory: string) => void;
  onPickDirectory: () => Promise<void>;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

const TITLES: Record<ProfileFormMode, string> = {
  create: 'Create Profile',
  rename: 'Rename Profile',
  clone: 'Clone Profile',
};

const SUBMIT_LABELS: Record<ProfileFormMode, string> = {
  create: 'Create profile',
  rename: 'Save name',
  clone: 'Clone profile',
};

export function ProfileFormModal({
  open,
  mode,
  initialName = '',
  requireDirectory,
  selectedDirectory,
  onChangeSelectedDirectory,
  onPickDirectory,
  onClose,
  onSubmit,
}: ProfileFormModalProps) {
  const [name, setName] = useState(initialName);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setIsSubmitting(false);
  }, [open, initialName, mode]);

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && (!requireDirectory || selectedDirectory.trim().length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={styles.modalOverlay}>
      <section style={styles.modalCard}>
        <h2 style={styles.modalTitle}>{TITLES[mode]}</h2>

        <label style={styles.label}>
          Profile name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            style={styles.searchInput}
            autoFocus
          />
        </label>

        {requireDirectory ? (
          <label style={styles.label}>
            Directory
            <div style={styles.buttonRow}>
              <input
                type="text"
                value={selectedDirectory}
                readOnly
                style={{ ...styles.searchInput, flex: 1 }}
              />
              <button type="button" style={styles.secondaryButton} onClick={() => void onPickDirectory()}>
                Choose
              </button>
            </div>
          </label>
        ) : null}

        <div style={styles.modalActions}>
          <button type="button" style={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
          <button type="button" style={styles.primaryButton} disabled={!canSubmit || isSubmitting} onClick={() => void submit()}>
            {SUBMIT_LABELS[mode]}
          </button>
        </div>
      </section>
    </div>
  );
}
