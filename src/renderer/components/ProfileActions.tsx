import { styles } from './app-styles.js';

interface ProfileActionsProps {
  onCreate: () => void;
  onRename: () => void;
  onClone: () => void;
  onDelete: () => void;
}

export function ProfileActions({ onCreate, onRename, onClone, onDelete }: ProfileActionsProps) {
  return (
    <div style={styles.actionsRow}>
      <button type="button" style={styles.secondaryButton} onClick={onCreate}>
        New
      </button>
      <button type="button" style={styles.secondaryButton} onClick={onRename}>
        Rename
      </button>
      <button type="button" style={styles.secondaryButton} onClick={onClone}>
        Clone
      </button>
      <button type="button" style={styles.dangerButton} onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}
