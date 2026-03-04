import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { attendanceAPI, eventsAPI, studentsAPI, groupsAPI, authAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { Download, FileText, Loader2 } from 'lucide-react';

export default function Attendance() {
  const { t, language } = useLanguage();
  const location = useLocation();
  const printRef = useRef(null);
  const [isExporting] = useState(false);
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({}); // groupId -> true/false
  const [groupAttendance, setGroupAttendance] = useState({}); // groupId -> {studentId -> status}
  const [originalAttendance, setOriginalAttendance] = useState({}); // groupId -> {studentId -> status}
  const [loading, setLoading] = useState(true);
  const [savingGroups, setSavingGroups] = useState({}); // groupId -> true/false
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Calendar State
  const [viewDate, setViewDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  
  // 🆕 Режим отображения: 'daily' | 'monthly'
  const [viewMode, setViewMode] = useState('daily');
  const [showCalendar, setShowCalendar] = useState(true); // 🆕 Toggle for calendar visibility
  
  // 🆕 Данные табеля за месяц
  const [selectedGroupForReport, setSelectedGroupForReport] = useState(null);
  const [monthlyReport, setMonthlyReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load user first to get role
        let userData = null;
        try {
            const userRes = await authAPI.getMe();
            userData = userRes.data;
            setUser(userData);
        } catch (e) {
            console.error("Auth failed", e);
            setErrorMessage('Ошибка авторизации');
            setLoading(false);
            return;
        }

        // Load others in parallel, tolerating failures
        const [evRes, stRes, grRes] = await Promise.allSettled([
          eventsAPI.getAll(),
          studentsAPI.getAll(),
          groupsAPI.getAll()
        ]);

        if (evRes.status === 'fulfilled') {
          const rawEvents = evRes.value.data?.data || evRes.value.data || [];
          const sortedEvents = Array.isArray(rawEvents) ? rawEvents.sort((a, b) => 
            new Date(b.start_time || b.event_date) - new Date(a.start_time || a.event_date)
          ) : [];
          setEvents(sortedEvents);
        } else {
            console.error("Events load failed", evRes.reason);
        }

        if (stRes.status === 'fulfilled') {
           setStudents(stRes.value.data?.data || stRes.value.data || []);
        } else {
            console.error("Students load failed", stRes.reason);
        }

        if (grRes.status === 'fulfilled') {
           setGroups(grRes.value.data?.data || grRes.value.data || []);
        } else {
             console.error("Groups load failed", grRes.reason);
        }

      } catch (error) {
        console.error('Error loading data:', error);
        setErrorMessage('Ошибка загрузки данных. Проверьте подключение.');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Загрузка табеля при выборе группы
  useEffect(() => {
    const loadReport = async () => {
      if (viewMode === 'monthly' && selectedGroupForReport) {
        setReportLoading(true);
        try {
          const response = await attendanceAPI.getMonthlyReport(
            selectedGroupForReport, 
            viewDate.getFullYear(), 
            viewDate.getMonth() + 1
          );
          setMonthlyReport(response.data);
        } catch (error) {
          console.error('Error loading monthly report:', error);
          setErrorMessage('Ошибка загрузки табеля');
          setTimeout(() => setErrorMessage(''), 3000);
        } finally {
          setReportLoading(false);
        }
      }
    };
    loadReport();
  }, [viewMode, selectedGroupForReport, viewDate]);

  // 🌟 Статистика посещений за месяц для каждой группы
  const [groupMonthlyStats, setGroupMonthlyStats] = useState({}); // groupId -> { studentId -> { present, absent, total } }
  
  // 🗓️ Schedule Export State
  const schedulePrintRef = useRef(null);
  const [scheduleExportGroup, setScheduleExportGroup] = useState('all');

  // Helper to get events for the current view month
  const getEventsForMonth = (date, groupId = 'all') => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    let filtered = events.filter(e => {
      const eDate = new Date(e.start_time || e.event_date);
      return eDate.getFullYear() === year && eDate.getMonth() === month;
    });

    if (groupId !== 'all') {
      filtered = filtered.filter(e => e.group_id === parseInt(groupId));
    }

    return filtered.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  };

  const handleScheduleExport = async (type) => {
    const currentEvents = getEventsForMonth(viewDate, scheduleExportGroup);
    
    if (currentEvents.length === 0) {
      setErrorMessage(t('no_events_to_export') || 'Нет событий для экспорта');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    const monthName = viewDate.toLocaleDateString(language === 'ru' ? 'ru-RU' : (language === 'ro' ? 'ro-RO' : 'en-US'), { month: 'long' });
    const year = viewDate.getFullYear();
    const groupName = scheduleExportGroup === 'all' 
      ? (t('all_academy') || 'Вся академия') 
      : groups.find(g => g.id === parseInt(scheduleExportGroup))?.name || t('group');
    
    const filename = `${t('schedule_filename')}_${groupName}_${monthName}_${year}`.replace(/\s+/g, '_');

    const columns = {
      date: t('date') || 'Дата',
      weekday: t('weekday') || 'День недели',
      time: t('time') || 'Время',
      group: t('group') || 'Группа',
      type: t('type') || 'Тип',
      location: t('location') || 'Локация'
    };

    const dataToExport = currentEvents.map(ev => {
      const date = new Date(ev.start_time);
      const endDate = new Date(ev.end_time);
      const group = groups.find(g => g.id === ev.group_id);
      const dateLocale = language === 'ru' ? 'ru-RU' : (language === 'ro' ? 'ro-RO' : 'en-US');
      
      return {
        date: date.toLocaleDateString(dateLocale),
        weekday: date.toLocaleDateString(dateLocale, { weekday: 'long' }),
        time: `${date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', hour12: false })} - ${endDate.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', hour12: false })}`,
        group: group?.name || 'Unknown',
        type: ev.type === 'game' ? (t('event_game') || 'Игра') : (t('event_training') || 'Тренировка'),
        location: ev.location || '-'
      };
    });

    if (type === 'excel') {
      exportToExcel(dataToExport, columns, filename);
    } else {
      exportToPDF(dataToExport, columns, filename, `${t('schedule_filename')}: ${groupName} - ${monthName} ${year}`);
    }
  };

  // 📥 Экспорт табеля
  const handleExport = async (type = 'excel') => {
    if (!monthlyReport || !monthlyReport.students) return;
    
    const filename = `${t('attendance_filename')}_${monthlyReport.group_name}_${monthlyReport.month_name}_${monthlyReport.year}`;

    // Формируем колонки: ФИО, даты (1-31), итоговая статистика
    const columns = {
      full_name: t('student') || 'Ученик'
    };
    
    // Добавляем даты тренировок как колонки
    monthlyReport.training_dates.forEach(td => {
      // Fix date format issues (e.g. "25 февраляWed")
      let weekday = td.weekday;
      
      // Simple translation map for weekdays if they come in English
      const weekdayMap = {
        'Mon': 'Пн', 'Tue': 'Вт', 'Wed': 'Ср', 'Thu': 'Чт', 'Fri': 'Пт', 'Sat': 'Сб', 'Sun': 'Вс',
        'Monday': 'Пн', 'Tuesday': 'Вт', 'Wednesday': 'Ср', 'Thursday': 'Чт', 'Friday': 'Пт', 'Saturday': 'Сб', 'Sunday': 'Вс'
      };
      
      if (language === 'ru' && weekdayMap[weekday]) {
        weekday = weekdayMap[weekday];
      }
      
      columns[`date_${td.id}`] = `${td.day} (${weekday})`;
    });
    
    // Итоговые колонки
    columns.present_count = t('present') || 'Присутствовал';
    columns.absent_count = t('absent') || 'Отсутствовал';
    columns.attendance_rate = '%';
    
    // Формируем данные
    const dataToExport = monthlyReport.students.map(student => {
      const row = {
        full_name: `${student.last_name} ${student.first_name}`
      };
      
      // Заполняем статусы по датам
      monthlyReport.training_dates.forEach(td => {
        const status = student.attendance[td.id];
        let statusText = '-';
        if (status === 'present') statusText = '✓';
        else if (status === 'absent') statusText = '✗';
        else if (status === 'late') statusText = '⏰';
        else if (status === 'sick') statusText = '🏥';
        
        row[`date_${td.id}`] = statusText;
      });
      
      // Итоги
      row.present_count = student.stats.present;
      row.absent_count = student.stats.absent;
      row.attendance_rate = `${student.stats.attendance_rate}%`;
      
      return row;
    });

    if (type === 'excel') {
      exportToExcel(dataToExport, columns, filename);
    } else {
      exportToPDF(dataToExport, columns, filename, `${t('attendance_report') || 'Табель посещаемости'}: ${monthlyReport.group_name} - ${monthlyReport.month_name} ${monthlyReport.year}`);
    }
  };

  const isSameDay = (d1, d2) => {
    return d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  };

  const getEventsForDay = useCallback((date) => {
    return events.filter(e => {
      const eDate = new Date(e.start_time || e.event_date);
      return isSameDay(eDate, date);
    });
  }, [events]);

  // 🌟 Загрузка статистики при раскрытии группы
  const loadGroupMonthlyStats = useCallback(async (groupId) => {
    try {
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth() + 1;
      const response = await attendanceAPI.getMonthlyReport(groupId, year, month);
      const data = response.data;
      
      if (data && data.students) {
        const statsMap = {};
        data.students.forEach(s => {
          statsMap[s.id] = {
            present: s.stats?.present ?? 0,
            absent: s.stats?.absent ?? 0,
            total: s.stats?.total ?? 0,
            percentage: s.stats?.attendance_rate ?? 0
          };
        });
        setGroupMonthlyStats(prev => ({ ...prev, [groupId]: statsMap }));
      }
    } catch (error) {
      console.error('Error loading group monthly stats:', error);
    }
  }, [selectedDate]);

  const toggleGroup = useCallback(async (groupId, eventId = null, forceExpand = false) => {
    // Safety check - don't toggle if groupId is invalid
    if (!groupId) {
      console.warn('toggleGroup called with invalid groupId');
      return;
    }
    
    const isExpanded = expandedGroups[groupId];
    
    // Break infinite loops: if forcing expand and already expanded, do nothing
    if (forceExpand && isExpanded) return;

    if (isExpanded) {
      // Collapse
      setExpandedGroups(prev => ({ ...prev, [groupId]: false }));
    } else {
      // Expand and load attendance
      setExpandedGroups(prev => ({ ...prev, [groupId]: true }));
      
      // 🌟 Загрузить статистику за месяц
      loadGroupMonthlyStats(groupId);
      
      // Find event for this group on selected date
      const dayEvents = getEventsForDay(selectedDate);
      const groupEvent = eventId 
        ? dayEvents.find(e => Number(e.id) === Number(eventId))
        : dayEvents.find(e => Number(e.group_id) === Number(groupId));
      
      if (groupEvent) {
        try {
          const response = await attendanceAPI.getByEvent(groupEvent.id);
          const data = response.data || [];
          const attendanceMap = data.reduce((acc, curr) => ({ 
            ...acc, 
            [curr.student_id]: { status: curr.status, recordId: curr.id }
          }), {});
          
          setGroupAttendance(prev => ({ ...prev, [groupId]: attendanceMap }));
          setOriginalAttendance(prev => ({ ...prev, [groupId]: { ...attendanceMap } }));
        } catch (error) {
          console.error('Error fetching attendance:', error);
        }
      }
    }
  }, [expandedGroups, selectedDate, getEventsForDay, loadGroupMonthlyStats]);

  // Handle URL param for direct event selection
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eventIdParam = params.get('eventId') || params.get('event_id');
    
    if (eventIdParam && events.length > 0) {
      const eventId = parseInt(eventIdParam);
      const event = events.find(e => e.id === eventId);
      if (event) {
        const eventDate = new Date(event.start_time || event.event_date);
        
        // Only update date if it actually changed to prevent infinite loops
        if (eventDate.getTime() !== selectedDate.getTime()) {
            setSelectedDate(eventDate);
            setViewDate(eventDate);
        }
        
        // Auto-expand the group (force expand mode)
        if (event.group_id) {
          // Pass true as 3rd argument to force expand without toggling
          toggleGroup(event.group_id, eventId, true);
        }
      } else {
        // Event not found - show error and clear invalid eventId from URL
        setErrorMessage(`Событие с ID ${eventId} не найдено`);
        setTimeout(() => setErrorMessage(''), 5000);
      }
    }
  }, [location.search, events, toggleGroup, selectedDate]);

  const handleStatusChange = (groupId, studentId, status) => {
    setGroupAttendance(prev => {
      const groupData = prev[groupId] || {};
      const currentStatus = groupData[studentId]?.status;
      
      if (currentStatus === status) {
        // Toggle off
        const newData = { ...groupData };
        delete newData[studentId];
        return { ...prev, [groupId]: newData };
      }
      
      return {
        ...prev,
        [groupId]: {
          ...groupData,
          [studentId]: { ...groupData[studentId], status }
        }
      };
    });
  };

  const hasChanges = (groupId) => {
    const current = groupAttendance[groupId] || {};
    const original = originalAttendance[groupId] || {};
    
    const currentKeys = Object.keys(current);
    const originalKeys = Object.keys(original);
    
    if (currentKeys.length !== originalKeys.length) return true;
    
    return currentKeys.some(key => current[key]?.status !== original[key]?.status);
  };

  const handleSaveGroup = async (groupId) => {
    const dayEvents = getEventsForDay(selectedDate);
    const groupEvent = dayEvents.find(e => e.group_id === groupId);
    if (!groupEvent) return;
    
    setSavingGroups(prev => ({ ...prev, [groupId]: true }));
    
    try {
      const current = groupAttendance[groupId] || {};
      const original = originalAttendance[groupId] || {};
      const groupStudents = students.filter(s => s.group_id === groupId);
      
      let successCount = 0;
      let errors = [];

      for (const student of groupStudents) {
        const newStatus = current[student.id]?.status;
        const origData = original[student.id];
        const originalStatus = origData?.status;
        
        if (newStatus && newStatus !== originalStatus) {
          try {
            if (origData?.recordId) {
              await attendanceAPI.update(origData.recordId, { status: newStatus });
            } else {
              await attendanceAPI.mark({
                event_id: groupEvent.id,
                student_id: student.id,
                status: newStatus
              });
            }
            successCount++;
          } catch (err) {
            console.error(`Error saving student ${student.id}:`, err);
            const msg = err.response?.data?.detail || 'Ошибка';
            errors.push(`${student.last_name} ${student.first_name}: ${msg}`);
          }
        }
      }
      
      // Refresh attendance data regardless of errors to show what was saved
      const response = await attendanceAPI.getByEvent(groupEvent.id);
      const data = response.data || [];
      const attendanceMap = data.reduce((acc, curr) => ({ 
        ...acc, 
        [curr.student_id]: { status: curr.status, recordId: curr.id }
      }), {});
      
      setGroupAttendance(prev => ({ ...prev, [groupId]: attendanceMap }));
      setOriginalAttendance(prev => ({ ...prev, [groupId]: { ...attendanceMap } }));
      
      if (errors.length > 0) {
        setErrorMessage(`${t('saved_with_errors') || 'Сохранено частично'}. ${t('errors') || 'Ошибки'}: ${errors.length}`);
        // Show detailed errors in a toast or alert if needed, for now console and general message
        console.warn('Save errors:', errors);
        // Optionally show first few errors
        setTimeout(() => setErrorMessage(errors.slice(0, 3).join('; ')), 2000);
      } else if (successCount > 0) {
        setSuccessMessage(t('attendance_saved') || 'Посещаемость сохранена!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        // No changes were made
        setSuccessMessage(t('no_changes') || 'Нет изменений');
        setTimeout(() => setSuccessMessage(''), 3000);
      }

    } catch (error) {
      console.error('Error saving:', error);
      console.error('Error details:', error.response?.data);
      const errorMsg = error.response?.data?.detail || 'Ошибка при сохранении';
      setErrorMessage(errorMsg);
    } finally {
      setSavingGroups(prev => ({ ...prev, [groupId]: false }));
    }
  };

  const handleCancelGroup = (groupId) => {
    setGroupAttendance(prev => ({
      ...prev,
      [groupId]: { ...originalAttendance[groupId] }
    }));
  };

  const handleMarkAllPresent = (groupId) => {
    const groupStudents = students.filter(s => s.group_id === groupId);
    setGroupAttendance(prev => {
      const currentGroupData = prev[groupId] || {};
      const newGroupData = { ...currentGroupData };
      
      groupStudents.forEach(student => {
        newGroupData[student.id] = { 
          ...currentGroupData[student.id], 
          status: 'present' 
        };
      });
      
      return { ...prev, [groupId]: newGroupData };
    });
  };

  const getStudentStatus = (groupId, studentId) => {
    return groupAttendance[groupId]?.[studentId]?.status || 'unmarked';
  };

  const hasDebt = (student) => {
    if (student.is_debtor) return true;
    if (student.classes_balance !== undefined && student.classes_balance <= 0) return true;
    if (student.subscription_expires) {
      const expDate = new Date(student.subscription_expires);
      if (expDate < new Date()) return true;
    }
    return false;
  };

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const startDay = firstDay === 0 ? 6 : firstDay - 1;
    
    const days = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }
    const remainingCells = 42 - days.length;
    for (let i = 1; i <= remainingCells; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false });
    }
    return days;
  };

  const changeMonth = (offset) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setViewDate(newDate);
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
    setExpandedGroups({}); // Reset expanded groups when date changes
    setGroupAttendance({});
    setOriginalAttendance({});
  };

  // Get unique groups that have events on selected date
  const getGroupsWithEvents = () => {
    const dayEvents = getEventsForDay(selectedDate);
    // Use loose comparison or Number() to handle potential string/number mismatches
    const groupIds = [...new Set(dayEvents.map(e => Number(e.group_id)))];
    
    // Filter by role: coach sees only their groups, managers see all groups
    const isCoach = user?.role?.toLowerCase() === 'coach';
    const isManager = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
    
    const allGroupsWithEvents = groups
      .filter(g => groupIds.includes(Number(g.id)))
      .map(group => {
        const groupEvent = dayEvents.find(e => Number(e.group_id) === Number(group.id));
        return { ...group, event: groupEvent };
      })
      .filter(g => g.event); // Ensure event exists

    // Since groups are already filtered by backend for coaches, 
    // we don't need strict frontend filtering that might fail if coach data is incomplete.
    // Just return all groups that have events.
    return allGroupsWithEvents;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-yellow-500 text-lg">{t('loading')}</div>
      </div>
    );
  }

  const localeMap = { ru: 'ru-RU', en: 'en-US', ro: 'ro-RO' };
  const dateLocale = localeMap[language] || 'ru-RU';
  const weekDays = language === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const groupsWithEvents = getGroupsWithEvents();

  // Смена месяца для табеля
  const changeReportMonth = (delta) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + delta);
    setViewDate(newDate);
  };
  
  // Получить цвет статуса
  const getStatusColor = (status) => {
    switch (status) {
      case 'present': return 'bg-emerald-500 text-white';
      case 'absent': return 'bg-red-500 text-white';
      case 'late': return 'bg-yellow-500 text-black';
      case 'sick': return 'bg-blue-500 text-white';
      default: return 'bg-white/10 text-white/40';
    }
  };
  
  const getStatusIcon = (status) => {
    switch (status) {
      case 'present': return '✓';
      case 'absent': return '✗';
      case 'late': return '⭑';
      case 'sick': return '🏥';
      default: return '—';
    }
  };

  const formatTimeSafe = (dateStr) => {
    if (!dateStr) return '--:--';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return '--:--';
      return date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch (e) {
      return '--:--';
    }
  };

  return (
    <div className="min-h-full bg-[#0F1117] p-4 md:p-6 text-white">
      {/* Hidden printable report for PDF generation */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        {/* Monthly Attendance Report */}
        {monthlyReport && (
          <div ref={printRef} className="p-4 bg-white text-black min-w-[1100px] font-sans">
            {/* ... content ... */}
            <div className="flex justify-between items-center mb-4 border-b-2 border-black pb-2">
              <div>
                <h1 className="text-xl font-bold uppercase tracking-wider">{monthlyReport.group_name}</h1>
                <p className="text-gray-600 text-sm">{monthlyReport.month_name} {monthlyReport.year}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">{t('total_trainings')}</div>
                <div className="font-bold text-lg">{monthlyReport.total_trainings}</div>
              </div>
            </div>

            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-1 border border-gray-300 font-bold w-40">{t('student') || "Student"}</th>
                  {monthlyReport.training_dates.map((td) => (
                    <th key={td.id} className="text-center p-0.5 border border-gray-300 font-bold min-w-[20px]">
                      <div>{td.day}</div>
                      <div className="text-[8px] text-gray-500">{td.weekday}</div>
                      <div className="text-[7px] text-gray-400">{td.time}</div>
                    </th>
                  ))}
                  <th className="text-center p-1 border border-gray-300 font-bold bg-green-50 w-8">✓</th>
                  <th className="text-center p-1 border border-gray-300 font-bold bg-red-50 w-8">✗</th>
                  <th className="text-center p-1 border border-gray-300 font-bold w-10">%</th>
                </tr>
              </thead>
              <tbody>
                {monthlyReport.students.map((student, idx) => (
                  <tr key={student.id} className="border-b border-gray-200">
                    <td className="p-1 border border-gray-300 font-medium">
                      {idx + 1}. {student.last_name} {student.first_name}
                    </td>
                    {monthlyReport.training_dates.map((td) => {
                       const status = student.attendance[td.id];
                       let content = '—';
                       let colorClass = 'text-gray-300';
                       
                       if (status === 'present') { content = '✓'; colorClass = 'text-green-600 font-bold'; }
                       else if (status === 'absent') { content = '✗'; colorClass = 'text-red-600 font-bold'; }
                       else if (status === 'late') { content = '⭑'; colorClass = 'text-yellow-600 font-bold'; }
                       else if (status === 'sick') { content = '🏥'; colorClass = 'text-blue-600'; }

                       return (
                         <td key={td.id} className={`text-center border border-gray-300 p-0.5 ${colorClass}`}>
                           {content}
                         </td>
                       );
                    })}
                    <td className="text-center border border-gray-300 p-1 font-bold text-green-700 bg-green-50">
                      {student.stats.present}
                    </td>
                    <td className="text-center border border-gray-300 p-1 font-bold text-red-700 bg-red-50">
                      {student.stats.absent}
                    </td>
                    <td className="text-center border border-gray-300 p-1 font-bold">
                      {student.stats.attendance_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 pt-2 border-t border-gray-300 flex justify-between text-[9px] text-gray-500">
              <div className="flex gap-4">
                <span>✓ {t('present')}</span>
                <span>✗ {t('absent')}</span>
                <span>⭑ {t('late')}</span>
                <span>🏥 {t('sick')}</span>
              </div>
              <div>{t('generated_by_system')} {new Date().toLocaleDateString()}</div>
            </div>
          </div>
        )}
        
        {/* 🗓️ Schedule Printable */}
        <div ref={schedulePrintRef} className="p-8 bg-white text-black min-w-[800px] font-sans">
          <div className="mb-6 border-b-2 border-black pb-4 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-bold uppercase tracking-wider mb-1">
                {t('schedule') || 'Schedule'}
              </h1>
              <h2 className="text-xl text-gray-600">
                {viewDate.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })}
              </h2>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 uppercase tracking-wide mb-1">
                {scheduleExportGroup === 'all' ? (t('all_academy') || 'Football Academy') : groups.find(g => g.id === parseInt(scheduleExportGroup))?.name}
              </div>
              <div className="font-bold text-lg text-yellow-600">
                {getEventsForMonth(viewDate, scheduleExportGroup).length} {t('events') || 'Events'}
              </div>
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b-2 border-gray-300">
                <th className="text-left p-3 font-bold text-sm w-32 uppercase tracking-wide text-gray-600">{t('date') || 'Date'}</th>
                <th className="text-left p-3 font-bold text-sm w-32 uppercase tracking-wide text-gray-600">{t('time') || 'Time'}</th>
                <th className="text-left p-3 font-bold text-sm uppercase tracking-wide text-gray-600">{t('group') || 'Group'}</th>
                <th className="text-left p-3 font-bold text-sm w-32 uppercase tracking-wide text-gray-600">{t('type') || 'Type'}</th>
                <th className="text-left p-3 font-bold text-sm w-48 uppercase tracking-wide text-gray-600">{t('location') || 'Location'}</th>
              </tr>
            </thead>
            <tbody>
              {getEventsForMonth(viewDate, scheduleExportGroup).map((ev, idx) => {
                const date = new Date(ev.start_time);
                const endDate = new Date(ev.end_time);
                const group = groups.find(g => g.id === ev.group_id);
                const isEven = idx % 2 === 0;
                
                return (
                  <tr key={ev.id} className={`border-b border-gray-100 ${isEven ? 'bg-white' : 'bg-gray-50'}`}>
                    <td className="p-3 text-sm font-bold text-gray-800">
                      {date.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' })}
                      <span className="text-gray-400 font-normal ml-2 text-xs uppercase">
                        {date.toLocaleDateString(dateLocale, { weekday: 'short' })}
                      </span>
                    </td>
                    <td className="p-3 text-sm font-medium">
                      {date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', hour12: false })}
                      <span className="text-gray-400 mx-1">-</span>
                      {endDate.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </td>
                    <td className="p-3 text-sm font-bold text-blue-900">
                      {group?.name || '-'}
                    </td>
                    <td className="p-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                        ev.type === 'game' 
                          ? 'bg-purple-100 text-purple-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {ev.type === 'game' ? (t('game') || 'GAME') : (t('training') || 'TRAINING')}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-gray-600">
                      {ev.location || 'Main Field'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between text-xs text-gray-400">
             <div>{t('official_schedule')}</div>
             <div>{t('generated_on')} {new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </div>

      <div className="fixed inset-0 pointer-events-none bg-gradient-mesh opacity-50" />
      
      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header & Controls - Unified & Responsive */}
        <div className="mb-8 flex flex-col gap-6">
          {/* Title Section */}
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl md:text-4xl font-bold leading-tight">
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent break-words">
                📋 {t('attendance_title')}
              </span>
            </h1>
            <p className="text-gray-500 text-sm md:text-base">Отметка посещаемости по группам</p>
          </div>
        
          {/* Controls - Unified Container with Wrap */}
          <div className="flex flex-wrap items-center gap-2 bg-white/5 p-2 rounded-2xl border border-white/10">
            {/* Day View */}
            <button
              onClick={() => setViewMode('daily')}
              className={`flex-1 sm:flex-none min-w-[80px] sm:min-w-[100px] px-2 sm:px-4 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-xs sm:text-sm ${
                viewMode === 'daily'
                  ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              📅 <span className="hidden sm:inline">{t('daily_view')}</span>
              <span className="sm:hidden">День</span>
            </button>

            {/* Month View */}
            <button
              onClick={() => setViewMode('monthly')}
              className={`flex-1 sm:flex-none min-w-[80px] sm:min-w-[100px] px-2 sm:px-4 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 text-xs sm:text-sm ${
                viewMode === 'monthly'
                  ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              📊 <span className="hidden sm:inline">{t('monthly_view')}</span>
              <span className="sm:hidden">Месяц</span>
            </button>

            {/* Calendar Toggle / Switch to Calendar */}
             <button
                onClick={() => {
                  if (viewMode === 'monthly') {
                    setViewMode('daily');
                    setShowCalendar(true);
                  } else {
                    setShowCalendar(!showCalendar);
                  }
                }}
                className={`flex-1 sm:flex-none min-w-[80px] sm:min-w-[100px] px-2 sm:px-4 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 border border-white/10 text-xs sm:text-sm ${
                  viewMode === 'daily' && showCalendar
                    ? 'bg-white/10 text-yellow-400 border-yellow-500/30' 
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
             >
                <span className="text-base sm:text-lg">
                  {viewMode === 'daily' && showCalendar ? '🔼' : '�️'}
                </span>
                <span className="hidden sm:inline">
                  {viewMode === 'daily' && showCalendar ? t('hide_calendar') : t('show_calendar')}
                </span>
                <span className="sm:hidden">
                  {viewMode === 'daily' && showCalendar ? (t('hide_calendar_short') || 'Скр.') : (t('show_calendar_short') || 'Кал.')}
                </span>
             </button>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 mb-6 backdrop-blur-sm animate-fade-up">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <span className="text-emerald-400 font-semibold text-lg">{successMessage}</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 mb-6 backdrop-blur-sm animate-fade-up">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <span className="text-2xl">⚠️</span>
              </div>
              <span className="text-red-400 font-semibold text-lg">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Calendar Section */}
        {viewMode === 'daily' && showCalendar && (
        <div className="bg-white/5 rounded-2xl p-4 md:p-6 mb-6 border border-white/10 backdrop-blur-sm animate-fade-in">
          {/* Month Navigation */}
          <div className="flex flex-col lg:flex-row justify-between items-center mb-6 gap-4">
            <div className="flex items-center gap-2 sm:gap-4 w-full lg:w-auto justify-between lg:justify-start bg-black/20 p-1.5 rounded-2xl sm:bg-transparent sm:p-0">
              <button onClick={() => changeMonth(-1)} className="p-2 sm:p-3 hover:bg-white/10 rounded-xl text-white font-bold text-lg sm:text-xl transition bg-white/5 border border-white/10">
                ←
              </button>
              <h2 className="text-base sm:text-xl font-bold text-white capitalize min-w-[120px] sm:min-w-[150px] text-center truncate px-2">
                {viewDate.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={() => changeMonth(1)} className="p-2 sm:p-3 hover:bg-white/10 rounded-xl text-white font-bold text-lg sm:text-xl transition bg-white/5 border border-white/10">
                →
              </button>
            </div>

            {/* 📥 Скачать расписание */}
            <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/10">
              <select
                value={scheduleExportGroup}
                onChange={(e) => setScheduleExportGroup(e.target.value)}
                className="bg-[#0F1117] text-white text-sm px-3 py-2 rounded-lg border border-white/10 focus:outline-none focus:border-yellow-500/50 min-w-[150px]"
              >
                <option value="all">{t('all_academy') || 'Вся академия'}</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              
              <div className="h-6 w-px bg-white/10 mx-1" />
              
              <button
                onClick={() => handleScheduleExport('excel')}
                disabled={isExporting}
                className="p-2 hover:bg-white/10 rounded-lg text-green-400 transition"
                title={t('download_excel') || "Download Excel"}
              >
                <FileText size={20} />
              </button>
              <button
                onClick={() => handleScheduleExport('pdf')}
                disabled={isExporting}
                className="p-2 hover:bg-white/10 rounded-lg text-red-400 transition"
                title={t('download_pdf') || "Download PDF"}
              >
                {isExporting ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />}
              </button>
            </div>
          </div>

          {/* Week Days */}
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((day, i) => (
              <div key={i} className="text-center text-xs font-semibold text-yellow-500 uppercase py-2">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {getDaysInMonth(viewDate).map((dayObj, i) => {
              const dayEvents = getEventsForDay(dayObj.date);
              const isSelected = isSameDay(dayObj.date, selectedDate);
              const isTodayDate = isSameDay(dayObj.date, new Date());
              
              return (
                <div 
                  key={i}
                  onClick={() => handleDateSelect(dayObj.date)}
                  className={`
                    min-h-[60px] p-1 rounded-xl border cursor-pointer transition relative
                    ${!dayObj.isCurrentMonth ? 'bg-white/3 border-white/5 opacity-50' : 'bg-white/5 border-white/10'}
                    ${isSelected ? 'ring-2 ring-yellow-500 bg-yellow-500/10 border-yellow-500/50' : 'hover:bg-white/10'}
                    ${isTodayDate ? 'border-emerald-500 border-2' : ''}
                  `}
                >
                  <div className={`text-right text-sm p-1 font-medium ${
                    !dayObj.isCurrentMonth ? 'text-gray-600' :
                    isTodayDate ? 'text-emerald-400 font-bold' :
                    isSelected ? 'text-yellow-300' : 'text-gray-300'
                  }`}>
                    {dayObj.date.getDate()}
                  </div>
                  
                  <div className="flex flex-wrap gap-1 justify-center mt-1">
                    {dayEvents.slice(0, 4).map((ev, idx) => (
                      <div 
                        key={idx} 
                        className={`w-2 h-2 rounded-full ${
                          ev.type === 'training' ? 'bg-blue-400' : 
                          ev.type === 'game' ? 'bg-purple-400' : 'bg-orange-400'
                        }`} 
                      />
                    ))}
                    {dayEvents.length > 4 && <span className="text-[10px] text-gray-400">+</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Selected Date Header - Always visible if calendar hidden */}
        {viewMode === 'daily' && (
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg md:text-xl font-bold text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center text-yellow-400">📅</span>
            {selectedDate.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
        </div>
        )}

        {/* Groups List - Expandable */}
        {viewMode === 'daily' && groupsWithEvents.length === 0 ? (
          <div className="bg-white/5 rounded-2xl p-12 text-center border border-dashed border-white/20">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-gray-400 text-lg">{t('no_events')}</p>
          </div>
        ) : viewMode === 'daily' && (
          <div className="space-y-4">
            {groupsWithEvents.map(group => {
              const isExpanded = expandedGroups[group.id];
              const groupStudents = students.filter(s => s.group_id === group.id);
              const filteredStudents = searchQuery.trim()
                ? groupStudents.filter(s => 
                    `${s.first_name} ${s.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    s.phone?.includes(searchQuery)
                  )
                : groupStudents;
              
              const markedCount = groupStudents.filter(s => getStudentStatus(group.id, s.id) !== 'unmarked').length;
              const presentCount = groupStudents.filter(s => getStudentStatus(group.id, s.id) === 'present').length;
              const isSaving = savingGroups[group.id];
              
              return (
                <div key={group.id} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                  {/* Group Header - Clickable */}
                  <div 
                    onClick={() => toggleGroup(group.id)}
                    className={`p-5 cursor-pointer transition-all ${
                      isExpanded 
                        ? 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20' 
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl transition-transform ${
                          isExpanded ? 'bg-yellow-500/30 rotate-12' : 'bg-white/10'
                        }`}>
                          {group.event?.type === 'training' ? '🏃' : group.event?.type === 'game' ? '⚽' : '📅'}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white">{group.name}</h3>
                          <p className="text-sm text-gray-400">
                            {formatTimeSafe(group.event?.start_time)} - {formatTimeSafe(group.event?.end_time)}
                            {group.event?.location && <span className="ml-2">📍 {group.event.location}</span>}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {isExpanded && (
                          <div className="hidden sm:flex gap-3 text-sm">
                            <span className="px-3 py-1 rounded-lg bg-white/10 text-gray-300">
                              👥 {groupStudents.length}
                            </span>
                            <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400">
                              ✓ {presentCount}
                            </span>
                            <span className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400">
                              📝 {markedCount}/{groupStudents.length}
                            </span>
                          </div>
                        )}
                        <div className={`text-2xl transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                          ▼
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Students List - Expandable Content */}
                  {isExpanded && (
                    <div className="border-t border-white/10">
                      {/* 📋 Training Plan View */}
                      {group.event?.training_plan && (
                        <div className="mx-5 my-4 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                          <h4 className="text-yellow-400 font-bold mb-2 flex items-center gap-2">
                            <span>📋</span> {t('training_plan') || 'План тренировки'}
                          </h4>
                          <div className="text-white/80 whitespace-pre-wrap text-sm">
                            {group.event.training_plan}
                          </div>
                        </div>
                      )}

                      {/* Search & Actions Bar */}
                      <div className="px-5 py-3 bg-white/3 flex flex-col lg:flex-row items-center justify-between gap-4">
                        <div className="relative w-full lg:flex-1 max-w-md">
                          <input
                            type="text"
                            placeholder="🔍 Поиск ученика..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-2 pl-10 bg-[#0F1117] text-white rounded-xl border border-white/10 focus:border-yellow-500/50 focus:outline-none"
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery('')}
                              className="absolute right-3 top-2.5 text-gray-400 hover:text-white"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap justify-center lg:justify-end gap-2 w-full lg:w-auto">
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleMarkAllPresent(group.id); }}
                            disabled={isSaving}
                            className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm transition flex items-center gap-2 whitespace-nowrap"
                          >
                            🎯 Все присутствуют
                          </button>
                          {hasChanges(group.id) && (
                            <div className="flex gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleCancelGroup(group.id); }}
                                disabled={isSaving}
                                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm transition whitespace-nowrap"
                              >
                                Отмена
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleSaveGroup(group.id); }}
                                disabled={isSaving}
                                className="px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black rounded-xl text-sm font-bold transition flex items-center gap-2 whitespace-nowrap"
                              >
                                {isSaving ? <span className="animate-spin">⏳</span> : '💾'} Сохранить
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Students */}
                      {filteredStudents.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                          {searchQuery ? 'Ученики не найдены' : t('no_students_in_group')}
                        </div>
                      ) : (
                        <div className="divide-y divide-white/5">
                          {filteredStudents.map(student => {
                            const status = getStudentStatus(group.id, student.id);
                            const studentHasDebt = hasDebt(student);
                            
                            return (
                              <div 
                                key={student.id} 
                                className={`px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition hover:bg-white/3 ${
                                  studentHasDebt ? 'bg-red-500/5' : ''
                                }`}
                              >
                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                  <div className="relative">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold overflow-hidden ${
                                      status === 'present' ? 'bg-emerald-500' : 
                                      status === 'absent' ? 'bg-red-500' : 
                                      status === 'late' ? 'bg-yellow-500' : 
                                      status === 'sick' ? 'bg-blue-500' : 'bg-white/10'
                                    }`}>
                                      {student.avatar_url ? (
                                        <img src={`http://localhost:8000${student.avatar_url}`} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        student.first_name?.[0] || '?'
                                      )}
                                    </div>
                                    {studentHasDebt && (
                                      <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                                        <span className="text-white text-xs">!</span>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-white truncate">
                                        {student.first_name} {student.last_name}
                                      </span>
                                      {studentHasDebt && (
                                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-lg border border-red-500/30 whitespace-nowrap">
                                          {t('debt')}
                                        </span>
                                      )}
                                      {student.is_frozen && (
                                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-lg border border-blue-500/30">
                                          ❄️
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm text-gray-500 flex flex-wrap items-center gap-2 mt-1">
                                      {status === 'present' && <span className="text-emerald-400">✓ {t('present')}</span>}
                                      {status === 'absent' && <span className="text-red-400">✗ {t('absent')}</span>}
                                      {status === 'late' && <span className="text-yellow-400">⏰ {t('late')}</span>}
                                      {status === 'sick' && <span className="text-blue-400">🏥 {t('sick')}</span>}
                                      {status === 'unmarked' && <span>— {t('not_marked')}</span>}
                                      {student.classes_balance !== undefined && (
                                        <span className={`text-xs ${student.classes_balance <= 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                          ({student.classes_balance} {t('classes_left')})
                                        </span>
                                      )}
                                      {/* 🌟 Статистика за месяц */}
                                      {groupMonthlyStats[group.id]?.[student.id] && (
                                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-lg border border-purple-500/30 whitespace-nowrap">
                                          📊 {groupMonthlyStats[group.id][student.id].present}/{groupMonthlyStats[group.id][student.id].total}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-4 sm:flex gap-2 w-full sm:w-auto justify-between sm:justify-start">
                                  <button
                                    onClick={() => handleStatusChange(group.id, student.id, 'present')}
                                    className={`flex-1 sm:flex-none h-10 sm:w-10 rounded-xl text-sm font-medium transition flex items-center justify-center ${
                                      status === 'present' 
                                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' 
                                        : 'bg-white/10 hover:bg-emerald-500/30 text-gray-300'
                                    }`}
                                  >
                                    ✓
                                  </button>
                                  <button
                                    onClick={() => handleStatusChange(group.id, student.id, 'absent')}
                                    className={`flex-1 sm:flex-none h-10 sm:w-10 rounded-xl text-sm font-medium transition flex items-center justify-center ${
                                      status === 'absent' 
                                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30' 
                                        : 'bg-white/10 hover:bg-red-500/30 text-gray-300'
                                    }`}
                                  >
                                    ✗
                                  </button>
                                  <button
                                    onClick={() => handleStatusChange(group.id, student.id, 'late')}
                                    className={`flex-1 sm:flex-none h-10 sm:w-10 rounded-xl text-sm font-medium transition flex items-center justify-center ${
                                      status === 'late' 
                                        ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/30' 
                                        : 'bg-white/10 hover:bg-yellow-500/30 text-gray-300'
                                    }`}
                                  >
                                    ⏰
                                  </button>
                                  <button
                                    onClick={() => handleStatusChange(group.id, student.id, 'sick')}
                                    className={`flex-1 sm:flex-none h-10 sm:w-10 rounded-xl text-sm font-medium transition flex items-center justify-center ${
                                      status === 'sick' 
                                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                                        : 'bg-white/10 hover:bg-blue-500/30 text-gray-300'
                                    }`}
                                  >
                                    🏥
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        
        {/* 🆕 ТАБЕЛЬ ЗА МЕСЯЦ */}
        {viewMode === 'monthly' && (
          <div className="space-y-6">
            {/* Выбор группы и месяца */}
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
              <div className="flex-1 w-full sm:w-auto">
                <label className="block text-sm text-white/60 mb-2">Группа</label>
                <select
                  value={selectedGroupForReport || ''}
                  onChange={(e) => setSelectedGroupForReport(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50 appearance-none"
                >
                  <option value="">Выберите группу</option>
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              
              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto bg-black/20 p-1.5 rounded-xl sm:bg-transparent sm:p-0">
                <button
                  onClick={() => changeReportMonth(-1)}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  ←
                </button>
                <div className="text-center flex-1 sm:flex-none sm:min-w-[150px]">
                  <div className="text-base sm:text-lg font-bold text-white whitespace-nowrap">
                    {viewDate.toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <button
                  onClick={() => changeReportMonth(1)}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 flex items-center justify-center transition-colors"
                >
                  →
                </button>
              </div>
            </div>
            
            {/* Табель */}
            {!selectedGroupForReport ? (
              <div className="bg-white/5 rounded-2xl p-12 text-center border border-dashed border-white/20">
                <div className="text-5xl mb-4">📊</div>
                <p className="text-gray-400 text-lg">Выберите группу для просмотра табеля</p>
              </div>
            ) : reportLoading ? (
              <div className="bg-white/5 rounded-2xl p-12 text-center border border-white/10">
                <div className="text-4xl animate-spin mb-4">⏳</div>
                <p className="text-gray-400">Загрузка табеля...</p>
              </div>
            ) : monthlyReport ? (
              <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                {/* Заголовок табеля */}
                <div className="bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-b border-white/10 p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-yellow-500/20 flex flex-shrink-0 items-center justify-center text-yellow-400">📊</span>
                      <span className="break-words">{monthlyReport.group_name}</span>
                    </h3>
                    <div className="text-sm text-gray-400 mt-1 ml-14">
                      {monthlyReport.month_name} {monthlyReport.year}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 ml-14 text-sm text-white/60">
                      <span>📅 Тренировок: <span className="text-yellow-400 font-medium">{monthlyReport.total_trainings}</span></span>
                      <span>👥 Учеников: <span className="text-emerald-400 font-medium">{monthlyReport.total_students}</span></span>
                    </div>
                  </div>
                  
                  {/* Кнопки экспорта */}
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleExport('excel')}
                      className="flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-emerald-500/20 text-white hover:text-emerald-400 rounded-xl border border-white/10 hover:border-emerald-500/30 transition-all shadow-lg"
                      title="Скачать в Excel"
                    >
                      <FileText size={18} />
                      <span className="inline">Excel</span>
                    </button>
                    <button
                      onClick={() => handleExport('pdf')}
                      disabled={isExporting}
                      className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-red-500/20 text-white hover:text-red-400 rounded-xl border border-white/10 hover:border-red-500/30 transition-all shadow-lg ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title="Скачать в PDF"
                    >
                      {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                      <span className="inline">{isExporting ? 'Экспорт...' : 'PDF'}</span>
                    </button>
                  </div>
                </div>
                
                {/* Таблица */}
                {monthlyReport.total_trainings === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    Нет тренировок в этом месяце
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-white/5">
                          <th className="text-left py-3 px-4 font-semibold text-white/70 sticky left-0 bg-[#1a1c23] z-10 min-w-[180px]">
                            Ученик
                          </th>
                          {monthlyReport.training_dates.map((td) => (
                            <th key={td.id} className="text-center py-2 px-1 font-medium text-white/60 min-w-[40px]">
                              <div className="text-lg text-white/80">{td.day}</div>
                              <div className="text-xs text-white/40">{td.weekday}</div>
                              <div className="text-[10px] text-white/30">{td.time}</div>
                            </th>
                          ))}
                          <th className="text-center py-3 px-3 font-semibold text-emerald-400 min-w-[60px] sticky right-0 bg-[#1a1c23] z-10">
                            ✓
                          </th>
                          <th className="text-center py-3 px-3 font-semibold text-yellow-400 min-w-[60px]">
                            ⭑
                          </th>
                          <th className="text-center py-3 px-3 font-semibold text-blue-400 min-w-[60px]">
                            🏥
                          </th>
                          <th className="text-center py-3 px-3 font-semibold text-red-400 min-w-[60px]">
                            ✗
                          </th>
                          <th className="text-center py-3 px-3 font-semibold text-white/70 min-w-[70px]">
                            %
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {monthlyReport.students.map((student) => (
                          <tr key={student.id} className="hover:bg-white/5 transition">
                            <td className="py-2 px-4 sticky left-0 bg-[#15171c] z-10">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm overflow-hidden">
                                  {student.avatar_url ? (
                                    <img src={`http://localhost:8000${student.avatar_url}`} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    student.first_name?.[0] || '?'
                                  )}
                                </div>
                                <div>
                                  <div className="font-medium text-white flex items-center gap-1">
                                    {student.last_name} {student.first_name}
                                    {student.is_frozen && <span className="text-blue-400 text-xs">❄️</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            {monthlyReport.training_dates.map((td) => (
                              <td key={td.id} className="text-center py-2 px-1">
                                <div className={`w-7 h-7 mx-auto rounded-lg flex items-center justify-center text-xs font-bold ${getStatusColor(student.attendance[td.id])}`}>
                                  {getStatusIcon(student.attendance[td.id])}
                                </div>
                              </td>
                            ))}
                            <td className="text-center py-2 px-3 sticky right-0 bg-[#15171c] z-10">
                              <span className="text-emerald-400 font-bold">{student.stats.present}</span>
                            </td>
                            <td className="text-center py-2 px-3">
                              <span className="text-yellow-400 font-bold">{student.stats.late}</span>
                            </td>
                            <td className="text-center py-2 px-3">
                              <span className="text-blue-400 font-bold">{student.stats.sick}</span>
                            </td>
                            <td className="text-center py-2 px-3">
                              <span className="text-red-400 font-bold">{student.stats.absent}</span>
                            </td>
                            <td className="text-center py-2 px-3">
                              <span className={`font-bold ${student.stats.attendance_rate >= 80 ? 'text-emerald-400' : student.stats.attendance_rate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                                {student.stats.attendance_rate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Легенда */}
                <div className="p-4 border-t border-white/10 flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-white text-xs font-bold">✓</div>
                    <span className="text-white/60">Присутствовал</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-red-500 flex items-center justify-center text-white text-xs font-bold">✗</div>
                    <span className="text-white/60">Отсутствовал</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-yellow-500 flex items-center justify-center text-black text-xs font-bold">⭑</div>
                    <span className="text-white/60">Опоздал</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center text-white text-xs">🏥</div>
                    <span className="text-white/60">Болел</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-white/40 text-xs">—</div>
                    <span className="text-white/60">Не отмечено</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
