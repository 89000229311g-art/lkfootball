import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../api/client';
import { subscribeToPushNotifications } from '../utils/push';

const defaultAuthContext = {
  user: null,
  login: async () => {
    throw new Error('AuthProvider is missing in component tree');
  },
  logout: () => {},
  updateUser: () => {},
  loading: false,
};

const AuthContext = createContext(defaultAuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authAPI.getMe()
        .then(response => {
          setUser(response.data);
          // Trigger push subscription check
          subscribeToPushNotifications();
          // Язык НЕ меняем автоматически при проверке токена
          // Язык устанавливается только при логине
        })
        .catch(() => {
          localStorage.removeItem('token');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const response = await authAPI.login(username, password);
      const token = response.data.access_token;
      localStorage.setItem('token', token);
      
      const userResponse = await authAPI.getMe();
      const userData = userResponse.data;
      setUser(userData);
      
      // Trigger push subscription check
      subscribeToPushNotifications();

      // При логине синхронизируем язык с бэкенда (только один раз)
      if (userData.preferred_language) {
        const savedLang = localStorage.getItem('language');
        if (savedLang !== userData.preferred_language) {
          localStorage.setItem('language', userData.preferred_language);
          window.dispatchEvent(new Event('languageChange'));
        }
      }
      
      return response;
    } catch (error) {
      localStorage.removeItem('token');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const updateUser = (userData) => {
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
