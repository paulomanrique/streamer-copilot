import { Component, type ReactNode } from 'react';

import { DEFAULT_APP_LANGUAGE } from '../../shared/constants.js';
import type { AppLanguage } from '../../shared/types.js';
import { messages } from '../i18n/messages.js';
import { styles } from './app-styles.js';

// ---------------------------------------------------------------------------
// AppErrorBoundary — top-level boundary (wraps the entire <App />)
// ---------------------------------------------------------------------------

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error('Renderer boundary caught an error', error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const language = (document.documentElement.lang as AppLanguage) || DEFAULT_APP_LANGUAGE;
      const t = (text: string) => messages[language]?.ui[text] ?? text;

      return (
        <main style={styles.page}>
          <section style={{ ...styles.card, alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
            <h1 style={styles.title}>{t('Renderer recovery mode')}</h1>
            <p style={styles.message}>
              {t('A renderer error was isolated by the app boundary. The window stayed alive so settings and recovery flows can be added without hard-crashing the process.')}
            </p>
            {this.state.error && (
              <pre style={{ margin: '12px 0 0', color: '#f87171', fontSize: '12px', whiteSpace: 'pre-wrap', maxWidth: '600px' }}>
                {this.state.error.message}
              </pre>
            )}
            <button onClick={this.handleRetry} style={{ ...styles.primaryButton, marginTop: '16px' }}>
              {t('Retry')}
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// SectionErrorBoundary — wraps individual sections (Dashboard, Settings, etc.)
// so a crash in one section doesn't take down the entire app.
// ---------------------------------------------------------------------------

interface SectionErrorBoundaryProps {
  /** Human-readable name shown in the fallback UI */
  sectionName: string;
  children: ReactNode;
}

interface SectionErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(`[SectionErrorBoundary:${this.props.sectionName}]`, error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '32px', display: 'grid', gap: '12px', justifyItems: 'center', textAlign: 'center' }}>
          <p style={{ margin: 0, color: '#f87171', fontSize: '14px', fontWeight: 600 }}>
            Something went wrong in {this.props.sectionName}.
          </p>
          {this.state.error && (
            <pre style={{ margin: 0, color: '#9ca3af', fontSize: '12px', whiteSpace: 'pre-wrap', maxWidth: '500px' }}>
              {this.state.error.message}
            </pre>
          )}
          <button onClick={this.handleRetry} style={styles.secondaryButton}>
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
