
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import ParentDashboard from './dashboards/ParentDashboard';
import CoachDashboard from './dashboards/CoachDashboard';
import OwnerDashboard from './dashboards/OwnerDashboard';
import AdminDashboard from './dashboards/AdminDashboard';

export default function Dashboard() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  
  if (user?.role?.toLowerCase() === 'parent') return <ParentDashboard t={t} language={language} user={user} />;
  if (user?.role?.toLowerCase() === 'coach') return <CoachDashboard t={t} language={language} />;
  if (user?.role?.toLowerCase() === 'super_admin' || user?.role?.toLowerCase() === 'owner') return <OwnerDashboard t={t} language={language} />;
  return <AdminDashboard t={t} language={language} />;
}
