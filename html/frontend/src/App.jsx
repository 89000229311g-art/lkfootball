import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { ConnectionStatus } from './components/ConnectionStatus';
import Students from './pages/Students';
import UsersManagement from './pages/UsersManagement';
import React, { Suspense, lazy } from 'react';

// Lazy load pages
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
// const Students = lazy(() => import('./pages/Students'));
const Groups = lazy(() => import('./pages/Groups'));
const Events = lazy(() => import('./pages/Events'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Analytics = lazy(() => import('./pages/Analytics'));
const CoachAnalytics = lazy(() => import('./pages/CoachAnalytics'));
const Attendance = lazy(() => import('./pages/Attendance'));
const Payments = lazy(() => import('./pages/Payments'));
const Chat = lazy(() => import('./pages/Chat'));
// const UsersManagement = lazy(() => import('./pages/UsersManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const NewsFeed = lazy(() => import('./pages/NewsFeed'));
const Communications = lazy(() => import('./pages/Communications'));
const SalaryManagement = lazy(() => import('./pages/SalaryManagement'));
const MySalary = lazy(() => import('./pages/MySalary'));
const History = lazy(() => import('./pages/History'));
const CRM = lazy(() => import('./pages/CRM'));
const Recruitment = lazy(() => import('./pages/Recruitment'));
const Marketing = lazy(() => import('./pages/Marketing'));
const Tasks = lazy(() => import('./pages/Tasks'));
const AcademicDiary = lazy(() => import('./components/AcademicDiary'));
const GroupAnalytics = lazy(() => import('./components/GroupAnalytics'));
const NewContractWizard = lazy(() => import('./pages/NewContractWizard'));

function normalizeRole(role) {
  if (!role) return null;
  const r = role.toString().toLowerCase().trim();
  if (r === 'super_admin' || r === 'super admin' || r === 'userrole.super_admin') return 'super_admin';
  if (r === 'owner' || r === 'userrole.owner') return 'owner';
  if (r === 'admin' || r === 'administrator' || r === 'userrole.admin') return 'admin';
  if (r === 'accountant' || r === 'userrole.accountant') return 'accountant';
  if (r === 'coach' || r === 'userrole.coach') return 'coach';
  if (r === 'parent' || r === 'userrole.parent') return 'parent';
  return r;
}

function PrivateRoute({ children }) {
  const auth = useAuth();
  const user = auth?.user;
  const loading = auth?.loading;
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Загрузка...</div>
      </div>
    );
  }
  
  if (!auth) {
    console.error("AuthContext missing in PrivateRoute");
    return <Navigate to="/login" />;
  }
  
  return user ? children : <Navigate to="/login" />;
}

function RoleRoute({ children, allowedRoles }) {
  const auth = useAuth();
  const user = auth?.user;
  
  if (!auth) return <Navigate to="/login" />;
  
  const userRole = normalizeRole(user?.role);
  
  if (!allowedRoles.includes(userRole)) {
    return <Navigate to="/" replace />;
  }
  
  return children;
}

function App() {
  return (
    <ErrorBoundary>
      {/* Статус подключения к серверу */}
      <ConnectionStatus />

      
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1C1E24',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#fff' }
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#fff' }
          }
        }}
      />
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#0F1115]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#E5B300]"></div>
        </div>
      }>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
          <Route index element={<Dashboard />} />
          <Route path="news" element={<NewsFeed />} />
                  <Route path="communications" element={<Communications />} />
          <Route path="students" element={<Students />} />
          <Route path="groups" element={<Groups />} />
          <Route path="events" element={<Events />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="analytics" element={
            <RoleRoute allowedRoles={['super_admin', 'admin', 'owner']}>
              <Analytics />
            </RoleRoute>
          } />
          <Route path="coach-analytics" element={
            <RoleRoute allowedRoles={['coach', 'super_admin', 'owner', 'admin']}>
              <CoachAnalytics />
            </RoleRoute>
          } />
          <Route path="attendance" element={<Attendance />} />
          <Route path="payments" element={
            <RoleRoute allowedRoles={['super_admin', 'owner', 'admin', 'parent']}>
              <Payments />
            </RoleRoute>
          } />
          <Route path="chat" element={<Chat />} />
          <Route path="users-management" element={
            <RoleRoute allowedRoles={['super_admin', 'owner', 'admin']}>
              <UsersManagement />
            </RoleRoute>
          } />
          <Route path="salary-management" element={
            <RoleRoute allowedRoles={['super_admin', 'owner', 'accountant']}>
              <SalaryManagement />
            </RoleRoute>
          } />
          <Route path="my-salary" element={
            <RoleRoute allowedRoles={['super_admin', 'owner', 'admin', 'coach', 'accountant']}>
              <MySalary />
            </RoleRoute>
          } />
          <Route path="history" element={
            <RoleRoute allowedRoles={['super_admin', 'admin', 'owner']}>
              <History />
            </RoleRoute>
          } />
          <Route path="crm" element={
            <RoleRoute allowedRoles={['super_admin', 'admin', 'owner']}>
              <CRM />
            </RoleRoute>
          } />
          <Route path="recruitment" element={
            <RoleRoute allowedRoles={['super_admin', 'admin', 'owner']}>
              <Recruitment />
            </RoleRoute>
          } />
          <Route path="marketing" element={
            <RoleRoute allowedRoles={['super_admin', 'admin', 'owner']}>
              <Marketing />
            </RoleRoute>
          } />
          <Route path="tasks" element={
            <RoleRoute allowedRoles={['super_admin', 'admin', 'owner']}>
              <Tasks />
            </RoleRoute>
          } />
          <Route path="settings" element={<Settings />} />
          <Route path="students/new-contract" element={
            <RoleRoute allowedRoles={['super_admin', 'owner', 'admin']}>
              <NewContractWizard />
            </RoleRoute>
          } />
          <Route path="students/:id/diary" element={<AcademicDiary />} />
          <Route path="groups/:id/analytics" element={<GroupAnalytics />} />
          </Route>
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
