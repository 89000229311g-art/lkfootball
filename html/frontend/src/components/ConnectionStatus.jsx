import { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { loggingAPI } from '../api/client';

/**
 * 🌐 ConnectionStatus - Показывает статус подключения к серверу
 * Автоматически проверяет соединение и показывает уведомление при проблемах
 */
export function ConnectionStatus() {
  const { t } = useLanguage();
  const [status, setStatus] = useState('connected'); // connected, checking, disconnected
  const [showBanner, setShowBanner] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Проверка статуса бэкенда
  const checkConnection = async () => {
    try {
      setStatus('checking');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // Увеличили таймаут до 10 сек
      
      const baseUrl = import.meta.env.VITE_API_URL || '/api/v1';
      // Ensure we don't double slashes or miss one
      const url = baseUrl.endsWith('/') 
        ? `${baseUrl}health` 
        : `${baseUrl}/health`;

      // DEBUG LOG
      console.log('Checking connection to:', url);

      const response = await fetch(url, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        setStatus('connected');
        setShowBanner(false);
        setLastError(null);
        setRetryCount(0);
      } else {
        throw new Error(`Server returned ${response.status}`);
      }
    } catch (error) {
      const baseUrl = import.meta.env.VITE_API_URL || '/api/v1';
      
      // Игнорируем ошибки отмены запроса (пользователь ушёл со страницы)
      if (error.name === 'AbortError') {
        console.log('Connection check aborted');
        return;
      }
      
      setStatus('disconnected');
      setShowBanner(true);
      
      // Улучшенное сообщение об ошибке
      let errorMessage = error.message;
      if (error.message.includes('signal is aborted') || error.message.includes('AbortError')) {
        errorMessage = 'Превышено время ожидания ответа от сервера';
      } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Нет соединения с сервером';
      }
      
      setLastError(`${errorMessage} (${baseUrl})`);
      setRetryCount(prev => prev + 1);
      
      // Log critical connection errors to backend
      if (retryCount > 0 && retryCount % 5 === 0) { // Log every 5th retry to avoid spam
          loggingAPI.logFrontendError(
              `Connection failed: ${error.message}`, 
              'ConnectionStatus', 
              { baseUrl, retryCount: retryCount + 1 }
          );
      }
    }
  };

  // Проверка при загрузке и периодическая проверка
  useEffect(() => {
    checkConnection();
    
    // Проверяем каждые 30 секунд если отключены
    const interval = setInterval(() => {
      if (status === 'disconnected') {
        checkConnection();
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, [status]);

  // Слушаем ошибки сети
  useEffect(() => {
    const handleOnline = () => checkConnection();
    const handleOffline = () => {
      setStatus('disconnected');
      setShowBanner(true);
      setLastError('Нет подключения к интернету');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] animate-slide-down">
      <div className="bg-amber-500/95 backdrop-blur-sm text-black px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">
              {status === 'checking' ? '🔄' : '⚠️'}
            </span>
            <div>
              <div className="font-bold">
                {status === 'checking' 
                  ? 'Проверка подключения...' 
                  : 'Сервер недоступен'}
              </div>
              <div className="text-sm opacity-80">
                {lastError || 'Проверьте, запущен ли бэкенд'}
                {retryCount > 0 && ` (попытка ${retryCount})`}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={checkConnection}
              disabled={status === 'checking'}
              className="px-4 py-2 bg-black/20 hover:bg-black/30 rounded-lg font-medium transition-all disabled:opacity-50"
            >
              {status === 'checking' ? '⏳' : '🔄'} Проверить
            </button>
            <button
              onClick={() => setShowBanner(false)}
              className="p-2 hover:bg-black/20 rounded-lg transition-all"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 🔔 Toast уведомления об ошибках API
 */
export function useApiErrorHandler() {
  const [errors, setErrors] = useState([]);

  const showError = (message, details = null) => {
    const id = Date.now();
    const error = { id, message, details, timestamp: new Date() };
    
    setErrors(prev => [...prev, error]);
    
    // Автоудаление через 5 секунд
    setTimeout(() => {
      setErrors(prev => prev.filter(e => e.id !== id));
    }, 5000);
  };

  const dismissError = (id) => {
    setErrors(prev => prev.filter(e => e.id !== id));
  };

  return { errors, showError, dismissError };
}

/**
 * 🎯 Компонент отображения ошибок API
 */
export function ApiErrorToasts({ errors, onDismiss }) {
  if (!errors.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-md">
      {errors.map(error => (
        <div 
          key={error.id}
          className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 backdrop-blur-sm animate-slide-in"
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl">❌</span>
            <div className="flex-1">
              <div className="font-bold text-red-400">{error.message}</div>
              {error.details && (
                <div className="text-sm text-white/60 mt-1">{error.details}</div>
              )}
            </div>
            <button
              onClick={() => onDismiss(error.id)}
              className="text-white/50 hover:text-white p-1"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}



export default ConnectionStatus;
