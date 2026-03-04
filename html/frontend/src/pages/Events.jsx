import { useState, useEffect } from 'react';
import { eventsAPI, groupsAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

const CURRENT_YEAR = new Date().getFullYear();

export default function Events() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const canEdit = user && user.role !== 'parent';

  const filteredEvents = searchQuery.trim()
    ? events.filter(e => {
        const group = groups.find(g => g.id === e.group_id);
        const typeLabel = getEventTypeLabel(e.type);
        return (
          group?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          typeLabel?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.location?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
    : events;
  
  const getDefaultDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };
  
  const [formData, setFormData] = useState({
    group_id: '',
    type: 'training',
    date: getDefaultDate(),
    start_time: '10:00',
    end_time: '11:30',
    location: '',
    notes: '',
    opponent: '',
    tournament_name: '',
    meeting_agenda: ''
  });

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

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [eventsRes, groupsRes] = await Promise.all([
        eventsAPI.getAll(),
        groupsAPI.getAll()
      ]);
      setEvents(eventsRes.data.data || []);
      setGroups(groupsRes.data.data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const start_time = `${formData.date}T${formData.start_time}:00`;
      const end_time = `${formData.date}T${formData.end_time}:00`;
      
      const data = {
        group_id: parseInt(formData.group_id),
        type: formData.type,
        start_time,
        end_time,
        location: formData.location || 'Main Field'
      };
      
      if (editingEvent) {
        await eventsAPI.update(editingEvent.id, data);
      } else {
        await eventsAPI.create(data);
      }
      fetchData();
      closeModal();
    } catch (error) {
      console.error('Error saving event:', error);
      alert(error.response?.data?.detail || t('save_error'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('confirm_delete_event'))) {
      try {
        await eventsAPI.delete(id);
        fetchData();
      } catch (error) {
        alert(error.response?.data?.detail || t('delete_error'));
      }
    }
  };

  const openModal = (event = null) => {
    if (event) {
      setEditingEvent(event);
      const startDate = event.start_time ? new Date(event.start_time) : new Date();
      const endDate = event.end_time ? new Date(event.end_time) : new Date();
      setFormData({
        group_id: event.group_id || '',
        type: event.type || 'training',
        date: startDate.toISOString().split('T')[0],
        start_time: startDate.toTimeString().slice(0, 5),
        end_time: endDate.toTimeString().slice(0, 5),
        location: event.location || ''
      });
    } else {
      setEditingEvent(null);
      setFormData({
        group_id: groups.length > 0 ? groups[0].id : '',
        type: 'training',
        date: getDefaultDate(),
        start_time: '10:00',
        end_time: '12:00',
        location: ''
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingEvent(null);
  };

  const getEventTypeLabel = (type) => {
    const types = {
      training: t('training'),
      game: t('game'),
      tournament: t('tournament'),
      parent_meeting: t('parent_meeting'),
      friendly_game: t('friendly_game'),
      game_day: t('game_day'),
      individual: t('individual_training'),
      medical: t('medical')
    };
    return types[type] || type;
  };

  const getEventTypeColor = (type) => {
    const colors = {
      training: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      game: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      tournament: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      parent_meeting: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      friendly_game: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      game_day: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      individual: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      medical: 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[type] || 'bg-white/10 text-white/60 border-white/10';
  };

  const getEventTypeIcon = (type) => {
    const icons = {
      training: '🏋️',
      game: '⚽',
      tournament: '🏆',
      parent_meeting: '👨‍👩‍👧',
      friendly_game: '🤝',
      game_day: '📅',
      individual: '🎯',
      medical: '🏥'
    };
    return icons[type] || '📅';
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '-';
    const date = new Date(dateTimeStr);
    const localeMap = { ru: 'ru-RU', en: 'en-US', ro: 'ro-RO' };
    return date.toLocaleDateString(localeMap[language] || 'ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatTimeRange = (startTime, endTime) => {
    if (!startTime || !endTime) return '-';
    const start = new Date(startTime);
    const end = new Date(endTime);
    return `${start.toTimeString().slice(0, 5)} - ${end.toTimeString().slice(0, 5)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin"></div>
          <span className="text-white/60 text-lg">{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-2 md:p-6 pb-24 md:pb-6 text-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-3">
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                📅 {t('schedule_title')}
              </span>
            </h1>
            <p className="text-white/50 mt-1 md:mt-2 text-sm md:text-base">
              {t('schedule_year')}: {CURRENT_YEAR}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <input
              type="text"
              placeholder="🔍 Поиск события по группе, типу или месту..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 pl-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 transition-colors"
            />
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/40 text-xl">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60"
              >
                ✕
              </button>
            )}
          </div>
          {searchQuery && (
            <p className="mt-2 text-sm text-white/50">
              Найдено: <span className="font-bold text-yellow-400">{filteredEvents.length}</span> событий
            </p>
          )}
        </div>

        {/* Quick Add Buttons */}
        {canEdit && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
            <button
              onClick={() => { setFormData({...formData, type: 'training'}); openModal(); }}
              className="p-4 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 rounded-xl transition-all flex flex-col items-center gap-2"
            >
              <span className="text-3xl">🏋️</span>
              <span className="font-medium text-blue-400 text-sm">{t('training')}</span>
            </button>
            <button
              onClick={() => { setFormData({...formData, type: 'game'}); openModal(); }}
              className="p-4 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-xl transition-all flex flex-col items-center gap-2"
            >
              <span className="text-3xl">⚽</span>
              <span className="font-medium text-emerald-400 text-sm">{t('game')}</span>
            </button>
            <button
              onClick={() => { setFormData({...formData, type: 'tournament'}); openModal(); }}
              className="p-4 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 rounded-xl transition-all flex flex-col items-center gap-2"
            >
              <span className="text-3xl">🏆</span>
              <span className="font-medium text-purple-400 text-sm">{t('tournament')}</span>
            </button>
            <button
              onClick={() => { setFormData({...formData, type: 'parent_meeting'}); openModal(); }}
              className="p-4 bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 rounded-xl transition-all flex flex-col items-center gap-2"
            >
              <span className="text-3xl">👨‍👩‍👧</span>
              <span className="font-medium text-orange-400 text-sm">{t('parent_meeting')}</span>
            </button>
            <button
              onClick={() => { setFormData({...formData, type: 'friendly_game'}); openModal(); }}
              className="p-4 bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 rounded-xl transition-all flex flex-col items-center gap-2"
            >
              <span className="text-3xl">🤝</span>
              <span className="font-medium text-yellow-400 text-sm">{t('friendly_game')}</span>
            </button>
            <button
              onClick={() => { setFormData({...formData, type: 'game_day'}); openModal(); }}
              className="p-4 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 rounded-xl transition-all flex flex-col items-center gap-2"
            >
              <span className="text-3xl">📅</span>
              <span className="font-medium text-indigo-400 text-sm">{t('game_day')}</span>
            </button>
          </div>
        )}

        {/* Table */}
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/70">{t('group')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/70">{t('type')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/70">{t('date')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/70">{t('time')}</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-white/70">{t('location')}</th>
                <th className="px-6 py-4 text-right text-sm font-semibold text-white/70">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredEvents.map((event) => {
                const group = groups.find(g => g.id === event.group_id);
                return (
                  <tr key={event.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-medium text-white">{group?.name || '-'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 inline-flex border ${getEventTypeColor(event.type)}`}>
                        <span>{getEventTypeIcon(event.type)}</span>
                        <span>{getEventTypeLabel(event.type)}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 text-white/60">{formatDateTime(event.start_time)}</td>
                    <td className="px-6 py-4 text-white/60">{formatTimeRange(event.start_time, event.end_time)}</td>
                    <td className="px-6 py-4 text-white/60">{event.location || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      {canEdit && (
                        <div className="flex gap-2 justify-end">
                          <button 
                            onClick={() => openModal(event)} 
                            className="px-3 py-1.5 bg-white/5 border border-white/10 text-white/70 rounded-lg text-sm hover:bg-white/10 transition-colors"
                          >
                            {t('edit')}
                          </button>
                          <button 
                            onClick={() => handleDelete(event.id)} 
                            className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/30 transition-colors"
                          >
                            {t('delete')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-white/40">
                    {searchQuery ? 'Ничего не найдено' : t('no_events')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
            <div className="bg-[#1C1E24] border border-white/10 rounded-3xl w-full max-w-md animate-scale-in flex flex-col max-h-[90dvh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-3 md:p-6 pb-3 shrink-0 border-b border-white/10">
                <h2 className="text-xl font-bold text-white">
                  {editingEvent ? t('edit') : t('add')} {t('event')}
                </h2>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-3 md:p-6 py-3 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('group')} *</label>
                  <select 
                    value={formData.group_id} 
                    onChange={(e) => setFormData({...formData, group_id: e.target.value})} 
                    className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                    required
                  >
                    <option value="">{t('select_group')}</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('type')}</label>
                  <select 
                    value={formData.type} 
                    onChange={(e) => setFormData({...formData, type: e.target.value})} 
                    className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                  >
                    <option value="training">🏃 {t('training')}</option>
                    <option value="individual">👤 {t('individual_training')}</option>
                    <option value="tournament">🏆 {t('tournament')}</option>
                    <option value="medical">🏥 {t('medical')}</option>
                    <option value="game">⚽ {t('game')}</option>
                    <option value="parent_meeting">👨‍👩‍👧 {t('parent_meeting')}</option>
                    <option value="friendly_game">🤝 {t('friendly_game')}</option>
                    <option value="game_day">📅 {t('game_day')}</option>
                  </select>
                </div>
                
                {formData.type === 'game' && (
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">{t('opponent')}</label>
                    <input 
                      type="text" 
                      placeholder={t('opponent_name')} 
                      value={formData.opponent} 
                      onChange={(e) => setFormData({...formData, opponent: e.target.value})} 
                      className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50" 
                    />
                  </div>
                )}
                {formData.type === 'tournament' && (
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">{t('tournament_name')}</label>
                    <input 
                      type="text" 
                      placeholder={t('tournament_name')} 
                      value={formData.tournament_name} 
                      onChange={(e) => setFormData({...formData, tournament_name: e.target.value})} 
                      className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50" 
                    />
                  </div>
                )}
                {formData.type === 'parent_meeting' && (
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">{t('meeting_agenda')}</label>
                    <textarea 
                      placeholder={t('meeting_agenda')} 
                      value={formData.meeting_agenda} 
                      onChange={(e) => setFormData({...formData, meeting_agenda: e.target.value})} 
                      className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50" 
                      rows="3" 
                    />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('date')} *</label>
                  <input 
                    type="date" 
                    value={formData.date} 
                    onChange={(e) => setFormData({...formData, date: e.target.value})} 
                    className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50" 
                    required 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">{t('start_time')} *</label>
                    <input 
                      type="time" 
                      value={formData.start_time} 
                      onChange={(e) => handleStartTimeChange(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50" 
                      required 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">{t('end_time')} *</label>
                    <input 
                      type="time" 
                      value={formData.end_time} 
                      onChange={(e) => handleEndTimeChange(e.target.value)} 
                      className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50" 
                      min={formData.start_time}
                      required 
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('location')}</label>
                  <input 
                    type="text" 
                    placeholder={t('location_placeholder')} 
                    value={formData.location} 
                    onChange={(e) => setFormData({...formData, location: e.target.value})} 
                    className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50" 
                  />
                </div>
                
                </div>
                <div className="p-3 md:p-6 pt-3 shrink-0 flex gap-3 border-t border-white/10 bg-[#1C1E24]">
                  <button 
                    type="button" 
                    onClick={closeModal} 
                    className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-white/70 rounded-xl hover:bg-white/10 transition-all"
                  >
                    {t('cancel')}
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-semibold px-4 py-3 rounded-xl hover:shadow-lg hover:shadow-yellow-500/25 transition-all"
                  >
                    {t('save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
