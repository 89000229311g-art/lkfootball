import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage, LANGUAGES } from '../context/LanguageContext.jsx';
import { useAcademy } from '../context/AcademyContext.jsx';
import { getAcademyLanguageCodes } from '../utils/academyLocale';

const EyeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

const EyeSlashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { language, changeLanguage, t } = useLanguage();
  const { academy } = useAcademy();
  const navigate = useNavigate();
  const brandColor = academy?.primary_color || '#16A34A';
  const academyLanguageCodes = getAcademyLanguageCodes(academy);
  const loginLanguages = LANGUAGES.filter((lang) => academyLanguageCodes.includes(lang.code));
  const showLanguageSelector = loginLanguages.length > 1;
  const phonePlaceholder = academy?.country_code === 'MD'
    ? '+37312345678'
    : academy?.country_code === 'RO'
      ? '+40712345678'
      : '+79991234567';

  const getLoginErrorMessage = (err) => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((item) => item?.msg || item?.message)
        .filter(Boolean)
        .join('. ') || t('login_error') || 'Неверный номер телефона или пароль';
    }
    if (detail && typeof detail === 'object') {
      return detail.msg || detail.message || t('login_error') || 'Неверный номер телефона или пароль';
    }
    return t('login_error') || 'Неверный номер телефона или пароль';
  };

  // Show a friendly message if session expired
  useEffect(() => {
    try {
      const notice = sessionStorage.getItem('auth_notice');
      if (notice) {
        setError(notice);
        sessionStorage.removeItem('auth_notice');
      }
    } catch (e) { void e; }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const userData = await login(username, password);
      navigate(userData?.role === 'platform_owner' ? '/platform' : '/');
    } catch (err) {
      console.error('Login error:', err);
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center p-4 overflow-y-auto" style={{ background: `linear-gradient(135deg, ${brandColor}, #14532d)` }}>
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-2xl w-full max-w-md mx-auto my-auto">
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-bold text-gray-950">
            {academy?.logo_url ? (
              <img src={academy.logo_url} alt="" className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover" />
            ) : null}
            <span>{academy?.name || 'Football Academy'}</span>
          </h1>
          <p className="text-gray-500 mt-2 text-sm md:text-base">{t('login_title')}</p>
          
          {/* Language Selector: показываем только для стран с несколькими языками */}
          {showLanguageSelector && (
            <div className="flex justify-center gap-2 mt-4">
              {loginLanguages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`px-3 py-1 rounded-full text-sm transition ${
                    language === lang.code
                      ? 'text-white'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                  }`}
                  style={language === lang.code ? { backgroundColor: brandColor } : undefined}
                >
                  {lang.flag}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('phone')}
            </label>
            <input
              type="tel"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:border-transparent transition text-black"
              placeholder={phonePlaceholder}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('password_placeholder')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-2xl focus:ring-2 focus:border-transparent transition pr-12 text-black"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          
          <button
            type="submit"
            disabled={loading}
            className="w-full text-white py-3 rounded-2xl font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: brandColor }}
          >
            {loading ? t('loading') : t('login_button')}
          </button>
        </form>
      </div>
    </div>
  );
}
