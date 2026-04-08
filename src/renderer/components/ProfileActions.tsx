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
        Novo
      </button>
      <button type="button" style={styles.secondaryButton} onClick={onRename}>
        Renomear
      </button>
      <button type="button" style={styles.secondaryButton} onClick={onClone}>
        Clonar
      </button>
      <button type="button" style={styles.dangerButton} onClick={onDelete}>
        Apagar
      </button>
    </div>
  );
}
