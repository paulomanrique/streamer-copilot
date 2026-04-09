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
    <aside className="fixed top-4 right-4 grid gap-2.5 z-50">
      {toasts.map((toast) => (
        <section key={toast.id} className="min-w-[260px] max-w-[360px] bg-slate-950/95 border border-red-400/50 rounded-xl px-3.5 py-3 text-red-200 shadow-2xl grid gap-1.5">
          <span className="text-red-100 text-[11px] font-bold uppercase tracking-wider">{toast.title}</span>
          <span className="text-sm">{toast.message}</span>
        </section>
      ))}
    </aside>
  );
}
