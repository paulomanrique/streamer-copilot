import { styles } from './app-styles.js';

export interface ToastItem {
  id: number;
  title: string;
  message: string;
}

interface ToastStackProps {
  toasts: ToastItem[];
}

export function ToastStack({ toasts }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <aside style={styles.toastStack}>
      {toasts.map((toast) => (
        <section key={toast.id} style={styles.toast}>
          <span style={styles.toastTitle}>{toast.title}</span>
          <span>{toast.message}</span>
        </section>
      ))}
    </aside>
  );
}
