import { styles } from './app-styles.js';

interface DashboardSummaryProps {
  activeProfileName: string;
}

export function DashboardSummary({ activeProfileName }: DashboardSummaryProps) {
  return (
    <section style={styles.block}>
      <h2 style={styles.subtitle}>Resumo</h2>
      <p style={styles.message}>Perfil ativo: {activeProfileName}</p>
      <p style={styles.message}>Painel principal em preparação para integração do mockup Phase 1.</p>
    </section>
  );
}
