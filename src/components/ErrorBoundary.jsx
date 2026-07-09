import { Component } from 'react';

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
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const lang = this.props.lang === 'en' ? 'en' : 'ar';
    const isAr = lang === 'ar';

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="card max-w-md w-full p-8 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-black mb-2">
            {isAr ? 'حدث خطأ غير متوقع' : 'Something went wrong'}
          </h1>
          <p className="text-[var(--text-sec)] text-sm mb-6 leading-relaxed">
            {isAr
              ? 'واجه المتجر مشكلة أثناء عرض هذه الصفحة. جرّب إعادة التحميل أو العودة للرئيسية.'
              : 'The store hit an unexpected error while rendering this page. Try reloading or go back home.'}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" onClick={this.handleReload} className="btn btn-primary">
              {isAr ? 'إعادة التحميل' : 'Reload'}
            </button>
            <a href={import.meta.env.BASE_URL || '/'} className="btn btn-secondary">
              {isAr ? 'الصفحة الرئيسية' : 'Home'}
            </a>
          </div>
        </div>
      </div>
    );
  }
}