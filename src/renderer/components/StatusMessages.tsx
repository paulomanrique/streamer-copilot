import { styles } from './app-styles.js';

interface StatusMessagesProps {
  isLoading: boolean;
  error: string | null;
}

export function StatusMessages({ isLoading, error }: StatusMessagesProps) {
  return (
    <>
      {isLoading ? <p style={styles.message}>Carregando...</p> : null}
      {error ? <p style={styles.error}>{error}</p> : null}
    </>
  );
}
