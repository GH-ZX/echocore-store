import { Component } from 'react';
import { getT } from '../lib/i18n';
import { logClientError } from '../lib/siteLogs';
import { isDynamicImportError } from '../lib/lazyRetry';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isChunkError: false };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      isChunkError: isDynamicImportError(error),
    };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
    const chunk = isDynamicImportError(error);
    // Chunk/HMR failures are common in local Vite — log as warning, not "critical danger"
    logClientError(chunk ? 'chunk_load_failed' : 'react_error_boundary', {
      severity: chunk ? 'warning' : 'danger',
      error,
      metadata: {
        componentStack: info?.componentStack || null,
        isChunkError: chunk,
        isDev: !!import.meta.env.DEV,
        consoleLog: [
          error?.stack || `${error?.name || 'Error'}: ${error?.message || error}`,
          info?.componentStack ? `\n--- componentStack ---\n${info.componentStack}` : '',
        ].filter(Boolean).join(''),
      },
    });

    // Dev: one automatic reload after Vite invalidates a lazy chunk (avoids stuck blank UI)
    if (chunk && import.meta.env.DEV && typeof window !== 'undefined') {
      const key = 'echocore-chunk-reload';
      try {
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.setTimeout(() => window.location.reload(), 400);
        }
      } catch {
        /* private mode */
      }
    }
  }

  handleReload = () => {
    try {
      sessionStorage.removeItem('echocore-chunk-reload');
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const lang = this.props.lang === 'en' ? 'en' : 'ar';
    const t = getT(lang);
    const chunk = this.state.isChunkError;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-black mb-2">
            {chunk
              ? (t.errorChunkTitle || t.errorUnexpectedTitle)
              : t.errorUnexpectedTitle}
          </h1>
          <p className="text-[var(--text-sec)] text-sm mb-6 leading-relaxed">
            {chunk
              ? (t.errorChunkDesc || t.errorUnexpectedDesc)
              : t.errorUnexpectedDesc}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={this.handleReload} className="btn btn-primary">
              {t.reload}
            </button>
            <a href={import.meta.env.BASE_URL || '/'} className="btn btn-secondary">
              {t.home}
            </a>
          </div>
        </div>
      </div>
    );
  }
}