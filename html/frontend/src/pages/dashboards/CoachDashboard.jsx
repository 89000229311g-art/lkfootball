
import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { eventsAPI, messagesAPI, attendanceAPI, groupsAPI } from '../../api/client';
import {
  ClipboardCheck, Calendar, MessageSquare, Users, AlertCircle,
  MapPin, Clock, ArrowRight, Activity, X, TrendingUp
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export default function CoachDashboard({ t }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [nextEvent, setNextEvent] = useState(null);
  const [todayEvents, setTodayEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [absenceRequests, setAbsenceRequests] = useState([]);
  const [pendingAttendanceEvents, setPendingAttendanceEvents] = useState([]);
  const [showAttendanceReminder, setShowAttendanceReminder] = useState(false);
  const [isQuarterlyCheckDay, setIsQuarterlyCheckDay] = useState(false);

  useEffect(() => {
    const fetchCoachData = async () => {
      try {
        const isCoach = user?.role?.toLowerCase() === 'coach';

        // Check for Quarterly Skills Assessment Reminder (20th of Mar, Jun, Sep, Dec)
        const today = new Date();
        const month = today.getMonth(); // 0-11
        const day = today.getDate();
        if (day === 20 && [2, 5, 8, 11].includes(month)) {
            setIsQuarterlyCheckDay(true);
        }
        const [eventsRes, absenceRes, groupsRes] = await Promise.all([
          eventsAPI.getAll(),
          messagesAPI.getAbsenceRequests(),
          isCoach ? groupsAPI.getAll() : Promise.resolve({ data: [] })
        ]);

        setAbsenceRequests(absenceRes.data || []);
        
        // Set groups
        const groupsData = groupsRes.data?.data || groupsRes.data || [];
        setGroups(groupsData);

        // Базовый список событий
        // Backend already filters events for coach (app/routers/events.py get_events)
        let myEvents = eventsRes.data?.data || eventsRes.data || [];


        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // События на сегодня (только тренировки)
        const todayEvs = myEvents
          .filter(e => {
            const start = new Date(e.start_time);
            const type = e.type?.toLowerCase();
            return (
              type === 'training' &&
              start >= startOfToday &&
              start <= endOfToday
            );
          })
          .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
        
        setTodayEvents(todayEvs);

        // Ближайшее событие:
        // 1) сперва ищем среди сегодняшних, которые ещё не закончились
        let candidate = todayEvs.find(e => new Date(e.end_time) > now);

        // 2) если сегодня всё уже прошло, ищем ближайшее в будущем (завтра и далее)
        if (!candidate) {
          const future = myEvents
            .filter(e => e.type?.toLowerCase() === 'training' && new Date(e.start_time) > endOfToday)
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

          if (future.length > 0) {
            candidate = future[0];
          }
        }

        setNextEvent(candidate || null);

        // Check for missing attendance
        // Only for events that have ALREADY STARTED today
        const startedEvents = todayEvs.filter(e => new Date(e.start_time) < now);
        
        if (startedEvents.length > 0) {
            const attendanceChecks = await Promise.all(
                startedEvents.map(async (event) => {
                    try {
                        const res = await attendanceAPI.getByEvent(event.id);
                        // If response data is empty array or null, attendance likely not taken
                        // Adjust based on actual API response structure. 
                        // Assuming res.data is array of records. If length > 0, taken.
                        const records = Array.isArray(res.data) ? res.data : (res.data?.data || []);
                        return { event, hasAttendance: records.length > 0 };
                    } catch (err) {
                        console.warn(`Failed to check attendance for event ${event.id}`, err);
                        return { event, hasAttendance: false }; // Assume not taken on error to be safe? Or ignore?
                    }
                })
            );

            const missing = attendanceChecks
                .filter(check => !check.hasAttendance)
                .map(check => check.event);
            
            setPendingAttendanceEvents(missing);
            if (missing.length > 0) {
                setShowAttendanceReminder(true);
            }
        }

      } catch (error) {
        console.error("Error loading coach data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCoachData();
  }, [user.id, user?.role]);

  if (loading) return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
      <div className="text-brand-yellow text-lg animate-pulse">{t('loading')}</div>
    </div>
  );

  return (
    <div className="min-h-full bg-[#0F1117] text-white font-sans selection:bg-brand-yellow selection:text-black pb-4 landscape:pb-6 relative overflow-hidden"> 
      {/* Background decoration matching Analytics */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-brand-yellow/5 via-transparent to-transparent" />
      
      <div className="max-w-7xl mx-auto p-4 md:p-8 relative z-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 md:mb-8">
            <div>
                <h1 className="text-2xl md:text-4xl font-bold text-white leading-tight">
                  {t('hello')}, <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">{user.first_name || t('role_coach')}</span>! 👋
                </h1>
                <p className="text-gray-400 text-xs md:text-sm mt-1">{t('ready_for_training')}</p>
            </div>
            <div className="w-9 h-9 md:w-12 md:h-12 rounded-xl bg-brand-gray/20 flex items-center justify-center border border-brand-gray/30 shadow-lg backdrop-blur-sm text-brand-yellow">
                <Activity size={20} className="md:w-6 md:h-6" />
            </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5 md:hidden">
          <button
            onClick={() => navigate('/attendance')}
            className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md px-3 py-3 rounded-xl border border-brand-gray/20 transition text-left flex flex-col gap-1 active:scale-[0.97]"
          >
            <div className="bg-brand-gray/20 w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 group-hover:text-brand-yellow transition-all">
              <ClipboardCheck size={18} />
            </div>
            <div className="font-bold text-white text-xs">
              {t('mark_attendance')}
            </div>
            <div className="text-[11px] text-gray-500">
              {t('attendance')}
            </div>
          </button>
          <button
            onClick={() => navigate('/calendar')}
            className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md px-3 py-3 rounded-xl border border-brand-gray/20 transition text-left flex flex-col gap-1 active:scale-[0.97]"
          >
            <div className="bg-brand-gray/20 w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 group-hover:text-brand-yellow transition-all">
              <Calendar size={18} />
            </div>
            <div className="font-bold text-white text-xs">
              {t('nav_calendar')}
            </div>
            <div className="text-[11px] text-gray-500">
              {t('view_calendar', 'Календарь')}
            </div>
          </button>
          <button
            onClick={() => navigate('/communications')}
            className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md px-3 py-3 rounded-xl border border-brand-gray/20 transition text-left flex flex-col gap-1 active:scale-[0.97]"
          >
            <div className="bg-brand-gray/20 w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 group-hover:text-brand-yellow transition-all">
              <MessageSquare size={18} />
            </div>
            <div className="font-bold text-white text-xs">
              {t('nav_messages')}
            </div>
            <div className="text-[11px] text-gray-500">
              {t('chats_contacts', 'Чаты')}
            </div>
          </button>
          <button
            onClick={() => navigate('/students')}
            className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md px-3 py-3 rounded-xl border border-brand-gray/20 transition text-left flex flex-col gap-1 active:scale-[0.97]"
          >
            <div className="bg-brand-gray/20 w-9 h-9 rounded-lg flex items-center justify-center text-gray-300 group-hover:text-brand-yellow transition-all">
              <Users size={18} />
            </div>
            <div className="font-bold text-white text-xs">
              {t('coach_my_students')}
            </div>
            <div className="text-[11px] text-gray-500">
              {t('players_list', 'Игроки')}
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
            {/* Left Column - Main Content */}
            <div className="lg:col-span-2 space-y-4 md:space-y-6">
                
                {/* --- REMINDERS SECTION --- */}
                {(isQuarterlyCheckDay || pendingAttendanceEvents.length > 0) && (
                    <div className="space-y-4 animate-slide-in">
                        {/* Quarterly Skills Reminder */}
                        {isQuarterlyCheckDay && (
                            <div className="bg-gradient-to-r from-orange-600/20 to-orange-500/20 border border-orange-500/40 rounded-2xl p-5 flex items-start gap-4 relative overflow-hidden group hover:border-orange-500/60 transition-all">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse"></div>
                                
                                <div className="p-3 bg-orange-500/20 rounded-xl text-orange-400 border border-orange-500/20 shrink-0">
                                    <TrendingUp size={24} />
                                </div>
                                <div className="flex-1 relative z-10">
                                    <h3 className="text-lg md:text-xl font-bold text-white mb-1">
                                        {t('quarterly_skills_check_title') || 'Квартальный замер навыков!'}
                                    </h3>
                                    <p className="text-gray-300 text-sm mb-4 leading-relaxed">
                                        {t('quarterly_skills_check_desc') || 'Сегодня 20-е число конца квартала. Необходимо провести замеры навыков и внести данные в статистику учеников.'}
                                    </p>
                                    <button 
                                        onClick={() => navigate('/students')}
                                        className="bg-orange-500 hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-orange-900/20 flex items-center gap-2 active:scale-95"
                                    >
                                        {t('go_to_students') || 'Перейти к ученикам'}
                                        <ArrowRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Attendance Reminder (Static Block) */}
                        {pendingAttendanceEvents.length > 0 && (
                             <div className="bg-gradient-to-r from-red-600/20 to-red-500/20 border border-red-500/40 rounded-2xl p-5 flex flex-col md:flex-row items-start gap-4 relative overflow-hidden group hover:border-red-500/60 transition-all">
                                <div className="absolute bottom-0 left-0 w-32 h-32 bg-red-500/5 rounded-full blur-3xl -ml-10 -mb-10"></div>
                                
                                <div className="flex items-start gap-4 w-full">
                                    <div className="p-3 bg-red-500/20 rounded-xl text-red-400 border border-red-500/20 shrink-0">
                                        <AlertCircle size={24} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg md:text-xl font-bold text-white mb-1">
                                            {t('attendance_missing_title') || 'Не отмечена посещаемость'}
                                        </h3>
                                        <p className="text-gray-300 text-sm mb-3">
                                            {t('attendance_missing_desc') || 'У вас есть неотмеченные тренировки за сегодня:'}
                                        </p>
                                        <div className="space-y-2">
                                             {pendingAttendanceEvents.map(event => (
                                                <div key={event.id} className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                                                    <div className="min-w-0 pr-2">
                                                        <div className="font-bold text-white text-sm truncate">{event.group?.name}</div>
                                                        <div className="text-xs text-white/50 flex items-center gap-1">
                                                            <Clock size={10} />
                                                            {new Date(event.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                                                        </div>
                                                    </div>
                                                    <button 
                                                        onClick={() => navigate(`/attendance?event_id=${event.id}`)}
                                                        className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold transition-colors shadow-lg shadow-red-900/20 whitespace-nowrap"
                                                    >
                                                        {t('mark')}
                                                    </button>
                                                </div>
                                             ))}
                                        </div>
                                    </div>
                                </div>
                             </div>
                        )}
                    </div>
                )}

                {/* FOCUS MODE: Next Event Card */}
                {nextEvent ? (
                    <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-2xl p-5 md:p-6 hover:border-brand-yellow/30 transition-all relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-yellow/5 rounded-full blur-3xl -mr-10 -mt-10 animate-pulse"></div>
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                                    new Date(nextEvent.start_time) < new Date() 
                                    ? 'bg-green-500/10 text-green-400 border-green-500/20 animate-pulse' 
                                    : 'bg-brand-yellow/10 text-brand-yellow border-brand-yellow/20'
                                }`}>
                                    {new Date(nextEvent.start_time) < new Date() ? (t('current_training') || 'Идет тренировка') : t('next_training')}
                                </span>
                                <div className="flex flex-col items-end">
                                     <span className="text-white font-mono text-2xl font-bold tracking-tight">
                                        {new Date(nextEvent.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', hour12: false})}
                                    </span>
                                    <span className="text-gray-400 text-xs uppercase font-semibold tracking-wider">
                                        {new Date(nextEvent.start_time).toLocaleDateString([], {weekday: 'short', day: 'numeric'})}
                                    </span>
                                </div>
                            </div>

                            <h2 className="text-2xl md:text-3xl font-bold mb-2 text-white tracking-tight">
                                {nextEvent.group?.name || t('group')}
                            </h2>
                            <p className="text-gray-400 mb-6 flex items-center gap-2 text-sm">
                                <MapPin size={16} className="text-brand-yellow" />
                                {nextEvent.location || t('cd_field_placeholder')}
                            </p>

                            <button 
                                onClick={() => navigate(`/attendance?event_id=${nextEvent.id}`)}
                                className="w-full bg-brand-yellow text-black font-bold py-3 md:py-4 rounded-xl shadow-lg shadow-brand-yellow/10 hover:shadow-brand-yellow/20 hover:bg-yellow-400 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            >
                                <ClipboardCheck size={20} />
                                <span className="text-base md:text-lg">{t('start_attendance')}</span>
                            </button>
                            
                            {/* Training Plan Teaser */}
                            {nextEvent.training_plan && (
                                <div className="mt-5 pt-4 border-t border-brand-gray/20">
                                    <div className="flex items-center gap-2 text-xs text-gray-400 uppercase font-bold tracking-wider mb-2">
                                        <span className="w-1.5 h-1.5 bg-brand-yellow rounded-full"></span>
                                        {t('training_plan')}
                                    </div>
                                    <div className="text-sm text-gray-300 line-clamp-2 leading-relaxed bg-brand-black/30 p-3 rounded-lg border border-brand-gray/20">
                                        {nextEvent.training_plan}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="bg-brand-gray/10 rounded-2xl p-8 text-center border border-brand-gray/20 backdrop-blur-md">
                        <div className="text-4xl mb-4 opacity-50">😴</div>
                        <h3 className="text-xl font-bold text-white">{t('no_events_today')}</h3>
                        <p className="text-gray-500 mt-2 text-sm">{t('no_upcoming_events')}</p>
                    </div>
                )}

                {/* Today's Schedule List */}
                {todayEvents.length > 0 && (
                    <div className="pt-2">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
                            <Clock className="text-brand-yellow" size={20} />
                            {t('schedule_today')}
                        </h3>
                        <div className="space-y-3">
                            {todayEvents.map(event => (
                                <div key={event.id} onClick={() => navigate(`/attendance?event_id=${event.id}`)} className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md p-4 rounded-xl border border-brand-gray/20 flex gap-4 cursor-pointer transition active:scale-[0.98] group">
                                    <div className="flex flex-col items-center justify-center w-16 bg-brand-black/30 rounded-lg border border-brand-gray/20 group-hover:border-brand-yellow/30 transition-colors">
                                        <span className="text-sm font-bold text-white">{new Date(event.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}</span>
                                        <span className="text-[10px] text-gray-500 uppercase">{new Date(event.end_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}</span>
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <h4 className="font-bold text-white text-lg truncate group-hover:text-brand-yellow transition-colors">{event.group?.name}</h4>
                                        <p className="text-sm text-gray-400 flex items-center gap-1">
                                            <MapPin size={12} />
                                            {event.location}
                                        </p>
                                    </div>
                                    <div className="flex items-center text-gray-500 group-hover:text-brand-yellow transition-colors">
                                        <ArrowRight size={20} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Right Column - Sidebar */}
            <div className="space-y-4 md:space-y-6">
                {/* Absence Requests Alert */}
                <button 
                  onClick={() => navigate('/communications?tab=absence')}
                  className="w-full bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md p-4 md:p-5 rounded-2xl border border-brand-gray/20 flex items-center justify-between group transition shadow-lg hover:border-brand-yellow/30"
                >
                   <div className="flex items-center gap-4">
                      <div className="relative">
                          <div className="w-12 h-12 rounded-xl bg-brand-gray/20 text-gray-300 flex items-center justify-center border border-brand-gray/30 group-hover:text-brand-yellow group-hover:border-brand-yellow/30 transition-all">
                             <AlertCircle size={24} />
                          </div>
                          {absenceRequests.length > 0 && (
                            <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center border-2 border-brand-black animate-pulse">
                                <span className="text-white text-[10px] font-bold">{absenceRequests.length}</span>
                            </div>
                          )}
                      </div>
                      <div className="text-left">
                         <div className="font-bold text-white text-lg group-hover:text-brand-yellow transition-colors">{t('cd_absence_requests')}</div>
                         <div className="text-sm text-gray-400">
                            {absenceRequests.length > 0 
                                ? `${absenceRequests.length} ${t('new_requests', 'новых запросов')}`
                                : t('cd_check_msgs')}
                         </div>
                      </div>
                   </div>
                   <div className="w-10 h-10 rounded-full bg-brand-gray/20 flex items-center justify-center text-gray-500 group-hover:text-brand-yellow group-hover:bg-brand-yellow/10 transition-all">
                      <ArrowRight size={18} />
                   </div>
                </button>

                {/* Quick Actions Grid */}
                <div>
                    <h3 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
                        <Activity className="text-brand-yellow" size={20} />
                        {t('quick_actions', 'Быстрые действия')}
                    </h3>
                    <div className="grid grid-cols-2 gap-3 md:gap-4 hidden md:grid">
                        <button
                          onClick={() => navigate('/schedule')}
                          className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md p-4 rounded-xl border border-brand-gray/20 transition text-left group hover:border-brand-yellow/30"
                        >
                            <div className="bg-brand-gray/20 w-10 h-10 rounded-lg flex items-center justify-center text-gray-300 mb-3 group-hover:text-brand-yellow group-hover:scale-110 transition-all">
                                <Calendar size={20} />
                            </div>
                            <div className="font-bold text-white text-sm md:text-base group-hover:text-brand-yellow transition-colors">{t('nav_schedule')}</div>
                            <div className="text-xs text-gray-500 mt-1">{t('view_calendar', 'Календарь')}</div>
                        </button>
                        
                        <button
                          onClick={() => navigate('/attendance')}
                          className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md p-4 rounded-xl border border-brand-gray/20 transition text-left group hover:border-brand-yellow/30"
                        >
                            <div className="bg-brand-gray/20 w-10 h-10 rounded-lg flex items-center justify-center text-gray-300 mb-3 group-hover:text-brand-yellow group-hover:scale-110 transition-all">
                                <ClipboardCheck size={20} />
                            </div>
                            <div className="font-bold text-white text-sm md:text-base group-hover:text-brand-yellow transition-colors">
                              {t('mark_attendance')}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {t('attendance')}
                            </div>
                        </button>
                        
                        <button onClick={() => navigate('/communications')} className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md p-4 rounded-xl border border-brand-gray/20 transition text-left group hover:border-brand-yellow/30">
                            <div className="bg-brand-gray/20 w-10 h-10 rounded-lg flex items-center justify-center text-gray-300 mb-3 group-hover:text-brand-yellow group-hover:scale-110 transition-all">
                                <MessageSquare size={20} />
                            </div>
                            <div className="font-bold text-white text-sm md:text-base group-hover:text-brand-yellow transition-colors">{t('nav_messages')}</div>
                            <div className="text-xs text-gray-500 mt-1">{t('chats_contacts', 'Чаты')}</div>
                        </button>
                        
                        <button onClick={() => navigate('/students')} className="bg-brand-gray/10 hover:bg-brand-gray/20 backdrop-blur-md p-4 rounded-xl border border-brand-gray/20 transition text-left group hover:border-brand-yellow/30">
                            <div className="bg-brand-gray/20 w-10 h-10 rounded-lg flex items-center justify-center text-gray-300 mb-3 group-hover:text-brand-yellow group-hover:scale-110 transition-all">
                                <Users size={20} />
                            </div>
                            <div className="font-bold text-white text-sm md:text-base group-hover:text-brand-yellow transition-colors">{t('coach_my_students')}</div>
                            <div className="text-xs text-gray-500 mt-1">{t('players_list', 'Игроки')}</div>
                        </button>
                    </div>
                </div>

                {/* My Groups List */}
                {groups.length > 0 && (
                    <div>
                        <h3 className="text-lg font-bold mb-4 text-white flex items-center gap-2">
                            <Users className="text-brand-yellow" size={20} />
                            {t('my_groups') || 'Мои группы'} ({groups.length})
                        </h3>
                        <div className="space-y-3">
                            {groups.map(group => (
                                <div key={group.id} className="bg-brand-gray/10 p-4 rounded-xl border border-brand-gray/20 flex justify-between items-center hover:border-brand-yellow/30 transition-colors group">
                                    <div>
                                        <div className="font-bold text-white group-hover:text-brand-yellow transition-colors">{group.name}</div>
                                        <div className="text-xs text-gray-400">{group.age_group}</div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="text-xs bg-brand-yellow/10 text-brand-yellow px-2 py-1 rounded-lg border border-brand-yellow/20">
                                            {group.students_count || 0} {t('students_short', 'уч.')}
                                        </div>
                                        {/* Show 'Assistant' label if not primary coach */}
                                        {Number(group.coach_id) !== Number(user.id) && (
                                            <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                                                {t('assistant', 'Помощник')}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Attendance Reminder Modal - Persistent if needed */}
      <AnimatePresence>
        {showAttendanceReminder && pendingAttendanceEvents.length > 0 && (
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-0 left-0 right-0 z-[100] p-4"
            >
                <div className="max-w-2xl mx-auto bg-red-500/10 backdrop-blur-xl border border-red-500/30 rounded-2xl p-6 shadow-2xl shadow-red-900/20">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-red-500 rounded-full animate-bounce">
                            <AlertCircle size={24} className="text-white" />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-white mb-2">{t('attendance_reminder_title') || 'Не забудьте отметить посещаемость!'}</h3>
                            <p className="text-red-200 mb-4 text-sm">
                                {t('attendance_reminder_desc') || 'Вы не отметили посещаемость для следующих тренировок:'}
                            </p>
                            <div className="space-y-2 mb-4">
                                {pendingAttendanceEvents.map(event => (
                                    <div key={event.id} className="flex items-center justify-between bg-black/40 p-3 rounded-xl border border-white/5">
                                        <div>
                                            <div className="font-bold text-white">{event.group?.name}</div>
                                            <div className="text-xs text-white/50">
                                                {new Date(event.start_time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12: false})}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => navigate(`/attendance?event_id=${event.id}`)}
                                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-bold transition-colors"
                                        >
                                            {t('mark')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <button 
                                onClick={() => setShowAttendanceReminder(false)}
                                className="text-white/40 hover:text-white text-sm underline"
                            >
                                {t('remind_later') || 'Напомнить позже'}
                            </button>
                        </div>
                        <button onClick={() => setShowAttendanceReminder(false)} className="text-white/40 hover:text-white">
                            <X size={20} />
                        </button>
                    </div>
                </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
