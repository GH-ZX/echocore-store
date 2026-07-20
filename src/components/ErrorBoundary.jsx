import { Component } from 'react';
import { getT } from '../lib/i18n';
import { logClientError } from '../lib/siteLogs';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
    logClientError('react_error_boundary', {
      severity: 'danger',
      error,
      metadata: {
        componentStack: info?.componentStack || null,
        consoleLog: [
          error?.stack || `${error?.name || 'Error'}: ${error?.message || error}`,
          info?.componentStack ? `\n--- componentStack ---\n${info.componentStack}` : '',
        ].filter(Boolean).join(''),
      },
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const lang = this.props.lang === 'en' ? 'en' : 'ar';
    const t = getT(lang);

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-black mb-2">
            {t.errorUnexpectedTitle}
          </h1>
          <p className="text-[var(--text-sec)] text-sm mb-6 leading-relaxed">
            {t.errorUnexpectedDesc}
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