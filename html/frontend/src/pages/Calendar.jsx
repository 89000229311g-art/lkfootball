import { useState, useEffect } from 'react';
import { eventsAPI, groupsAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { FileText, Download } from 'lucide-react';

const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAYS_RO = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
const DAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const MONTHS_RU = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_RO = ['Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie', 'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Calendar() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const filterGroupId = location.state?.groupId;
  
  const canEdit = user && user.role !== 'parent';
  const isParent = user?.role === 'parent';
  
  const DAYS = language === 'ro' ? DAYS_RO : (language === 'en' ? DAYS_EN : DAYS_RU);
  const MONTHS = language === 'ro' ? MONTHS_RO : (language === 'en' ? MONTHS_EN : MONTHS_RU);

  const EVENT_TYPES = {
    TRAINING: { label: t('event_training') || 'Тренировка', color: 'from-emerald-600 to-emerald-500', bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', icon: '🏋️' },
    GAME: { label: t('event_game') || 'Матч', color: 'from-blue-600 to-blue-500', bg: 'bg-blue-500/20', border: 'border-blue-500/30', icon: '⚽' },
    TOURNAMENT: { label: t('event_tournament') || 'Турнир', color: 'from-purple-600 to-purple-500', bg: 'bg-purple-500/20', border: 'border-purple-500/30', icon: '🏆' },
    CHAMPIONSHIP: { label: t('event_championship') || 'Чемпионат', color: 'from-yellow-600 to-yellow-500', bg: 'bg-yellow-500/20', border: 'border-yellow-500/30', icon: '🥇' },
    PARENT_MEETING: { label: t('event_parent_meeting') || 'Собрание', color: 'from-orange-600 to-orange-500', bg: 'bg-orange-500/20', border: 'border-orange-500/30', icon: '👨‍👩‍👧' },
    INDIVIDUAL: { label: t('event_individual') || 'Индивидуальная', color: 'from-cyan-600 to-cyan-500', bg: 'bg-cyan-500/20', border: 'border-cyan-500/30', icon: '🎯' },
    MEDICAL: { label: t('event_medical') || 'Медосмотр', color: 'from-red-600 to-red-500', bg: 'bg-red-500/20', border: 'border-red-500/30', icon: '🏥' },
    TESTING: { label: t('event_testing') || 'Тестирование', color: 'from-indigo-600 to-indigo-500', bg: 'bg-indigo-500/20', border: 'border-indigo-500/30', icon: '📊' },
    REST: { label: t('event_rest') || 'Отдых', color: 'from-gray-600 to-gray-500', bg: 'bg-gray-500/20', border: 'border-gray-500/30', icon: '😴' },
  };

  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState(filterGroupId || '');
  const [successMessage, setSuccessMessage] = useState('');
  const [formData, setFormData] = useState({
    type: 'training',
    group_id: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '18:00',
    end_time: '19:30',
    location: '',
    description: ''
  });
  const [viewMode, setViewMode] = useState('month');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [eventsRes, groupsRes] = await Promise.all([
        eventsAPI.getAll(),
        groupsAPI.getAll()
      ]);
      setEvents(eventsRes.data.data || eventsRes.data || []);
      setGroups(groupsRes.data.data || groupsRes.data || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // 🕒 Авторасчёт времени окончания (+1.5 часа по умолчанию)
  const calculateEndTime = (startTime, durationMinutes = 90) => {
    const [hours, minutes] = startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + durationMinutes;
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  };

  // Обработка изменения времени начала - автоматически пересчитываем окончание
  const handleStartTimeChange = (newStartTime) => {
    const newEndTime = calculateEndTime(newStartTime);
    setFormData(prev => ({ ...prev, start_time: newStartTime, end_time: newEndTime }));
  };

  // Обработка изменения времени окончания - проверяем что оно после начала
  const handleEndTimeChange = (newEndTime) => {
    const [startH, startM] = formData.start_time.split(':').map(Number);
    const [endH, endM] = newEndTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    if (endMinutes <= startMinutes) {
      setFormData(prev => ({ ...prev, end_time: calculateEndTime(prev.start_time) }));
    } else {
      setFormData(prev => ({ ...prev, end_time: newEndTime }));
    }
  };

  const getGroupName = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    return group?.name || '';
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    
    const days = [];
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  // 📅 Helper to get local date string YYYY-MM-DD
  const getLocalDateString = (date) => {
    if (!date) return '';
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().split('T')[0];
  };

  const getEventsForDate = (date) => {
    if (!date) return [];
    const dateStr = getLocalDateString(date);
    return events.filter(event => {
      const eventDate = event.start_time?.split('T')[0];
      const matchesDate = eventDate === dateStr;
      const matchesGroup = !selectedGroupFilter || event.group_id === parseInt(selectedGroupFilter);
      return matchesDate && matchesGroup;
    });
  };

  const formatTime = (dateTimeStr) => {
    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const goToToday = () => { setCurrentDate(new Date()); setSelectedDate(new Date()); };

  const isToday = (date) => {
    if (!date) return false;
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date) => {
    if (!date || !selectedDate) return false;
    return date.toDateString() === selectedDate.toDateString();
  };

  const handleExportCalendar = (format) => {
    // 1. Filter events for current month and view
    const currentMonthEvents = events.filter(event => {
      if (!event.start_time) return false;
      const eventDate = new Date(event.start_time);
      return eventDate.getMonth() === currentDate.getMonth() && 
             eventDate.getFullYear() === currentDate.getFullYear() &&
             (!selectedGroupFilter || event.group_id === parseInt(selectedGroupFilter));
    });

    if (currentMonthEvents.length === 0) {
      alert(t('no_events_month') || 'No events for this month');
      return;
    }

    // 2. Prepare data
    const dataToExport = currentMonthEvents.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)).map(event => {
      const groupName = getGroupName(event.group_id);
      const typeLabel = EVENT_TYPES[event.type]?.label || event.type;
      
      return {
        date: new Date(event.start_time).toLocaleDateString(),
        time: `${formatTime(event.start_time)} - ${formatTime(event.end_time)}`,
        type: typeLabel,
        group: groupName,
        location: event.location || '',
        description: event.description || ''
      };
    });

    // 3. Define columns
    const columns = {
      date: t('date') || 'Дата',
      time: t('time') || 'Время',
      type: t('type') || 'Тип',
      group: t('group') || 'Группа',
      location: t('location') || 'Место',
      description: t('description') || 'Описание'
    };

    const monthName = MONTHS[currentDate.getMonth()];
    const fileName = `Calendar_Schedule_${monthName}_${currentDate.getFullYear()}`;
    const title = `${t('schedule') || 'Расписание'}: ${monthName} ${currentDate.getFullYear()}`;

    // 4. Export
    if (format === 'excel') {
      exportToExcel(dataToExport, columns, fileName);
    } else {
      exportToPDF(dataToExport, columns, fileName, title);
    }
  };

  const getMonthEventsGrouped = () => {
    const grouped = {};
    events.forEach((event) => {
      if (!event.start_time) return;
      const eventDate = new Date(event.start_time);
      if (
        eventDate.getMonth() !== currentDate.getMonth() ||
        eventDate.getFullYear() !== currentDate.getFullYear()
      ) {
        return;
      }
      if (selectedGroupFilter && event.group_id !== parseInt(selectedGroupFilter)) {
        return;
      }
      const dateKey = getLocalDateString(eventDate);
      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          date: new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()),
          events: []
        };
      }
      grouped[dateKey].events.push(event);
    });
    return Object.entries(grouped)
      .sort((a, b) => a[1].date - b[1].date)
      .map(([dateKey, value]) => ({ dateKey, ...value }));
  };

  const days = getDaysInMonth(currentDate);
  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : [];
  const monthEventsGrouped = getMonthEventsGrouped();

  const openAddModal = (date = null) => {
    setEditingEvent(null);
    setFormData({
      type: 'training',
      group_id: selectedGroupFilter || '',
      date: date ? getLocalDateString(date) : getLocalDateString(new Date()),
      start_time: '18:00',
      end_time: '19:30',
      location: '',
      description: ''
    });
    setShowModal(true);
  };

  const openEditModal = (event) => {
    setEditingEvent(event);
    const startDate = new Date(event.start_time);
    const endDate = new Date(event.end_time);
    setFormData({
      type: event.type || 'training',
      group_id: event.group_id || '',
      date: getLocalDateString(startDate),
      start_time: startDate.toTimeString().slice(0, 5),
      end_time: endDate.toTimeString().slice(0, 5),
      location: event.location || '',
      description: event.description || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const startDateTime = new Date(`${formData.date}T${formData.start_time}`);
      const endDateTime = new Date(`${formData.date}T${formData.end_time}`);
      
      const eventData = {
        type: formData.type,
        group_id: formData.group_id ? parseInt(formData.group_id) : null,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        location: formData.location,
        description: formData.description
      };

      if (editingEvent) {
        await eventsAPI.update(editingEvent.id, eventData);
        setSuccessMessage(t('event_updated') || 'Событие обновлено!');
      } else {
        await eventsAPI.create(eventData);
        setSuccessMessage(t('event_created') || 'Событие создано!');
      }
      
      setTimeout(() => setSuccessMessage(''), 3000);
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving event', error);
      alert(error.response?.data?.detail || t('save_error') || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (eventId) => {
    if (!window.confirm(t('delete_event_confirm') || 'Удалить это событие?')) return;
    try {
      await eventsAPI.delete(eventId);
      setSuccessMessage(t('event_deleted') || 'Событие удалено!');
      setTimeout(() => setSuccessMessage(''), 3000);
      loadData();
    } catch (error) {
      console.error('Error deleting event', error);
      alert(t('delete_error') || 'Ошибка удаления');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-yellow-500 text-lg">{t('loading') || 'Загрузка...'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0F1117] p-2 md:p-6 text-white">
      <div className="fixed inset-0 pointer-events-none bg-gradient-mesh opacity-50" />
      
      <div className="w-full mx-auto relative z-10">
        {/* Header */}
        <div className="mb-4 md:mb-8">
          <div className="flex justify-between items-start">
            <div className="mb-2 md:mb-0">
              <h1 className="text-2xl md:text-4xl font-bold">
                <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                  📅 {t('calendar_title') || 'Календарь'}
                </span>
              </h1>
              <p className="text-gray-400 mt-1 md:mt-2 text-xs md:text-base">
                {t('calendar_subtitle') || 'Управление тренировками и матчами'}
              </p>
            </div>

            {/* Mobile Top-Right Controls */}
            <div className="flex flex-col items-end gap-2 md:hidden">
              {/* Row 1: View Toggle + Exports */}
              <div className="flex items-center gap-1">
                {/* Export Excel */}
                <button 
                  onClick={() => handleExportCalendar('excel')} 
                  className="p-1.5 bg-green-500/10 text-green-400 rounded-lg border border-green-500/30"
                  title={t('export_excel') || "Скачать Excel"}
                >
                  <FileText size={16} />
                </button>
                {/* Export PDF */}
                <button 
                  onClick={() => handleExportCalendar('pdf')} 
                  className="p-1.5 bg-red-500/10 text-red-400 rounded-lg border border-red-500/30"
                  title={t('export_pdf') || "Скачать PDF"}
                >
                  <FileText size={16} />
                </button>
                
                {/* View Toggle */}
                <div className="flex bg-white/5 border border-white/10 rounded-lg p-0.5">
                  <button 
                    onClick={() => setViewMode('month')} 
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition ${viewMode === 'month' ? 'bg-yellow-500 text-black' : 'text-white/60'}`}
                  >
                    {t('view_month') || 'Месяц'}
                  </button>
                  <button 
                    onClick={() => setViewMode('list')} 
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition ${viewMode === 'list' ? 'bg-yellow-500 text-black' : 'text-white/60'}`}
                  >
                    {t('view_list') || 'Список'}
                  </button>
                </div>
              </div>
              
              {/* Row 2: Today */}
              <button 
                onClick={goToToday} 
                className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-white/80 hover:bg-white/10 transition"
              >
                {t('today') || 'Сегодня'}
              </button>
            </div>

            {/* Desktop Controls */}
            <div className="hidden md:flex gap-3 flex-wrap items-center">
              {/* Group filter - HIDDEN for parents */}
              {!isParent && (
                <select
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                  className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                >
                  <option value="" style={{ backgroundColor: '#1C1E24' }}>{t('all_groups') || 'Все группы'}</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id} style={{ backgroundColor: '#1C1E24' }}>{g.name}</option>
                  ))}
                </select>
              )}
              
              <button
                onClick={goToToday}
                className="px-5 py-2.5 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition font-medium"
              >
                {t('today') || 'Сегодня'}
              </button>
              
              {canEdit && (
                <button
                  onClick={() => openAddModal(selectedDate)}
                  className="px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black rounded-xl font-semibold shadow-lg shadow-yellow-500/25 transition-all hover:scale-105"
                >
                  + {t('add_event') || 'Добавить событие'}
                </button>
              )}

              {/* Export Buttons */}
              <div className="flex gap-2 ml-2">
                <button
                  onClick={() => handleExportCalendar('excel')}
                  className="p-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl border border-green-500/30 transition flex items-center gap-2"
                  title={t('export_excel') || "Скачать Excel"}
                >
                  <FileText size={20} />
                </button>
                <button
                  onClick={() => handleExportCalendar('pdf')}
                  className="p-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 transition flex items-center gap-2"
                  title={t('export_pdf') || "Скачать PDF"}
                >
                  <FileText size={20} />
                </button>
              </div>

              <div className="flex bg-white/5 border border-white/10 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                    viewMode === 'month'
                      ? 'bg-yellow-500 text-black'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {t('view_month') || 'Месяц'}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1.5 rounded-lg text-xs md:text-sm font-medium transition ${
                    viewMode === 'list'
                      ? 'bg-yellow-500 text-black'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {t('view_list') || 'Список'}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Secondary Row: Group Filter & Add Event */}
          <div className="flex md:hidden gap-2 mt-2">
            {!isParent && (
              <select
                value={selectedGroupFilter}
                onChange={(e) => setSelectedGroupFilter(e.target.value)}
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm focus:border-yellow-500/50 focus:outline-none"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <option value="" style={{ backgroundColor: '#1C1E24' }}>{t('all_groups') || 'Все группы'}</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id} style={{ backgroundColor: '#1C1E24' }}>{g.name}</option>
                ))}
              </select>
            )}
            
            {canEdit && (
              <button
                onClick={() => openAddModal(selectedDate)}
                className="flex-1 px-3 py-2 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black text-sm rounded-xl font-semibold shadow-lg shadow-yellow-500/25 transition-all"
              >
                + {t('add_event') || 'Добавить'}
              </button>
            )}
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

        {viewMode === 'month' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white/5 rounded-2xl border border-white/10 p-6 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-6">
                <button onClick={prevMonth} className="p-3 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition text-xl">←</button>
                <h2 className="text-2xl font-bold text-white">
                  {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h2>
                <button onClick={nextMonth} className="p-3 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition text-xl">→</button>
              </div>

              <div className="grid grid-cols-7 gap-2 mb-3">
                {DAYS.map((day) => (
                  <div key={day} className="text-center text-sm font-bold text-gray-400 py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 md:gap-2">
                {days.map((day, index) => {
                  const dayEvents = getEventsForDate(day);
                  return (
                    <div
                      key={index}
                      onClick={() => day && setSelectedDate(day)}
                      onDoubleClick={() => day && canEdit && openAddModal(day)}
                      className={`
                        min-h-[60px] md:min-h-[100px] p-1 md:p-2 rounded-xl cursor-pointer transition-all duration-200 border
                        ${!day ? 'bg-transparent border-transparent' : 'hover:border-yellow-500/50 bg-white/[0.02]'}
                        ${isToday(day) ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/5'}
                        ${isSelected(day) ? 'ring-2 ring-yellow-500/50 border-yellow-500/50 bg-yellow-500/10' : ''}
                      `}
                    >
                      {day && (
                        <>
                          <div className={`text-xs md:text-sm font-bold mb-1 ${isToday(day) ? 'text-emerald-400' : 'text-white'}`}>
                            {day.getDate()}
                          </div>

                          <div className="flex md:hidden gap-1 flex-wrap justify-center">
                            {dayEvents.slice(0, 4).map((event, i) => (
                              <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full ${
                                  event.type === 'game'
                                    ? 'bg-green-500'
                                    : event.type === 'training'
                                    ? 'bg-blue-500'
                                    : 'bg-gray-400'
                                }`}
                              />
                            ))}
                            {dayEvents.length > 4 && <span className="text-[8px] text-gray-500">+</span>}
                          </div>

                          <div className="hidden md:block space-y-1">
                            {dayEvents.slice(0, 2).map((event) => {
                              const eventTypeKey = event.type?.toUpperCase() || 'TRAINING';
                              const eventType = EVENT_TYPES[eventTypeKey] || EVENT_TYPES.TRAINING;
                              return (
                                <div
                                  key={event.id}
                                  className={`text-xs px-1.5 py-0.5 rounded truncate ${eventType.bg} ${eventType.border} border`}
                                >
                                  <span className="mr-1">{eventType.icon}</span>
                                  {formatTime(event.start_time)}
                                </div>
                              );
                            })}
                            {dayEvents.length > 2 && (
                              <div className="text-xs text-gray-400 font-medium">
                                +{dayEvents.length - 2} ещё
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">
                  {selectedDate ? `${selectedDate.getDate()} ${MONTHS[selectedDate.getMonth()]}` : 'Выберите дату'}
                </h3>
                {canEdit && selectedDate && (
                  <button
                    onClick={() => openAddModal(selectedDate)}
                    className="p-2 hover:bg-yellow-500/20 rounded-lg text-yellow-500 transition"
                    title="Добавить событие"
                  >
                    ➕
                  </button>
                )}
              </div>

              {selectedEvents.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">📭</div>
                  <p className="text-gray-500">{t('no_events_day') || 'Нет событий на этот день'}</p>
                  {canEdit && (
                    <button
                      onClick={() => openAddModal(selectedDate)}
                      className="mt-4 px-4 py-2 bg-yellow-500/20 border border-yellow-500/30 rounded-xl text-yellow-400 hover:bg-yellow-500/30 transition"
                    >
                      + Добавить событие
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {selectedEvents.map((event) => {
                    const eventTypeKey = event.type?.toUpperCase() || 'TRAINING';
                    const eventType = EVENT_TYPES[eventTypeKey] || EVENT_TYPES.TRAINING;
                    return (
                      <div
                        key={event.id}
                        className={`${eventType.bg} ${eventType.border} border rounded-xl p-4 hover:scale-[1.02] transition-transform cursor-pointer`}
                        onClick={() => canEdit && openEditModal(event)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <div className="text-2xl">{eventType.icon}</div>
                            <div>
                              <div className="font-bold text-white">{eventType.label}</div>
                              <div className="text-sm text-gray-300 mt-1">
                                🕐 {formatTime(event.start_time)} - {formatTime(event.end_time)}
                              </div>
                              {event.group_id && (
                                <div className="text-sm text-gray-400 mt-1">
                                  📚 {getGroupName(event.group_id)}
                                </div>
                              )}
                              {event.location && (
                                <div className="text-sm text-gray-400 mt-1">
                                  📍 {event.location}
                                </div>
                              )}
                              {event.description && (
                                <div className="text-sm text-gray-500 mt-2 italic">
                                  {event.description}
                                </div>
                              )}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(event);
                                }}
                                className="p-2 hover:bg-white/10 rounded-lg text-blue-400 transition"
                                title="Редактировать"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(event.id);
                                }}
                                className="p-2 hover:bg-white/10 rounded-lg text-red-400 transition"
                                title="Удалить"
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

              <div className="mt-6 pt-4 border-t border-white/10">
                <div className="text-sm font-medium text-gray-500 mb-3">{t('event_types_title')}:</div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(EVENT_TYPES).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span>{value.icon}</span>
                      <span className="text-gray-400">{value.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl border border-white/10 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <span className="text-xs text-gray-400">
                {monthEventsGrouped.reduce((sum, day) => sum + day.events.length, 0)} {t('events') || 'событий'}
              </span>
            </div>
            {monthEventsGrouped.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">📭</div>
                <p className="text-gray-500">{t('no_events_month') || 'Нет событий в этом месяце'}</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {monthEventsGrouped.map((day) => {
                  const dateLabel = day.date.toLocaleDateString(t('locale') || 'ru-RU', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'long'
                  });
                  return (
                    <div key={day.dateKey} className="bg-black/20 rounded-xl border border-white/10 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold text-white capitalize">{dateLabel}</div>
                        <div className="text-xs text-gray-400">
                          {day.events.length} {t('events') || 'событий'}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {day.events.map((event) => {
                          const eventTypeKey = event.type?.toUpperCase() || 'TRAINING';
                          const eventType = EVENT_TYPES[eventTypeKey] || EVENT_TYPES.TRAINING;
                          return (
                            <div
                              key={event.id}
                              className={`${eventType.bg} ${eventType.border} border rounded-xl p-3 flex items-start justify-between`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="text-2xl">{eventType.icon}</div>
                                <div>
                                  <div className="font-bold text-white text-sm">{eventType.label}</div>
                                  <div className="text-xs text-gray-300 mt-1">
                                    🕐 {formatTime(event.start_time)} - {formatTime(event.end_time)}
                                  </div>
                                  {event.group_id && (
                                    <div className="text-xs text-gray-400 mt-1">
                                      📚 {getGroupName(event.group_id)}
                                    </div>
                                  )}
                                  {event.location && (
                                    <div className="text-xs text-gray-400 mt-1">
                                      📍 {event.location}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {canEdit && (
                                <button
                                  onClick={() => openEditModal(event)}
                                  className="ml-3 px-2 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white transition"
                                >
                                  ✏️
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Add/Edit Event Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#1C1E24] rounded-3xl shadow-2xl w-full max-w-lg border border-white/10 animate-scale-in max-h-[90vh] flex flex-col">
              <div className="p-6 border-b border-white/10 shrink-0">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="text-2xl">{editingEvent ? '✏️' : '➕'}</span>
                  {editingEvent ? 'Редактировать событие' : 'Новое событие'}
                </h2>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Тип события</label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({...formData, type: e.target.value})}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                        required
                      >
                        {Object.entries(EVENT_TYPES).map(([key, value]) => (
                          <option key={key} value={key} style={{ backgroundColor: '#1C1E24' }}>{value.icon} {value.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Группа</label>
                      <select
                        value={formData.group_id}
                        onChange={(e) => setFormData({...formData, group_id: e.target.value})}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                      >
                        <option value="" style={{ backgroundColor: '#1C1E24' }}>Без группы</option>
                        {groups.map(g => (
                          <option key={g.id} value={g.id} style={{ backgroundColor: '#1C1E24' }}>{g.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Дата</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Начало</label>
                      <input
                        type="time"
                        value={formData.start_time}
                        onChange={(e) => handleStartTimeChange(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">Окончание</label>
                      <input
                        type="time"
                        value={formData.end_time}
                        onChange={(e) => handleEndTimeChange(e.target.value)}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                        min={formData.start_time}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Место</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none placeholder-gray-500"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                      placeholder="Стадион, зал..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Описание</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none placeholder-gray-500 resize-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                      rows="2"
                      placeholder="Дополнительная информация..."
                    />
                  </div>

                </form>
              </div>

              <div className="p-6 border-t border-white/10 shrink-0 flex justify-end gap-3 bg-[#1C1E24]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-300"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  form="eventForm"
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-medium hover:shadow-lg hover:shadow-brand-primary/20 transition-all duration-300 transform hover:-translate-y-0.5"
                >
                  {editingEvent ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
