import React, { Component } from 'react';

/**
 * 🛡️ ErrorBoundary - Глобальный перехватчик ошибок
 * Ловит JavaScript ошибки в дочерних компонентах и показывает user-friendly сообщение
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      isRetrying: false
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('🚨 ErrorBoundary caught error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ isRetrying: true });
    setTimeout(() => {
      this.setState({ hasError: false, error: null, errorInfo: null, isRetrying: false });
    }, 500);
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 max-w-lg w-full text-center">
            <div className="text-6xl mb-4">💥</div>
            <h2 className="text-2xl font-bold text-red-400 mb-2">
              Произошла ошибка
            </h2>
            <p className="text-white/60 mb-4">
              {this.state.error?.message || 'Неизвестная ошибка в компоненте'}
            </p>
            
            {import.meta.env.DEV && this.state.errorInfo && (
              <details className="text-left bg-black/30 rounded-lg p-4 mb-4 text-xs">
                <summary className="cursor-pointer text-white/50 mb-2">
                  Технические детали
                </summary>
                <pre className="text-red-300 overflow-auto">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            
            <button
              onClick={this.handleRetry}
              disabled={this.state.isRetrying}
              className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl text-red-400 font-medium transition-all"
            >
              {this.state.isRetrying ? '⏳ Перезагрузка...' : '🔄 Попробовать снова'}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
