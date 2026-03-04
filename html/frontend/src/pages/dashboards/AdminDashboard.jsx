
import { useState, useEffect } from 'react';
import { statsAPI, adminAPI } from '../../api/client';
import StatCard from '../../components/StatCard';
import BirthdaysWidget from '../../components/BirthdaysWidget';
import { 
  BriefcaseMedical, Loader2
} from 'lucide-react';
import { getLocalizedName } from '../../utils/transliteration';

export default function AdminDashboard({ t, language }) {
  const [stats, setStats] = useState({ students: 0, activeStudents: 0, groups: 0, coaches: 0, events: 0, eventsThisMonth: 0 });
  const [groupStats, setGroupStats] = useState([]);
  const [paymentStatus, setPaymentStatus] = useState({ paid: [], pending: [], paidCount: 0, pendingCount: 0 });
  const [medicalDebts, setMedicalDebts] = useState([]);
  const [medicalDebtsCount, setMedicalDebtsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState(false);

  useEffect(() => { fetchAllStats(); }, []);

  const handleRemindAll = async () => {
    if (!window.confirm("Отправить SMS/WhatsApp напоминания всем должникам?")) return;
    
    setReminding(true);
    try {
      const res = await adminAPI.remindAllDebtors(0); // 0 days overdue = current month debt
      alert(`Успешно поставлено в очередь ${res.data.count} напоминаний`);
    } catch (error) {
      console.error("Failed to remind", error);
      alert("Ошибка при отправке напоминаний");
    } finally {
      setReminding(false);
    }
  };

  const fetchAllStats = async () => {
    try {
      const data = await statsAPI.getDashboardStats();

      setStats({
        students: data.total_students,
        activeStudents: data.active_students,
        groups: data.total_groups,
        coaches: data.total_coaches,
        events: data.events_this_month,
        eventsThisMonth: data.events_this_month,
      });

      setGroupStats(data.group_stats.map(g => ({
        id: g.id,
        name: g.name,
        coachName: g.coach_name,
        studentsCount: g.students_count,
        monthlyFee: g.monthly_fee,
      })));

      setPaymentStatus({
        paid: data.paid_students_list.map(s => ({
          ...s,
          groupName: s.group_name
        })),
        pending: data.debtors_list.map(s => ({
          ...s,
          groupName: s.group_name,
          debt: s.debt_amount
        })),
        paidCount: data.paid_students_count,
        pendingCount: data.debtors_count
      });

      setMedicalDebts(data.medical_debts_list.map(s => ({
        ...s,
        groupName: s.group_name,
        medStatus: s.med_status
      })));
      setMedicalDebtsCount(data.medical_debts_count);

    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-yellow-500 text-lg">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-2 md:p-6 text-white pb-24 md:pb-6 landscape:pb-6">
      <div className="fixed inset-0 pointer-events-none bg-gradient-mesh opacity-50" />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="mb-4 md:mb-8">
          <h1 className="text-2xl md:text-4xl font-bold">
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">🔧 {t('role_admin')} - {t('dashboard')}</span>
          </h1>
          <p className="text-gray-500 mt-1 md:mt-2 text-sm md:text-base">{t('app_name')}</p>
        </div>
        
        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4 mb-4 md:mb-8">
          <StatCard title={t('total_students')} value={stats.students} subtitle={`${stats.activeStudents} ${t('active_students')}`} icon="👥" color="blue" />
          <StatCard title={t('total_groups')} value={stats.groups} subtitle={`${stats.coaches} ${t('coaches')}`} icon="📋" color="green" />
          <StatCard title={t('paid_stat')} value={paymentStatus.paidCount} subtitle={t('this_month_lower')} icon="✅" color="green" />
          <StatCard title={t('debtors_stat')} value={paymentStatus.pendingCount} subtitle={t('not_paid_stat')} icon="⚠️" color="red" />
        </div>

        {/* Birthdays Banner */}
        <BirthdaysWidget t={t} />

        {/* Medical Debts Alert */}
        {medicalDebts.length > 0 && (
          <div className="mb-4 md:mb-8 bg-orange-500/10 border border-orange-500/30 rounded-3xl p-3 md:p-4 flex flex-col sm:flex-row items-start gap-3 md:gap-4">
            <div className="p-2 bg-orange-500/20 rounded-2xl text-orange-400 hidden sm:block">
              <BriefcaseMedical size={24} />
            </div>
            <div className="flex items-center gap-3 sm:hidden mb-2">
               <div className="p-2 bg-orange-500/20 rounded-xl text-orange-400">
                  <BriefcaseMedical size={20} />
               </div>
               <span className="font-bold text-orange-400">Медицинский контроль</span>
            </div>
            <div className="flex-1 w-full">
              <h3 className="font-bold text-orange-400 text-base md:text-lg flex justify-between items-center w-full">
                <span>Долг по справкам ({medicalDebtsCount})</span>
                <button className="text-[10px] md:text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30 px-2 md:px-3 py-1 md:py-1.5 rounded-full hover:bg-orange-500/30 transition whitespace-nowrap ml-2 font-medium">Показать всех</button>
              </h3>
              <p className="text-gray-300 text-xs md:text-sm mb-2">Ученики без справки или с истекшим сроком действия</p>
              <div className="flex flex-wrap gap-1 md:gap-2">
                {medicalDebts.map(s => (
                  <span key={s.id} className={`text-[10px] md:text-xs px-2 py-0.5 md:py-1 rounded-full border ${
                    s.medStatus === 'missing' ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                  }`}>
                    {getLocalizedName(s.first_name, s.last_name, language)} {s.medStatus === 'missing' ? '(Нет)' : '(Истекла)'}
                  </span>
                ))}
                {medicalDebtsCount > medicalDebts.length && (
                  <span className="text-[10px] md:text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 md:py-1 rounded-full border border-orange-500/30">
                    +{medicalDebtsCount - medicalDebts.length} еще
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 md:gap-6 mb-4 md:mb-8">
          {/* WHO PAID */}
          <div className="bg-emerald-500/10 rounded-3xl p-3 md:p-6 border border-emerald-500/30">
            <h2 className="text-base md:text-lg font-semibold text-emerald-400 mb-3 md:mb-4 flex items-center gap-2">
              <span className="text-lg md:text-xl">✅</span> {t('paid_this_month')} ({paymentStatus.paidCount})
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {paymentStatus.paid.length === 0 ? (
                <p className="text-gray-500 text-center py-4">{t('no_payments_found')}</p>
              ) : (
                <>
                  {paymentStatus.paid.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-white text-sm md:text-base truncate">{getLocalizedName(s.first_name, s.last_name, language)}</div>
                        <div className="text-xs md:text-sm text-gray-400 truncate">{s.groupName}</div>
                      </div>
                      <span className="text-emerald-400 font-bold flex-shrink-0">✓</span>
                    </div>
                  ))}
                  {paymentStatus.paidCount > paymentStatus.paid.length && (
                    <div className="text-center text-xs text-gray-500 mt-2">
                      ...и еще {paymentStatus.paidCount - paymentStatus.paid.length}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* WHO OWES */}
          <div className="bg-red-500/10 rounded-3xl p-3 md:p-6 border border-red-500/30">
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <h2 className="text-base md:text-lg font-semibold text-red-400 flex items-center gap-2">
                <span className="text-lg md:text-xl">⚠️</span> {t('debtors_stat')} ({paymentStatus.pendingCount})
              </h2>
              {paymentStatus.pendingCount > 0 && (
                 <button 
                   onClick={handleRemindAll}
                   disabled={reminding}
                   className="text-[10px] md:text-xs bg-red-500 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-full hover:bg-red-600 shadow-lg shadow-red-500/20 transition flex items-center gap-2 disabled:opacity-50 font-medium"
                 >
                   {reminding ? <Loader2 size={12} className="animate-spin" /> : '📨'}
                   Напомнить всем
                 </button>
               )}
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {paymentStatus.pending.length === 0 ? (
                <p className="text-gray-500 text-center py-4">{t('all_paid_success')}</p>
              ) : (
                <>
                  {paymentStatus.pending.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/10 gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-white text-sm md:text-base truncate">{getLocalizedName(s.first_name, s.last_name, language)}</div>
                        <div className="text-xs md:text-sm text-gray-400 truncate">{s.groupName}</div>
                      </div>
                      <span className="text-red-400 font-bold text-sm md:text-base whitespace-nowrap flex-shrink-0">{s.debt} MDL</span>
                    </div>
                  ))}
                  {paymentStatus.pendingCount > paymentStatus.pending.length && (
                    <div className="text-center text-xs text-gray-500 mt-2">
                      ...и еще {paymentStatus.pendingCount - paymentStatus.pending.length}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Groups Overview */}
        <div className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10">
          <h2 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
            <span className="text-lg md:text-xl">👥</span> {t('groups')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
            {groupStats.map(g => (
              <div key={g.id} className="flex items-center justify-between p-3 md:p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition">
                <div>
                  <div className="font-medium text-white text-sm md:text-base">{g.name}</div>
                  <div className="text-xs md:text-sm text-gray-400">🏃 {g.coachName}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-blue-400 text-sm md:text-base">{g.studentsCount} уч.</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
