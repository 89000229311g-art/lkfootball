import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { AcademyProvider } from './context/AcademyContext.jsx'

const knownRoutes = new Set([
  'login', 'news', 'communications', 'students', 'groups', 'events', 'calendar',
  'schedule', 'analytics', 'coach-analytics', 'attendance', 'payments', 'chat',
  'users-management', 'salary-management', 'my-salary', 'history', 'crm',
  'recruitment', 'marketing', 'tasks', 'settings', 'platform'
]);

const parts = window.location.pathname.split('/').filter(Boolean);
if (parts[0] && !knownRoutes.has(parts[0])) {
  window.__ACADEMY_SLUG__ = parts[0];
  window.__APP_BASENAME__ = `/${parts[0]}`;
  localStorage.setItem('academySlug', parts[0]);
} else if (!parts[0] || parts[0] === 'login' || parts[0] === 'platform') {
  window.__PLATFORM_LOGIN__ = true;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={window.__APP_BASENAME__ || ''}>
      <LanguageProvider>
        <AcademyProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </AcademyProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
