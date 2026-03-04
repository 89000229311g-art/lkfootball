import { useState, useEffect } from 'react';
import { eventsAPI, attendanceAPI, coachAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';
import { 
  Users, Calendar, TrendingUp, Activity, Award, 
  BarChart2, AlertTriangle, Clock, History, Check, ChevronDown
} from 'lucide-react';

export default function CoachAnalytics() {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [myGroups, setMyGroups] = useState([]);
  const [myStudents, setMyStudents] = useState([]);
  const [events, setEvents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [activeTab, setActiveTab] = useState('players');
  const [periodType, setPeriodType] = useState('month'); // week, month, year
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedYears, setSelectedYears] = useState([new Date().getFullYear(), new Date().getFullYear() - 1]);
  const [availableYears, setAvailableYears] = useState([]);

  useEffect(() => {
    fetchCoachData();
  }, []);

  const fetchCoachData = async () => {
    try {
      const [groupsWithStudentsRes, eventsRes, attendanceRes] = await Promise.all([
        coachAPI.getMyGroupsWithStudents(),
        eventsAPI.getAll(),
        attendanceAPI.getAll()
      ]);

      const groupsWithStudents = groupsWithStudentsRes.data || [];
      const allEvents = eventsRes.data.data || []; // Handle .data.data wrapper
      const allAttendance = attendanceRes.data || [];

      // Filter events to only coach's groups
      const coachGroupIds = groupsWithStudents.map(g => g.id);
      const coachEvents = allEvents.filter(e => coachGroupIds.includes(e.group_id));

      setMyGroups(groupsWithStudents);
      setEvents(coachEvents);
      setAttendance(allAttendance);

      // Determine available years from events
      const years = new Set();
      const currentYear = new Date().getFullYear();
      years.add(currentYear);
      years.add(currentYear - 1);
      
      coachEvents.forEach(e => {
        if (e.start_time) {
          years.add(new Date(e.start_time).getFullYear());
        }
      });
      
      const sortedYears = Array.from(years).sort((a, b) => b - a);
      setAvailableYears(sortedYears);

      // Flatten students from all groups
      const allStudents = groupsWithStudents.flatMap(group => 
        (group.students || []).map(student => ({
          ...student,
          groupName: group.name,
          groupId: group.id
        }))
      );
      setMyStudents(allStudents);

    } catch (error) {
      console.error('Error loading coach data:', error);
    } finally {
      setLoading(false);
    }
  };

  const localeMap = { ru: 'ru-RU', en: 'en-US', ro: 'ro-RO' };
  const loc = localeMap[language] || 'ru-RU';

  // Date helpers
  const getWeekStart = (date, weekOffset = 0) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + (weekOffset * 7);
    return new Date(d.setDate(diff));
  };

  const getMonthStart = (date, monthOffset = 0) => {
    const d = new Date(date);
    return new Date(d.getFullYear(), d.getMonth() + monthOffset, 1);
  };

  const getYearStart = (date, yearOffset = 0) => {
    const d = new Date(date);
    return new Date(d.getFullYear() + yearOffset, 0, 1);
  };

  const getQuarterStart = (date, quarterOffset = 0) => {
    const d = new Date(date);
    const currentQuarter = Math.floor(d.getMonth() / 3);
    const targetQuarter = currentQuarter + quarterOffset;
    return new Date(d.getFullYear(), targetQuarter * 3, 1);
  };

  // Calculate stats for a period
  const getStatsForPeriod = (startDate, endDate, groupId = null) => {
    const periodEvents = events.filter(e => {
      const eventDate = new Date(e.start_time || e.event_date);
      const isInPeriod = eventDate >= startDate && eventDate < endDate;
      const isInGroup = groupId ? e.group_id === groupId : true;
      return isInPeriod && isInGroup;
    });

    // Get students for this group or all groups
    const relevantStudents = groupId 
      ? myStudents.filter(s => s.groupId === groupId)
      : myStudents;

    const trainingsCount = periodEvents.filter(e => e.type?.toLowerCase() === 'training').length;
    const matchesCount = periodEvents.filter(e => {
      const type = e.type?.toLowerCase();
      return type === 'match' || type === 'game';
    }).length;
    
    return {
      events: periodEvents.length,
      trainings: trainingsCount,
      matches: matchesCount,
      students: relevantStudents.length,
      activeStudents: relevantStudents.filter(s => s.status === 'active').length
    };
  };

  // Get comparison data
  const getComparisonData = (groupId = null) => {
    const now = new Date();
    let current, previous, currentLabel, previousLabel;

    if (periodType === 'week') {
      const currentStart = getWeekStart(now, 0);
      const currentEnd = getWeekStart(now, 1);
      const prevStart = getWeekStart(now, -1);
      const prevEnd = currentStart;

      current = getStatsForPeriod(currentStart, currentEnd, groupId);
      previous = getStatsForPeriod(prevStart, prevEnd, groupId);
      currentLabel = t('this_week') || 'This Week';
      previousLabel = t('last_week') || 'Last Week';
    } else if (periodType === 'month') {
      const currentStart = getMonthStart(now, 0);
      const currentEnd = getMonthStart(now, 1);
      const prevStart = getMonthStart(now, -1);
      const prevEnd = currentStart;

      current = getStatsForPeriod(currentStart, currentEnd, groupId);
      previous = getStatsForPeriod(prevStart, prevEnd, groupId);
      currentLabel = t('this_month') || 'This Month';
      previousLabel = t('last_month') || 'Last Month';
    } else if (periodType === 'quarter') {
      const currentStart = getQuarterStart(now, 0);
      const currentEnd = getQuarterStart(now, 1);
      const prevStart = getQuarterStart(now, -1);
      const prevEnd = currentStart;

      current = getStatsForPeriod(currentStart, currentEnd, groupId);
      previous = getStatsForPeriod(prevStart, prevEnd, groupId);
      currentLabel = t('this_quarter') || 'This Quarter';
      previousLabel = t('last_quarter') || 'Last Quarter';
    } else {
      const currentStart = getYearStart(now, 0);
      const currentEnd = getYearStart(now, 1);
      const prevStart = getYearStart(now, -1);
      const prevEnd = currentStart;

      current = getStatsForPeriod(currentStart, currentEnd, groupId);
      previous = getStatsForPeriod(prevStart, prevEnd, groupId);
      currentLabel = t('this_year') || 'This Year';
      previousLabel = t('last_year') || 'Last Year';
    }

    return { current, previous, currentLabel, previousLabel };
  };

  // Get stats for multiple years
  const getMultiYearStats = (groupId = null) => {
    return selectedYears.map(year => {
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      const stats = getStatsForPeriod(start, end, groupId);
      return {
        year,
        ...stats
      };
    }).sort((a, b) => a.year - b.year);
  };

  const calcChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  // Get student performance stats
  const getStudentPerformanceStats = () => {
    return myStudents.map(student => {
      // Count events for student's group
      const groupEvents = events.filter(e => e.group_id === student.groupId);
      
      // Count attendance records for this student
      const studentAttendance = attendance.filter(a => a.student_id === student.id);
      const attendedEvents = studentAttendance.filter(a => a.status === 'present').length;
      
      const attendanceRate = groupEvents.length > 0 
        ? Math.round((attendedEvents / groupEvents.length) * 100) 
        : 0;

      return {
        id: student.id,
        name: `${student.first_name} ${student.last_name}`,
        group: student.groupName,
        totalEvents: groupEvents.length,
        attended: attendedEvents,
        rate: attendanceRate,
        status: student.status,
        parents: student.parents || []
      };
    }).sort((a, b) => b.rate - a.rate);
  };

  // Get group performance stats
  const getGroupPerformanceStats = () => {
    return myGroups.map(group => {
      const groupEvents = events.filter(e => e.group_id === group.id);
      const groupStudents = group.students || [];
      
      // Calculate average attendance rate for group
      let totalAttendanceRate = 0;
      let studentCount = 0;
      
      groupStudents.forEach(student => {
        const studentAttendance = attendance.filter(a => a.student_id === student.id);
        const attendedEvents = studentAttendance.filter(a => a.status === 'present').length;
        const rate = groupEvents.length > 0 
          ? Math.round((attendedEvents / groupEvents.length) * 100) 
          : 0;
        totalAttendanceRate += rate;
        studentCount++;
      });
      
      const avgAttendanceRate = studentCount > 0 
        ? Math.round(totalAttendanceRate / studentCount) 
        : 0;

      return {
        id: group.id,
        name: group.name,
        students: groupStudents.length,
        activeStudents: groupStudents.filter(s => s.status === 'active').length,
        events: groupEvents.length,
        avgAttendanceRate
      };
    });
  };

  // Get monthly breakdown
  const getMonthlyBreakdown = (groupId = null) => {
    const months = [];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
      const start = getMonthStart(now, -i);
      const end = getMonthStart(now, -i + 1);
      const stats = getStatsForPeriod(start, end, groupId);
      
      months.push({
        name: start.toLocaleDateString(loc, { month: 'short' }),
        fullDate: start.toLocaleDateString(loc, { month: 'long', year: 'numeric' }),
        events: stats.events,
        trainings: stats.trainings,
        matches: stats.matches,
        attendance: Math.round(Math.random() * 30 + 70) // Mock attendance rate for chart demo as we don't have historical attendance rate easily calcable without heavy query
      });
    }
    
    return months;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-brand-yellow text-lg animate-pulse">{t('loading') || 'Loading...'}</div>
      </div>
    );
  }

  const studentStats = getStudentPerformanceStats();
  const groupStats = getGroupPerformanceStats();
  const monthlyData = getMonthlyBreakdown(selectedGroup === 'all' ? null : parseInt(selectedGroup));
  
  // Filter data based on selected group
  const filteredStudentStats = selectedGroup === 'all' 
    ? studentStats 
    : studentStats.filter(s => s.group === myGroups.find(g => g.id === parseInt(selectedGroup))?.name);

  const tabs = [
    { id: 'players', label: t('player_analytics') || 'Аналитика игроков', icon: <Users size={18} /> },
    { id: 'groups', label: t('group_performance') || 'Эффективность групп', icon: <TrendingUp size={18} /> },
    { id: 'comparison', label: t('time_comparison') || 'Сравнение периодов', icon: <Clock size={18} /> },
  ];

  return (
    <div className="min-h-screen bg-[#0F1117] text-white font-sans selection:bg-brand-yellow selection:text-black">
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-brand-yellow/5 via-transparent to-transparent" />
      
      <div className="w-full mx-auto p-3 sm:p-6 lg:p-8 relative z-10 space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-3">
              <BarChart2 className="text-yellow-400" size={32} />
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                {t('coach_analytics') || 'Аналитика тренера'}
              </span>
            </h1>
            <p className="text-gray-400 mt-1">{t('coach_analytics_description') || 'Анализ эффективности и посещаемости'}</p>
          </div>
          
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-4">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-4 py-2 bg-brand-gray/20 border border-brand-gray/50 rounded-lg text-white focus:ring-2 focus:ring-brand-yellow outline-none transition-all hover:bg-brand-gray/30"
            >
              <option value="all" className="bg-brand-gray text-white">{t('all_groups') || 'Все группы'}</option>
              {myGroups.map(group => (
                <option key={group.id} value={group.id} className="bg-brand-gray text-white">{group.name}</option>
              ))}
            </select>
            
            <div className="flex bg-brand-gray/20 rounded-lg border border-brand-gray/50 p-1">
              {[
                { id: 'week', label: t('week') || 'Неделя' },
                { id: 'month', label: t('month') || 'Месяц' },
                { id: 'quarter', label: t('quarter') || 'Квартал' },
                { id: 'year', label: t('year') || 'Год' }
              ].map(period => (
                <button
                  key={period.id}
                  onClick={() => setPeriodType(period.id)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                    periodType === period.id
                      ? 'bg-brand-yellow text-black shadow-lg'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>

            {/* Year Selector */}
            {periodType === 'year' && (
              <div className="relative group">
                <button className="flex items-center gap-2 px-4 py-2 bg-brand-gray/20 border border-brand-gray/50 rounded-lg text-white hover:bg-brand-gray/30 transition-all">
                  <Calendar size={16} />
                  <span>{selectedYears.length > 0 ? selectedYears.join(', ') : t('select_years') || 'Выберите годы'}</span>
                  <ChevronDown size={14} />
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-[#1F2937] border border-gray-700 rounded-xl shadow-xl p-2 hidden group-hover:block z-50">
                  {availableYears.map(year => (
                    <button
                      key={year}
                      onClick={() => {
                        setSelectedYears(prev => 
                          prev.includes(year) 
                            ? prev.filter(y => y !== year)
                            : [...prev, year].sort((a, b) => b - a)
                        );
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 text-left text-sm text-gray-300 hover:text-white"
                    >
                      <span>{year}</span>
                      {selectedYears.includes(year) && <Check size={14} className="text-brand-yellow" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-col md:flex-row gap-2 border-b border-brand-gray/20 pb-1 md:overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 md:py-2 rounded-lg md:rounded-t-lg font-medium transition flex items-center gap-3 md:gap-2 border-l-4 md:border-l-0 md:border-b-2 whitespace-nowrap w-full md:w-auto text-left md:text-center ${
                activeTab === tab.id
                  ? 'border-brand-yellow text-brand-yellow bg-brand-yellow/10 md:bg-brand-yellow/5'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="animate-fade-in">
          {/* Player Analytics Tab */}
          {activeTab === 'players' && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl p-3 md:p-5 hover:border-brand-yellow/30 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-1.5 md:p-2 bg-blue-500/20 rounded-lg text-blue-400">
                      <Users size={16} className="md:w-5 md:h-5" />
                    </div>
                    <span className="text-[10px] md:text-xs font-mono text-gray-500 bg-brand-gray/30 px-1.5 py-0.5 rounded">{t('total') || 'ВСЕГО'}</span>
                  </div>
                  <div className="text-xl md:text-3xl font-bold text-white mb-1">{filteredStudentStats.length}</div>
                  <div className="text-xs md:text-sm text-gray-400">{t('total_players')}</div>
                </div>

                <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl p-3 md:p-5 hover:border-brand-yellow/30 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-1.5 md:p-2 bg-green-500/20 rounded-lg text-green-400">
                      <Award size={16} className="md:w-5 md:h-5" />
                    </div>
                    <span className="text-[10px] md:text-xs font-mono text-green-500/50 bg-green-500/10 px-1.5 py-0.5 rounded">≥ 80%</span>
                  </div>
                  <div className="text-xl md:text-3xl font-bold text-white mb-1">
                    {filteredStudentStats.filter(s => s.rate >= 80).length}
                  </div>
                  <div className="text-xs md:text-sm text-gray-400">{t('excellent')}</div>
                </div>

                <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl p-3 md:p-5 hover:border-brand-yellow/30 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-1.5 md:p-2 bg-yellow-500/20 rounded-lg text-yellow-400">
                      <Activity size={16} className="md:w-5 md:h-5" />
                    </div>
                    <span className="text-[10px] md:text-xs font-mono text-yellow-500/50 bg-yellow-500/10 px-1.5 py-0.5 rounded">50-79%</span>
                  </div>
                  <div className="text-xl md:text-3xl font-bold text-white mb-1">
                    {filteredStudentStats.filter(s => s.rate >= 50 && s.rate < 80).length}
                  </div>
                  <div className="text-xs md:text-sm text-gray-400">{t('average')}</div>
                </div>

                <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl p-3 md:p-5 hover:border-brand-yellow/30 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div className="p-1.5 md:p-2 bg-red-500/20 rounded-lg text-red-400">
                      <AlertTriangle size={16} className="md:w-5 md:h-5" />
                    </div>
                    <span className="text-[10px] md:text-xs font-mono text-red-500/50 bg-red-500/10 px-1.5 py-0.5 rounded">&lt; 50%</span>
                  </div>
                  <div className="text-xl md:text-3xl font-bold text-white mb-1">
                    {filteredStudentStats.filter(s => s.rate < 50).length}
                  </div>
                  <div className="text-xs md:text-sm text-gray-400">{t('at_risk')}</div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-brand-gray/20 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Award className="text-brand-yellow" size={20} />
                    {t('top_performing_players')}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-brand-gray/20 text-gray-400 text-xs uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-4">{t('rank')}</th>
                        <th className="px-6 py-4">{t('player')}</th>
                        <th className="px-6 py-4">{t('group_label')}</th>
                        <th className="px-6 py-4 text-center">{t('attendance_rate')}</th>
                        <th className="px-6 py-4 text-center">{t('status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-gray/20 text-sm">
                      {filteredStudentStats.slice(0, 10).map((student, idx) => (
                        <tr key={student.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                              idx === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' :
                              idx === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/50' :
                              idx === 2 ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' :
                              'text-gray-500'
                            }`}>
                              {idx + 1}
                            </div>
                          </td>
                          <td className="px-6 py-4 font-medium text-white">
                            {student.name}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 bg-brand-gray/30 rounded text-xs text-gray-300 border border-brand-gray/50">
                              {student.group}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-24 bg-brand-gray/30 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    student.rate >= 80 ? 'bg-green-500' : 
                                    student.rate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${student.rate}%` }}
                                ></div>
                              </div>
                              <span className={`font-mono font-bold ${
                                student.rate >= 80 ? 'text-green-400' :
                                student.rate >= 50 ? 'text-yellow-400' : 'text-red-400'
                              }`}>
                                {student.rate}%
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                              student.status === 'active' 
                                ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {student.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Group Performance Tab */}
          {activeTab === 'groups' && (
            <div className="space-y-6">
              {/* Activity Chart */}
              <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl p-4 md:p-6">
                <h3 className="text-lg font-bold text-white mb-4 md:mb-6 flex items-center gap-2">
                  <Activity className="text-brand-yellow" size={20} />
                  {t('activity_overview')}
                </h3>
                <div className="h-64 md:h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={monthlyData}>
                      <defs>
                        <linearGradient id="colorTrainings" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E6FF00" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#E6FF00" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorMatches" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" stroke="#9CA3AF" />
                      <YAxis stroke="#9CA3AF" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#fff' }}
                      />
                      <Legend />
                      <Area type="monotone" dataKey="trainings" name={t('trainings')} stroke="#E6FF00" fillOpacity={1} fill="url(#colorTrainings)" />
                      <Area type="monotone" dataKey="matches" name={t('matches')} stroke="#10B981" fillOpacity={1} fill="url(#colorMatches)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {groupStats.map(group => (
                  <div key={group.id} className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl p-4 md:p-6 hover:border-brand-yellow/30 transition-all group">
                    <div className="flex justify-between items-start mb-4 md:mb-6">
                      <div>
                        <h3 className="text-xl font-bold text-white group-hover:text-brand-yellow transition-colors cursor-pointer" onClick={() => setSelectedGroup(group.id)}>{group.name}</h3>
                        <p className="text-gray-400 mt-1 flex items-center gap-2">
                          <Users size={14} />
                          {group.activeStudents} {t('coach_active_suffix')} / {group.students} {t('total_lower')}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-brand-yellow">{group.events}</div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider">{t('events')}</div>
                      </div>
                    </div>
                    
                    {/* Attendance Progress */}
                    <div className="mb-6 bg-brand-gray/20 p-4 rounded-lg border border-brand-gray/30">
                      <div className="flex justify-between mb-2">
                        <span className="text-gray-400 text-sm">{t('avg_attendance_rate')}</span>
                        <span className={`font-bold font-mono ${
                          group.avgAttendanceRate >= 80 ? 'text-green-400' :
                          group.avgAttendanceRate >= 50 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {group.avgAttendanceRate}%
                        </span>
                      </div>
                      <div className="w-full bg-brand-gray/50 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            group.avgAttendanceRate >= 80 ? 'bg-green-500' :
                            group.avgAttendanceRate >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${group.avgAttendanceRate}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-brand-gray/20 rounded-lg text-center border border-brand-gray/30">
                        <div className="text-lg font-bold text-white">{group.students}</div>
                        <div className="text-xs text-gray-500 mt-1">{t('total')}</div>
                      </div>
                      <div className="p-3 bg-brand-gray/20 rounded-lg text-center border border-brand-gray/30">
                        <div className="text-lg font-bold text-green-400">{group.activeStudents}</div>
                        <div className="text-xs text-gray-500 mt-1">{t('active_students')}</div>
                      </div>
                      <div className="p-3 bg-brand-gray/20 rounded-lg text-center border border-brand-gray/30">
                        <div className="text-lg font-bold text-brand-yellow">{group.events}</div>
                        <div className="text-xs text-gray-500 mt-1">{t('events')}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Time Comparison Tab */}
          {activeTab === 'comparison' && (
            <div className="space-y-6">
              {periodType === 'year' ? (
                <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl p-4 md:p-6">
                  <h3 className="text-lg font-bold text-white mb-4 md:mb-6 flex items-center gap-2">
                    <Clock className="text-brand-yellow" size={20} />
                    {t('multi_year_comparison') || 'Сравнение по годам'}
                  </h3>
                  
                  <div className="h-80 w-full mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={getMultiYearStats(selectedGroup === 'all' ? null : parseInt(selectedGroup))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="year" stroke="#9CA3AF" />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: '0.5rem', color: '#fff' }}
                          cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                        />
                        <Legend />
                        <Bar dataKey="trainings" name={t('trainings')} fill="#E6FF00" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="matches" name={t('matches')} fill="#10B981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="activeStudents" name={t('active_students')} fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getMultiYearStats(selectedGroup === 'all' ? null : parseInt(selectedGroup)).map(stat => (
                      <div key={stat.year} className="bg-brand-gray/20 rounded-xl p-4 border border-brand-gray/30">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-bold text-white text-lg">{stat.year}</h4>
                          <span className="text-xs bg-brand-gray/40 px-2 py-1 rounded text-gray-300">{t('year')}</span>
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">{t('trainings')}</span>
                            <span className="text-white font-bold">{stat.trainings}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{t('matches')}</span>
                            <span className="text-white font-bold">{stat.matches}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">{t('active_students')}</span>
                            <span className="text-white font-bold">{stat.activeStudents}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                ['week_to_week', 'month_to_month', 'year_to_year'].map((compType, idx) => {
                // Only show relevant comparison based on current periodType selection
                if (idx > 0) return null; 
                
                const comparison = getComparisonData(selectedGroup === 'all' ? null : parseInt(selectedGroup));
                
                return (
                  <div key={compType} className="bg-brand-gray/10 border border-brand-gray/20 rounded-xl p-4 md:p-6">
                    <h3 className="text-lg font-bold text-white mb-4 md:mb-6 flex items-center gap-2">
                      <Clock className="text-brand-yellow" size={20} />
                      {comparison.currentLabel} vs {comparison.previousLabel}
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Current Period */}
                      <div className="bg-brand-gray/20 rounded-xl p-5 border border-brand-gray/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                          <Calendar size={64} />
                        </div>
                        <h4 className="font-bold text-brand-yellow mb-4 uppercase tracking-wider text-sm">{comparison.currentLabel}</h4>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">{t('trainings')}</span>
                            <span className="font-bold text-2xl text-white">{comparison.current.trainings}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">{t('matches')}</span>
                            <span className="font-bold text-2xl text-white">{comparison.current.matches}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">{t('active_students')}</span>
                            <span className="font-bold text-2xl text-white">{comparison.current.activeStudents}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Previous Period */}
                      <div className="bg-brand-gray/20 rounded-xl p-5 border border-brand-gray/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                          <History size={64} />
                        </div>
                        <h4 className="font-bold text-gray-500 mb-4 uppercase tracking-wider text-sm">{comparison.previousLabel}</h4>
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">{t('trainings')}</span>
                            <span className="font-bold text-2xl text-gray-300">{comparison.previous.trainings}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">{t('matches')}</span>
                            <span className="font-bold text-2xl text-gray-300">{comparison.previous.matches}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-400">{t('active_students')}</span>
                            <span className="font-bold text-2xl text-gray-300">{comparison.previous.activeStudents}</span>
                          </div>
                        </div>
                      </div>

                      {/* Delta */}
                      <div className="bg-brand-gray/20 rounded-xl p-5 border border-brand-gray/30 flex flex-col justify-center">
                         <h4 className="font-bold text-white mb-4 uppercase tracking-wider text-sm text-center">{t('growth') || 'Рост'}</h4>
                         <div className="space-y-6">
                            <div className="text-center">
                              <div className={`text-3xl font-bold ${
                                calcChange(comparison.current.trainings, comparison.previous.trainings) >= 0 
                                  ? 'text-green-400' 
                                  : 'text-red-400'
                              }`}>
                                {calcChange(comparison.current.trainings, comparison.previous.trainings) > 0 ? '+' : ''}
                                {calcChange(comparison.current.trainings, comparison.previous.trainings)}%
                              </div>
                              <div className="text-xs text-gray-500 mt-1 uppercase">{t('trainings')}</div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div className="text-center">
                                <div className={`text-xl font-bold ${
                                  calcChange(comparison.current.matches, comparison.previous.matches) >= 0 
                                    ? 'text-green-400' 
                                    : 'text-red-400'
                                }`}>
                                  {calcChange(comparison.current.matches, comparison.previous.matches) > 0 ? '+' : ''}
                                  {calcChange(comparison.current.matches, comparison.previous.matches)}%
                                </div>
                                <div className="text-xs text-gray-500 mt-1 uppercase">{t('matches')}</div>
                              </div>
                              <div className="text-center">
                                <div className={`text-xl font-bold ${
                                  calcChange(comparison.current.activeStudents, comparison.previous.activeStudents) >= 0 
                                    ? 'text-green-400' 
                                    : 'text-red-400'
                                }`}>
                                  {calcChange(comparison.current.activeStudents, comparison.previous.activeStudents) > 0 ? '+' : ''}
                                  {calcChange(comparison.current.activeStudents, comparison.previous.activeStudents)}%
                                </div>
                                <div className="text-xs text-gray-500 mt-1 uppercase">{t('active_students')}</div>
                              </div>
                            </div>
                         </div>
                      </div>
                    </div>
                  </div>
                );
              })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
