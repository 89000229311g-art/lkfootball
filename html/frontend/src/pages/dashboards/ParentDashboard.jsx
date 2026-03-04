
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { groupsAPI, eventsAPI, paymentsAPI, skillsAPI, parentAPI, settingsAPI } from '../../api/client';
import PlayerCard from '../../components/PlayerCard';
import UserAvatar from '../../components/UserAvatar';
import { 
  BookOpen, BriefcaseMedical, X, AlertTriangle, Calendar, Upload, FileText, Check, Loader2, Star
} from 'lucide-react';
import AbsenceRequestModal from '../../components/parent/AbsenceRequestModal';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
} from 'chart.js';
import { Radar, Line } from 'react-chartjs-2';
import { getLocalizedName, transliterate } from '../../utils/transliteration';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale
);

const SKILL_COLORS = {
    technique: 'rgb(59, 130, 246)',
    speed: 'rgb(16, 185, 129)',
    discipline: 'rgb(245, 158, 11)',
    teamwork: 'rgb(139, 92, 246)',
    endurance: 'rgb(239, 68, 68)',
  };

  const TAG_CONFIG = {
    high_potential: { label: 'tag_high_potential', color: 'bg-purple-500/20 text-purple-400 border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.2)]' },
    captain: { label: 'tag_captain', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]' },
    needs_work: { label: 'tag_needs_work', color: 'bg-red-500/20 text-red-400 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' },
    consistent: { label: 'tag_consistent', color: 'bg-blue-500/20 text-blue-400 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]' },
  };

export default function ParentDashboard({ t, language, user }) {
  const SKILL_LABELS = {
    technique: t('skill_technique') || 'Техника',
    speed: t('skill_speed') || 'Скорость',
    discipline: t('skill_discipline') || 'Дисциплина',
    teamwork: t('skill_teamwork') || 'Командная игра',
    endurance: t('skill_endurance') || 'Выносливость',
  };

  const [children, setChildren] = useState([]);
  const [groups, setGroups] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [recentPayments, setRecentPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]); // NEW: Detailed pending payments
  const [childSkills, setChildSkills] = useState({});
  const [selectedChildForChart, setSelectedChildForChart] = useState(null);
  const [chartView, setChartView] = useState('radar');
  const [loading, setLoading] = useState(true);
  
  // NEW: Tabs state
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'diary', 'achievements'
  const [selectedChildForTab, setSelectedChildForTab] = useState(null); // Defaults to first child

  // Payment Info State
  const [paymentStatus, setPaymentStatus] = useState(null);

  // Group view modal state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupData, setGroupData] = useState(null);
  const [loadingGroup, setLoadingGroup] = useState(false);
  
  // Student Detail Modal
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Absence Modal
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [absenceSuccessMsg, setAbsenceSuccessMsg] = useState(false);

  const fetchParentData = useCallback(async () => {
    try {
      const [childrenRes, groupsRes, eventsRes, paymentsRes, statusRes] = await Promise.all([
        parentAPI.getChildren(),
        groupsAPI.getAll(),
        eventsAPI.getAll(),
        paymentsAPI.getAll(),
        paymentsAPI.getStatus().catch(e => {
            console.warn("Payment status load error", e);
            return { data: null };
        })
      ]);
      const rawChildren = childrenRes.data;
      const myChildren = Array.isArray(rawChildren) ? rawChildren : (rawChildren?.data || []);
      const allGroups = groupsRes.data?.data || groupsRes.data || [];
      const allEvents = eventsRes.data?.data || eventsRes.data || [];
      const allPayments = paymentsRes.data?.data || paymentsRes.data || [];
      
      setChildren(myChildren);
      setPaymentStatus(statusRes?.data);
      if (myChildren.length > 0 && !selectedChildForTab) {
        setSelectedChildForTab(myChildren[0].id);
      }
      setGroups(allGroups);
      
      if (myChildren.length > 0) {
          const skillsResults = await Promise.all(myChildren.map(async (child) => {
              try {
                  const cardRes = await skillsAPI.getStudentCard(child.id);
                  return { id: child.id, data: cardRes.data };
              } catch {
                  return { id: child.id, data: null };
              }
          }));
          const skillsMap = {};
          skillsResults.forEach(r => { if (r.data) skillsMap[r.id] = r.data; });
          setChildSkills(skillsMap);
      }
      const childGroupIds = myChildren.map(c => c.group_id).filter(Boolean);
      const now = new Date();
      const upcoming = allEvents
        .filter(e => {
          const eventDate = new Date(e.start_time || e.date);
          return eventDate >= now && childGroupIds.includes(e.group_id);
        })
        .sort((a, b) => new Date(a.start_time || a.date) - new Date(b.start_time || b.date))
        .slice(0, 5);
      setUpcomingEvents(upcoming);
      const childIds = myChildren.map(c => c.id);
      const paymentsForChildren = allPayments.filter(p => childIds.includes(p.student_id) && !p.deleted_at);
      
      const recent = paymentsForChildren
        .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
        .slice(0, 100);
      setRecentPayments(recent);
      
      // Filter out ghost debts (pending payments where completed payment exists for same period AND same amount)
      const completedMap = new Map();
      paymentsForChildren.forEach(p => {
        if (p.status === 'completed' && p.payment_period) {
           const key = `${p.student_id}_${p.payment_period}`;
           if (!completedMap.has(key)) completedMap.set(key, new Set());
           completedMap.get(key).add(Number(p.amount));
        }
      });

      const pending = paymentsForChildren.filter(p => {
        if (p.status !== 'pending') return false;
        if (!p.payment_period) return true;
        
        const key = `${p.student_id}_${p.payment_period}`;
        const completedAmounts = completedMap.get(key);
        // Only hide if we have a completed payment with the SAME amount
        if (completedAmounts && completedAmounts.has(Number(p.amount))) return false;
        
        return true;
      });
      setPendingPayments(pending);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedChildForTab]);

  useEffect(() => { fetchParentData(); }, [fetchParentData]);
  
  useEffect(() => {
    const handler = () => fetchParentData();
    window.addEventListener('payments:updated', handler);
    return () => window.removeEventListener('payments:updated', handler);
  }, [fetchParentData]);

  const getGroupName = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    return group?.name || '-';
  };


  const fetchGroupTeammates = async (childId) => {
    setLoadingGroup(true);
    try {
      const response = await parentAPI.getChildGroupTeammates(childId);
      setGroupData(response.data);
      setShowGroupModal(true);
    } catch (error) {
      console.error('Error fetching group:', error);
    } finally {
      setLoadingGroup(false);
    }
  };

  // Auto-open diary if only one child
  useEffect(() => {
    if (activeTab === 'diary' && children.length === 1 && !selectedStudentId) {
      setSelectedStudentId(children[0].id);
    }
  }, [activeTab, children, selectedStudentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-yellow-500 text-lg">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0F1117] px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] md:p-6 text-white md:pb-6">
      <div className="fixed inset-0 pointer-events-none bg-gradient-mesh opacity-50" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="mb-2 md:mb-8 flex flex-col md:flex-row md:justify-between md:items-center gap-2 md:gap-4">
            <div>
                <h1 className="text-2xl md:text-4xl font-bold">
                    <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">👨‍👩‍👧 {t('dashboard_parent')}</span>
                </h1>
            <p className="text-gray-400 mt-1 md:mt-2 text-sm md:text-base">{t('welcome')}, {user?.full_name}!</p>
            </div>
             <div className="grid grid-cols-3 md:flex md:w-auto gap-1 md:gap-2 w-full">
               <button
                 onClick={() => setActiveTab(activeTab === 'diary' ? 'dashboard' : 'diary')}
                 className={`flex-1 px-1 py-2 md:px-4 md:py-3 rounded-2xl font-medium transition-all shadow-lg flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 ${activeTab === 'diary' ? 'bg-blue-500 text-white shadow-blue-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
               >
                 <span className="text-lg md:text-xl">📓</span>
                 <span className="text-[10px] md:text-base text-center leading-tight break-words w-full">{t('open_diary') || 'Дневник'}</span>
               </button>
               <button
                 onClick={() => setActiveTab(activeTab === 'achievements' ? 'dashboard' : 'achievements')}
                 className={`flex-1 px-1 py-2 md:px-4 md:py-3 rounded-2xl font-medium transition-all shadow-lg flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 ${activeTab === 'achievements' ? 'bg-yellow-500 text-black shadow-yellow-500/20' : 'bg-white/10 text-white hover:bg-white/20'}`}
               >
                 <span className="text-lg md:text-xl">🏆</span>
                 <span className="text-[10px] md:text-base text-center leading-tight break-words w-full">{t('achievements') || 'Достижения'}</span>
               </button>
               <button
                 onClick={() => setShowAbsenceModal(true)}
                 className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-1 py-2 md:px-4 md:py-3 rounded-2xl font-medium transition-all shadow-lg shadow-orange-500/20 flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
               >
                 <AlertTriangle className="w-5 h-5 md:w-5 md:h-5" />
                 <span className="text-[10px] md:text-base text-center leading-tight break-words w-full">{t('report_absence') || 'Пропуск'}</span>
               </button>
            </div>
        </div>

        {/* Tabs Navigation Removed */}
        
        {/* Child Selector (Only if multiple children and not on Dashboard) */}
        {activeTab !== 'dashboard' && children.length > 1 && (
          <div className="flex gap-2 mb-2 md:mb-6 overflow-x-auto pb-2 -mx-2 px-2 md:mx-0 md:px-0 no-scrollbar touch-pan-x">
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => setSelectedChildForTab(child.id)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition flex items-center gap-2 ${selectedChildForTab === child.id ? 'bg-white/10 border-yellow-500 text-yellow-400' : 'bg-transparent border-white/10 text-gray-400 hover:border-white/30'}`}
              >
                <UserAvatar user={child} size="w-6 h-6" className="rounded-full" />
                {child.first_name}
              </button>
            ))}
          </div>
        )}

        {/* Absence Modal */}
        {showAbsenceModal && (
          <AbsenceRequestModal 
            onClose={() => setShowAbsenceModal(false)}
            onSuccess={() => {
              // Optionally show toast or refresh something
              alert(t('request_sent'));
            }}
          />
        )}

      {/* Payment Modal Removed - Moved to Payments.jsx */}

        {children.length === 0 ? (
          <div className="bg-white/5 rounded-3xl p-6 md:p-12 text-center border border-white/10">
            <div className="text-6xl mb-4">👶</div>
            <h2 className="text-xl font-semibold text-gray-300 mb-2">{t('pd_no_children') || 'Ученик не подтянулся к родителю в кабинет'}</h2>
            <p className="text-gray-500 mb-4">{t('pd_contact_admin_link') || 'Свяжитесь с администратором для привязки'}</p>
            
            <div className="text-xs text-gray-400 mt-4 bg-black/20 p-4 rounded-xl inline-block border border-white/5 max-w-md">
               <p className="mb-2">Система автоматически ищет учеников по вашему номеру телефона:</p>
               <p className="font-mono text-lg text-yellow-500 mb-1">{user?.phone}</p>
               {user?.phone_secondary && <p className="font-mono text-lg text-yellow-500 mb-1">{user?.phone_secondary}</p>}
               <p className="mt-3 opacity-70">Если номер отличается от того, который вы указали в анкете ученика, обратитесь к администратору или тренеру для обновления данных.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2 md:space-y-6">
            {/* Dashboard Overview Tab */}
            {activeTab === 'dashboard' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 md:gap-6 animate-fade-in">
                {/* Upcoming Events */}
                <div className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10">
                  <h2 className="text-lg md:text-xl font-bold text-white mb-3 md:mb-4 flex items-center gap-2">
                    📅 {t('upcoming_events') || 'Ближайшие события'}
                  </h2>
                  {upcomingEvents.length > 0 ? (
                    <div className="space-y-2 md:space-y-3">
                      {upcomingEvents.map((event, idx) => (
                        <div key={event.id || idx} className="bg-white/5 p-3 md:p-4 rounded-2xl border border-white/10 flex items-center gap-3 md:gap-4">
                           <div className="bg-blue-500/20 p-2 md:p-3 rounded-xl text-blue-400">
                             <Calendar className="w-5 h-5 md:w-6 md:h-6" />
                           </div>
                           <div>
                             <div className="font-bold text-white text-sm md:text-base">{event.title}</div>
                             <div className="text-xs md:text-sm text-gray-400">
                               {new Date(event.start_time || event.date).toLocaleDateString()} {new Date(event.start_time || event.date).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', hour12: false })}
                             </div>
                           </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {t('no_events') || 'Нет ближайших событий'}
                    </div>
                  )}
                </div>

                {/* Recent Payments */}
                <div className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10">
                  <div className="flex justify-between items-center mb-3 md:mb-4">
                    <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                      💰 {t('recent_payments') || 'Последние платежи'}
                    </h2>
                    <Link to="/payments?tab=all" className="text-sm text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-3 py-1.5 rounded-full">
                      {t('view_all') || 'Все'} →
                    </Link>
                  </div>
                  
                  {/* Payment Status Summary */}
                  {((paymentStatus && (paymentStatus.has_debt || paymentStatus.total_pending > 0)) || pendingPayments.length > 0) && (
                    <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-2xl p-3 md:p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between w-full">
                            <div>
                                <div className="text-red-400 font-bold text-base md:text-lg">
                                    {t('payment_due') || 'К оплате'}: {paymentStatus?.total_pending || pendingPayments.reduce((sum, p) => sum + p.amount, 0)} MDL
                                </div>
                                <div className="text-xs text-red-400/70">{t('please_pay_soon') || 'Пожалуйста, оплатите счета'}</div>
                            </div>
                            <Link to="/payments?tab=details" className="px-3 py-1.5 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600 transition">
                                {t('pay_now') || 'Оплатить'}
                            </Link>
                        </div>
                        
                        {/* Detailed Pending List */}
                        {pendingPayments.length > 0 && (
                            <div className="mt-1 space-y-1 w-full max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                {pendingPayments.map(p => (
                                    <div key={p.id} className="flex justify-between items-center bg-red-500/5 p-2 rounded-lg border border-red-500/10 text-xs md:text-sm">
                                        <div className="flex flex-col flex-1 min-w-0 mr-2">
                                            <span className="text-white font-medium text-left leading-tight break-words" title={p.description || (p.payment_period ? `${t('invoice_for')} ${new Date(p.payment_period).toLocaleDateString([], {month: 'long', year: 'numeric'})}` : t('invoice'))}>
                                                {p.description || (p.payment_period ? `${t('invoice_for')} ${new Date(p.payment_period).toLocaleDateString([], {month: 'long', year: 'numeric'})}` : t('invoice'))}
                                            </span>
                                            <span className="text-[10px] text-white/50">{new Date(p.payment_period).toLocaleDateString()}</span>
                                        </div>
                                        <span className="text-red-300 font-bold whitespace-nowrap shrink-0">{p.amount} MDL</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                  )}

                  {recentPayments.length > 0 ? (
                    <div className="space-y-2 md:space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                      {recentPayments.map((payment, idx) => (
                         <div key={payment.id || idx} className="bg-white/5 p-3 md:p-4 rounded-2xl border border-white/10 flex justify-between items-center">
                           <div>
                             <div className="font-bold text-white text-sm md:text-base">{payment.amount} MDL</div>
                             <div className="text-xs text-gray-400">{new Date(payment.payment_date).toLocaleDateString()}</div>
                           </div>
                           <div className={`px-2 md:px-3 py-1 rounded-lg text-xs font-medium ${payment.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                             {payment.status === 'completed' ? (t('status_completed') || 'Оплачено') : (t('status_pending') || 'Ожидает')}
                           </div>
                         </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {t('no_payments_found') || 'Платежей не найдено'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* If Diary tab is active, show the PlayerCard (or selector) */}
            {activeTab === 'diary' && (
               <div className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10 animate-fade-in">
                  <h2 className="text-xl font-bold text-white mb-4 md:mb-6 flex items-center gap-2">
                    📓 {t('open_diary')}
                  </h2>
                  
                  {children.length > 1 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                      {children.map(child => (
                        <button
                          key={child.id}
                          onClick={() => setSelectedStudentId(child.id)}
                          className="bg-[#1a1f2e] hover:bg-[#252b3b] p-4 md:p-6 rounded-2xl md:rounded-3xl border border-white/10 transition flex flex-col items-center gap-4 group"
                        >
                          <UserAvatar 
                            user={child} 
                            size="w-20 h-20 md:w-24 md:h-24" 
                            className="rounded-full border-4 border-white/5 group-hover:border-blue-500/50 transition" 
                          />
                          <div className="text-center">
                            <h3 className="text-lg font-bold text-white">{child.first_name} {child.last_name}</h3>
                            <p className="text-sm text-gray-400">{t('click_to_open_diary')}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                       <p className="text-gray-400 mb-4">{t('opening_diary')}</p>
                    </div>
                  )}
               </div>
            )}

            {activeTab === 'achievements' && (
              <div className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10 animate-fade-in">
                {(() => {
                   const targetChildId = selectedChildForTab || (children[0] && children[0].id);
                   const targetChild = children.find(c => c.id === targetChildId);
                   const achievements = targetChild?.achievements || [];
                   const stars = targetChild?.stars || 0;
                   const streak = targetChild?.attendance_streak || 0;
                   const progress = Math.min((streak / 10) * 100, 100);
                   
                   return (
                     <div>
                       <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 md:mb-8 gap-4 md:gap-6">
                          <div>
                            <h2 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                              🏆 {t('achievements')} - {targetChild ? getLocalizedName(targetChild.first_name, targetChild.last_name, language) : ''}
                            </h2>
                            <p className="text-gray-400 text-xs md:text-sm mt-1">{t('track_progress') || 'Отслеживайте прогресс и награды'}</p>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2 md:gap-4 w-full sm:w-auto">
                              <div className="bg-gradient-to-br from-yellow-500/20 to-amber-600/20 px-4 py-3 md:px-6 rounded-2xl border border-yellow-500/30 flex items-center gap-3 md:gap-4 w-full sm:w-auto">
                                <div className="shrink-0 flex items-center justify-center min-w-[40px]">
                                   {stars <= 3 ? (
                                      <div className="flex -space-x-1">
                                         {[...Array(Math.max(1, stars))].map((_, i) => (
                                            <div key={i} className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center ${stars > 0 ? 'bg-gradient-to-br from-yellow-400 to-amber-600 shadow-lg shadow-yellow-500/30' : 'bg-white/10'}`}>
                                               <Star size={16} className={`md:w-5 md:h-5 ${stars > 0 ? 'text-white fill-white' : 'text-white/20'}`} />
                                            </div>
                                         ))}
                                      </div>
                                   ) : (
                                      <div className="relative w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center shadow-lg shadow-yellow-500/30 border-2 border-yellow-200/50">
                                         <span className="text-sm md:text-base font-black text-white drop-shadow-md">{stars}</span>
                                         <Star size={14} className="absolute -top-1 -right-1 text-yellow-200 fill-yellow-200 drop-shadow-md" />
                                      </div>
                                   )}
                                </div>
                                <div>
                                    <div className="text-[10px] md:text-xs text-yellow-200 uppercase tracking-wider font-bold">{t('total_stars') || 'Всего звезд'}</div>
                                    <div className="text-2xl md:text-3xl font-black text-yellow-400">{stars}</div>
                                </div>
                              </div>
                              
                              <div className="bg-white/5 px-4 py-3 md:px-6 rounded-2xl border border-white/10 flex flex-col justify-center min-w-[140px] w-full sm:w-auto">
                                <div className="flex justify-between items-center mb-2">
                                    <div className="text-[10px] md:text-xs text-gray-400 uppercase tracking-wider">{t('next_star') || 'Следующая звезда'}</div>
                                    <div className="text-sm font-bold text-white">{streak}/10</div>
                                </div>
                                <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-500 ease-out"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                              </div>
                          </div>
                       </div>
                       
                       {achievements.length === 0 ? (
                         <div className="text-center py-12 bg-black/20 rounded-2xl border border-white/5">
                           <div className="text-4xl mb-3 opacity-50">🏆</div>
                           <p className="text-gray-500">{t('no_achievements_yet')}</p>
                           <p className="text-gray-600 text-sm mt-2">{t('achievement_hint')}</p>
                         </div>
                       ) : (
                         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-4">
                           {achievements.map((ach, idx) => (
                             <div key={ach.id || idx} className="bg-gradient-to-br from-yellow-500/10 to-amber-500/10 border border-yellow-500/20 p-3 md:p-4 rounded-2xl flex flex-col items-center text-center group hover:scale-105 transition-transform">
                               <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-2xl md:text-3xl shadow-lg shadow-yellow-500/20 mb-3 group-hover:rotate-12 transition-transform shrink-0">
                                 {ach.icon || '🏆'}
                               </div>
                               <h3 className="font-bold text-white text-xs md:text-sm line-clamp-2">{ach.title}</h3>
                               <p className="text-[10px] md:text-xs text-yellow-200/70 mt-1 line-clamp-3">{ach.description}</p>
                               <div className="mt-auto pt-2 text-[10px] text-gray-500 bg-black/20 px-2 py-0.5 rounded-full">
                                 {new Date(ach.created_at).toLocaleDateString()}
                               </div>
                             </div>
                           ))}
                         </div>
                       )}
                     </div>
                   );
                })()}
              </div>
            )}

            {activeTab === 'dashboard' && (
              <>
            {/* Children Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-6">
              {children.map(child => {
                const childGroup = groups.find(g => g.id === child.group_id);
                const skillData = childSkills[child.id];
                const latestSkills = skillData?.latest_skills;
                const skillsHistory = skillData?.skills_history;
                
                
                
                const radarData = {
                  labels: ['technique', 'speed', 'discipline', 'teamwork', 'endurance'].map(k => t(`skill_${k}`)),
                  datasets: [{
                    label: t('skills'),
                    data: latestSkills ? [latestSkills.technique, latestSkills.speed, latestSkills.discipline, latestSkills.teamwork, latestSkills.endurance] : [3, 3, 3, 3, 3],
                    backgroundColor: 'rgba(234, 179, 8, 0.2)',
                    borderColor: 'rgb(234, 179, 8)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgb(234, 179, 8)',
                  }]
                };

                const radarOptions = {
                  scales: { r: { beginAtZero: true, min: 0, max: 5, ticks: { stepSize: 1, color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,0.1)' }, pointLabels: { color: '#9CA3AF' } } },
                  plugins: { legend: { display: false } }
                };

                // Get tags from latest skills
                const talentTags = latestSkills?.talent_tags || [];

                const lineData = skillsHistory ? {
                  labels: skillsHistory.months,
                  datasets: ['technique', 'speed', 'discipline', 'teamwork', 'endurance'].map(key => ({
                    label: t(`skill_${key}`),
                    data: skillsHistory[key],
                    borderColor: SKILL_COLORS[key],
                    backgroundColor: SKILL_COLORS[key],
                    tension: 0.3,
                  }))
                } : null;

                const lineOptions = {
                  responsive: true,
                  maintainAspectRatio: false,
                  scales: { y: { beginAtZero: true, min: 0, max: 5, ticks: { stepSize: 1, color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,0.1)' } }, x: { ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(255,255,255,0.1)' } } },
                  plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 }, color: '#9CA3AF' } } }
                };
                
                return (
                  <div key={child.id} className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10">
                    <div className="flex items-start gap-3 md:gap-4 mb-3 md:mb-4">
                      <UserAvatar 
                        user={child} 
                        size="w-16 h-16 md:w-20 md:h-20" 
                        className="rounded-full border-2 border-yellow-500/30"
                      />
                      <div className="flex-1">
                        <h2 className="text-lg md:text-xl font-bold text-white">{getLocalizedName(child.first_name, child.last_name, language)}</h2>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 md:py-1 rounded-xl text-xs font-medium ${
                            child.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            child.status === 'frozen' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                            'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                          }`}>
                            {child.status === 'active' ? `✅ ${t('active')}` : child.status === 'frozen' ? `❄️ ${t('frozen')}` : child.status}
                          </span>
                          {latestSkills && (
                            <span className="px-2 py-0.5 md:py-1 bg-purple-500/20 text-purple-400 rounded-xl text-xs font-medium border border-purple-500/30">
                            ⭐ {((
                              (latestSkills.technique || 0) + 
                              (latestSkills.speed || 0) + 
                              (latestSkills.discipline || 0) + 
                              (latestSkills.teamwork || 0) + 
                              (latestSkills.endurance || 0)
                            ) / 5).toFixed(1)}
                          </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Achievement Banner */}
                    {(child.stars > 0 || (child.attendance_streak || 0) > 0) && (
                      <div className="mb-3 md:mb-4 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-2xl p-2 md:p-3 flex items-center justify-between gap-2 md:gap-3 animate-fade-in relative overflow-hidden group">
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-lg md:text-xl shadow-lg shadow-yellow-500/20">⭐</div>
                            <div>
                              <div className="font-bold text-yellow-400 text-xs md:text-sm flex items-center gap-2">
                                {t('stars_collected') || 'Собрано звезд'}
                                <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold">{child.stars || 0}</span>
                              </div>
                              <div className="text-[10px] md:text-xs text-yellow-200/70">{t('next_reward') || 'До следующей:'} {child.attendance_streak || 0}/10</div>
                            </div>
                        </div>
                        {/* Mini Progress Bar */}
                        <div className="w-16 md:w-20 h-1.5 bg-black/20 rounded-full overflow-hidden">
                             <div className="h-full bg-yellow-400" style={{ width: `${Math.min(((child.attendance_streak || 0) / 10) * 100, 100)}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2 md:space-y-3 mb-3 md:mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">📍 {t('group')}:</span>
                        <span className="font-medium text-white">{childGroup?.name || t('no_group')}</span>
                        {childGroup && (
                          <button
                            onClick={() => fetchGroupTeammates(child.id)}
                            disabled={loadingGroup}
                            className="ml-2 px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full hover:bg-blue-500/30 transition border border-blue-500/30"
                          >
                            {loadingGroup ? '...' : `👥 ${t('group')}`}
                          </button>
                        )}
                      </div>
                      
                      {/* Absence Request Button Removed - moved to header */}
                      
                      {/* Open Diary/Profile Button Removed */}
                      
                      {/* Medical Certificate Status */}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-500">🏥 {t('medical_certificate')}:</span>
                         {(() => {
                            if (!child.medical_certificate_expires) return <span className="text-red-400 font-medium flex items-center gap-1"><BriefcaseMedical size={14}/> {t('missing_certificates_stat') || 'Отсутствует'}</span>;
                            const expiry = new Date(child.medical_certificate_expires);
                            const today = new Date();
                            const isExpired = expiry < today;
                            const isWarning = expiry < new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
                            
                            if (isExpired) return <span className="text-red-400 font-medium flex items-center gap-1"><BriefcaseMedical size={14}/> {t('certificate_expired') || 'Истекла'}</span>;
                            if (isWarning) return <span className="text-yellow-400 font-medium flex items-center gap-1"><BriefcaseMedical size={14}/> {t('expiring_soon_stat') || 'Истекает скоро'}</span>;
                            return <span className="text-green-400 font-medium flex items-center gap-1"><BriefcaseMedical size={14}/> {t('certificate_valid') || 'Действительна'} (до {expiry.toLocaleDateString()})</span>;
                         })()}
                      </div>
                    </div>

                    {latestSkills && (
                      <div className="pt-3 md:pt-4 border-t border-white/10">
                        <div className="flex items-center justify-between mb-2 md:mb-3">
                          <h3 className="font-semibold text-white">⚽ {t('skills')}</h3>
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setSelectedChildForChart(selectedChildForChart === child.id ? null : child.id); setChartView('radar'); }}
                              className={`px-2 py-1 text-xs rounded-full transition ${selectedChildForChart === child.id && chartView === 'radar' ? 'bg-yellow-500 text-black' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                            >
                              📊 {t('radar')}
                            </button>
                            <button
                              onClick={() => { setSelectedChildForChart(child.id); setChartView('line'); }}
                              className={`px-2 py-1 text-xs rounded-full transition ${selectedChildForChart === child.id && chartView === 'line' ? 'bg-yellow-500 text-black' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                            >
                              📈 {t('history_button')}
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-1 mb-2 md:mb-3">
                          {Object.entries(SKILL_LABELS).map(([key, label]) => (
                            <div key={key} className="text-center">
                              <div className="text-base md:text-lg font-bold" style={{ color: SKILL_COLORS[key] }}>{latestSkills[key]}</div>
                              <div className="text-[10px] md:text-xs text-gray-500 truncate">{label}</div>
                            </div>
                          ))}
                        </div>

                        {selectedChildForChart === child.id && (
                          <div className="h-48 mt-2 bg-white/5 rounded-2xl p-2">
                            {chartView === 'radar' ? (
                              <Radar data={radarData} options={radarOptions} />
                            ) : (
                              lineData ? <Line data={lineData} options={lineOptions} /> : <div className="flex items-center justify-center h-full text-gray-500 text-sm">Нет истории оценок</div>
                            )}
                          </div>
                        )}

                        {talentTags.length > 0 && (
                            <div className="mt-3 md:mt-4 flex flex-wrap gap-1 md:gap-2 justify-center">
                                {talentTags.map(tagId => {
                                    const config = TAG_CONFIG[tagId];
                                    if (!config) return null;
                                    return (
                                        <span 
                                            key={tagId} 
                                            className={`px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-bold border ${config.color}`}
                                        >
                                            {t(config.label) || config.label}
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        <div className="text-xs text-gray-500 mt-2 text-center">
                          {t('rating_for')} {latestSkills.rating_month}/{latestSkills.rating_year}
                        </div>
                      </div>
                    )}

                    {/* Empty state removed */}
                  </div>
                );
              })}
            </div>



              </>
            )}

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
              <Link to="/calendar" className="bg-gradient-to-r from-blue-500/20 to-blue-600/20 border border-blue-500/30 hover:from-blue-500/30 hover:to-blue-600/30 text-white rounded-xl p-4 md:p-6 transition">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="text-3xl md:text-4xl">📅</div>
                  <div>
                    <h3 className="text-lg md:text-xl font-bold">{t('nav_calendar')}</h3>
                    <p className="text-blue-200 text-xs md:text-sm">{t('parents_schedule')}</p>
                  </div>
                </div>
              </Link>
              

            </div>
          </div>
        )}
      </div>

      {/* Group Teammates Modal */}
      {showGroupModal && groupData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-white/10 bg-gradient-to-r from-blue-500/20 to-purple-500/20 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    👥 {groupData.group_info?.name || t('group')}
                  </h2>
                  <p className="text-gray-400 mt-1">
                    {groupData.group_info?.students_count} {t('students_count')} • {t('coach')}: {transliterate(groupData.group_info?.coach_name, language) || t('not_assigned')}
                  </p>
                </div>
                <button
                  onClick={() => setShowGroupModal(false)}
                  className="text-gray-400 hover:text-white p-2 hover:bg-white/10 rounded-lg transition"
                >
                  ✕
                </button>
              </div>
              {groupData.group_info?.schedule && (
                <div className="mt-3 text-sm text-blue-300 bg-blue-500/10 px-3 py-2 rounded-lg border border-blue-500/20">
                  📅 {groupData.group_info.schedule}
                </div>
              )}
            </div>

            {/* Teammates List */}
            <div className="p-6 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groupData.teammates?.map(teammate => (
                  <div
                    key={teammate.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                      teammate.is_my_child
                        ? 'bg-yellow-500/10 border-yellow-500/30'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {teammate.avatar_url ? (
                      <img
                        src={`http://localhost:8000${teammate.avatar_url}`}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover border-2 border-white/20"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-xl">
                        ⚽
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">
                        {transliterate(teammate.full_name, language)}
                        {teammate.is_my_child && (
                          <span className="ml-2 text-yellow-400 text-xs">({t('your_child')})</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-400">
                        {teammate.age ? `${teammate.age} ${t('years_old') || 'лет'}` : ''}
                        {teammate.status === 'frozen' && (
                          <span className="ml-2 text-blue-400">❄️ {t('frozen')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {(!groupData.teammates || groupData.teammates.length === 0) && (
                <div className="text-center text-gray-500 py-8">
                  {t('no_students_in_group_yet')}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 bg-white/5 shrink-0">
              <button
                onClick={() => setShowGroupModal(false)}
                className="w-full py-3 bg-blue-500/20 text-blue-400 rounded-xl hover:bg-blue-500/30 transition font-medium border border-blue-500/30"
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Absence Request Modal */}
      {showAbsenceModal && (
        <AbsenceRequestModal 
          onClose={() => setShowAbsenceModal(false)}
          onSuccess={() => {
            setShowAbsenceModal(false);
            setAbsenceSuccessMsg(true);
            setTimeout(() => setAbsenceSuccessMsg(false), 4000);
          }}
        />
      )}

      {/* Success popup — absence sent */}
      {absenceSuccessMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-green-600 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-green-900/40 animate-fade-in">
          <Check className="w-5 h-5 shrink-0" />
          <span className="font-medium">{t('request_sent') || 'Заявка отправлена!'}</span>
          <button onClick={() => setAbsenceSuccessMsg(false)} className="ml-2 opacity-60 hover:opacity-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Student Diary/Profile Modal */}
      {selectedStudentId && (
        <PlayerCard 
          studentId={selectedStudentId} 
          initialTab={activeTab === 'diary' ? 'diary' : 'profile'}
          onClose={() => {
            setSelectedStudentId(null);
            // Exit diary mode if active to prevent auto-reopening
            if (activeTab === 'diary') {
              setActiveTab('dashboard');
            }
          }} 
        />
      )}
    </div>
  );
}
