import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { studentsAPI, groupsAPI, usersAPI, analyticsAPI, paymentsAPI, attendanceAPI, eventsAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import PlayerCard from '../components/PlayerCard';
import MedicalMonitoring from '../components/MedicalMonitoring';
import GroupAnalytics from '../components/GroupAnalytics';
import { Search, Filter, Users, Loader2, AlertCircle, CheckCircle2, ChevronDown, Activity, FileText, BarChart2, TrendingUp, Trophy, DollarSign, ArrowLeft } from 'lucide-react';
import { exportToExcel, exportToPDF, getDateString } from '../utils/exportUtils';
import { getLocalizedName, transliterate } from '../utils/transliteration';
import StudentRow from '../components/StudentRow';

const getBaseUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
  return apiUrl.replace('/api/v1', '');
};

const BASE_URL = getBaseUrl();

// Analytics constants
const months = [
  { value: '', label: 'Все месяцы' },
  { value: '01', label: 'Январь' },
  { value: '02', label: 'Февраль' },
  { value: '03', label: 'Март' },
  { value: '04', label: 'Апрель' },
  { value: '05', label: 'Май' },
  { value: '06', label: 'Июнь' },
  { value: '07', label: 'Июль' },
  { value: '08', label: 'Август' },
  { value: '09', label: 'Сентябрь' },
  { value: '10', label: 'Октябрь' },
  { value: '11', label: 'Ноябрь' },
  { value: '12', label: 'Декабрь' }
];

export default function Students() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  
  // State
  const [students, setStudents] = useState([]);
  const [totalStudentsCount, setTotalStudentsCount] = useState(0);
  const [groups, setGroups] = useState([]);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [searchQuery, setSearchQuery] = React.useState('');
  const [viewMode, setViewMode] = useState('groups'); // 'groups', 'list'
  const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'frozen', 'debtors'
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedStudentForCard, setSelectedStudentForCard] = useState(null);
  const [activeTab, setActiveTab] = useState('list'); // 'list', 'medical'
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Export state
  // const printRef = useRef(null); // Unused
  // const [isExporting, setIsExporting] = useState(false); // Unused
  
  // Bulk selection
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignGroupId, setBulkAssignGroupId] = useState('');

  // Modals (kept minimal state for now, can expand as needed)

  // Analytics State (for super_admin full functionality)
  const [analyticsActiveTab, setAnalyticsActiveTab] = useState('comparison');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState('');
  const [events, setEvents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [financialReport, setFinancialReport] = useState(null);
  const [attendanceReport, setAttendanceReport] = useState(null);
  const [coachReport, setCoachReport] = useState([]);
  const [topPlayers, setTopPlayers] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Map student_id -> count of pending invoices (keeps UI debt aligned with issued invoices)
  const [pendingByStudent, setPendingByStudent] = useState(new Map());

  const refreshPendingMap = useCallback(async () => {
    try {
      const res = await paymentsAPI.getAll();
      const all = res.data.data || res.data || [];
      // Build map of completed payments per student/period to filter ghost pending
      const completedKeys = new Set();
      all.forEach(p => {
        if (p.status === 'completed' && p.payment_period && p.student_id) {
          const periodStr = String(p.payment_period);
          const periodKey = periodStr.length >= 7 ? periodStr.substring(0, 7) : periodStr;
          completedKeys.add(`${p.student_id}_${periodKey}`);
        }
      });
      const counter = new Map();
      all.forEach(p => {
        if (p.deleted_at) return;
        if (p.status !== 'pending') return;
        if (p.payment_period) {
          const periodStr = String(p.payment_period);
          const periodKey = periodStr.length >= 7 ? periodStr.substring(0, 7) : periodStr;
          const key = `${p.student_id}_${periodKey}`;
          if (completedKeys.has(key)) return; // skip ghost pending
        }
        const sid = p.student_id;
        counter.set(sid, (counter.get(sid) || 0) + 1);
      });
      setPendingByStudent(counter);
    } catch (e) {
      console.warn('Failed to refresh pending payments map:', e);
      setPendingByStudent(new Map());
    }
  }, []);

  useEffect(() => {
    refreshPendingMap();
  }, [refreshPendingMap]);

  useEffect(() => {
    const handler = () => refreshPendingMap();
    window.addEventListener('payments:updated', handler);
    return () => window.removeEventListener('payments:updated', handler);
  }, [refreshPendingMap]);

  // Roles
  const isAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
  const isCoach = user?.role?.toLowerCase() === 'coach';

  // Fetch Data
    const fetchData = useCallback(async () => {
      try {
        setLoading(true);
        
        // Only admins can fetch all users. Coaches get 403.
        // We handle this by conditionally adding the promise.
        const promises = [
          studentsAPI.getAll(),
          groupsAPI.getAll()
        ];
        
        if (isAdmin) {
          promises.push(usersAPI.getAll());
        }
        
        const results = await Promise.all(promises);
        const studentsRes = results[0];
        const groupsRes = results[1];
        const usersRes = isAdmin ? results[2] : { data: [] };
        
        console.log('Students response:', studentsRes);
      
      // Robust data extraction
      let studentsData = [];
      let totalCount = 0;

      if (studentsRes.data) {
        if (Array.isArray(studentsRes.data)) {
            studentsData = studentsRes.data;
            totalCount = studentsData.length;
        } else if (studentsRes.data.data && Array.isArray(studentsRes.data.data)) {
            studentsData = studentsRes.data.data;
            totalCount = studentsRes.data.total || studentsData.length;
        }
      }

      const groupsData = groupsRes.data?.data || groupsRes.data || [];
      
      setStudents(studentsData);
      setTotalStudentsCount(totalCount);
      setGroups(groupsData);
      
      // Fix: Handle paginated users response
      const allUsers = usersRes.data?.data || usersRes.data || [];
      const parentsList = Array.isArray(allUsers) ? allUsers.filter(u => u.role?.toLowerCase() === 'parent') : [];
      setParents(parentsList);
      
      // Create parents map for O(1) lookup
      // We'll use a ref or state if we want to optimize re-renders, but for now simple state is fine.
      // Actually, let's optimize getParentInfo by creating a map
      
      // Initialize expanded groups (expand all by default for better UX if not too many)
      const initialExpanded = {};
      groupsData.forEach((g, idx) => {
        if (idx === 0 || isCoach) initialExpanded[g.id] = true;
      });
      setExpandedGroups(initialExpanded);
      
    } catch (error) {
      console.error('Error fetching data:', error);
      setErrorMessage(t('load_error'));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isCoach, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Analytics Functions (Full functionality for super_admin)
  const loadAnalyticsData = useCallback(async () => {
    if (!isAdmin || activeTab !== 'analytics') return;
    
    setAnalyticsLoading(true);
    try {
      const results = await Promise.allSettled([
        eventsAPI.getAll(),
        groupsAPI.getAll(),
        studentsAPI.getAll(),
        paymentsAPI.getAll(),
        attendanceAPI.getAll()
      ]);
      
      const [eventsRes, groupsRes, studentsRes, paymentsRes, attendanceRes] = results;

      if (eventsRes.status === 'fulfilled') {
        setEvents(eventsRes.value.data.data || []);
      }
      if (groupsRes.status === 'fulfilled') {
        // groups already loaded in main fetchData
      }
      if (studentsRes.status === 'fulfilled') {
        // students already loaded in main fetchData
      }
      if (paymentsRes.status === 'fulfilled') {
        const allPayments = paymentsRes.value.data.data || paymentsRes.value.data || [];
        const completedPayments = allPayments.filter(p => p.status === 'completed' && !p.deleted_at);
        setPayments(completedPayments);
      }
      if (attendanceRes.status === 'fulfilled') {
        setAttendance(attendanceRes.value.data || []);
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [isAdmin, activeTab]);

  const loadFinancialReport = useCallback(async () => {
    if (!isAdmin || analyticsActiveTab !== 'financial') return;
    
    try {
      const { start, end } = getAnalyticsDateRange();
      const res = await analyticsAPI.getFinancialReport('month', 12, start, end);
      setFinancialReport(res.data);
    } catch (e) {
      console.error('Error loading financial report:', e);
    }
  }, [analyticsActiveTab, selectedYear, selectedMonth]);

  const loadAttendanceReport = useCallback(async () => {
    if (!isAdmin || analyticsActiveTab !== 'attendance') return;
    
    try {
      const { start, end } = getAnalyticsDateRange();
      const res = await analyticsAPI.getAttendance('month', 12, start, end);
      setAttendanceReport(res.data);
    } catch (e) {
      console.error('Error loading attendance report:', e);
    }
  }, [analyticsActiveTab, selectedYear, selectedMonth]);

  const loadCoachReport = useCallback(async () => {
    if (!isAdmin || analyticsActiveTab !== 'coaches') return;
    
    try {
      const { start, end } = getAnalyticsDateRange();
      const res = await analyticsAPI.getCoachReport(start, end);
      const rankedData = res.data.map(c => ({
        ...c,
        efficiency: c.trainings_count > 0 ? Math.round((c.trainings_count / c.total_events) * 100) : 0
      }));
      setCoachReport(rankedData);
    } catch (e) {
      console.error('Error loading coach report:', e);
    }
  }, [analyticsActiveTab, selectedYear, selectedMonth]);

  const loadTopPlayers = useCallback(async () => {
    if (!isAdmin || analyticsActiveTab !== 'top_players') return;
    
    try {
      const res = await analyticsAPI.getTopPlayers(null, selectedMonth || null, selectedYear, 500);
      setTopPlayers(res.data);
    } catch (e) {
      console.error('Error loading top players:', e);
    }
  }, [analyticsActiveTab, selectedYear, selectedMonth]);

  const getAnalyticsDateRange = () => {
    let start, end;
    if (selectedMonth) {
      const mIndex = parseInt(selectedMonth) - 1;
      start = new Date(Date.UTC(selectedYear, mIndex, 1)).toISOString().split('T')[0];
      end = new Date(Date.UTC(selectedYear, mIndex + 1, 0)).toISOString().split('T')[0];
    } else {
      start = new Date(Date.UTC(selectedYear, 0, 1)).toISOString().split('T')[0];
      end = new Date(Date.UTC(selectedYear, 11, 31)).toISOString().split('T')[0];
    }
    return { start, end };
  };

  // Load analytics data when tab changes
  useEffect(() => {
    if (activeTab === 'analytics' && isAdmin) {
      loadAnalyticsData();
      
      // Load specific reports based on active analytics tab
      if (analyticsActiveTab === 'financial') {
        loadFinancialReport();
      } else if (analyticsActiveTab === 'attendance') {
        loadAttendanceReport();
      } else if (analyticsActiveTab === 'coaches') {
        loadCoachReport();
      } else if (analyticsActiveTab === 'top_players') {
        loadTopPlayers();
      }
    }
  }, [activeTab, analyticsActiveTab, loadAnalyticsData, loadFinancialReport, loadAttendanceReport, loadCoachReport, loadTopPlayers]);

  // Helpers
  // Optimize parent lookup
  const parentsMap = useMemo(() => {
    const map = new Map();
    parents.forEach(p => {
        map.set(p.id, p);
        if (p.phone) map.set(p.phone, p);
    });
    return map;
  }, [parents]);

  const getParentInfo = useCallback((student) => {
    if (student.guardians && student.guardians.length > 0) return student.guardians;
    if (student.guardian_ids && student.guardian_ids.length > 0) {
      return student.guardian_ids.map(id => parentsMap.get(id)).filter(Boolean);
    }
    if (student.parent_phone) {
      const parentByPhone = parentsMap.get(student.parent_phone);
      if (parentByPhone) return [parentByPhone];
      return [{ phone: student.parent_phone, full_name: t('parent_default') }];
    }
    return [];
  }, [parentsMap, t]);

  const hasDebt = useCallback((student) => {
    // Primary: if there are pending invoices for student -> debt
    const pendingCount = pendingByStudent.get(student.id) || 0;
    if (pendingCount > 0) return true;

    // Secondary: negative balances indicate debt even without invoice
    if (student.monthly_balance !== undefined) return student.monthly_balance < 0;
    if (student.balance !== undefined) return student.balance < 0;

    // Legacy fallbacks (keep compatibility)
    if (student.is_paid_this_month !== undefined) return !student.is_paid_this_month;
    if (student.is_debtor) return true;
    if (student.balance_color === 'red') return true;
    return false;
  }, [pendingByStudent]);

  const calculateAge = (dob) => {
    if (!dob) return '';
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  // Filtering
  const displayGroups = useMemo(() => {
    return isCoach 
      ? groups.filter(g => 
          g.coach_id === user?.id || 
          g.coaches?.some(c => c.id === user?.id || c.user_id === user?.id)
        )
      : groups;
  }, [groups, isCoach, user]);

  const filteredStudents = useMemo(() => {
    let result = students;

    // 1. Text Search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => 
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(query) ||
        s.parent_phone?.includes(query) ||
        s.phone?.includes(query)
      );
    }

    // 2. Status Filter
    if (filterStatus === 'active') {
      result = result.filter(s => s.status === 'active' && !s.is_frozen);
    } else if (filterStatus === 'frozen') {
      result = result.filter(s => s.is_frozen);
    } else if (filterStatus === 'debtors') {
      // Show students who have unpaid subscription OR negative total balance
      result = result.filter(s => hasDebt(s) || (s.balance !== undefined && s.balance < 0));
    }

    // 3. Group Filter
    if (selectedGroup !== 'all') {
      result = result.filter(s => s.group_id === parseInt(selectedGroup));
    }

    // 4. Sort by Last Name (Alphabetical)
    result = [...result].sort((a, b) => {
      const nameA = (a.last_name || '').toLowerCase();
      const nameB = (b.last_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return result;
  }, [students, searchQuery, filterStatus, selectedGroup, hasDebt]);

  const getFilteredStudentsByGroup = (groupId) => filteredStudents.filter(s => s.group_id === groupId);

  // Group Toggle
  const toggleGroup = (groupId) => setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  const expandAll = () => {
    const all = {};
    displayGroups.forEach(g => all[g.id] = true);
    setExpandedGroups(all);
  };
  const collapseAll = () => setExpandedGroups({});

  // Selection
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) newSet.delete(studentId);
      else newSet.add(studentId);
      return newSet;
    });
  };

  const clearSelection = () => setSelectedStudents(new Set());
  const selectGroupStudents = (groupId) => {
    const groupStudentIds = students.filter(s => s.group_id === groupId).map(s => s.id);
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      groupStudentIds.forEach(id => newSet.add(id));
      return newSet;
    });
  };

  // Bulk Assign Handler
  const handleBulkAssign = async () => {
    if (!bulkAssignGroupId || selectedStudents.size === 0) return;
    try {
      const response = await groupsAPI.transferStudents({
        student_ids: Array.from(selectedStudents),
        target_group_id: parseInt(bulkAssignGroupId)
      });
      const result = response.data;
      if (result.transferred_count > 0) {
        setSuccessMessage(`✅ ${result.transferred_count} ${t('bulk_assign_success')}`);
      }
      if (result.failed_ids?.length > 0) {
        setErrorMessage(`⚠️ ${result.failed_ids.length} ${t('bulk_assign_error')}`);
      }
      setShowBulkAssignModal(false);
      setBulkAssignGroupId('');
      setSelectedStudents(new Set());
      fetchData();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setErrorMessage(t('bulk_assign_error_generic'));
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  // Stats
  const activeStudents = useMemo(() => students.filter(s => s.status === 'active').length, [students]);
  const debtors = useMemo(() => students.filter(s => hasDebt(s)).length, [students, hasDebt]);

  // Export
  const handleExport = (type = 'excel') => {
    let dataToExport = [];
    let columns = {};
    let title = '';

    if (activeTab === 'medical') {
      title = t('medical_monitoring') || 'Medical Monitoring';
      const medicalStudents = students.filter(s => {
        // Permission check
        if (!displayGroups.some(g => g.id === s.group_id)) return false;
        // Group filter
        if (selectedGroup !== 'all' && s.group_id !== parseInt(selectedGroup)) return false;
        return true;
      });

      dataToExport = medicalStudents.map(s => {
        const group = groups.find(g => g.id === s.group_id);
        const getStatus = (dateStr) => {
          if (!dateStr) return 'Missing';
          const today = new Date();
          const expiry = new Date(dateStr);
          const diffTime = expiry - today;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays < 0) return 'Expired';
          if (diffDays < 30) return 'Expiring Soon';
          return 'Valid';
        };
        
        return {
          student: `${s.last_name} ${s.first_name}`,
          group: group?.name || '-',
          expiry_date: s.medical_certificate_expires ? new Date(s.medical_certificate_expires).toLocaleDateString() : '-',
          status: getStatus(s.medical_certificate_expires)
        };
      });

      columns = {
        student: t('student') || 'Student',
        group: t('group') || 'Group',
        expiry_date: t('expiry_date') || 'Expiry Date',
        status: t('status') || 'Status'
      };
    } else {
      // Default List Export
      title = t('students_list') || 'Students List';
      dataToExport = filteredStudents.map(s => {
        const group = groups.find(g => g.id === s.group_id);
        const parent = getParentInfo(s)[0] || {};
        
        return {
          first_name: getLocalizedName(s.first_name, s.last_name, language),
          group: transliterate(group?.name, language) || 'No Group',
          dob: s.dob ? new Date(s.dob).toLocaleDateString() : '',
          age: calculateAge(s.dob),
          status: s.status,
          balance: s.monthly_balance || 0,
          is_debtor: hasDebt(s) ? (t('yes') || 'Yes') : (t('no') || 'No'),
          parent_name: transliterate(parent.full_name, language) || '',
          parent_phone: parent.phone || ''
        };
      });

      columns = {
        first_name: t('full_name') || 'Full Name',
        group: t('group') || 'Group',
        dob: t('dob') || 'Date of Birth',
        age: t('age') || 'Age',
        status: t('status') || 'Status',
        balance: t('balance') || 'Balance',
        is_debtor: t('debtor') || 'Debtor',
        parent_name: t('parent') || 'Parent',
        parent_phone: t('phone') || 'Phone'
      };
    }

    const filename = `Students_${activeTab}_${getDateString()}`;

    if (type === 'excel') {
      exportToExcel(dataToExport, columns, filename);
    } else {
      exportToPDF(dataToExport, columns, filename, title);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-brand-yellow animate-spin" />
          <span className="text-white/60 text-lg">{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-2 md:p-6 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div className="w-full min-w-0">
            <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-3">
              <Users className="text-yellow-400 w-8 h-8 md:w-10 md:h-10" />
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                {isCoach ? (t('coach_my_students') || 'Мои ученики') : (t('students_title') || 'Ученики')}
              </span>
            </h1>
            <p className="text-gray-500 mt-1 md:mt-2 text-sm md:text-base">
              {t('total_students')}: {totalStudentsCount}
            </p>
            <div className="sticky top-0 z-30 flex items-center gap-2 mt-6 overflow-x-auto w-full pb-2 flex-nowrap pr-4 no-scrollbar bg-[#13161F]/95 backdrop-blur-sm py-2">
            <button
              onClick={() => setActiveTab('list')}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 border
                ${activeTab === 'list' 
                  ? 'bg-brand-yellow/10 text-brand-yellow border-brand-yellow' 
                  : 'bg-brand-gray/10 text-gray-400 border-brand-gray/20 hover:text-white hover:bg-brand-gray/20'}
              `}
            >
              <Users size={16} />
              {t('all_students')}
            </button>
            <button
              onClick={() => setActiveTab('medical')}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 border
                ${activeTab === 'medical' 
                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/50' 
                  : 'bg-brand-gray/10 text-gray-400 border-brand-gray/20 hover:text-white hover:bg-brand-gray/20'}
              `}
            >
              <FileText size={16} />
              {t('medical_monitoring')}
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 border
                ${activeTab === 'analytics' 
                  ? 'bg-brand-yellow/10 text-brand-yellow border-brand-yellow' 
                  : 'bg-brand-gray/10 text-gray-400 border-brand-gray/20 hover:text-white hover:bg-brand-gray/20'}
              `}
            >
              <BarChart2 size={16} />
              {t('nav_analytics') || 'Analytics'}
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {(successMessage || errorMessage) && (
        <div className={`
          relative z-10 mb-6 p-4 rounded-xl backdrop-blur-md border animate-in slide-in-from-top-2
          ${successMessage ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}
        `}>
          <div className="flex items-center gap-3">
            {successMessage ? <CheckCircle2 className="text-emerald-500" /> : <AlertCircle className="text-red-500" />}
            <span className={successMessage ? 'text-emerald-400' : 'text-red-400'}>
              {successMessage || errorMessage}
            </span>
          </div>
        </div>
      )}

      {/* Common Search Bar - Only show in list view */}
      {activeTab === 'list' && (
        <div className="relative z-10 mb-8 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-14 pl-14 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all text-lg"
            />
            <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 text-white/40 w-6 h-6" />
          </div>
          
          <div className="flex gap-4 overflow-x-auto pb-2 w-full md:w-auto">
            {/* View Mode Toggle */}
            <div className="bg-white/5 p-1 rounded-2xl border border-white/10 flex flex-shrink-0">
              <button
                onClick={() => handleExport('excel')}
                className="px-3 py-2 rounded-xl text-sm font-medium text-green-400 hover:bg-white/10 transition-all flex items-center gap-2"
                title={t('export_excel') || 'Export Excel'}
              >
                <FileText size={18} />
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="px-3 py-2 rounded-xl text-sm font-medium text-red-400 hover:bg-white/10 transition-all flex items-center gap-2"
                title={t('export_pdf') || 'Export PDF'}
              >
                <FileText size={18} />
              </button>
              
              <div className="w-px bg-white/10 mx-1 my-2"></div>
              
              <button
                onClick={() => setViewMode('groups')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${viewMode === 'groups' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
              >
                {t('view_groups') || 'Группы'}
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white'}`}
              >
                {t('view_list') || 'Список'}
              </button>
            </div>

            {/* Group Filter */}
            <div className="relative min-w-[200px] flex-shrink-0">
              <Users className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/40 w-5 h-5 pointer-events-none" />
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white appearance-none focus:outline-none focus:border-yellow-500/50 cursor-pointer"
              >
                <option value="all">{t('all_groups') || 'Все группы'}</option>
                {displayGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/40 w-5 h-5 pointer-events-none" />
            </div>

            {/* Filter Dropdown */}
            <div className="relative min-w-[200px]">
              <Filter className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/40 w-5 h-5 pointer-events-none" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full h-14 pl-12 pr-4 bg-white/5 border border-white/10 rounded-2xl text-white appearance-none focus:outline-none focus:border-yellow-500/50 cursor-pointer"
              >
                <option value="all">{t('filter_all') || 'Все студенты'}</option>
                <option value="active">{t('filter_active') || 'Активные'}</option>
                <option value="frozen">{t('filter_frozen') || 'Замороженные'}</option>
                <option value="debtors">{t('filter_debtors') || 'Должники'}</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/40 w-5 h-5 pointer-events-none" />
            </div>
          </div>
        </div>
      )}

      {/* Content based on Tab */}
      {activeTab === 'medical' ? (
        <MedicalMonitoring 
          students={students.filter(s => displayGroups.some(g => g.id === s.group_id))} 
          groups={displayGroups}
          onStudentClick={setSelectedStudentForCard} 
          t={t}
          baseUrl={BASE_URL}
          selectedGroup={selectedGroup}
          onGroupChange={setSelectedGroup}
          onExport={handleExport}
          isExporting={false} // Unused
          onRefresh={fetchData}
        />
      ) : activeTab === 'analytics' ? (
        isAdmin ? (
          // Full Analytics for super_admin/admin/owner
          <div className="space-y-6">
            {/* Analytics Header with Controls */}
            <div className="flex flex-col md:flex-row flex-wrap gap-4 items-start md:items-center mb-6 bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-white/50 text-sm">Год:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="bg-[#1C1E24] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-500 transition-colors cursor-pointer"
                >
                  {Array.from({ length: 51 }, (_, i) => (new Date().getFullYear() - 20) + i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-white/50 text-sm">Месяц:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-[#1C1E24] border border-white/10 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-500 transition-colors cursor-pointer"
                >
                  {months.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Analytics Tabs */}
            <div className="bg-white/5 border border-white/10 p-1 flex rounded-xl overflow-x-auto mb-6">
              {[
                { id: 'comparison', label: 'Сравнение', icon: <TrendingUp className="w-4 h-4" /> },
                { id: 'overview', label: 'Обзор', icon: <Activity className="w-4 h-4" /> },
                { id: 'coaches', label: 'Тренеры', icon: <Trophy className="w-4 h-4" /> },
                { id: 'attendance', label: 'Посещаемость', icon: <Users className="w-4 h-4" /> },
                { id: 'financial', label: 'Финансы', icon: <DollarSign className="w-4 h-4" /> },
                { id: 'top_players', label: 'Топ Игроков', icon: <Trophy className="w-4 h-4" /> },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setAnalyticsActiveTab(tab.id)}
                  className={`px-4 py-3 flex items-center gap-2 font-medium transition-all rounded-lg whitespace-nowrap ${
                    analyticsActiveTab === tab.id
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Analytics Content */}
            {analyticsLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
              </div>
            ) : (
              <div className="space-y-6">
                {analyticsActiveTab === 'comparison' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-blue-500/20 rounded-lg">
                          <Activity className="w-6 h-6 text-blue-400" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-white">{events.filter(e => e.type?.toLowerCase() === 'training').length}</div>
                      <div className="text-white/60 text-sm">Тренировок</div>
                    </div>
                    
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-green-500/20 rounded-lg">
                          <Trophy className="w-6 h-6 text-green-400" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-white">{events.filter(e => e.type?.toLowerCase() === 'match' || e.type?.toLowerCase() === 'game').length}</div>
                      <div className="text-white/60 text-sm">Матчей</div>
                    </div>
                    
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-purple-500/20 rounded-lg">
                          <Users className="w-6 h-6 text-purple-400" />
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-white">{students.filter(s => s.status === 'active').length}</div>
                      <div className="text-white/60 text-sm">Активных учеников</div>
                    </div>
                    
                    {!isCoach && (
                      <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-4">
                          <div className="p-3 bg-yellow-500/20 rounded-lg">
                            <DollarSign className="w-6 h-6 text-yellow-400" />
                          </div>
                        </div>
                        <div className="text-2xl font-bold text-white">
                          {payments.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString()} MDL
                        </div>
                        <div className="text-white/60 text-sm">Доход за период</div>
                      </div>
                    )}
                  </div>
                )}

                {analyticsActiveTab === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <h3 className="text-lg font-semibold text-white mb-4">Общая статистика</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-white/60">Всего учеников:</span>
                          <span className="text-white font-semibold">{students.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Активных:</span>
                          <span className="text-green-400 font-semibold">{students.filter(s => s.status === 'active').length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Должников:</span>
                          <span className="text-red-400 font-semibold">{students.filter(s => s.is_debtor).length}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <h3 className="text-lg font-semibold text-white mb-4">Группы</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-white/60">Всего групп:</span>
                          <span className="text-white font-semibold">{groups.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">С тренерами:</span>
                          <span className="text-blue-400 font-semibold">{groups.filter(g => g.coach_id).length}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <h3 className="text-lg font-semibold text-white mb-4">Мероприятия</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-white/60">Тренировок:</span>
                          <span className="text-blue-400 font-semibold">{events.filter(e => e.type?.toLowerCase() === 'training').length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Матчей:</span>
                          <span className="text-green-400 font-semibold">{events.filter(e => e.type?.toLowerCase() === 'match' || e.type?.toLowerCase() === 'game').length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/60">Турниров:</span>
                          <span className="text-purple-400 font-semibold">{events.filter(e => e.type?.toLowerCase() === 'tournament').length}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {analyticsActiveTab === 'coaches' && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-6 py-4 text-left text-white/60 font-medium">Тренер</th>
                          <th className="px-6 py-4 text-left text-white/60 font-medium">Группа</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Тренировок</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Эффективность</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coachReport.map((coach, index) => (
                          <tr key={index} className="border-t border-white/10">
                            <td className="px-6 py-4 text-white">{coach.coach_name}</td>
                            <td className="px-6 py-4 text-white/60">{coach.group_name || '-'}</td>
                            <td className="px-6 py-4 text-center text-white">{coach.trainings_count}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                coach.efficiency >= 80 ? 'bg-green-500/20 text-green-400' :
                                coach.efficiency >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {coach.efficiency}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {analyticsActiveTab === 'attendance' && attendanceReport && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-purple-400">{attendanceReport.attendance_rate}%</div>
                          <div className="text-white/60 text-sm">Общая посещаемость</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-400">{attendanceReport.total_records}</div>
                          <div className="text-white/60 text-sm">Всего записей</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-blue-400">{attendanceReport.by_groups.length}</div>
                          <div className="text-white/60 text-sm">Групп</div>
                        </div>
                      </div>
                    </div>
                    <table className="w-full">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-6 py-4 text-left text-white/60 font-medium">Группа</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Посещаемость</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Присутствовало</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Отсутствовало</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Всего</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceReport.by_groups.map((group, index) => (
                          <tr key={index} className="border-t border-white/10">
                            <td className="px-6 py-4 text-white">{group.group_name}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                group.rate >= 80 ? 'bg-green-500/20 text-green-400' :
                                group.rate >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {group.rate}%
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center text-green-400">{group.present}</td>
                            <td className="px-6 py-4 text-center text-red-400">{group.total - group.present}</td>
                            <td className="px-6 py-4 text-center text-white">{group.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {analyticsActiveTab === 'financial' && financialReport && !isCoach && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/10">
                      <h3 className="text-lg font-semibold text-white mb-4">Финансовый отчет</h3>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-green-400">
                            {financialReport.data.reduce((sum, d) => sum + (d.revenue || 0), 0).toLocaleString()} MDL
                          </div>
                          <div className="text-white/60 text-sm">Общий доход</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-red-400">
                            {financialReport.data.reduce((sum, d) => sum + (d.salary || 0), 0).toLocaleString()} MDL
                          </div>
                          <div className="text-white/60 text-sm">Зарплаты</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-red-400">
                            {financialReport.data.reduce((sum, d) => sum + (d.expense || 0), 0).toLocaleString()} MDL
                          </div>
                          <div className="text-white/60 text-sm">Расходы</div>
                        </div>
                        <div className="text-center">
                          <div className="text-3xl font-bold text-yellow-400">
                            {financialReport.data.reduce((sum, d) => sum + (d.net_profit || 0), 0).toLocaleString()} MDL
                          </div>
                          <div className="text-white/60 text-sm">Чистая прибыль</div>
                        </div>
                      </div>
                    </div>
                    <table className="w-full">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-6 py-4 text-left text-white/60 font-medium">Период</th>
                          <th className="px-6 py-4 text-right text-white/60 font-medium">Доход</th>
                          <th className="px-6 py-4 text-right text-white/60 font-medium">Зарплаты</th>
                          <th className="px-6 py-4 text-right text-white/60 font-medium">Расходы</th>
                          <th className="px-6 py-4 text-right text-white/60 font-medium">Прибыль</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financialReport.data.map((period, index) => (
                          <tr key={index} className="border-t border-white/10">
                            <td className="px-6 py-4 text-white">{period.period}</td>
                            <td className="px-6 py-4 text-right text-green-400">{period.revenue.toLocaleString()} MDL</td>
                            <td className="px-6 py-4 text-right text-red-400">{(period.salary || 0).toLocaleString()} MDL</td>
                            <td className="px-6 py-4 text-right text-red-400">{(period.expense || 0).toLocaleString()} MDL</td>
                            <td className="px-6 py-4 text-right text-yellow-400">{(period.net_profit || 0).toLocaleString()} MDL</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {analyticsActiveTab === 'top_players' && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">#</th>
                          <th className="px-6 py-4 text-left text-white/60 font-medium">Ученик</th>
                          <th className="px-6 py-4 text-left text-white/60 font-medium">Группа</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Баллы</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Навыки</th>
                          <th className="px-6 py-4 text-center text-white/60 font-medium">Дисциплина</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topPlayers.slice(0, 50).map((player, index) => (
                          <tr key={index} className="border-t border-white/10">
                            <td className="px-6 py-4 text-center text-white font-semibold">{index + 1}</td>
                            <td className="px-6 py-4 text-white">{player.student_name}</td>
                            <td className="px-6 py-4 text-white/60">{player.group_name || '-'}</td>
                            <td className="px-6 py-4 text-center text-yellow-400 font-semibold">{player.total_points}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-1 rounded text-sm ${
                                player.skills_rating >= 4 ? 'bg-green-500/20 text-green-400' :
                                player.skills_rating >= 3 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {player.skills_rating}/5
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-2 py-1 rounded text-sm ${
                                player.discipline_rating >= 4 ? 'bg-green-500/20 text-green-400' :
                                player.discipline_rating >= 3 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {player.discipline_rating}/5
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // Basic analytics for non-admin users
          <GroupAnalytics 
            groups={groups} 
            groupId={selectedGroup !== 'all' ? parseInt(selectedGroup) : null}
            t={t} 
          />
        )
      ) : (
        <>
          {/* Quick Stats (List View Only) */}
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden group hover:border-white/20 transition-all">
              <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-white/40 text-sm mb-1 z-10">{t('total_students_stat')}</span>
              <div className="flex items-baseline gap-2 z-10">
                <span className="text-3xl font-bold text-white">{totalStudentsCount}</span>
                <span className="text-emerald-400 text-sm">({activeStudents} {t('active_count')})</span>
              </div>
            </div>
            
            {!isCoach && (
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 rounded-2xl p-4 flex flex-col justify-center relative overflow-hidden group hover:border-white/20 transition-all">
               <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-white/40 text-sm mb-1 z-10">{t('debtors_stat')}</span>
              <div className="flex items-baseline gap-2 z-10">
                <span className="text-3xl font-bold text-red-400">{debtors}</span>
                <span className="text-white/30 text-sm">{t('students_lower')}</span>
              </div>
            </div>
            )}
          </div>

      {/* Bulk Actions */}
      {isAdmin && selectedStudents.size > 0 && (
        <div className="relative z-20 mb-6 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-center justify-between backdrop-blur-md animate-in slide-in-from-top-2">
          <div className="flex items-center gap-4">
            <span className="text-yellow-500 font-semibold flex items-center gap-2">
              <CheckCircle2 size={20} />
              {t('bulk_selected')}: {selectedStudents.size}
            </span>
            <button onClick={clearSelection} className="text-white/50 hover:text-white text-sm underline">
              {t('reset_selection')}
            </button>
          </div>
          <button
            onClick={() => setShowBulkAssignModal(true)}
            className="px-6 py-2.5 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 shadow-lg shadow-yellow-500/20 transition-all transform hover:scale-105"
          >
            {t('bulk_assign')}
          </button>
        </div>
      )}

      {/* Groups List or Flat List */}
      <div className="relative z-10 space-y-6">
        {viewMode === 'list' ? (
          /* FLAT LIST VIEW */
          <div className="bg-[#13161F] border border-white/5 rounded-3xl overflow-hidden shadow-xl">
             <div className="bg-white/5 px-4 md:px-8 py-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center gap-3">
                  {t('all_students_list') || 'Список всех студентов'}
                  <span className="text-white/40 text-sm font-normal">({filteredStudents.length})</span>
                </h2>
                {isAdmin && (
                  <button
                    onClick={() => {
                      const ids = new Set(filteredStudents.map(s => s.id));
                      setSelectedStudents(ids);
                    }}
                    className="text-sm text-yellow-500 hover:text-yellow-400"
                  >
                    {t('select_all_visible') || 'Выбрать всех'}
                  </button>
                )}
             </div>
             <div>
                {filteredStudents.length > 0 ? (
                  filteredStudents.map(student => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      isAdmin={isAdmin}
                      isCoach={isCoach}
                      isSelected={selectedStudents.has(student.id)}
                      toggleSelection={toggleStudentSelection}
                      onCardClick={setSelectedStudentForCard}
                      hasDebt={hasDebt}
                      calculateAge={calculateAge}
                      getParentInfo={getParentInfo}
                      t={t}
                      language={language}
                      group={groups.find(g => g.id === student.group_id)}
                    />
                  ))
                ) : (
                  <div className="py-20 text-center">
                    <p className="text-white/30">{t('no_students_found') || 'Студенты не найдены'}</p>
                  </div>
                )}
             </div>
          </div>
        ) : (
          /* GROUP VIEW (Existing) */
          <>
            <div className="flex justify-end gap-4 mb-2">
              <button onClick={expandAll} className="text-sm text-white/40 hover:text-yellow-400 transition-colors">{t('expand_all')}</button>
              <button onClick={collapseAll} className="text-sm text-white/40 hover:text-white transition-colors">{t('collapse_all')}</button>
            </div>

            {displayGroups.map(group => {
              const groupStudents = getFilteredStudentsByGroup(group.id);
              if ((searchQuery || filterStatus !== 'all' || selectedGroup !== 'all') && groupStudents.length === 0) return null;
              
              const isExpanded = expandedGroups[group.id];
              const groupDebtors = groupStudents.filter(s => hasDebt(s)).length;

              return (
                <div key={group.id} className="bg-[#13161F] border border-white/5 rounded-3xl overflow-hidden shadow-xl">
                  {/* Group Header */}
                  <div 
                    onClick={() => toggleGroup(group.id)}
                    className="
                      flex items-center justify-between px-4 md:px-8 py-5 cursor-pointer select-none
                      bg-gradient-to-r from-white/[0.03] to-transparent hover:from-white/[0.05] 
                      border-b border-white/5 transition-all
                    "
                  >
                    <div className="flex items-center gap-5">
                      <div className={`
                        w-12 h-12 rounded-2xl flex items-center justify-center text-xl
                        transition-all duration-300
                        ${isExpanded ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'bg-white/5 text-white/50'}
                      `}>
                        {isExpanded ? <Users size={24} /> : <Users size={24} />}
                      </div>
                      
                      <div>
                        <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-3">
                          {transliterate(group.name, language)}
                          {groupDebtors > 0 && (
                            <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-full font-medium">
                              {groupDebtors} {t('debtors_short')}
                            </span>
                          )}
                        </h2>
                        <div className="flex items-center gap-3 text-sm text-white/40">
                          <span>{groupStudents.length} {t('students_lower')}</span>
                          {group.coach && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-white/20" />
                              <span>{t('coach')}: {transliterate(group.coach.full_name, language)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            selectGroupStudents(group.id);
                          }}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-sm transition-colors"
                        >
                          {t('select_all')}
                        </button>
                      )}
                      <div className={`transform transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown className="text-white/30" />
                      </div>
                    </div>
                  </div>

                  {/* Students List */}
                  {isExpanded && (
                    <div className="bg-black/20">
                      {groupStudents.length > 0 ? (
                        groupStudents.map(student => (
                          <StudentRow
                            key={student.id}
                            student={student}
                            isAdmin={isAdmin}
                            isCoach={isCoach}
                            isSelected={selectedStudents.has(student.id)}
                            toggleSelection={toggleStudentSelection}
                            onCardClick={setSelectedStudentForCard}
                            hasDebt={hasDebt}
                            calculateAge={calculateAge}
                            getParentInfo={getParentInfo}
                            t={t}
                            language={language}
                            group={groups.find(g => g.id === student.group_id)}
                          />
                        ))
                      ) : (
                        <div className="py-12 text-center">
                          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Users className="text-white/20 w-8 h-8" />
                          </div>
                          <p className="text-white/30">{t('no_students_in_group')}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {viewMode === 'groups' && displayGroups.length === 0 && (
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="text-white/20 w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{t('groups_not_found')}</h3>
            <p className="text-white/40">{t('try_changing_search')}</p>
          </div>
        )}
      </div>
      </>
      )}

      {/* PlayerCard Modal */}
      {selectedStudentForCard !== null && (
        <PlayerCard 
          studentId={selectedStudentForCard} 
          onClose={() => {
            setSelectedStudentForCard(null);
            fetchData();
          }} 
        />
      )}

      {/* Bulk Assign Modal */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-[#1A1D24] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-8 pb-0 overflow-y-auto">
              <h2 className="text-2xl font-bold text-white mb-6">{t('bulk_assign_modal_title')}</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium text-white/60 mb-2">{t('bulk_assign_modal_desc')}</label>
                <select
                  value={bulkAssignGroupId}
                  onChange={(e) => setBulkAssignGroupId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-yellow-500 focus:outline-none"
                >
                  <option value="">-- {t('select_group_placeholder')} --</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-8 pt-6 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setShowBulkAssignModal(false)}
                className="px-6 py-3 text-white/60 hover:text-white transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleBulkAssign}
                disabled={!bulkAssignGroupId}
                className="px-6 py-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {t('assign_action')} ({selectedStudents.size})
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
