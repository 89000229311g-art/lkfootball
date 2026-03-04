import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { historyAPI, loggingAPI, adminAPI, settingsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import SystemHealthMonitor from '../components/SystemHealthMonitor';
import UserActivityStats from '../components/UserActivityStats';

const ACTION_COLORS = {
  create: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  update: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  delete: 'bg-red-500/20 text-red-400 border-red-500/30',
  restore: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  permanent_delete: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const ACTION_ICONS = {
  create: '➕',
  update: '✏️',
  delete: '🗑️',
  restore: '♻️',
  permanent_delete: '💀',
};

export default function History() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState('timeline');
  const [loading, setLoading] = useState(true);
  
  // Calendar state
  const [viewDate, setViewDate] = useState(new Date());
  const [calendarChanges, setCalendarChanges] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [dateChanges, setDateChanges] = useState([]);
  
  // Timeline state
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [error, setError] = useState(null);
  const [systemStats, setSystemStats] = useState(null);
  // Cleanup settings state
  const [cleanupSettings, setCleanupSettings] = useState({
    notification_retention_days: '180',
    log_rotate_threshold_mb: '10',
    log_lines_to_keep: '2000',
    enable_weekly_trash: true,
    wl_schedule_template: true,
    wl_trial_session: true,
    // Schedule
    schedule_hour: '2',
    schedule_minute: '0',
    schedule_days_of_week: '*',
    // Alerts
    alerts_enabled: true,
    alerts_check_interval_minutes: '10',
    alerts_cpu_threshold: '85',
    alerts_ram_threshold: '85',
    alerts_process_rss_mb: '1024',
    alerts_cooldown_minutes: '60',
    // Uploads
    uploads_enable_media_cleanup: true,
    uploads_max_size_mb: '2048',
    uploads_tmp_days: '90',
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [filters, setFilters] = useState({
    entity_type: '',
    action: '',
    search: '',
  });
  
  // Trash state
  const [trash, setTrash] = useState({});
  const [trashTotal, setTrashTotal] = useState(0);
  
  // Toast
  const [toast, setToast] = useState({ show: false, type: '', message: '' });
  
  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: '', message: '' }), 4000);
  };

  const ENTITY_LABELS = useMemo(() => ({
    group: t('entity_group'),
    student: t('entity_student'),
    user: t('entity_user'),
    payment: t('entity_payment'),
    event: t('entity_event'),
    schedule_template: t('entity_schedule_template'),
    attendance: t('entity_attendance'),
    employee_contract: t('entity_employee_contract'),
    salary_payment: t('entity_salary_payment'),
    message: t('entity_message'),
    expense: t('entity_expense'),
    expense_category: t('entity_expense_category'),
    trial_session: t('entity_trial_session'),
    coach: t('entity_coach'),
  }), [t]);

  const ACTION_LABELS = useMemo(() => ({
    create: t('action_create'),
    update: t('action_update'),
    delete: t('action_delete'),
    restore: t('action_restore'),
    permanent_delete: t('action_permanent_delete'),
  }), [t]);

  const TABS = useMemo(() => {
    const tabs = [
      { id: 'calendar', label: t('tab_calendar'), icon: '📅' },
      { id: 'timeline', label: t('tab_timeline'), icon: '📜' },
      { id: 'trash', label: t('tab_trash'), icon: '🗑️' },
    ];
    
    if (['super_admin', 'owner'].includes(user?.role?.toLowerCase())) {
        tabs.push({ id: 'visits', label: t('tab_visits') || 'Посещения', icon: '📊' });
        tabs.push({ id: 'optimization', label: t('tab_optimization') || 'Оптимизация', icon: '🚀' });
    }
    
    return tabs;
  }, [t, user]);

  const DAY_NAMES = useMemo(() => [
    t('mon'), t('tue'), t('wed'), t('thu'), t('fri'), t('sat'), t('sun')
  ], [t]);

  // Fetch cleanup settings
  useEffect(() => {
    const fetchCleanupSettings = async () => {
      try {
        const res = await settingsAPI.getAll('cleanup');
        const list = res.data || res || []; // some api methods return .data, some return raw
        const map = {};
        (list || []).forEach(s => { map[s.key] = s.value; });
        setCleanupSettings(cs => ({
          ...cs,
          notification_retention_days: map['cleanup.notification_retention_days'] || cs.notification_retention_days,
          log_rotate_threshold_mb: map['cleanup.log_rotate_threshold_mb'] || cs.log_rotate_threshold_mb,
          log_lines_to_keep: map['cleanup.log_lines_to_keep'] || cs.log_lines_to_keep,
          enable_weekly_trash: (map['cleanup.enable_weekly_trash'] || 'true').toString().toLowerCase() === 'true',
          wl_schedule_template: (map['cleanup.trash_whitelist.schedule_template'] || 'true').toString().toLowerCase() === 'true',
          wl_trial_session: (map['cleanup.trash_whitelist.trial_session'] || 'true').toString().toLowerCase() === 'true',
          schedule_hour: map['cleanup.schedule.hour'] || cs.schedule_hour,
          schedule_minute: map['cleanup.schedule.minute'] || cs.schedule_minute,
          schedule_days_of_week: map['cleanup.schedule.days_of_week'] || cs.schedule_days_of_week,
          alerts_enabled: (map['cleanup.alerts.enabled'] || 'true').toString().toLowerCase() === 'true',
          alerts_check_interval_minutes: map['cleanup.alerts.check_interval_minutes'] || cs.alerts_check_interval_minutes,
          alerts_cpu_threshold: map['cleanup.alerts.cpu_percent_threshold'] || cs.alerts_cpu_threshold,
          alerts_ram_threshold: map['cleanup.alerts.ram_percent_threshold'] || cs.alerts_ram_threshold,
          alerts_process_rss_mb: map['cleanup.alerts.process_rss_mb_threshold'] || cs.alerts_process_rss_mb,
          alerts_cooldown_minutes: map['cleanup.alerts.cooldown_minutes'] || cs.alerts_cooldown_minutes,
          uploads_enable_media_cleanup: (map['cleanup.uploads.enable_media_cleanup'] || 'true').toString().toLowerCase() === 'true',
          uploads_max_size_mb: map['cleanup.uploads.max_size_mb'] || cs.uploads_max_size_mb,
          uploads_tmp_days: map['cleanup.uploads.tmp_days'] || cs.uploads_tmp_days,
        }));
      } catch (e) {
        // Silent fail; settings may be empty initially
      }
    };
    fetchCleanupSettings();
  }, []);

  const saveCleanupSettings = async () => {
    try {
      setSavingSettings(true);
      const updates = [
        { key: 'cleanup.notification_retention_days', value: String(cleanupSettings.notification_retention_days), description: 'Retention for system/announcement messages (days)', group: 'cleanup' },
        { key: 'cleanup.log_rotate_threshold_mb', value: String(cleanupSettings.log_rotate_threshold_mb), description: 'Rotate logs above this size (MB)', group: 'cleanup' },
        { key: 'cleanup.log_lines_to_keep', value: String(cleanupSettings.log_lines_to_keep), description: 'Lines to keep when rotating logs', group: 'cleanup' },
        { key: 'cleanup.enable_weekly_trash', value: cleanupSettings.enable_weekly_trash ? 'true' : 'false', description: 'Enable weekly trash cleanup', group: 'cleanup' },
        { key: 'cleanup.trash_whitelist.schedule_template', value: cleanupSettings.wl_schedule_template ? 'true' : 'false', description: 'Include schedule templates in weekly cleanup', group: 'cleanup' },
        { key: 'cleanup.trash_whitelist.trial_session', value: cleanupSettings.wl_trial_session ? 'true' : 'false', description: 'Include trial sessions in weekly cleanup', group: 'cleanup' },
        // Schedule
        { key: 'cleanup.schedule.hour', value: String(cleanupSettings.schedule_hour), description: 'Daily cleanup hour (0-23)', group: 'cleanup' },
        { key: 'cleanup.schedule.minute', value: String(cleanupSettings.schedule_minute), description: 'Daily cleanup minute (0-59)', group: 'cleanup' },
        { key: 'cleanup.schedule.days_of_week', value: String(cleanupSettings.schedule_days_of_week || '*'), description: 'Days of week for cleanup (e.g., mon-fri or *)', group: 'cleanup' },
        // Alerts
        { key: 'cleanup.alerts.enabled', value: cleanupSettings.alerts_enabled ? 'true' : 'false', description: 'Enable resource alerts', group: 'cleanup' },
        { key: 'cleanup.alerts.check_interval_minutes', value: String(cleanupSettings.alerts_check_interval_minutes), description: 'Alerts check interval (minutes)', group: 'cleanup' },
        { key: 'cleanup.alerts.cpu_percent_threshold', value: String(cleanupSettings.alerts_cpu_threshold), description: 'CPU alert threshold (%)', group: 'cleanup' },
        { key: 'cleanup.alerts.ram_percent_threshold', value: String(cleanupSettings.alerts_ram_threshold), description: 'RAM alert threshold (%)', group: 'cleanup' },
        { key: 'cleanup.alerts.process_rss_mb_threshold', value: String(cleanupSettings.alerts_process_rss_mb), description: 'Process RSS alert threshold (MB)', group: 'cleanup' },
        { key: 'cleanup.alerts.cooldown_minutes', value: String(cleanupSettings.alerts_cooldown_minutes), description: 'Alerts cooldown minutes', group: 'cleanup' },
        // Uploads
        { key: 'cleanup.uploads.enable_media_cleanup', value: cleanupSettings.uploads_enable_media_cleanup ? 'true' : 'false', description: 'Enable uploads/media cleanup', group: 'cleanup' },
        { key: 'cleanup.uploads.max_size_mb', value: String(cleanupSettings.uploads_max_size_mb), description: 'Max size for uploads/media (MB)', group: 'cleanup' },
        { key: 'cleanup.uploads.tmp_days', value: String(cleanupSettings.uploads_tmp_days), description: 'Delete media older than N days', group: 'cleanup' },
      ];
      for (const u of updates) {
        await settingsAPI.update(u.key, { value: u.value, description: u.description, group: u.group });
      }
      showToast('success', 'Настройки сохранены');
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Ошибка сохранения настроек');
    } finally {
      setSavingSettings(false);
    }
  };

  // Group history items by mass action
  const groupedHistory = useMemo(() => {
    const grouped = [];
    let currentGroup = null;

    // Filter out invalid items to prevent crashes
    const validHistory = Array.isArray(history) ? history.filter(item => item && typeof item === 'object') : [];

    validHistory.forEach(item => {
      // Check for mass schedule clearing
      if (item.reason === "Массовая очистка расписания") {
        if (currentGroup && 
            currentGroup.type === 'mass_clear' && 
            Math.abs(new Date(item.created_at) - new Date(currentGroup.items[0].created_at)) < 60000 // 1 minute window
        ) {
          currentGroup.items.push(item);
        } else {
          if (currentGroup) grouped.push(currentGroup);
          currentGroup = {
            type: 'mass_clear',
            id: `group-${item.id}`,
            items: [item],
            created_at: item.created_at,
            reason: item.reason,
            user_name: item.user_name
          };
        }
      } else {
        if (currentGroup) {
          grouped.push(currentGroup);
          currentGroup = null;
        }
        grouped.push(item);
      }
    });
    
    if (currentGroup) grouped.push(currentGroup);
    return grouped;
  }, [history]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'calendar') {
        const res = await historyAPI.getCalendar(viewDate.getFullYear(), viewDate.getMonth() + 1);
        setCalendarChanges(res.changes || {});
      } else if (activeTab === 'timeline') {
        const params = { ...filters, limit: 100 };
        // Clean empty params
        Object.keys(params).forEach(key => {
            if (params[key] === '' || params[key] === null || params[key] === undefined) {
                delete params[key];
            }
        });
        
        const res = await historyAPI.getHistory(params);
        setHistory(Array.isArray(res?.items) ? res.items : []);
        setHistoryTotal(res?.total || 0);
      } else if (activeTab === 'trash') {
        const res = await historyAPI.getTrash();
        setTrash(res?.items || {});
        setTrashTotal(res?.total || 0);
      } else if (activeTab === 'optimization') {
          const res = await adminAPI.getSystemStats();
          setSystemStats(res);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error.message || 'Error fetching data');
      // Ensure state is at least empty to prevent crashes
      setHistory([]); 
      setTrash({});
    } finally {
      setLoading(false);
    }
  }, [activeTab, filters, viewDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDateClick = async (date) => {
    setSelectedDate(date);
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      const res = await historyAPI.getByDate(dateStr);
      setDateChanges(res.items || []);
    } catch (error) {
      console.error('Error fetching date changes:', error);
      setDateChanges([]);
    }
  };

  const handleRestore = async (auditId) => {
    if (!window.confirm(t('restore_template_confirm'))) return; // Using generic confirm or add new key
    try {
      const res = await historyAPI.restoreVersion(auditId);
      showToast('success', res.message || t('user_restored_success'));
      fetchData();
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error restoring history item',
        { page: 'History' },
        error?.response?.data?.detail || error.message || null
      );
    }
  };

  const handleBulkRestore = async (items) => {
    if (!window.confirm(`${t('restore')} ${items.length} ${t('items')}?`)) return;
    
    setLoading(true);
    try {
      // Execute sequentially to avoid overwhelming the server
      for (const item of items) {
        try {
          await historyAPI.restoreVersion(item.id);
        } catch (e) {
          console.error(`Failed to restore ${item.id}`, e);
        }
      }
      
      showToast('success', t('user_restored_success'));
      fetchData();
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error during bulk restore in History',
        { page: 'History' },
        error?.response?.data?.detail || error.message || null
      );
    } finally {
      setLoading(false);
    }
  };

  const [showCleanupModal, setShowCleanupModal] = useState(false);
  const [cleanupAction, setCleanupAction] = useState(null);
  const [selectedTrashTypes, setSelectedTrashTypes] = useState({});

  const handleSystemCleanup = async (action, label) => {
      if (action === 'empty_trash') {
          // Open selection modal
          const details = systemStats?.trash?.details || {};
          // Initialize selection with all true
          const initialSelection = {};
          Object.keys(details).forEach(key => initialSelection[key] = true);
          setSelectedTrashTypes(initialSelection);
          setCleanupAction({ action, label });
          setShowCleanupModal(true);
          return;
      }

      if (!window.confirm(`${t('confirm_cleanup_action')}: ${label}?`)) return;
      
      performCleanup(action);
  };

  const performCleanup = async (action, extraParams = {}) => {
      try {
          setLoading(true);
          // If trash with types
          let endpoint = `/admin/system/cleanup?action=${action}`;
          if (action === 'empty_trash' && extraParams.types) {
              endpoint += `&types=${extraParams.types.join(',')}`;
          }
          
          // Use client direct call for custom query params or update api/client.js
          // Since api/client.js has fixed signature, let's update it or use a direct call if needed.
          // Updating api/client.js is better.
          const res = await adminAPI.cleanupSystem(action, extraParams.types);
          
          showToast('success', res.message);
          // Refresh
          const stats = await adminAPI.getSystemStats();
          setSystemStats(stats);
          setShowCleanupModal(false);
      } catch (err) {
          showToast('error', err.response?.data?.detail || 'Error during cleanup');
      } finally {
          setLoading(false);
      }
  };

  const handleOptimizeNow = async () => {
    if (!window.confirm(`${t('confirm_cleanup_action')}: ${t('optimize_now') || 'Оптимизировать сейчас'}?`)) return;
    try {
      setLoading(true);
      const res1 = await adminAPI.cleanupSystem('clear_cache');
      const res2 = await adminAPI.cleanupSystem('gc_collect');
      const msg = `${res1?.message || ''} ${res2?.message || ''}`.trim();
      showToast('success', msg || (t('optimized_now_done') || 'Оптимизация выполнена'));
      const stats = await adminAPI.getSystemStats();
      setSystemStats(stats);
    } catch (err) {
      showToast('error', err.response?.data?.detail || 'Error during optimization');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreFromTrash = async (entityType, entityId) => {
    try {
      const res = await historyAPI.restoreFromTrash(entityType, entityId);
      showToast('success', res.message || t('user_restored_success'));
      fetchData();
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error restoring item from trash in History',
        { page: 'History' },
        error?.response?.data?.detail || error.message || null
      );
    }
  };

  const handleDeleteForever = async (entityType, entityId, name) => {
    if (!window.confirm(`${t('delete_forever')} "${name}"?`)) return;
    try {
      const res = await historyAPI.deleteForever(entityType, entityId);
      showToast('success', res.message || t('user_deleted_success'));
      fetchData();
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error deleting item forever in History',
        { page: 'History' },
        error?.response?.data?.detail || error.message || null
      );
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm(`${t('clear_trash')}?`)) return;
    
    setLoading(true);
    try {
      const allItems = [];
      Object.entries(trash).forEach(([type, items]) => {
        if (Array.isArray(items)) {
           items.forEach(item => allItems.push({ type, id: item.id }));
        }
      });

      for (const item of allItems) {
        try {
          await historyAPI.deleteForever(item.type, item.id);
        } catch (e) {
          console.error(`Failed to delete ${item.id}`, e);
        }
      }
      
      showToast('success', `${t('trash')} ${t('schedule_cleared')}`);
      fetchData();
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error emptying trash in History',
        { page: 'History' },
        error?.response?.data?.detail || error.message || null
      );
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = (delta) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setViewDate(newDate);
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    
    const days = [];
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const isAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
  const isSuperAdmin = ['super_admin', 'owner'].includes(user?.role?.toLowerCase());

  const locale = language === 'ro' ? 'ro-RO' : 'ru-RU';

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold text-white mb-2">{t('access_denied')}</h1>
          <p className="text-white/50">{t('access_denied_desc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-4 md:p-6">
      {/* Toast */}
      {toast.show && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in">
          <div className={`rounded-2xl p-4 shadow-xl backdrop-blur-sm border ${
            toast.type === 'success' 
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
              : 'bg-red-500/10 border-red-500/30 text-red-400'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-xl">{toast.type === 'success' ? '✅' : '❌'}</span>
              <span className="font-medium">{toast.message}</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-3">
            <span className="text-3xl md:text-4xl">🕐</span>
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
              {t('history_title')}
            </span>
          </h1>
          <p className="text-gray-500 mt-1 md:mt-2 text-sm md:text-base">{t('history_subtitle')}</p>
        </div>
        
        {trashTotal > 0 && (
          <div className="flex flex-wrap gap-2">
            {activeTab === 'trash' && isSuperAdmin && (
              <button
                onClick={handleEmptyTrash}
                className="px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all flex items-center gap-2"
              >
                💀 {t('clear_trash')}
              </button>
            )}
            <button
              onClick={() => setActiveTab('trash')}
              className="px-4 py-2.5 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 font-medium hover:bg-red-500/30 transition-all flex items-center gap-2"
            >
              <span>🗑️</span> {t('trash')} <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{trashTotal}</span>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
        <div className="flex gap-1 bg-white/5 rounded-xl p-1 overflow-x-auto no-scrollbar max-w-full">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'bg-yellow-500 text-black'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              {tab.id === 'trash' && trashTotal > 0 && (
                <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{trashTotal}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* Calendar View */}
          {activeTab === 'calendar' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Calendar */}
              <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="flex justify-between items-center p-4 bg-white/5 border-b border-white/10">
                  <button onClick={() => changeMonth(-1)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10">
                    ←
                  </button>
                  <h3 className="text-xl font-bold text-white capitalize">
                    {viewDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                  </h3>
                  <button onClick={() => changeMonth(1)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10">
                    →
                  </button>
                </div>

                <div className="p-4">
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {DAY_NAMES.map(d => (
                      <div key={d} className="text-center font-medium text-white/50 py-2 text-sm">{d}</div>
                    ))}
                  </div>
                  
                  <div className="grid grid-cols-7 gap-1">
                    {getDaysInMonth(viewDate).map((day, i) => {
                      if (!day) return <div key={i} className="p-2 min-h-[60px]"></div>;
                      
                      const count = calendarChanges[day] || 0;
                      const dateObj = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
                      const isSelected = selectedDate?.toDateString() === dateObj.toDateString();
                      const isToday = new Date().toDateString() === dateObj.toDateString();
                      
                      return (
                        <div
                          key={i}
                          onClick={() => handleDateClick(dateObj)}
                          className={`p-2 min-h-[60px] rounded-xl cursor-pointer transition-all border ${
                            isSelected
                              ? 'bg-yellow-500/20 border-yellow-500/50 ring-2 ring-yellow-500/30'
                              : isToday
                                ? 'bg-emerald-500/10 border-emerald-500/30'
                                : count > 0
                                  ? 'bg-white/5 border-white/10 hover:border-yellow-500/30'
                                  : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                          }`}
                        >
                          <div className={`text-sm font-medium ${isToday ? 'text-emerald-400' : isSelected ? 'text-yellow-400' : 'text-white/80'}`}>
                            {day}
                          </div>
                          {count > 0 && (
                            <div className="mt-1 text-xs bg-yellow-500/20 text-yellow-400 rounded px-1.5 py-0.5 text-center">
                              {count}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Day Details */}
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10 bg-white/5">
                  <h3 className="font-bold text-white capitalize">
                    {selectedDate 
                      ? selectedDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
                      : t('select_date')
                    }
                  </h3>
                </div>
                <div className="p-4 max-h-[500px] overflow-y-auto">
                  {!selectedDate ? (
                    <div className="text-center py-8 text-white/50">
                      <div className="text-4xl mb-2">👆</div>
                      {t('click_date_history')}
                    </div>
                  ) : dateChanges.length === 0 ? (
                    <div className="text-center py-8 text-white/50">
                      <div className="text-4xl mb-2">📭</div>
                      {t('no_changes_day')}
                    </div>
                  ) : (
                    <div className="space-y-3">
                        <button 
                            onClick={handleOptimizeNow}
                            className="w-full p-3 bg-brand-yellow/20 hover:bg-brand-yellow/30 border border-yellow-500/20 rounded-xl flex items-center justify-between group transition-colors"
                        >
                            <span className="text-yellow-400 font-bold">{t('optimize_now') || 'Оптимизировать сейчас'}</span>
                            <span className="text-xs text-yellow-400/70">{t('optimize_now_desc') || 'Очистить кэш + GC'}</span>
                        </button>
                      {dateChanges.map(item => (
                        <HistoryItem 
                          key={item.id} 
                          item={item} 
                          onRestore={handleRestore} 
                          labels={{ entity: ENTITY_LABELS, action: ACTION_LABELS, t }}
                          locale={locale}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Timeline View */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {/* Filters */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-wrap gap-4">
                <select
                  value={filters.entity_type}
                  onChange={(e) => setFilters({ ...filters, entity_type: e.target.value })}
                  className="px-4 py-2.5 bg-[#1C1E24] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                >
                  <option value="">{t('all')}</option>
                  {Object.entries(ENTITY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                
                <select
                  value={filters.action}
                  onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                  className="px-4 py-2.5 bg-[#1C1E24] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                >
                  <option value="">{t('all')}</option>
                  {Object.entries(ACTION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                
                <input
                  type="text"
                  placeholder={`🔍 ${t('search')}...`}
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="flex-1 min-w-[200px] px-4 py-2.5 bg-[#1C1E24] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50"
                />
                
                <div className="text-white/50 flex items-center">
                  {t('found')}: <span className="text-yellow-400 font-bold ml-1">{historyTotal}</span>
                </div>
              </div>

              {/* History List */}
              {error ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center">
                  <div className="text-3xl mb-2 text-red-400">⚠️</div>
                  <p className="text-red-400 font-bold mb-2">{t('error_loading_history') || 'Ошибка загрузки истории'}</p>
                  <p className="text-red-300/70 text-sm font-mono">{error}</p>
                  <button 
                    onClick={fetchData}
                    className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                  >
                    {t('retry') || 'Повторить'}
                  </button>
                </div>
              ) : history.length === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                  <div className="text-5xl mb-4 opacity-50">📜</div>
                  <p className="text-white/50 text-lg">{t('history_empty')}</p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
                  {groupedHistory.map(item => {
                    if (item.type === 'mass_clear') {
                      return (
                        <GroupedHistoryItem 
                          key={item.id} 
                          items={item.items} 
                          onBulkRestore={handleBulkRestore}
                          labels={{ entity: ENTITY_LABELS, action: ACTION_LABELS, t }}
                          locale={locale}
                        />
                      );
                    }
                    return (
                      <HistoryItem 
                        key={item.id} 
                        item={item} 
                        onRestore={handleRestore} 
                        showDate 
                        labels={{ entity: ENTITY_LABELS, action: ACTION_LABELS, t }}
                        locale={locale}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Visits View */}
          {activeTab === 'visits' && (
            <div className="bg-[#1C2127] rounded-2xl border border-gray-800 p-6">
               <UserActivityStats />
            </div>
          )}

          {/* Optimization View */}
          {activeTab === 'optimization' && systemStats && (
            <div className="space-y-6">
              <SystemHealthMonitor health={systemStats.health} />

              <div className="p-4 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-2xl">
                <h3 className="text-xl font-bold text-white mb-2">🚀 {t('system_health') || 'Состояние системы'}</h3>
                <p className="text-white/60 mb-4">
                   {t('system_health_desc') || 'Здесь вы можете видеть статистику использования ресурсов и выполнять очистку устаревших данных для ускорения работы приложения.'}
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Database */}
                  <div className="bg-[#1C1E24] p-4 rounded-xl border border-white/10">
                    <div className="text-white/50 text-xs uppercase font-bold mb-1">{t('database_size') || 'Размер БД'}</div>
                    <div className="text-2xl font-bold text-white mb-2">{systemStats.database?.size}</div>
                    <div className="space-y-1 text-xs text-white/60">
                       <div className="flex justify-between"><span>Audit Logs:</span> <span>{systemStats.database?.audit_logs}</span></div>
                       <div className="flex justify-between"><span>Messages:</span> <span>{systemStats.database?.messages}</span></div>
                       <div className="flex justify-between"><span>Students:</span> <span>{systemStats.database?.students}</span></div>
                    </div>
                  </div>
                  
                  {/* Trash */}
                  <div className="bg-[#1C1E24] p-4 rounded-xl border border-white/10">
                    <div className="text-white/50 text-xs uppercase font-bold mb-1">{t('trash_items') || 'В корзине'}</div>
                    <div className="text-2xl font-bold text-yellow-400 mb-2">{systemStats.trash?.total_items}</div>
                    <div className="space-y-1 text-xs text-white/60">
                       {Object.entries(systemStats.trash?.details || {}).slice(0, 3).map(([table, count]) => (
                          <div key={table} className="flex justify-between"><span>{table}:</span> <span>{count}</span></div>
                       ))}
                       {(Object.keys(systemStats.trash?.details || {}).length > 3) && <div>...</div>}
                    </div>
                  </div>
                  
                  {/* Logs */}
                  <div className="bg-[#1C1E24] p-4 rounded-xl border border-white/10">
                    <div className="text-white/50 text-xs uppercase font-bold mb-1">{t('logs_size') || 'Логи'}</div>
                    <div className="text-2xl font-bold text-blue-400 mb-2">{systemStats.files?.logs_size_mb} MB</div>
                    <div className="text-xs text-white/40">frontend_errors.log</div>
                  </div>
                  
                  {/* Cache */}
                  <div className="bg-[#1C1E24] p-4 rounded-xl border border-white/10">
                    <div className="text-white/50 text-xs uppercase font-bold mb-1">{t('cache_status') || 'Кэш (Redis)'}</div>
                    <div className={`text-xl font-bold mb-2 ${systemStats.cache?.status === 'connected' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {systemStats.cache?.status === 'connected' ? 'Подключен' : (systemStats.cache?.status === 'disabled' ? 'Отключен' : (systemStats.cache?.status || 'Ошибка'))}
                    </div>
                    {systemStats.cache?.status === 'connected' && (
                        <div className="text-xs text-white/60">
                            Mem: {systemStats.cache?.used_memory_human}
                        </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                        <span>🧹</span> {t('cleanup_tools') || 'Инструменты очистки'}
                    </h4>
                    
                    <div className="space-y-3">
                        <button 
                            onClick={() => handleSystemCleanup('gc_collect', t('clear_memory') || 'Освободить память')}
                            className="w-full p-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-xl flex items-center justify-between group transition-colors"
                        >
                            <span className="text-emerald-400 font-medium">{t('clear_memory') || 'Освободить память'}</span>
                            <span className="text-xs text-emerald-400/70">{t('clear_memory_desc') || 'GC + очистка кэша'}</span>
                        </button>
                        
                        <button 
                            onClick={() => handleSystemCleanup('clear_cache', t('clear_cache') || 'Очистить кэш')}
                            className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-between group transition-colors"
                        >
                            <span className="text-white font-medium group-hover:text-yellow-400 transition-colors">{t('clear_cache') || 'Очистить кэш'}</span>
                            <span className="text-xs text-white/40">{t('clear_cache_desc') || 'Сброс временных данных'}</span>
                        </button>
                        
                        <button 
                            onClick={() => handleSystemCleanup('clear_logs', t('clear_logs') || 'Очистить логи')}
                            className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-between group transition-colors"
                        >
                            <span className="text-white font-medium group-hover:text-yellow-400 transition-colors">{t('clear_logs') || 'Очистить логи'}</span>
                            <span className="text-xs text-white/40">{t('clear_logs_desc') || 'Удаление старых записей ошибок'}</span>
                        </button>
                        
                        <button 
                            onClick={() => handleSystemCleanup('empty_trash', t('empty_trash') || 'Очистить корзину')}
                            className="w-full p-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl flex items-center justify-between group transition-colors"
                        >
                            <span className="text-red-400 font-medium">{t('empty_trash') || 'Очистить корзину'}</span>
                            <span className="text-xs text-red-400/60">{t('empty_trash_desc') || 'Удалить всё из корзины навсегда'}</span>
                        </button>
                    </div>
                 </div>
                 
                 <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                        <span>📉</span> {t('data_retention') || 'Управление хранением'}
                    </h4>
                     <div className="space-y-3">
                        <button 
                            onClick={() => handleSystemCleanup('prune_messages', t('prune_messages') || 'Удалить старые сообщения')}
                            className="w-full p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-between group transition-colors"
                        >
                            <div className="text-left">
                                <div className="text-white font-medium group-hover:text-yellow-400 transition-colors">{t('prune_messages') || 'Удалить старые сообщения'}</div>
                                <div className="text-xs text-white/40">{t('prune_messages_hint') || '> 365 дней'}</div>
                            </div>
                            <span className="text-xs px-2 py-1 bg-white/10 rounded text-white/60">Auto</span>
                        </button>
                        
                        <div className="p-3 bg-white/5 border border-white/10 rounded-xl opacity-50 cursor-not-allowed">
                             <div className="text-white font-medium mb-1">{t('prune_audit') || 'Очистка истории изменений'}</div>
                             <div className="text-xs text-yellow-500/80">
                                ⚠️ {t('audit_policy_warning') || 'Отключено политикой безопасности (хранить вечно)'}
                             </div>
                        </div>
                     </div>
                 </div>
                 
                 {/* Cleanup Settings */}
                 <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:col-span-2">
                    <h4 className="font-bold text-white mb-4 flex items-center gap-2">
                        <span>⚙️</span> {t('cleanup_settings') || 'Настройки очистки'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('notif_retention_days') || 'Дни хранения уведомлений'}</label>
                         <input 
                           type="number" min="30" max="3650"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.notification_retention_days}
                           onChange={e => setCleanupSettings(s => ({...s, notification_retention_days: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('log_rotate_threshold_mb') || 'Порог ротации логов (МБ)'}</label>
                         <input 
                           type="number" min="1" max="1024"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.log_rotate_threshold_mb}
                           onChange={e => setCleanupSettings(s => ({...s, log_rotate_threshold_mb: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('log_lines_to_keep') || 'Строк оставлять при ротации'}</label>
                         <input 
                           type="number" min="100" max="100000"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.log_lines_to_keep}
                           onChange={e => setCleanupSettings(s => ({...s, log_lines_to_keep: e.target.value }))}
                         />
                       </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                       <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer">
                         <input 
                           type="checkbox"
                           checked={cleanupSettings.enable_weekly_trash}
                           onChange={e => setCleanupSettings(s => ({...s, enable_weekly_trash: e.target.checked }))}
                           className="w-5 h-5 rounded accent-yellow-500"
                         />
                         <span className="text-white">{t('enable_weekly_trash') || 'Еженедельная очистка корзины'}</span>
                       </label>
                       <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer">
                         <input 
                           type="checkbox"
                           checked={cleanupSettings.wl_schedule_template}
                           onChange={e => setCleanupSettings(s => ({...s, wl_schedule_template: e.target.checked }))}
                           className="w-5 h-5 rounded accent-yellow-500"
                         />
                         <span className="text-white">{t('wl_schedule_template') || 'Включать шаблоны расписаний'}</span>
                       </label>
                       <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer">
                         <input 
                           type="checkbox"
                           checked={cleanupSettings.wl_trial_session}
                           onChange={e => setCleanupSettings(s => ({...s, wl_trial_session: e.target.checked }))}
                           className="w-5 h-5 rounded accent-yellow-500"
                         />
                         <span className="text-white">{t('wl_trial_session') || 'Включать пробные занятия'}</span>
                       </label>
                    </div>
                    {/* Schedule */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('schedule_hour') || 'Час запуска (0-23)'}</label>
                         <input 
                           type="number" min="0" max="23"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.schedule_hour}
                           onChange={e => setCleanupSettings(s => ({...s, schedule_hour: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('schedule_minute') || 'Минута запуска (0-59)'}</label>
                         <input 
                           type="number" min="0" max="59"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.schedule_minute}
                           onChange={e => setCleanupSettings(s => ({...s, schedule_minute: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('schedule_days_of_week') || 'Дни недели (cron формат)'}</label>
                         <input 
                           type="text" 
                           placeholder="*, mon-fri, sat,sun, 0-6"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.schedule_days_of_week}
                           onChange={e => setCleanupSettings(s => ({...s, schedule_days_of_week: e.target.value }))}
                         />
                       </div>
                    </div>
                    {/* Alerts */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                       <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer">
                         <input 
                           type="checkbox"
                           checked={cleanupSettings.alerts_enabled}
                           onChange={e => setCleanupSettings(s => ({...s, alerts_enabled: e.target.checked }))}
                           className="w-5 h-5 rounded accent-yellow-500"
                         />
                         <span className="text-white">{t('alerts_enabled') || 'Оповещения по ресурсам'}</span>
                       </label>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('alerts_interval') || 'Интервал проверки (мин)'}</label>
                         <input 
                           type="number" min="1" max="60"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.alerts_check_interval_minutes}
                           onChange={e => setCleanupSettings(s => ({...s, alerts_check_interval_minutes: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('alerts_cooldown') || 'Период молчания (мин)'}</label>
                         <input 
                           type="number" min="10" max="1440"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.alerts_cooldown_minutes}
                           onChange={e => setCleanupSettings(s => ({...s, alerts_cooldown_minutes: e.target.value }))}
                         />
                       </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('cpu_threshold') || 'Порог CPU (%)'}</label>
                         <input 
                           type="number" min="50" max="100"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.alerts_cpu_threshold}
                           onChange={e => setCleanupSettings(s => ({...s, alerts_cpu_threshold: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('ram_threshold') || 'Порог RAM (%)'}</label>
                         <input 
                           type="number" min="50" max="100"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.alerts_ram_threshold}
                           onChange={e => setCleanupSettings(s => ({...s, alerts_ram_threshold: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('process_mem_threshold') || 'Порог памяти процесса (МБ)'}</label>
                         <input 
                           type="number" min="128" max="8192"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.alerts_process_rss_mb}
                           onChange={e => setCleanupSettings(s => ({...s, alerts_process_rss_mb: e.target.value }))}
                         />
                       </div>
                    </div>
                    {/* Uploads */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                       <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10 cursor-pointer">
                         <input 
                           type="checkbox"
                           checked={cleanupSettings.uploads_enable_media_cleanup}
                           onChange={e => setCleanupSettings(s => ({...s, uploads_enable_media_cleanup: e.target.checked }))}
                           className="w-5 h-5 rounded accent-yellow-500"
                         />
                         <span className="text-white">{t('uploads_cleanup') || 'Очистка uploads/media'}</span>
                       </label>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('uploads_max_size') || 'Макс. размер uploads/media (МБ)'}</label>
                         <input 
                           type="number" min="100" max="102400"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.uploads_max_size_mb}
                           onChange={e => setCleanupSettings(s => ({...s, uploads_max_size_mb: e.target.value }))}
                         />
                       </div>
                       <div>
                         <label className="block text-xs text-white/60 mb-1">{t('uploads_tmp_days') || 'Удалять медиа старше (дней)'}</label>
                         <input 
                           type="number" min="1" max="3650"
                           className="w-full p-2 rounded-lg bg-[#15171C] text-white border border-white/10"
                           value={cleanupSettings.uploads_tmp_days}
                           onChange={e => setCleanupSettings(s => ({...s, uploads_tmp_days: e.target.value }))}
                         />
                       </div>
                    </div>
                    <div className="mt-4">
                      <button
                        onClick={saveCleanupSettings}
                        disabled={savingSettings}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl text-white font-bold"
                      >
                        {savingSettings ? (t('saving') || 'Сохранение...') : (t('save_settings') || 'Сохранить настройки')}
                      </button>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {/* Trash View */}
          {activeTab === 'trash' && (
            <div className="space-y-4">
              {trashTotal === 0 ? (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
                  <div className="text-5xl mb-4 opacity-50">🗑️</div>
                  <p className="text-white/50 text-lg">{t('trash_empty')}</p>
                  <p className="text-white/30 text-sm mt-2">{t('trash_retention')}</p>
                </div>
              ) : (
                Object.entries(trash).map(([entityType, items]) => (
                  <div key={entityType} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
                      <h3 className="font-bold text-white flex items-center gap-2">
                        <span>{ENTITY_LABELS[entityType] || entityType}</span>
                        <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full">{items.length}</span>
                      </h3>
                    </div>
                    <div className="divide-y divide-white/5">
                      {items.map(item => (
                        <div key={item.id} className="p-4 hover:bg-white/5 transition-colors">
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div>
                              <div className="font-medium text-white">{item.name}</div>
                              <div className="text-sm text-white/50 mt-1">
                                {t('deleted_at')}: {item.deleted_at ? new Date(item.deleted_at).toLocaleString(locale, { hour12: false }) : '—'}
                              </div>
                              {item.deletion_reason && (
                                <div className="text-sm text-white/40 mt-1">{t('deletion_reason')}: {item.deletion_reason}</div>
                              )}
                              <div className={`text-xs mt-2 ${item.days_left <= 7 ? 'text-red-400' : 'text-white/40'}`}>
                                ⏱️ {t('days_left')}: {item.days_left}
                              </div>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                              <button
                                onClick={() => handleRestoreFromTrash(entityType, item.id)}
                                className="flex-1 sm:flex-none justify-center px-3 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm hover:bg-emerald-500/30 transition-colors flex items-center gap-2"
                              >
                                ♻️ {t('restore')}
                              </button>
                              {isSuperAdmin && (
                                <button
                                  onClick={() => handleDeleteForever(entityType, item.id, item.name)}
                                  className="flex-1 sm:flex-none justify-center px-3 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm hover:bg-red-500/30 transition-colors flex items-center gap-2"
                                >
                                  💀 {t('delete_forever')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {/* Cleanup Modal */}
          {showCleanupModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCleanupModal(false)}>
              <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-white/10">
                  <h3 className="text-xl font-bold text-white">{t('select_trash_types')}</h3>
                </div>
                <div className="p-6 space-y-3 max-h-[60vh] overflow-y-auto">
                   {Object.entries(systemStats?.trash?.details || {}).map(([type, count]) => (
                     <label key={type} className="flex items-center justify-between p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-3">
                            <input 
                                type="checkbox" 
                                checked={!!selectedTrashTypes[type]} 
                                onChange={e => setSelectedTrashTypes(prev => ({...prev, [type]: e.target.checked}))}
                                className="w-5 h-5 rounded accent-yellow-500"
                            />
                            <span className="text-white font-medium">{ENTITY_LABELS[type] || type}</span>
                        </div>
                        <span className="text-white/50 text-sm">{count}</span>
                     </label>
                   ))}
                   {Object.keys(systemStats?.trash?.details || {}).length === 0 && (
                       <div className="text-white/50 text-center py-4">{t('trash_empty')}</div>
                   )}
                </div>
                <div className="p-6 border-t border-white/10 flex gap-3">
                    <button 
                        onClick={() => setShowCleanupModal(false)}
                        className="flex-1 py-3 rounded-xl bg-white/5 text-white font-medium hover:bg-white/10 transition-colors"
                    >
                        {t('cancel')}
                    </button>
                    <button 
                        onClick={() => {
                            const types = Object.keys(selectedTrashTypes).filter(k => selectedTrashTypes[k]);
                            if (types.length === 0) return;
                            performCleanup('empty_trash', { types });
                        }}
                        disabled={Object.values(selectedTrashTypes).filter(Boolean).length === 0}
                        className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold hover:bg-red-600 transition-colors disabled:opacity-50"
                    >
                        {t('delete_selected')}
                    </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GroupedHistoryItem({ items, onBulkRestore, labels, locale }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = labels;
  const firstItem = items[0];
  const count = items.length;
  
  return (
    <div className="bg-white/5 border-l-4 border-l-yellow-500 hover:bg-white/10 transition-colors">
      <div className="p-4 flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
             <span className="px-2 py-1 rounded-lg text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
               ⚠️ {t('mass_action') || 'Массовое действие'}
             </span>
             <span className="text-white font-medium">{firstItem.reason}</span>
             <span className="text-white/50 text-sm">({count} {t('items')})</span>
          </div>
          
          <div className="flex items-center gap-4 mt-2 text-sm text-white/50">
            <span>🕐 {new Date(firstItem.created_at).toLocaleString(locale, { hour12: false })}</span>
            {firstItem.user_name && <span>👤 {firstItem.user_name}</span>}
          </div>
          
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-yellow-400 hover:text-yellow-300 mt-2 flex items-center gap-1"
          >
            {expanded ? '▼' : '▶'} {t('show_details') || 'Показать детали'}
          </button>
        </div>
        
        <button
          onClick={() => onBulkRestore(items)}
          className="w-full sm:w-auto justify-center px-3 py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl text-sm hover:bg-purple-500/30 transition-colors flex items-center gap-1"
        >
          ↩️ {t('restore_all') || 'Восстановить всё'}
        </button>
      </div>
      
      {expanded && (
        <div className="border-t border-white/10 pl-8">
           {items.map(item => (
             <div key={item.id} className="border-b border-white/5 last:border-0">
               <HistoryItem 
                 item={item} 
                 // Disable restore button in individual items when in group view to avoid confusion, 
                 // or keep it if individual restore is desired. Let's keep it but maybe simplified.
                 onRestore={() => {}} 
                 showDate={false}
                 labels={labels}
                 locale={locale}
                 hideRestore={true}
               />
             </div>
           ))}
        </div>
      )}
    </div>
  );
}

// History Item Component
function HistoryItem({ item, onRestore, showDate = false, labels, locale, hideRestore = false }) {
  const [expanded, setExpanded] = useState(false);
  const { entity, action, t } = labels;

  const formatValue = (field, value) => {
    if (value === null || value === undefined) return '—';
    if (field === 'is_active') {
      return value ? `✅ ${t('active') || 'Active'}` : `⏸️ ${t('inactive') || 'Inactive'}`;
    }
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    return value.toString().slice(0, 50);
  };

  const getFieldLabel = (field) => {
    const map = {
      is_active: t('status') || 'Статус',
      name: t('name') || 'Название',
      valid_from: t('valid_from') || 'Действует с',
      valid_until: t('valid_until') || 'Действует по',
      group_id: t('group') || 'Группа',
      schedule_rules: t('schedule_rules') || 'Правила расписания',
      excluded_dates: t('excluded_dates') || 'Исключения',
    };
    return map[field] || field;
  };
  
  return (
    <div className="p-4 hover:bg-white/5 transition-colors">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-1 rounded-lg text-xs font-medium border ${ACTION_COLORS[item.action] || 'bg-white/10 text-white/60 border-white/10'}`}>
              {ACTION_ICONS[item.action]} {action[item.action] || item.action}
            </span>
            <span className="text-white/50 text-sm">{entity[item.entity_type] || item.entity_type}</span>
            <span className="text-white font-medium">{item.entity_name}</span>
          </div>
          
          <div className="flex items-center gap-4 mt-2 text-sm text-white/50">
            {showDate && (
              <span>📅 {item.created_at ? new Date(item.created_at).toLocaleString(locale, { hour12: false }) : '—'}</span>
            )}
            {!showDate && (
              <span>🕐 {item.created_at ? new Date(item.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}</span>
            )}
            {item.user_name && <span>👤 {item.user_name}</span>}
          </div>
          
          {item.reason && (
            <div className="text-sm text-white/40 mt-1">💬 {item.reason}</div>
          )}
          
          {/* Changed Fields */}
          {item.changed_fields && item.changed_fields.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-yellow-400 hover:text-yellow-300"
              >
                {expanded ? '▼' : '▶'} {t('changed_fields')} ({item.changed_fields.length})
              </button>
              {expanded && (
                <div className="mt-2 p-3 bg-black/20 rounded-lg text-xs space-y-1">
                  {item.changed_fields.map(field => (
                    <div key={field} className="flex gap-2 items-center">
                      <span className="text-white/50">{getFieldLabel(field)}:</span>
                      <span className="text-red-400 line-through">{formatValue(field, item.old_data?.[field])}</span>
                      <span className="text-white/30">→</span>
                      <span className="text-emerald-400">{formatValue(field, item.new_data?.[field])}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {!hideRestore && (item.action === 'update' || item.action === 'delete') && item.old_data && (
          <button
            onClick={() => onRestore(item.id)}
            className="w-full sm:w-auto justify-center px-3 py-2 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl text-sm hover:bg-purple-500/30 transition-colors flex items-center gap-1"
          >
            ↩️ {t('rollback')}
          </button>
        )}
      </div>
    </div>
  );
}
