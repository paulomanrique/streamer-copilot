import { Component, type ReactNode } from 'react';

import { styles } from './app-styles.js';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Renderer boundary caught an error', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={styles.page}>
          <section style={styles.card}>
            <h1 style={styles.title}>Renderer recovery mode</h1>
            <p style={styles.message}>
              A renderer error was isolated by the app boundary. The window stayed alive so settings and recovery
              flows can be added without hard-crashing the process.
            </p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
