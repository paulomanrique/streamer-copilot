import { styles } from './app-styles.js';

interface DashboardSummaryProps {
  activeProfileName: string;
}

export function DashboardSummary({ activeProfileName }: DashboardSummaryProps) {
  return (
    <section style={styles.block}>
      <h2 style={styles.subtitle}>Summary</h2>
      <p style={styles.message}>Active profile: {activeProfileName}</p>
      <p style={styles.message}>Main panel is being prepared for Phase 1 mockup integration.</p>
    </section>
  );
}
