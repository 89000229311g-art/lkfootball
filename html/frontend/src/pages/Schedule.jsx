import { useState, useEffect, useRef, useCallback } from 'react';
import { groupsAPI, scheduleAPI, messagesAPI, eventsAPI, historyAPI, loggingAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Loader2, Download, FileText, Calendar as CalendarIcon, List as ListIcon } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

// Helper function
const getErrorMessage = (error, fallback = 'Unknown error') => {
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    if (Array.isArray(detail)) return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
    if (typeof detail === 'string') return detail;
    return JSON.stringify(detail);
  }
  return error.message || fallback;
};

export default function Schedule() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState(window.innerWidth < 768 ? 'list' : 'grid');
  const [activeTab, setActiveTab] = useState('calendar');
  const [groups, setGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calendarData, setCalendarData] = useState(null);
  const [changes, setChanges] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const printRef = useRef(null);
  
  // Modals
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTrashModal, setShowTrashModal] = useState(false);
  const [trashItems, setTrashItems] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [newEventDate, setNewEventDate] = useState(null);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  
  // Toast
  const [toast, setToast] = useState({ show: false, type: '', message: '' });
  
  // Clear All Schedule State
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClearSchedule = async () => {
    setClearing(true);
    try {
      const res = await scheduleAPI.clearAll();
      showToast('success', res.data.message || 'Расписание очищено');
      setShowClearConfirm(false);
      // Refresh
      fetchData();
      fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    } catch (err) {
      console.error(err);
      loggingAPI.logFrontendError(
        'Error clearing schedule',
        { page: 'Schedule', action: 'clearAll' },
        err?.response?.data?.detail || err.message || null
      );
    } finally {
      setClearing(false);
    }
  };

  // Export State

  const handleExport = (type) => {
    if (!calendarData || !calendarData.days) return;
    
    // Flatten calendar data into a list of events
    const allEvents = [];
    calendarData.days.forEach(day => {
      if (day.events && day.events.length > 0) {
        day.events.forEach(event => {
          allEvents.push({
            date: day.date,
            group: event.group_name,
            type: (event.type === 'training' || event.type === 'TRAINING') ? (t('training') || 'Тренировка') : (t('game') || 'Игра'),
            time: `${event.start_time.slice(0, 5)} - ${event.end_time.slice(0, 5)}`,
            location: event.location || '',
            coach: event.coach_name || ''
          });
        });
      }
    });
    
    if (allEvents.length === 0) {
      loggingAPI.logFrontendError(
        'No events to export in Schedule',
        { page: 'Schedule', action: 'export', type },
        null
      );
      return;
    }
    
    // Sort by date and time
    allEvents.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
    
    const columns = {
      date: t('date') || 'Дата',
      time: t('time') || 'Время',
      group: t('group') || 'Группа',
      type: t('type') || 'Тип',
      location: t('location') || 'Место',
      coach: t('coach') || 'Тренер'
    };
    
    const monthName = currentDate.toLocaleString('default', { month: 'long' });
    const filename = `Schedule_${monthName}_${currentDate.getFullYear()}`;
    
    try {
      if (type === 'excel') {
        exportToExcel(allEvents, columns, filename);
      } else {
        exportToPDF(allEvents, columns, filename, `${t('schedule_title')} - ${monthName} ${currentDate.getFullYear()}`);
      }
      showToast('success', t('export_success') || 'Экспорт выполнен успешно');
    } catch (err) {
      console.error(err);
      loggingAPI.logFrontendError(
        'Error exporting schedule',
        { page: 'Schedule', action: 'export', type },
        err?.message || null
      );
    }
  };

  const isAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
  const isCoach = user?.role?.toLowerCase() === 'coach';
  const isParent = user?.role?.toLowerCase() === 'parent';
  const canEdit = isAdmin;
  
  // Tabs configuration - Templates and History only for admins
  const TABS_ADMIN = [
    { id: 'calendar', label: t('calendar_tab'), icon: '📆' },
    { id: 'templates', label: t('templates_tab'), icon: '📋' },
    { id: 'history', label: t('history_tab'), icon: '📝' },
  ];
  // Coach/Parent only sees calendar (their schedule)
  const TABS_USER = [
    { id: 'calendar', label: t('my_schedule'), icon: '📆' },
  ];
  
  // Get tabs based on role
  const TABS = isAdmin ? TABS_ADMIN : TABS_USER;

  const showToast = (type, message) => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: '', message: '' }), 4000);
  };

  

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [groupsRes, templatesRes] = await Promise.all([
        groupsAPI.getAll(),
        isParent ? Promise.resolve({ data: [] }) : scheduleAPI.getTemplates(null, false)
      ]);
      let groupsData = [];
      if (groupsRes.data && Array.isArray(groupsRes.data.data)) {
        groupsData = groupsRes.data.data;
      } else if (Array.isArray(groupsRes.data)) {
        groupsData = groupsRes.data;
      } else if (groupsRes.data && Array.isArray(groupsRes.data.items)) {
         groupsData = groupsRes.data.items;
      }

      console.log('Fetched groups:', groupsData); // Debug log
      
      // Backend already filters groups for coach and parent
      // We don't need to filter again in frontend, which might be buggy if coaches relation is not fully loaded
      
      setGroups(groupsData);
      setTemplates(Array.isArray(templatesRes.data) ? templatesRes.data : []);
    } catch (error) {
      console.error('Error fetching data:', error);
      loggingAPI.logFrontendError(
        'Error fetching schedule data',
        { page: 'Schedule' },
        error?.response?.data?.detail || error.message || null
      );
    } finally {
      setLoading(false);
    }
  }, [isCoach, isParent, user?.id]); // Removed selectedGroup dependency

  // Auto-select first group for coach/parent
  useEffect(() => {
    if ((isCoach || isParent) && groups.length > 0 && !selectedGroup) {
      setSelectedGroup(groups[0].id);
    }
  }, [isCoach, isParent, groups, selectedGroup]);

  const fetchCalendar = useCallback(async (year, month) => {
    try {
      const response = await scheduleAPI.getCalendar(year, month, selectedGroup);
      setCalendarData(response.data || { year, month, days: [] });
    } catch (error) {
      console.error('Error fetching calendar:', error);
      setCalendarData({ year, month, month_name: '', days: [] });
    }
  }, [selectedGroup]);

  const fetchChanges = useCallback(async () => {
    try {
      const response = isAdmin 
        ? await scheduleAPI.getChanges(selectedGroup, 100)
        : await scheduleAPI.getMyChanges(100);
      const data = response.data?.data || response.data?.changes || response.data || [];
      setChanges(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching changes:', error);
      setChanges([]);
    }
  }, [isAdmin, selectedGroup]);

  const fetchTrash = async () => {
    try {
      const res = await historyAPI.getTrash({ entity_type: 'schedule_template' });
      const items = res.items?.schedule_template || [];
      setTrashItems(items);
    } catch (err) {
      console.error('Error fetching trash:', err);
      // Проверяем, если ошибка 403 (нет доступа), показываем сообщение пользователю
      if (err.response?.status === 403) {
        showToast('error', t('no_trash_access') || 'Нет доступа к корзине. Обратитесь к администратору.');
      } else {
        showToast('error', t('error_loading_trash') || 'Ошибка загрузки корзины');
      }
      setTrashItems([]);
    }
  };

  // Effects placed after callback declarations to avoid TDZ runtime errors
  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  useEffect(() => {
    if (activeTab === 'calendar') {
      fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    } else if (activeTab === 'history') {
      fetchChanges();
    }
  }, [activeTab, selectedGroup, currentDate, fetchCalendar, fetchChanges]);

  const handleRestoreTemplate = async (id) => {
    try {
      await historyAPI.restore('schedule_template', id);
      showToast('success', t('template_restored') || 'Шаблон восстановлен');
      fetchTrash();
      fetchData();
    } catch (err) {
      loggingAPI.logFrontendError(
        'Error restoring schedule template from history',
        { page: 'Schedule' },
        getErrorMessage(err, t('restore_error') || 'Ошибка восстановления')
      );
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm(t('delete_schedule_confirm'))) return;
    try {
      // Automatically cleanup future events when deleting a template
      await scheduleAPI.cleanupFutureEvents(templateId);
      await scheduleAPI.deleteTemplate(templateId);
      
      showToast('success', t('schedule_deleted'));
      fetchData();
      fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error deleting schedule template',
        { page: 'Schedule' },
        getErrorMessage(error, t('delete_error'))
      );
    }
  };

  const handleToggleTemplateStatus = async (template) => {
    const isStopping = template.is_active;
    const confirmMsg = isStopping ? t('stop_template_confirm') : t('restore_template_confirm');
    
    if (!window.confirm(confirmMsg)) return;

    try {
      // If stopping template, cleanup future events first
      if (isStopping) {
        await scheduleAPI.cleanupFutureEvents(template.id);
      }
      
      await scheduleAPI.updateTemplate(template.id, { is_active: !template.is_active });
      showToast('success', isStopping ? t('template_stopped') : t('template_restored'));
      fetchData();
      // Force refresh calendar
      fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error toggling schedule template status',
        { page: 'Schedule' },
        getErrorMessage(error, t('update_error'))
      );
    }
  };

  const handleGenerateEvents = async (templateId) => {
    if (!window.confirm(t('generate_events_confirm'))) return;
    try {
      const response = await scheduleAPI.generateEvents(templateId);
      showToast('success', response.data?.message || t('events_generated'));
      fetchData();
      fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error generating schedule events',
        { page: 'Schedule' },
        getErrorMessage(error, t('generate_error'))
      );
    }
  };

  const handleCleanupFuture = async (templateId) => {
    if (!window.confirm(t('cleanup_future_confirm') || 'Удалить все будущие события этого шаблона?')) return;
    try {
      const response = await scheduleAPI.cleanupFutureEvents(templateId);
      showToast('success', response.data?.message || 'Будущие события очищены');
      fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error cleaning up future schedule events',
        { page: 'Schedule' },
        getErrorMessage(error, 'Ошибка очистки')
      );
    }
  };

  const handleDeleteEvent = (eventId) => {
    setEventToDelete(eventId);
    setShowDeleteModal(true);
  };

  const confirmDeleteEvent = async (deleteFuture) => {
    if (!eventToDelete) return;
    
    try {
      const response = await scheduleAPI.deleteEvent(eventToDelete, deleteFuture);
      showToast('success', response.data?.message || t('event_deleted'));
      fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
      setShowDayModal(false);
      setShowEventModal(false);
      setShowDeleteModal(false);
      setEventToDelete(null);
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error deleting schedule event',
        { page: 'Schedule' },
        getErrorMessage(error, t('delete_error'))
      );
    }
  };

  const changeMonth = (delta) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setCurrentDate(newDate);
  };

  const filteredTemplates = templates.filter(t => !selectedGroup || t.group_id === selectedGroup);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin"></div>
          <span className="text-white/60">{t('loading_schedule')}</span>
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
            <span className="text-3xl md:text-4xl">📅</span>
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
              {isCoach || isParent ? t('my_schedule') : t('schedule_title')}
            </span>
          </h1>
          <p className="text-gray-500 mt-1 md:mt-2 text-sm md:text-base">
            {isCoach || isParent
              ? t('schedule_subtitle_coach') 
              : t('schedule_subtitle') || 'Управление тренировочным процессом'
            }
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {activeTab === 'calendar' && (
            <>
              <button 
                onClick={() => handleExport('excel')}
                className="bg-white/5 hover:bg-white/10 text-green-400 hover:text-green-300 px-4 py-2 rounded-xl flex items-center gap-2 transition-all border border-white/10"
              >
                <FileText size={18} />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button 
                onClick={() => handleExport('pdf')}
                disabled={loading}
                className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all border border-white/10"
              >
                <Download size={18} />
                <span className="hidden sm:inline">{t('export_pdf') || 'PDF'}</span>
              </button>
            </>
          )}
          
          {isAdmin && (
            <button 
              onClick={() => setShowClearConfirm(true)}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-xl flex items-center gap-2 transition-all border border-red-500/30"
            >
              <span>🗑️</span>
              <span className="hidden sm:inline">{t('clear_schedule') || 'Очистить расписание'}</span>
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => { setSelectedTemplate(null); setShowTemplateModal(true); }}
              className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-xl text-black font-semibold hover:shadow-lg hover:shadow-yellow-500/25 transition-all flex items-center gap-2"
            >
              <span>➕</span> <span className="hidden sm:inline">{t('add_schedule')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Hidden Printable Section */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-0 z-[-1]" aria-hidden="true">
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <PrintableCalendar 
            contentRef={printRef}
            calendarData={calendarData}
            currentDate={currentDate}
            groupName={selectedGroup ? groups.find(g => g.id === selectedGroup)?.name : (t('all_groups') || 'All Groups')}
            t={t}
          />
        </div>
      </div>

      {/* Coach Info Panel - Only for coaches */}
      {isCoach && groups.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">⚽</span>
            <span className="text-white font-medium">
              {t('you_train')} {groups.length} {groups.length === 1 ? t('groups_count_1') : groups.length < 5 ? t('groups_count_2_4') : t('groups_count_5')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {groups.map(g => (
              <span 
                key={g.id}
                className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-sm"
              >
                {g.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabs + Filter */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          {/* Tabs - different for coaches */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'bg-yellow-500 text-black'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
          
          {/* Filter - for admins show all groups, for coaches only their groups */}
          <select
            value={selectedGroup || ''}
            onChange={(e) => setSelectedGroup(e.target.value ? parseInt(e.target.value) : null)}
            className="px-4 py-2.5 bg-[#1C1E24] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50 min-w-[200px]"
          >
            {isAdmin && <option value="">{t('all_groups')}</option>}
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'calendar' && (
        <CalendarView
          calendarData={calendarData}
          currentDate={currentDate}
          changeMonth={changeMonth}
          onDayClick={(day) => { setSelectedDay(day); setShowDayModal(true); }}
          onEventClick={(event) => { setSelectedEvent(event); setShowEventModal(true); }}
          canEdit={canEdit}
          viewMode={viewMode}
          setViewMode={setViewMode}
        />
      )}

      {activeTab === 'templates' && (
        <TemplatesView
          templates={filteredTemplates}
          groups={groups}
          onEdit={(t) => { setSelectedTemplate(t); setShowTemplateModal(true); }}
          onDelete={handleDeleteTemplate}
          onGenerate={handleGenerateEvents}
          onToggleStatus={handleToggleTemplateStatus}
          onCleanup={handleCleanupFuture}
          canEdit={canEdit}
          onOpenTrash={() => { 
            try {
              fetchTrash(); 
              setShowTrashModal(true); 
            } catch (err) {
              console.error('Error opening trash:', err);
              showToast('error', 'Ошибка открытия корзины');
            }
          }}
        />
      )}

      {activeTab === 'history' && (
        <HistoryView changes={changes} />
      )}

      {/* Modals */}
      {showTrashModal && (
        <TrashModal
          items={trashItems}
          onClose={() => setShowTrashModal(false)}
          onRestore={handleRestoreTemplate}
        />
      )}

      {showTemplateModal && (
        <TemplateModal
          template={selectedTemplate}
          groups={groups}
          selectedGroupId={selectedGroup}
          onClose={() => { setShowTemplateModal(false); setSelectedTemplate(null); }}
          onSave={() => { fetchData(); setShowTemplateModal(false); setSelectedTemplate(null); showToast('success', t('schedule_saved')); }}
        />
      )}

      {showDayModal && selectedDay && (
        <DayModal
          day={selectedDay}
          onClose={() => setShowDayModal(false)}
          onEventClick={(event) => { setSelectedEvent(event); setShowEventModal(true); }}
          onAddEvent={() => {
            setNewEventDate(selectedDay.date);
            setShowCreateEventModal(true);
            // Don't close DayModal yet, or maybe close it?
            // Closing it feels better UX to focus on creation
            setShowDayModal(false); 
          }}
          onDeleteEvent={handleDeleteEvent}
          canEdit={canEdit}
        />
      )}

      {showCreateEventModal && (
        <CreateEventModal
          date={newEventDate}
          groups={groups}
          selectedGroupId={selectedGroup}
          onClose={() => { setShowCreateEventModal(false); setNewEventDate(null); }}
          onSave={() => {
            fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
            setShowCreateEventModal(false);
            setNewEventDate(null);
            showToast('success', t('event_created') || 'Событие создано');
          }}
        />
      )}

      {showEventModal && selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => { setShowEventModal(false); setSelectedEvent(null); }}
          onSave={() => { 
            fetchCalendar(currentDate.getFullYear(), currentDate.getMonth() + 1);
            setShowEventModal(false); 
            setSelectedEvent(null);
            showToast('success', t('changes_saved'));
          }}
          onDelete={handleDeleteEvent}
          canEdit={canEdit}
        />
      )}

      {showDeleteModal && eventToDelete && (
        <DeleteEventModal
          onClose={() => { setShowDeleteModal(false); setEventToDelete(null); }}
          onConfirm={confirmDeleteEvent}
        />
      )}

      {/* Clear Schedule Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <span className="text-red-500">⚠️</span> {t('clear_schedule_confirm_title') || 'Очистка расписания'}
            </h3>
            <p className="text-white/60 mb-6">
              {t('clear_schedule_confirm_desc') || 
               'Вы уверены? Это действие остановит ВСЕ активные шаблоны и удалит ВСЕ будущие события. Это полезно, если расписание стало неактуальным. Вы сможете восстановить шаблоны через Историю.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-white/60 hover:text-white transition-colors"
                disabled={clearing}
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleClearSchedule}
                disabled={clearing}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors flex items-center gap-2"
              >
                {clearing && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('confirm_clear') || 'Очистить всё'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== DELETE CONFIRMATION MODAL ====================
function DeleteEventModal({ onClose, onConfirm }) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-sm p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-3xl">
            🗑️
          </div>
        </div>
        <h3 className="text-xl font-bold text-white mb-2 text-center">{t('delete_event_title') || 'Удаление события'}</h3>
        <p className="text-white/60 mb-6 text-center text-sm">{t('delete_event_question') || 'Выберите вариант удаления:'}</p>
        
        <div className="space-y-3">
          <button
            onClick={() => onConfirm(false)}
            className="w-full p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-left group flex items-start gap-3"
          >
            <div className="mt-1 p-1 bg-white/10 rounded-lg text-xs">1️⃣</div>
            <div>
              <div className="font-bold text-white mb-1 group-hover:text-yellow-400 transition-colors">
                {t('delete_only_this') || 'Только это событие'}
              </div>
              <div className="text-xs text-white/50">
                {t('delete_only_this_desc') || 'Удалить только выбранную тренировку.'}
              </div>
            </div>
          </button>

          <button
            onClick={() => onConfirm(true)}
            className="w-full p-4 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all text-left group flex items-start gap-3"
          >
            <div className="mt-1 p-1 bg-red-500/20 text-red-400 rounded-lg text-xs">⏩</div>
            <div>
              <div className="font-bold text-red-400 mb-1">
                {t('delete_this_and_future') || 'Это и все будущие'}
              </div>
              <div className="text-xs text-white/50">
                {t('delete_future_desc') || 'Удалить это событие и все последующие в серии.'}
              </div>
            </div>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 py-3 text-white/50 hover:text-white transition-colors font-medium text-sm"
        >
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}

// ==================== PRINTABLE CALENDAR ====================
const PrintableCalendar = ({ contentRef, calendarData, currentDate, groupName, t }) => {
  const DAY_NAMES_SHORT = [
    t('mon_short') || 'Mon', 
    t('tue_short') || 'Tue', 
    t('wed_short') || 'Wed', 
    t('thu_short') || 'Thu', 
    t('fri_short') || 'Fri', 
    t('sat_short') || 'Sat', 
    t('sun_short') || 'Sun'
  ];

  const monthNames = [
    t('january'), t('february'), t('march'), t('april'), t('may'), t('june'), 
    t('july'), t('august'), t('september'), t('october'), t('november'), t('december')
  ];

  const EVENT_TYPES = [
    { value: 'training', label: t('event_training') || 'Training', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    { value: 'game', label: t('event_game') || 'Game', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    { value: 'tournament', label: t('event_tournament') || 'Tournament', color: 'bg-purple-100 text-purple-800 border-purple-200' },
    { value: 'championship', label: t('event_championship') || 'Championship', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
    { value: 'individual', label: t('event_individual') || 'Individual', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
    { value: 'parent_meeting', label: t('event_parent_meeting') || 'Parent Meeting', color: 'bg-orange-100 text-orange-800 border-orange-200' },
    { value: 'medical', label: t('event_medical') || 'Medical', color: 'bg-red-100 text-red-800 border-red-200' },
    { value: 'testing', label: t('event_testing') || 'Testing', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    { value: 'rest', label: t('event_rest') || 'Rest', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  ];

  // Logic to fill empty cells
  const firstDay = calendarData?.days?.[0]?.day_of_week || 0;
  // Offset logic: 0 = Mon, but JS 0 = Sun. Our backend likely returns 0=Mon or we need to adjust.
  // In CalendarView: DAY_NAMES_SHORT starts with Mon. 
  // calendarData.days[0].day_of_week is likely 0-6.
  
  return (
    <div ref={contentRef} className="p-8 bg-white text-black font-sans w-[1600px]">
      {/* Header */}
      <div className="flex justify-between items-end mb-6 border-b-2 border-black pb-4">
        <div>
          <h1 className="text-4xl font-bold uppercase tracking-wider mb-2">
            {t('schedule_title') || 'Schedule'}
          </h1>
          <div className="text-xl text-gray-600 font-medium">
            {groupName}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-black">
            {calendarData?.month_name || monthNames[currentDate.getMonth()]} {calendarData?.year || currentDate.getFullYear()}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Generated: {new Date().toLocaleDateString()}
          </div>
        </div>
      </div>

      {/* Grid Header */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DAY_NAMES_SHORT.map(d => (
          <div key={d} className="text-center font-bold text-gray-600 uppercase text-sm py-2 bg-gray-100 border border-gray-200 rounded">
            {d}
          </div>
        ))}
      </div>

      {/* Grid Body */}
      <div className="grid grid-cols-7 gap-1">
        {/* Empty cells */}
        {Array(firstDay).fill(null).map((_, i) => (
          <div key={`empty-${i}`} className="p-2 min-h-[120px] bg-gray-50/50 rounded border border-gray-100"></div>
        ))}

        {/* Days */}
        {calendarData?.days?.map(day => (
          <div 
            key={day.date} 
            className={`p-2 min-h-[120px] border rounded relative flex flex-col ${
              new Date(day.date).getDay() === 0 || new Date(day.date).getDay() === 6 
                ? 'bg-gray-50 border-gray-200' 
                : 'bg-white border-gray-200'
            }`}
          >
            <div className="font-bold text-lg mb-2 text-right text-gray-700">
              {new Date(day.date).getDate()}
            </div>
            
            <div className="space-y-1 flex-1">
              {day.events?.map((event, idx) => {
                const eventType = EVENT_TYPES.find(t => t.value === (event.type?.toLowerCase() || event.type));
                return (
                  <div 
                    key={idx}
                    className={`text-[10px] px-1.5 py-1 rounded border leading-tight ${
                      event.status === 'cancelled'
                        ? 'bg-red-50 text-red-600 border-red-200 line-through'
                        : eventType?.color || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="font-bold">
                      {event.start_time} - {event.end_time}
                    </div>
                    <div className="truncate font-medium">
                      {event.group_name}
                    </div>
                    {event.location && (
                      <div className="truncate opacity-75">
                        {event.location}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex gap-6 text-sm text-gray-600 border-t border-gray-200 pt-4">
        {EVENT_TYPES.map(type => (
          <div key={type.value} className="flex items-center gap-2">
            <span className={`w-4 h-4 rounded border ${type.color.replace('text-', 'bg-').split(' ')[0]}`}></span>
            <span>{type.label}</span>
          </div>
        ))}
         <div className="flex items-center gap-2">
            <span className="w-4 h-4 rounded bg-red-50 border border-red-200"></span>
            <span>{t('cancelled_status') || 'Cancelled'}</span>
          </div>
      </div>
    </div>
  );
};

// ==================== CALENDAR VIEW ====================
function CalendarView({ calendarData, currentDate, changeMonth, onDayClick, onEventClick, canEdit, viewMode, setViewMode }) {
  const { t } = useLanguage();
  
  const DAY_NAMES_SHORT = [
    t('mon_short'), t('tue_short'), t('wed_short'), t('thu_short'), t('fri_short'), t('sat_short'), t('sun_short')
  ];

  const EVENT_TYPES = [
    { value: 'TRAINING', label: t('event_training'), icon: '🏋️', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    { value: 'GAME', label: t('event_game'), icon: '⚽', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { value: 'TOURNAMENT', label: t('event_tournament'), icon: '🏆', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { value: 'CHAMPIONSHIP', label: t('event_championship') || 'Чемпионат', icon: '🥇', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { value: 'INDIVIDUAL', label: t('event_individual') || 'Индивидуальная', icon: '🎯', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
    { value: 'PARENT_MEETING', label: t('event_parent_meeting') || 'Собрание', icon: '👨‍👩‍👧', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    { value: 'MEDICAL', label: t('event_medical') || 'Медосмотр', icon: '🏥', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    { value: 'TESTING', label: t('event_testing') || 'Тестирование', icon: '📊', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
    { value: 'REST', label: t('event_rest'), icon: '😴', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  ];

  const monthNames = [
    t('january'), t('february'), t('march'), t('april'), t('may'), t('june'), 
    t('july'), t('august'), t('september'), t('october'), t('november'), t('december')
  ];
  
  const today = new Date();
  const isToday = (dateStr) => {
    const d = new Date(dateStr);
    return d.toDateString() === today.toDateString();
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      {/* Month Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-center p-4 bg-white/5 border-b border-white/10 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
            <button
              onClick={() => changeMonth(-1)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10 transition-colors"
            >
              ← <span className="hidden md:inline">{t('prev_short')}</span>
            </button>
            <h3 className="text-xl font-bold text-white text-center">
              {monthNames[currentDate.getMonth()]} {calendarData?.year || currentDate.getFullYear()}
            </h3>
            <button
              onClick={() => changeMonth(1)}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10 transition-colors"
            >
              <span className="hidden md:inline">{t('next_short')}</span> →
            </button>
        </div>
        
        {/* View Toggle */}
        <button
            onClick={() => setViewMode(prev => prev === 'list' ? 'grid' : 'list')}
            className="w-full md:w-auto px-4 py-2 bg-white/10 border border-white/10 rounded-xl text-white hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
            title={viewMode === 'list' ? (t('switch_to_grid') || 'Показать календарь') : (t('switch_to_list') || 'Показать список')}
        >
            {viewMode === 'list' ? <CalendarIcon size={18} /> : <ListIcon size={18} />}
            <span>{viewMode === 'list' ? 'Календарь' : 'Список'}</span>
        </button>
      </div>

      {/* Calendar Grid & List */}
      <div className="p-4">
        {/* List View */}
        {viewMode === 'list' && (
        <div className="space-y-2">
          {calendarData?.days?.flatMap(d => d.events || []).length > 0 ? (
            calendarData.days.map(day => {
              if (!day.events || day.events.length === 0) return null;
              const isDayToday = isToday(day.date);
              
              return (
                <div key={day.date} className="space-y-1">
                  <div className={`text-xs font-bold ${isDayToday ? 'text-yellow-400' : 'text-white/60'} sticky top-0 bg-[#0F1117]/95 backdrop-blur py-1.5 z-10 px-1 border-b border-white/5`}>
                    {new Date(day.date).toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </div>
                  {day.events.map((event, idx) => {
                    const eventType = EVENT_TYPES.find(t => t.value === (event.type?.toLowerCase() || event.type));
                    return (
                      <div
                        key={`${day.date}-${idx}`}
                        onClick={() => onEventClick(event)}
                        className={`p-2 rounded-lg border ${
                          event.status === 'cancelled'
                            ? 'bg-red-500/10 border-red-500/30'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'
                        } flex items-center justify-between gap-2 active:scale-[0.98] transition-all`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${eventType?.color || 'bg-white/10 border-white/10'}`}>
                              {eventType?.icon} {eventType?.label}
                            </span>
                            <span className="text-white font-bold text-xs">
                              {event.start_time}-{event.end_time}
                            </span>
                          </div>
                          <div className="text-white/90 truncate font-medium text-xs">
                            {event.group_name}
                          </div>
                          {event.location && (
                            <div className="text-[10px] text-white/40 truncate flex items-center gap-1">
                              <span>📍</span> {event.location}
                            </div>
                          )}
                        </div>
                        {canEdit && <div className="text-white/20 text-xs">✏️</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })
          ) : (
            <div className="text-center py-12 text-white/50">
              <div className="text-4xl mb-2">📅</div>
              {t('no_events_month')}
            </div>
          )}
        </div>
        )}

        {/* Grid View */}
        {viewMode === 'grid' && (
        <div className="overflow-x-auto">
        <div className="w-full min-w-[600px] md:min-w-0">
          <div className="grid grid-cols-7 gap-1 mb-2">
            {DAY_NAMES_SHORT.map(d => (
              <div key={d} className="text-center font-medium text-white/50 py-2 text-sm">{d}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {/* Empty cells for first week offset */}
          {calendarData?.days?.[0]?.day_of_week > 0 && (
            Array(calendarData.days[0].day_of_week).fill(null).map((_, i) => (
              <div key={`empty-${i}`} className="p-2 min-h-[100px]"></div>
            ))
          )}
          
          {calendarData?.days?.length > 0 ? (
            calendarData.days.map(day => {
              const hasEvents = day.events?.length > 0;
              
              return (
                <div
                  key={day.date}
                  onClick={() => onDayClick(day)}
                  className={`p-2 min-h-[100px] rounded-xl cursor-pointer transition-all border ${
                    isToday(day.date)
                      ? 'bg-yellow-500/20 border-yellow-500/50 ring-2 ring-yellow-500/30'
                      : hasEvents
                        ? 'bg-white/5 border-white/10 hover:border-yellow-500/30 hover:bg-white/10'
                        : 'bg-white/[0.02] border-white/5 hover:bg-white/5'
                  }`}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday(day.date) ? 'text-yellow-400' : 'text-white/80'}`}>
                    {new Date(day.date).getDate()}
                  </div>
                  <div className="space-y-1">
                    {(day.events || []).slice(0, 3).map((event, idx) => {
                      const eventType = EVENT_TYPES.find(t => t.value === (event.type?.toLowerCase() || event.type));
                      return (
                        <div
                          key={idx}
                          onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                          className={`text-xs px-1.5 py-0.5 rounded truncate border ${
                            event.status === 'cancelled'
                              ? 'bg-red-500/20 text-red-400 border-red-500/30 line-through opacity-60'
                              : eventType?.color || 'bg-white/10 text-white/60 border-white/10'
                          } ${canEdit ? 'cursor-pointer hover:opacity-80' : ''}`}
                        >
                          {event.start_time} {event.group_name?.split(' ')[0] || ''}
                        </div>
                      );
                    })}
                    {day.events?.length > 3 && (
                      <div className="text-xs text-white/40 pl-1">+{day.events.length - 3}</div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-7 text-center py-16 text-white/50">
              <div className="text-4xl mb-2">📅</div>
              {t('no_events_month')}
            </div>
          )}
        </div>
        </div>
      </div>
      )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 p-4 border-t border-white/10 bg-white/[0.02]">
        {EVENT_TYPES.map(type => (
          <div key={type.value} className="flex items-center gap-2 text-xs">
            <span>{type.icon}</span>
            <span className="text-white/60">{type.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-3 h-3 rounded bg-red-500/30"></span>
          <span className="text-white/60">{t('cancelled_status')}</span>
        </div>
      </div>

    </div>
  );
}

// ==================== TRASH MODAL ====================
function TrashModal({ items, onClose, onRestore }) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-md p-6 animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            🗑️ {t('trash_title') || 'Корзина'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 flex items-center justify-center">
            ✕
          </button>
        </div>
        
        {items.length === 0 ? (
          <div className="text-center py-8 text-white/50">
            {t('trash_empty') || 'Корзина пуста'}
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {items.map(item => (
              <div key={item.id} className="p-3 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-white truncate">{item.name}</div>
                  <div className="text-xs text-white/50">
                    {t('deleted')}: {new Date(item.deleted_at).toLocaleDateString('ru')}
                  </div>
                </div>
                <button
                  onClick={() => onRestore(item.id)}
                  className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
                >
                  <span>↺</span> {t('restore') || 'Восстановить'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== TEMPLATES VIEW ====================
function TemplatesView({ templates, onEdit, onDelete, onGenerate, onToggleStatus, onCleanup, canEdit, onOpenTrash }) {
  const { t } = useLanguage();
  const DAY_NAMES_SHORT = [
    t('mon_short'), t('tue_short'), t('wed_short'), t('thu_short'), t('fri_short'), t('sat_short'), t('sun_short')
  ];

  if (templates.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
        <div className="text-5xl mb-4 opacity-50">📋</div>
        <p className="text-white/50 text-lg">{t('no_schedules')}</p>
        {canEdit && <p className="text-white/30 text-sm mt-2">{t('click_add_schedule')}</p>}
        {canEdit && (
          <button
            onClick={onOpenTrash}
            className="mt-6 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center gap-2"
          >
            <span>🗑️</span> {t('open_trash') || 'Корзина'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        {canEdit && (
          <button
            onClick={onOpenTrash}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center gap-2 text-sm"
          >
            <span>🗑️</span> {t('open_trash') || 'Корзина'}
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {templates.map(template => (
        <div
          key={template.id}
          className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 transition-all"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-b border-white/10 p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white">{template.name}</h3>
                <p className="text-sm text-white/50 mt-1">
                  {t('group')}: <span className="text-emerald-400 font-medium">{template.group_name}</span>
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                template.is_active 
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                  : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
              }`}>
                {template.is_active ? `✅ ${t('active')}` : `⏸️ ${t('inactive')}`}
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4">
            {/* Info */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-white/60">
                <span>📅</span>
                <span>{new Date(template.valid_from).toLocaleDateString('ru')} — {new Date(template.valid_until).toLocaleDateString('ru')}</span>
              </div>
              <div className="flex items-center gap-2 text-white/60">
                <span>📊</span>
                <span>{t('events')}: <span className="text-yellow-400 font-medium">{template.events_generated}</span></span>
              </div>
            </div>

            {/* Weekly Preview */}
            <div className="overflow-x-auto pb-2">
              <div className="grid grid-cols-7 gap-1 min-w-[300px]">
                {DAY_NAMES_SHORT.map((day, idx) => {
                  const dayRules = (template.schedule_rules || []).filter(r => r.day === idx);
                  return (
                    <div key={idx} className={`text-center p-2 rounded-lg ${dayRules.length > 0 ? 'bg-white/10 border border-white/10' : 'bg-white/5'}`}>
                      <div className="text-xs font-medium text-white/50 mb-1">{day}</div>
                      {dayRules.map((rule, rIdx) => (
                        <div key={rIdx} className="text-xs text-yellow-400 font-medium truncate">
                          {rule.start_time?.slice(0,5)}
                        </div>
                      ))}
                      {dayRules.length === 0 && <div className="text-xs text-white/20">—</div>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            {canEdit && (
              <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
                <div className="flex gap-2">
                  <button
                    onClick={() => onGenerate(template.id)}
                    className="flex-1 px-3 py-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-sm hover:bg-blue-500/30 transition-colors flex items-center justify-center gap-2"
                  >
                    <span>🚀</span> {t('generate_button') || 'Генерировать'}
                  </button>
                  <button
                    onClick={() => onCleanup(template.id)}
                    className="px-3 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-sm hover:bg-red-500/20 transition-colors"
                    title={t('cleanup_future') || 'Очистить будущие'}
                  >
                    🧹
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onToggleStatus(template)}
                    className={`flex-1 px-3 py-2 border rounded-xl text-sm transition-colors ${
                      template.is_active
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                    }`}
                    title={t('click_to_toggle')}
                  >
                    {template.is_active ? `⏸️ ${t('stop_template') || 'Пауза'}` : `▶️ ${t('restore_template') || 'Запуск'}`}
                  </button>
                  <button
                    onClick={() => onEdit(template)}
                    className="px-3 py-2 bg-white/5 text-white/70 border border-white/10 rounded-xl text-sm hover:bg-white/10 transition-colors"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => onDelete(template.id)}
                    className="px-3 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-sm hover:bg-red-500/30 transition-colors"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

// ==================== HISTORY VIEW ====================
function HistoryView({ changes }) {
  const { t } = useLanguage();
  
  const getChangeInfo = (type) => {
    switch (type) {
      case 'cancelled': return { icon: '❌', label: t('cancelled_status'), color: 'text-red-400 bg-red-500/10 border-red-500/30' };
      case 'rescheduled': return { icon: '🔄', label: t('rescheduled'), color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
      case 'location_changed': return { icon: '📍', label: t('location_changed'), color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' };
      case 'template_deleted': return { icon: '🗑️', label: t('template_deleted') || 'Шаблон удален', color: 'text-gray-400 bg-gray-500/10 border-gray-500/30' };
      default: return { icon: '🔄', label: type, color: 'text-white/60 bg-white/5 border-white/10' };
    }
  };

  if (changes.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
        <div className="text-5xl mb-4 opacity-50">📝</div>
        <p className="text-white/50 text-lg">{t('history_empty')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/[0.02]">
        <h3 className="font-bold text-white flex items-center gap-2">
          <span>📝</span> {t('history_title')} ({changes.length})
        </h3>
      </div>
      <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
        {changes.map((change, idx) => {
          const info = getChangeInfo(change.change_type);
          return (
            <div key={idx} className="p-4 hover:bg-white/[0.02] transition-colors">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${info.color}`}>
                    {info.icon} {info.label}
                  </span>
                  <span className="text-emerald-400 font-medium text-sm">{change.group_name}</span>
                </div>
                <span className="text-xs text-white/40">
                  {change.created_at ? new Date(change.created_at).toLocaleString('ru', { hour12: false }) : '—'}
                </span>
              </div>
              
              {change.reason && (
                <p className="text-sm text-white/70 mb-2">
                  <span className="text-white/50">{t('reason_label')}:</span> {change.reason}
                </p>
              )}
              
              {change.change_type === 'rescheduled' && change.old_start_time && change.new_start_time && (
                <div className="text-sm">
                  <span className="text-red-400/70 line-through">{new Date(change.old_start_time).toLocaleString('ru', { hour12: false })}</span>
                  <span className="mx-2 text-white/30">→</span>
                  <span className="text-emerald-400">{new Date(change.new_start_time).toLocaleString('ru', { hour12: false })}</span>
                </div>
              )}
              
              {change.change_type === 'location_changed' && (
                <div className="text-sm">
                  <span className="text-red-400/70 line-through">{change.old_location || '—'}</span>
                  <span className="mx-2 text-white/30">→</span>
                  <span className="text-emerald-400">{change.new_location}</span>
                </div>
              )}
              
              {change.changed_by_name && (
                <div className="text-xs text-white/40 mt-2">
                  👤 {change.changed_by_name}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== DAY MODAL ====================
function DayModal({ day, onClose, onEventClick, onAddEvent, onDeleteEvent, canEdit }) {
  const { t } = useLanguage();
  const DAY_NAMES = [
    t('monday'), t('tuesday'), t('wednesday'), t('thursday'), t('friday'), t('saturday'), t('sunday')
  ];
  
  const EVENT_TYPES = [
    { value: 'TRAINING', label: t('event_training'), icon: '🏋️', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    { value: 'GAME', label: t('event_game'), icon: '⚽', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { value: 'TOURNAMENT', label: t('event_tournament'), icon: '🏆', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { value: 'CHAMPIONSHIP', label: t('event_championship') || 'Чемпионат', icon: '🥇', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { value: 'INDIVIDUAL', label: t('event_individual') || 'Индивидуальная', icon: '🎯', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
    { value: 'PARENT_MEETING', label: t('event_parent_meeting') || 'Собрание', icon: '👨‍👩‍👧', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    { value: 'MEDICAL', label: t('event_medical') || 'Медосмотр', icon: '🏥', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    { value: 'TESTING', label: t('event_testing') || 'Тестирование', icon: '📊', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
    { value: 'REST', label: t('event_rest'), icon: '😴', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  ];

  const dateObj = new Date(day.date);
  const dayName = DAY_NAMES[dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-0 md:p-4" onClick={onClose}>
      <div className="bg-[#1C1E24] border-0 md:border border-white/10 w-full max-w-md flex flex-col h-full md:h-auto md:max-h-[90vh] md:rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-white/10 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-white">{dateObj.toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</h3>
            <p className="text-sm text-white/50">{dayName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 flex items-center justify-center">
            ✕
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {canEdit && (
            <button
              onClick={onAddEvent}
              className="w-full py-3 mb-4 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl hover:bg-yellow-500/20 transition-all flex items-center justify-center gap-2 font-medium"
            >
              <span>➕</span> {t('add_event') || 'Добавить событие'}
            </button>
          )}

          {(!day.events || day.events.length === 0) ? (
            <div className="text-center py-8 text-white/50">
              <div className="text-3xl mb-2">📭</div>
              {t('no_events_day')}
            </div>
          ) : (
            <div className="space-y-2">
              {day.events.map((event, idx) => {
                const eventType = EVENT_TYPES.find(t => t.value === (event.type?.toLowerCase() || event.type));
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border ${
                      event.status === 'cancelled'
                        ? 'bg-red-500/10 border-red-500/30'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    } transition-colors`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs border ${eventType?.color || 'bg-white/10 border-white/10'}`}>
                            {eventType?.icon} {eventType?.label}
                          </span>
                          {event.status === 'cancelled' && (
                            <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-xs">{t('cancelled_status')}</span>
                          )}
                        </div>
                        <div className="text-white font-medium">{event.start_time} — {event.end_time}</div>
                        <div className="text-sm text-white/60">{event.group_name}</div>
                        {event.location && <div className="text-sm text-white/40 mt-1">📍 {event.location}</div>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => onEventClick(event)}
                            className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 flex items-center justify-center text-sm"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => onDeleteEvent(event.id)}
                            className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 flex items-center justify-center text-sm"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== CREATE EVENT MODAL ====================
function CreateEventModal({ date, groups, onClose, onSave, selectedGroupId }) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    group_id: selectedGroupId || '',
    date: date || new Date().toISOString().split('T')[0],
    start_time: '18:00',
    end_time: '19:30',
    type: 'TRAINING',
    location: '',
    notes: '',
    send_notification: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  const EVENT_TYPES = [
    { value: 'TRAINING', label: t('event_training'), icon: '🏋️' },
    { value: 'GAME', label: t('event_game'), icon: '⚽' },
    { value: 'TOURNAMENT', label: t('event_tournament'), icon: '🏆' },
    { value: 'CHAMPIONSHIP', label: t('event_championship') || 'Чемпионат', icon: '🥇' },
    { value: 'INDIVIDUAL', label: t('event_individual') || 'Индивидуальная', icon: '🎯' },
    { value: 'PARENT_MEETING', label: t('event_parent_meeting') || 'Собрание', icon: '👨‍👩‍👧' },
    { value: 'MEDICAL', label: t('event_medical') || 'Медосмотр', icon: '🏥' },
    { value: 'TESTING', label: t('event_testing') || 'Тестирование', icon: '📊' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.group_id) {
       alert(t('select_group_warning') || 'Выберите группу');
       return;
    }

    setSaving(true);
    try {
      const startDateTime = `${formData.date}T${formData.start_time}:00`;
      const endDateTime = `${formData.date}T${formData.end_time}:00`;

      await eventsAPI.create({
        group_id: parseInt(formData.group_id),
        start_time: startDateTime,
        end_time: endDateTime,
        type: formData.type,
        location: formData.location,
        notes: formData.notes,
        status: 'scheduled',
        send_notification: formData.send_notification
      });
      onSave();
    } catch (error) {
      alert('Error: ' + getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-0 md:p-4" onClick={onClose}>
      <div className="bg-[#1C1E24] border-0 md:border border-white/10 w-full max-w-md flex flex-col h-full md:h-auto md:max-h-[90vh] md:rounded-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-white/10 shrink-0">
          <h3 className="text-lg font-bold text-white">➕ {t('add_event') || 'Новое событие'}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 flex items-center justify-center">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1 pb-safe">
          <div>
            <label className="block text-sm text-white/70 mb-2">{t('group_required')}</label>
            <select
              value={formData.group_id}
              onChange={(e) => setFormData({...formData, group_id: e.target.value ? parseInt(e.target.value) : ''})}
              className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
              required
            >
              <option value="">{t('select_group_placeholder')}</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-2">{t('type')}</label>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map(type => (
                <label key={type.value} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer border ${formData.type === type.value ? 'bg-yellow-500/20 border-yellow-500/50' : 'bg-white/5 border-white/10'}`}>
                  <input
                    type="radio"
                    name="eventType"
                    value={type.value}
                    checked={formData.type === type.value}
                    onChange={(e) => setFormData({...formData, type: e.target.value})}
                    className="hidden"
                  />
                  <span>{type.icon}</span>
                  <span className="text-sm text-white">{type.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('start_time')}</label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({...formData, start_time: e.target.value})}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('end_time')}</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({...formData, end_time: e.target.value})}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-2">{t('location')}</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({...formData, location: e.target.value})}
              placeholder={t('location_placeholder') || 'Место проведения'}
              className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50"
            />
          </div>

          {/* Notification Checkbox */}
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <input
              type="checkbox"
              checked={formData.send_notification}
              onChange={(e) => setFormData({...formData, send_notification: e.target.checked})}
              className="w-5 h-5 rounded accent-yellow-500"
            />
            <span className="text-sm text-white/80">📨 {t('notify_parents') || 'Оповестить родителей'}</span>
          </label>

          <div className="flex gap-2 mt-4 mb-6 md:mb-0">
             <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-white/70 rounded-xl hover:bg-white/10 transition-all"
            >
              {t('cancel_button') || 'Отмена'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
            >
              {saving ? '⏳...' : t('create_button') || 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== EVENT MODAL ====================
function EventModal({ event, onClose, onSave, onDelete }) {
  const { t } = useLanguage();
  const [action, setAction] = useState('cancel');
  const [reason, setReason] = useState('');
  const [newStartTime, setNewStartTime] = useState(event.start_time || '');
  const [newEndTime, setNewEndTime] = useState(event.end_time || '');
  const [newLocation, setNewLocation] = useState(event.location || '');
  const [trainingPlan, setTrainingPlan] = useState(event.training_plan || '');
  const [sendSms, setSendSms] = useState(true);
  const [updateFuture, setUpdateFuture] = useState(false);
  const [saving, setSaving] = useState(false);

  // Event type definitions with icons
  const EVENT_TYPES = [
    { value: 'TRAINING', label: t('event_training'), icon: '🏋️', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    { value: 'GAME', label: t('event_game'), icon: '⚽', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { value: 'TOURNAMENT', label: t('event_tournament'), icon: '🏆', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { value: 'CHAMPIONSHIP', label: t('event_championship') || 'Чемпионат', icon: '🥇', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { value: 'INDIVIDUAL', label: t('event_individual') || 'Индивидуальная', icon: '🎯', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
    { value: 'PARENT_MEETING', label: t('event_parent_meeting') || 'Собрание', icon: '👨‍👩‍👧', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    { value: 'MEDICAL', label: t('event_medical') || 'Медосмотр', icon: '🏥', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    { value: 'TESTING', label: t('event_testing') || 'Тестирование', icon: '📊', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
    { value: 'REST', label: t('event_rest'), icon: '😴', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  ];

  const eventTypeInfo = EVENT_TYPES.find(et => et.value === event.type) || EVENT_TYPES[0];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason || reason.length < 3) {
      alert(t('reason_required'));
      return;
    }
    
    setSaving(true);
    try {
      // Build datetime from event date
      const eventDate = event.date || new Date().toISOString().split('T')[0];
      
      await scheduleAPI.updateEvent(event.id, {
        changeType: action,
        reason,
        newStartTime: action === 'reschedule' ? `${eventDate}T${newStartTime}:00` : null,
        newEndTime: action === 'reschedule' ? `${eventDate}T${newEndTime}:00` : null,
        newLocation: action === 'change_location' ? newLocation : null,
        trainingPlan: action === 'update_details' ? trainingPlan : null,
        sendSms,
        updateFuture
      });
      onSave();
    } catch (error) {
      alert('Error: ' + getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const actions = [
    { id: 'cancel', label: t('cancel_action'), icon: '❌', desc: t('cancel_desc') },
    { id: 'reschedule', label: t('reschedule_action'), icon: '🔄', desc: t('reschedule_desc') },
    { id: 'change_location', label: t('change_location_action'), icon: '📍', desc: t('change_location_desc') },
    { id: 'update_details', label: t('edit_details') || 'Редактировать детали', icon: '📝', desc: t('edit_details_desc') || 'Изменить заметки или план тренировки' },
  ];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-0 md:p-4" onClick={onClose}>
      <div className="bg-[#1C1E24] border-0 md:border border-white/10 w-full max-w-md h-full md:h-auto md:max-h-[90vh] md:rounded-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-white/10 bg-[#1C1E24] z-10 shrink-0 md:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{eventTypeInfo.icon}</span>
            <div>
              <h3 className="text-lg font-bold text-white">{eventTypeInfo.label}</h3>
              <p className="text-xs text-white/50">{t('editing_title')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 flex items-center justify-center">
            ✕
          </button>
        </div>
        
        {/* Event Info */}
        <div className="p-4 bg-white/5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 rounded-lg text-xs font-medium border ${eventTypeInfo.color}`}>
              {eventTypeInfo.icon} {eventTypeInfo.label}
            </span>
          </div>
          <div className="text-sm text-white/70">
            <span className="text-yellow-400 font-medium">{event.group_name}</span>
            <span className="mx-2">•</span>
            <span>{event.date}</span>
            <span className="mx-2">•</span>
            <span>{event.start_time} — {event.end_time}</span>
          </div>
          {event.location && <div className="text-sm text-white/50 mt-1">📍 {event.location}</div>}
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 pb-24 overflow-y-auto flex-1">
          {/* Action Selection */}
          <div className="space-y-2">
            {actions.map(a => (
              <label
                key={a.id}
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                  action === a.id
                    ? 'bg-yellow-500/20 border-yellow-500/50'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <input type="radio" name="action" value={a.id} checked={action === a.id} onChange={() => setAction(a.id)} className="hidden" />
                <span className="text-lg">{a.icon}</span>
                <div>
                  <div className="font-medium text-white">{a.label}</div>
                  <div className="text-xs text-white/50">{a.desc}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm text-white/70 mb-2">{t('reason_required')}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('reason_placeholder')}
              className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50"
              rows={2}
              required
            />
          </div>

          {/* Reschedule Time */}
          {action === 'reschedule' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-white/70 mb-2">{t('new_start_label')}</label>
                <input
                  type="time"
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-white/70 mb-2">{t('new_end_label')}</label>
                <input
                  type="time"
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                  required
                />
              </div>
            </div>
          )}

          {/* New Location */}
          {action === 'change_location' && (
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('change_location_desc')}</label>
              <input
                type="text"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                placeholder="Поле 2, Зал 3..."
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50"
                required
              />
            </div>
          )}

          {/* Training Plan / Details */}
          {action === 'update_details' && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-white/70 mb-2">{t('training_plan') || 'План тренировки'}</label>
                <textarea
                  value={trainingPlan}
                  onChange={(e) => setTrainingPlan(e.target.value)}
                  placeholder={t('training_plan_placeholder') || '1. Разминка...'}
                  className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 min-h-[150px]"
                />
              </div>
            </div>
          )}

          {/* Future Events Option */}
          {event.is_from_template && (
            <label className="flex items-center gap-3 cursor-pointer p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
              <input
                type="checkbox"
                checked={updateFuture}
                onChange={(e) => setUpdateFuture(e.target.checked)}
                className="w-5 h-5 rounded accent-yellow-500"
              />
              <div>
                <div className="font-medium text-white">{t('apply_to_future') || 'Применить ко всем будущим'}</div>
                <div className="text-xs text-white/50">{t('apply_to_future_desc') || 'Изменить это и все последующие события серии'}</div>
              </div>
            </label>
          )}

          {/* SMS Option */}
          <label className="flex items-center gap-3 cursor-pointer p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <input
              type="checkbox"
              checked={sendSms}
              onChange={(e) => setSendSms(e.target.checked)}
              className="w-5 h-5 rounded accent-yellow-500"
            />
            <span className="text-sm text-white/80">📨 {t('send_sms_label')}</span>
          </label>

          {/* Buttons */}
          <div className="flex gap-2 pt-2 mb-6 md:mb-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-white/70 rounded-xl hover:bg-white/10 transition-all"
            >
              {t('cancel_button')}
            </button>
            <button
              type="button"
              onClick={() => onDelete(event.id)}
              className="px-4 py-3 bg-red-500/20 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-500/30 transition-all"
            >
              🗑️
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50"
            >
              {saving ? '⏳...' : `✅ ${t('apply_button')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==================== TEMPLATE MODAL ====================
function TemplateModal({ template, groups, onClose, onSave, selectedGroupId }) {
  const { t } = useLanguage();
  const DAY_NAMES = [
    t('monday'), t('tuesday'), t('wednesday'), t('thursday'), t('friday'), t('saturday'), t('sunday')
  ];
  const DAY_NAMES_SHORT = [
    t('mon_short'), t('tue_short'), t('wed_short'), t('thu_short'), t('fri_short'), t('sat_short'), t('sun_short')
  ];
  
  const EVENT_TYPES = [
    { value: 'TRAINING', label: t('event_training'), icon: '🏋️', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    { value: 'GAME', label: t('event_game'), icon: '⚽', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    { value: 'TOURNAMENT', label: t('event_tournament'), icon: '🏆', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    { value: 'CHAMPIONSHIP', label: t('event_championship') || 'Чемпионат', icon: '🥇', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    { value: 'INDIVIDUAL', label: t('event_individual') || 'Индивидуальная', icon: '🎯', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
    { value: 'PARENT_MEETING', label: t('event_parent_meeting') || 'Собрание', icon: '👨‍👩‍👧', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
    { value: 'MEDICAL', label: t('event_medical') || 'Медосмотр', icon: '🏥', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
    { value: 'TESTING', label: t('event_testing') || 'Тестирование', icon: '📊', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
    { value: 'REST', label: t('event_rest'), icon: '😴', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  ];

  const [formData, setFormData] = useState({
    group_id: template?.group_id || selectedGroupId || '',
    name: template?.name || '',
    valid_from: template?.valid_from?.split('T')[0] || new Date().toISOString().split('T')[0],
    valid_until: template?.valid_until?.split('T')[0] || new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
    schedule_rules: template?.schedule_rules || [],
    excluded_dates: template?.excluded_dates || [],
    is_active: template ? template.is_active : false
  });
  const [newRule, setNewRule] = useState({ day: 0, start_time: '17:00', end_time: '18:30', type: 'TRAINING', location: '' });
  const [editingRuleIndex, setEditingRuleIndex] = useState(null);
  const [newExclusion, setNewExclusion] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [regenerateFuture, setRegenerateFuture] = useState(false);

  // Auto-fill name based on group selection
  useEffect(() => {
    if (!template && formData.group_id && groups.length > 0) {
      const group = groups.find(g => g.id === parseInt(formData.group_id));
      if (group && (!formData.name || formData.name.startsWith('Расписание') || formData.name.startsWith('Schedule'))) {
         setFormData(prev => ({ ...prev, name: `Расписание ${group.name}` }));
      }
    }
  }, [formData.group_id, groups, template]);

  // Sync group_id if selectedGroupId provided and form is empty
  useEffect(() => {
    if (selectedGroupId && !formData.group_id && !template) {
       setFormData(prev => ({ ...prev, group_id: selectedGroupId }));
    }
  }, [selectedGroupId, template]);

  // Quick Fill Modal State
  const [showQuickFillDialog, setShowQuickFillDialog] = useState(false);
  const [quickFillDays, setQuickFillDays] = useState([]);
  const [quickFillTime, setQuickFillTime] = useState({ start: '17:00', end: '18:30' });

  const calcEndTime = (start, mins = 90) => {
    const [h, m] = start.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  const addRule = () => {
    if (editingRuleIndex !== null) {
      // Update existing rule
      setFormData(prev => {
        const updatedRules = [...prev.schedule_rules];
        updatedRules[editingRuleIndex] = { ...newRule };
        return { ...prev, schedule_rules: updatedRules };
      });
      setEditingRuleIndex(null);
    } else {
      // Add new rule
      setFormData(prev => ({
        ...prev,
        schedule_rules: [...prev.schedule_rules, { ...newRule }]
      }));
    }
    // Reset form
    setNewRule({ day: 0, start_time: '17:00', end_time: '18:30', type: 'TRAINING', location: '' });
  };

  const editRule = (idx) => {
    setEditingRuleIndex(idx);
    setNewRule({ ...formData.schedule_rules[idx] });
  };

  const cancelEditRule = () => {
    setEditingRuleIndex(null);
    setNewRule({ day: 0, start_time: '17:00', end_time: '18:30', type: 'TRAINING', location: '' });
  };

  const removeRule = (idx) => {
    if (editingRuleIndex === idx) {
      cancelEditRule();
    }
    setFormData(prev => ({
      ...prev,
      schedule_rules: prev.schedule_rules.filter((_, i) => i !== idx)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.group_id || !formData.name) {
      setError(t('fill_required_fields'));
      return;
    }
    if (formData.schedule_rules.length === 0) {
      setError(t('add_one_rule'));
      return;
    }

    setSaving(true);
    try {
      const data = {
        ...formData,
        group_id: parseInt(formData.group_id),
        valid_from: new Date(formData.valid_from).toISOString(),
        valid_until: new Date(formData.valid_until).toISOString(),
        is_active: formData.is_active
      };

      if (template) {
        await scheduleAPI.updateTemplate(template.id, {
          ...data,
          regenerate_future: regenerateFuture
        });
      } else {
        await scheduleAPI.createTemplate(data);
      }
      onSave();
    } catch (err) {
      setError(getErrorMessage(err, t('save_error')));
    } finally {
      setSaving(false);
    }
  };

  const quickFill = (days) => {
    setQuickFillDays(days);
    setQuickFillTime({ start: newRule.start_time, end: newRule.end_time });
    setShowQuickFillDialog(true);
  };

  const confirmQuickFill = () => {
    const rules = quickFillDays.map(day => ({
      day,
      start_time: quickFillTime.start,
      end_time: quickFillTime.end,
      type: 'TRAINING',
      location: ''
    }));
    setFormData(prev => ({ ...prev, schedule_rules: [...prev.schedule_rules, ...rules] }));
    setShowQuickFillDialog(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
        
        {/* Quick Fill Time Dialog */}
        {showQuickFillDialog && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in rounded-2xl">
            <div className="bg-[#1C1E24] border border-yellow-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
              <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                ⚡ {t('quick_fill_time') || 'Время для быстрого заполнения'}
              </h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/70 mb-2">{t('start_time') || 'Начало'}</label>
                  <input
                    type="time"
                    value={quickFillTime.start}
                    onChange={(e) => {
                       const newStart = e.target.value;
                       setQuickFillTime(prev => ({
                         ...prev,
                         start: newStart,
                         end: calcEndTime(newStart, 90) // Default 90 min duration
                       }));
                    }}
                    className="w-full px-4 py-2 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:border-yellow-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/70 mb-2">{t('end_time') || 'Конец'}</label>
                  <input
                    type="time"
                    value={quickFillTime.end}
                    onChange={(e) => setQuickFillTime(prev => ({...prev, end: e.target.value}))}
                    className="w-full px-4 py-2 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:border-yellow-500/50"
                  />
                </div>
                
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickFillDialog(false)}
                    className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:bg-white/10"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={confirmQuickFill}
                    className="flex-1 px-4 py-2 bg-yellow-500 text-black font-semibold rounded-xl hover:bg-yellow-400"
                  >
                    {t('apply') || 'Применить'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-[#1C1E24] flex justify-between items-center p-4 border-b border-white/10 z-10 shrink-0 rounded-t-2xl">
          <h3 className="text-lg font-bold text-white">
            {template ? `✏️ ${t('edit_template_title')}` : `➕ ${t('new_template_title')}`}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/5 text-white/60 hover:bg-white/10 flex items-center justify-center">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4 pb-24 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              ❌ {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('group_required')}</label>
              <select
                value={formData.group_id}
                onChange={(e) => setFormData({...formData, group_id: e.target.value ? parseInt(e.target.value) : ''})}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                required
              >
                <option value="">{t('select_group_placeholder')}</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('name_required')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder={t('name_placeholder')}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('from_date')}</label>
              <input
                type="date"
                value={formData.valid_from}
                onChange={(e) => setFormData({...formData, valid_from: e.target.value})}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('to_date')}</label>
              <input
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData({...formData, valid_until: e.target.value})}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
              />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
              className="w-5 h-5 rounded accent-yellow-500"
            />
            <div>
              <div className="font-medium text-white">{t('template_active') || 'Активен'}</div>
              <div className="text-xs text-white/50">{t('template_active_desc') || 'Сразу готов к генерации событий'}</div>
            </div>
          </label>

          {/* Schedule Rules */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <label className="block text-sm font-medium text-white mb-3">📋 {t('daily_schedule')}</label>
            
            {/* Existing Rules */}
            <div className="space-y-2 mb-4">
              {formData.schedule_rules.map((rule, idx) => (
                <div key={idx} className={`flex items-center gap-2 border p-2 rounded-lg flex-wrap ${editingRuleIndex === idx ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}>
                  <span className="text-yellow-400 font-medium text-sm min-w-[80px]">{DAY_NAMES_SHORT[rule.day]}</span>
                  <span className="text-white/70 text-sm">{rule.start_time} — {rule.end_time}</span>
                  <span className={`text-xs px-2 py-0.5 rounded border ${EVENT_TYPES.find(t => t.value === rule.type)?.color || ''}`}>
                    {EVENT_TYPES.find(t => t.value === rule.type)?.icon}
                  </span>
                  {rule.location && <span className="text-xs text-white/50">📍 {rule.location}</span>}
                  <div className="ml-auto flex gap-1">
                    <button type="button" onClick={() => editRule(idx)} className="text-blue-400 hover:text-blue-300 px-2">✏️</button>
                    <button type="button" onClick={() => removeRule(idx)} className="text-red-400 hover:text-red-300 px-2">✕</button>
                  </div>
                </div>
              ))}
              {formData.schedule_rules.length === 0 && (
                <p className="text-white/30 text-sm text-center py-4">{t('add_training_days')}</p>
              )}
            </div>

            {/* Add Rule */}
            <div className="flex items-center gap-2 flex-wrap bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg">
              <select
                value={newRule.day}
                onChange={(e) => setNewRule({...newRule, day: parseInt(e.target.value)})}
                className="px-3 py-1.5 bg-[#0F1117] border border-white/10 rounded-lg text-sm text-white"
              >
                {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
              </select>
              <input
                type="time"
                value={newRule.start_time}
                onChange={(e) => {
                  const newStart = e.target.value;
                  // Calculate current duration
                  let duration = 90;
                  if (newRule.start_time && newRule.end_time) {
                     const [h1, m1] = newRule.start_time.split(':').map(Number);
                     const [h2, m2] = newRule.end_time.split(':').map(Number);
                     duration = (h2 * 60 + m2) - (h1 * 60 + m1);
                     if (duration < 0) duration += 24 * 60;
                  }
                  // If duration is reasonable (e.g. not 0), preserve it. Otherwise default to 90.
                  const newDuration = duration > 0 ? duration : 90;
                  
                  setNewRule({
                    ...newRule, 
                    start_time: newStart, 
                    end_time: calcEndTime(newStart, newDuration)
                  });
                }}
                className="px-3 py-1.5 bg-[#0F1117] border border-white/10 rounded-lg text-sm text-white"
              />
              <span className="text-white/30">—</span>
              <input
                type="time"
                value={newRule.end_time}
                onChange={(e) => setNewRule({...newRule, end_time: e.target.value})}
                className="px-3 py-1.5 bg-[#0F1117] border border-white/10 rounded-lg text-sm text-white"
              />
              
              {/* Duration Presets */}
              <div className="flex gap-1">
                 {[45, 60, 90, 120].map(mins => (
                   <button
                     key={mins}
                     type="button"
                     onClick={() => setNewRule({...newRule, end_time: calcEndTime(newRule.start_time, mins)})}
                     className="px-2 py-1 bg-white/5 hover:bg-white/10 text-xs text-white/50 hover:text-white rounded border border-white/5 transition-colors"
                     title={`${mins} мин`}
                   >
                     {mins}
                   </button>
                 ))}
              </div>

              <select
                value={newRule.type}
                onChange={(e) => setNewRule({...newRule, type: e.target.value})}
                className="px-3 py-1.5 bg-[#0F1117] border border-white/10 rounded-lg text-sm text-white"
              >
                {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
              <button
                type="button"
                onClick={addRule}
                className={`px-4 py-1.5 font-medium rounded-lg text-sm transition-colors ${
                  editingRuleIndex !== null 
                    ? 'bg-blue-500 text-white hover:bg-blue-400' 
                    : 'bg-yellow-500 text-black hover:bg-yellow-400'
                }`}
              >
                {editingRuleIndex !== null ? '💾' : '➕'}
              </button>
              {editingRuleIndex !== null && (
                <button
                  type="button"
                  onClick={cancelEditRule}
                  className="px-3 py-1.5 bg-white/10 text-white/70 hover:text-white rounded-lg text-sm hover:bg-white/20"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Fill */}
            <div className="flex gap-2 mt-3 flex-wrap">
              <span className="text-xs text-white/50">{t('quick_fill')}:</span>
              <button type="button" onClick={() => quickFill([0,1,2,3,4])} className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30">{t('mon_fri')}</button>
              <button type="button" onClick={() => quickFill([0,2,4])} className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30">{t('mon_wed_fri')}</button>
              <button type="button" onClick={() => quickFill([1,3])} className="text-xs px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30">{t('tue_thu')}</button>
              <button type="button" onClick={() => setFormData(p => ({...p, schedule_rules: []}))} className="text-xs px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30">{t('clear_button')}</button>
            </div>
          </div>

          {/* Exclusions */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <label className="block text-sm font-medium text-white mb-3">🚫 {t('exclusions_label')}</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {formData.excluded_dates.map(date => (
                <span key={date} className="inline-flex items-center gap-2 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm">
                  {date}
                  <button type="button" onClick={() => setFormData(p => ({...p, excluded_dates: p.excluded_dates.filter(d => d !== date)}))} className="hover:text-red-300">✕</button>
                </span>
              ))}
              {formData.excluded_dates.length === 0 && <span className="text-white/30 text-sm">{t('no_exclusions')}</span>}
            </div>
            <div className="flex gap-2">
              <input
                type="date"
                value={newExclusion}
                onChange={(e) => setNewExclusion(e.target.value)}
                className="px-3 py-1.5 bg-[#0F1117] border border-white/10 rounded-lg text-sm text-white"
              />
              <button
                type="button"
                onClick={() => {
                  if (newExclusion && !formData.excluded_dates.includes(newExclusion)) {
                    setFormData(p => ({...p, excluded_dates: [...p.excluded_dates, newExclusion]}));
                    setNewExclusion('');
                  }
                }}
                className="px-4 py-1.5 bg-white/5 border border-white/10 text-white/70 rounded-lg text-sm hover:bg-white/10"
              >
                ➕
              </button>
            </div>
          </div>

          {/* Regenerate Option (Only for edit) */}
          {template && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={regenerateFuture}
                  onChange={(e) => setRegenerateFuture(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded accent-yellow-500"
                />
                <div>
                  <div className="text-sm font-medium text-white">{t('generate_update_events')}</div>
                  <div className="text-xs text-white/50">{t('generate_update_events_desc')}</div>
                </div>
              </label>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-white/70 rounded-xl hover:bg-white/10"
            >
              {t('cancel_button')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-semibold rounded-xl hover:shadow-lg disabled:opacity-50"
            >
              {saving ? `⏳ ${t('saving')}` : `💾 ${t('save_button')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
