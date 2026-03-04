
import { useState, useEffect, useRef } from 'react';
import { statsAPI } from '../../api/client';
import PlayerCard from '../../components/PlayerCard';
import StatCard from '../../components/StatCard';
import { 
  Activity, Layout, Users, FileText, ShieldAlert, 
  DollarSign, TrendingUp, ClipboardCheck, UserCheck, 
  Heart, GraduationCap, Loader2
} from 'lucide-react';
import { exportToExcel, getDateString, downloadBlob } from '../../utils/exportUtils';
import { getLocalizedName } from '../../utils/transliteration';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export default function OwnerDashboard({ t, language }) {
  const [stats, setStats] = useState({ students: 0, activeStudents: 0, groups: 0, coaches: 0, events: 0, eventsThisMonth: 0, totalRevenue: 0, revenueThisMonth: 0, attendanceRate: 0 });
  const [recentPayments, setRecentPayments] = useState([]);
  const [groupStats, setGroupStats] = useState([]);
  const [expiringDocs, setExpiringDocs] = useState([]);
  const [viewMode, setViewMode] = useState('methodology'); // 'methodology' | 'business'
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  
  // Export State
  const printRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => { fetchAllStats(); }, []);

  const fetchAllStats = async () => {
    try {
      const data = await statsAPI.getDashboardStats();

      setStats({
        students: data.total_students,
        activeStudents: data.active_students,
        groups: data.total_groups,
        coaches: data.total_coaches,
        events: data.events_this_month, // Using events_this_month as primary metric for now
        eventsThisMonth: data.events_this_month,
        totalRevenue: data.total_revenue,
        revenueThisMonth: data.revenue_this_month,
        attendanceRate: data.attendance_rate,
      });

      // Map group stats to frontend format
      const gStats = data.group_stats.map(g => ({
        id: g.id,
        name: g.name,
        coachName: g.coach_name,
        studentsCount: g.students_count,
        monthlyFee: g.monthly_fee,
      }));
      setGroupStats(gStats);

      // Map recent payments
      const rPayments = data.recent_payments.map(p => ({
        id: p.id,
        amount: p.amount,
        payment_date: p.payment_date,
        student: { first_name: p.student_name.split(' ')[0], last_name: p.student_name.split(' ').slice(1).join(' ') }, // Mock object for compatibility
        student_name: p.student_name,
        payment_method: p.payment_method,
      }));
      setRecentPayments(rPayments);

      // Map expiring docs
      setExpiringDocs(data.expiring_students || []);

    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (type = 'excel') => {
    const filename = `Dashboard_Owner_${viewMode}_${getDateString()}`;

    if (type === 'excel') {
      let dataToExport = [];
      let columns = {};

      if (viewMode === 'methodology') {
        dataToExport = groupStats.map(g => ({
          group: g.name,
          coach: g.coachName,
          students: g.studentsCount,
          occupancy: Math.round((g.studentsCount / 20) * 100) + '%'
        }));
        columns = { group: 'Group', coach: 'Coach', students: 'Students', occupancy: 'Occupancy' };
      } else {
        // Business
        dataToExport = groupStats.map(g => ({
          group: g.name,
          students: g.studentsCount,
          fee: g.monthlyFee,
          potential: g.studentsCount * g.monthlyFee
        }));
        columns = { group: 'Group', students: 'Students', fee: 'Monthly Fee', potential: 'Potential Revenue' };
      }

      exportToExcel(dataToExport, columns, filename);
    } else {
      // PDF Export
      if (!printRef.current) return;
      setIsExporting(true);

      setTimeout(async () => {
        try {
          const canvas = await html2canvas(printRef.current, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false
          });
          
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'px',
            format: 'a4'
          });
          
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          const imgHeight = (canvas.height * pdfWidth) / canvas.width;
          
          let heightLeft = imgHeight;
          let position = 0;
          
          pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pdfHeight;
          
          while (heightLeft > 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;
          }
          
          const blob = pdf.output('blob');
          downloadBlob(blob, `${filename}.pdf`);
        } catch (err) {
          console.error("Export failed:", err);
        } finally {
          setIsExporting(false);
        }
      }, 100);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-yellow-500 text-lg">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-2 md:p-6 text-white pb-24 md:pb-6">
      {/* Hidden printable section */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-0 z-[-1]" aria-hidden="true">
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={printRef} className="p-8 bg-white text-black min-w-[800px] font-sans">
          <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-4">
            <div>
              <h1 className="text-3xl font-bold uppercase tracking-wider">{t('owner_dashboard') || 'Owner Dashboard'}</h1>
              <div className="text-gray-600 mt-1 uppercase font-bold text-lg">
                {viewMode === 'methodology' ? t('methodology_view') : t('business_view')}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">{t('date') || 'Date'}</div>
              <div className="font-bold">{new Date().toLocaleDateString()}</div>
            </div>
          </div>

          {/* Key Stats Summary */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-gray-50 border border-gray-200 rounded">
              <div className="text-sm text-gray-500">{t('total_students')}</div>
              <div className="text-xl font-bold text-blue-600">{stats.students}</div>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded">
              <div className="text-sm text-gray-500">{t('total_groups')}</div>
              <div className="text-xl font-bold text-green-600">{stats.groups}</div>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded">
              <div className="text-sm text-gray-500">{t('total_revenue')}</div>
              <div className="text-xl font-bold text-yellow-600">{stats.totalRevenue.toLocaleString()} MDL</div>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-200 rounded">
              <div className="text-sm text-gray-500">{t('active_students')}</div>
              <div className="text-xl font-bold text-purple-600">{stats.activeStudents}</div>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-300">
                  <th className="text-left p-2 border border-gray-300">Group</th>
                  <th className="text-left p-2 border border-gray-300">Coach</th>
                  <th className="text-right p-2 border border-gray-300">Students</th>
                  <th className="text-right p-2 border border-gray-300">Fee (MDL)</th>
                  <th className="text-right p-2 border border-gray-300">Potential (MDL)</th>
                </tr>
              </thead>
              <tbody>
                {groupStats.map((g, i) => (
                  <tr key={i} className="border-b border-gray-200">
                    <td className="p-2 border border-gray-300 font-bold">{g.name}</td>
                    <td className="p-2 border border-gray-300">{g.coachName}</td>
                    <td className="p-2 border border-gray-300 text-right">{g.studentsCount}</td>
                    <td className="p-2 border border-gray-300 text-right">{g.monthlyFee}</td>
                    <td className="p-2 border border-gray-300 text-right font-medium">{(g.studentsCount * g.monthlyFee).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden grid grid-cols-1 gap-4">
            {groupStats.map((g, i) => (
              <div key={i} className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-lg">{g.name}</div>
                  <div className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded">
                    {g.studentsCount} students
                  </div>
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  <span className="font-semibold">Coach:</span> {g.coachName}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-200">
                  <div>
                    <div className="text-xs text-gray-500">Monthly Fee</div>
                    <div className="font-medium">{g.monthlyFee} MDL</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Potential</div>
                    <div className="font-bold text-green-600">{(g.studentsCount * g.monthlyFee).toLocaleString()} MDL</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between text-xs text-gray-500">
            <div>Generated by Football Academy System</div>
            <div>Confidential Report</div>
          </div>
        </div>
      </div>
    </div>

      <div className="fixed inset-0 pointer-events-none bg-gradient-mesh opacity-50" />
      
      <div className="w-full mx-auto relative z-10">
        {/* Header & Toggle */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-4 md:mb-8">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold">
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                {viewMode === 'methodology' ? t('methodology_view') : t('business_view')}
              </span>
            </h1>
            <p className="text-gray-500 mt-1 md:mt-2 text-sm md:text-base">{t('app_name')} - {t('owner_panel')}</p>
          </div>
          
          <div className="flex flex-wrap justify-center sm:justify-end bg-white/5 p-1 rounded-xl border border-white/10 items-center gap-2">
            <div className="flex gap-1 pr-2 border-r border-white/10">
              <button
                onClick={() => handleExport('excel')}
                className="p-2 text-green-400 hover:bg-white/10 rounded-lg transition"
                title="Export Excel"
              >
                <FileText size={18} />
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={isExporting}
                className="p-2 text-red-400 hover:bg-white/10 rounded-lg transition"
                title="Export PDF"
              >
                {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
              </button>
            </div>
            <button
              onClick={() => setViewMode('methodology')}
              className={`px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                viewMode === 'methodology' 
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('methodology_toggle')}
            </button>
            <button
              onClick={() => setViewMode('business')}
              className={`px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                viewMode === 'business' 
                  ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t('business_toggle')}
            </button>
          </div>
        </div>

        {/* Safety Guard: Expiring Docs Alert */}
        {expiringDocs.length > 0 && (
          <div className="mb-4 md:mb-8 bg-red-500/10 border border-red-500/30 rounded-3xl p-3 md:p-4 flex items-start gap-3 md:gap-4 animate-pulse-slow">
            <div className="p-2 bg-red-500/20 rounded-2xl text-red-400">
              <BriefcaseMedical size={24} />
            </div>
            <div>
              <h3 className="font-bold text-red-400 text-base md:text-lg">{t('expiring_docs_alert')} ({expiringDocs.length})</h3>
              <p className="text-gray-300 text-xs md:text-sm mb-2">{t('expiring_docs_desc')}</p>
              <div className="flex flex-wrap gap-1 md:gap-2">
                {expiringDocs.slice(0, 5).map(s => (
                  <span key={s.id} className="text-[10px] md:text-xs bg-red-500/20 text-red-300 px-2 py-0.5 md:py-1 rounded-full border border-red-500/30">
                    {getLocalizedName(s.first_name, s.last_name, language)}
                  </span>
                ))}
                {expiringDocs.length > 5 && (
                  <span className="text-[10px] md:text-xs bg-red-500/20 text-red-300 px-2 py-0.5 md:py-1 rounded-full border border-red-500/30">
                    +{expiringDocs.length - 5} {t('more_students')}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {viewMode === 'methodology' ? (
          <div className="space-y-4 md:space-y-6">
            {/* Methodology Layer */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
              <StatCard title={t('active_students_card')} value={stats.activeStudents} subtitle={`${stats.students} ${t('total_in_base')}`} icon={<GraduationCap size={24} />} color="yellow" />
              <StatCard title={t('groups_card')} value={stats.groups} subtitle={`${stats.coaches} ${t('coaches')}`} icon={<Users size={24} />} color="blue" />
              <StatCard title={t('trainings_card')} value={stats.eventsThisMonth} subtitle={t('this_month')} icon={<Activity size={24} />} color="green" />
              <StatCard title={t('attendance_card')} value={`${stats.attendanceRate}%`} subtitle={t('avg_school')} icon={<ClipboardCheck size={24} />} color="purple" />
            </div>

            <div className="grid lg:grid-cols-3 gap-2 md:gap-6">
              <div className="lg:col-span-2 bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10">
                <h2 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
                  <Layout className="text-yellow-500" size={20} />
                  {t('status_groups')}
                </h2>
                <div className="grid sm:grid-cols-2 gap-2 md:gap-4">
                  {groupStats.map(g => (
                    <div key={g.id} className="bg-white/5 p-3 md:p-4 rounded-2xl border border-white/5 hover:border-yellow-500/30 transition group">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-medium text-white group-hover:text-yellow-400 transition text-sm md:text-base">{g.name}</h3>
                        <span className="text-[10px] md:text-xs bg-white/10 px-2 py-1 rounded-full text-gray-400">{g.studentsCount} {t('students_short')}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs md:text-sm text-gray-400 mb-3">
                        <UserCheck size={14} />
                        {g.coachName}
                      </div>
                      <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-yellow-500" 
                          style={{ width: `${Math.min((g.studentsCount / 20) * 100, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] md:text-xs text-gray-500 mt-1">
                        <span>{t('occupancy')}</span>
                        <span>{Math.round((g.studentsCount / 20) * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10">
                <h2 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
                  <Activity className="text-blue-500" size={20} />
                  {t('quick_actions')}
                </h2>
                <div className="space-y-2 md:space-y-3">
                  <a href="/students" className="block p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition border border-white/5 hover:border-blue-500/30">
                    <div className="font-medium text-white mb-1 text-sm md:text-base">{t('add_student')}</div>
                    <div className="text-[10px] md:text-xs text-gray-400">{t('add_student_desc')}</div>
                  </a>
                  <a href="/schedule" className="block p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition border border-white/5 hover:border-green-500/30">
                    <div className="font-medium text-white mb-1 text-sm md:text-base">{t('schedule')}</div>
                    <div className="text-[10px] md:text-xs text-gray-400">{t('schedule_desc')}</div>
                  </a>
                  <a href="/groups" className="block p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition border border-white/5 hover:border-purple-500/30">
                    <div className="font-medium text-white mb-1 text-sm md:text-base">{t('groups')}</div>
                    <div className="text-[10px] md:text-xs text-gray-400">{t('groups_desc')}</div>
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 md:space-y-6">
            {/* Business Layer */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
              <StatCard title={t('revenue_month_card')} value={`${stats.revenueThisMonth.toLocaleString()} MDL`} subtitle={t('current_month')} icon={<DollarSign size={24} />} color="green" />
              <StatCard title={t('revenue_total_card')} value={`${stats.totalRevenue.toLocaleString()} MDL`} subtitle={t('all_time')} icon={<TrendingUp size={24} />} color="blue" />
              <StatCard title={t('avg_check_card')} value={`${stats.activeStudents ? Math.round(stats.revenueThisMonth / stats.activeStudents) : 0} MDL`} subtitle={t('per_student')} icon={<Users size={24} />} color="yellow" />
              <StatCard title={t('ltv_card')} value={t('wait') || 'Подождите...'} subtitle={t('lifetime_value') || 'Lifetime Value'} icon={<Heart size={24} />} color="purple" />
            </div>

            <div className="grid lg:grid-cols-2 gap-2 md:gap-6">
              <div className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10">
                <h2 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
                  <DollarSign className="text-emerald-500" size={20} />
                  {t('financial_flow')}
                </h2>
                <div className="space-y-2 md:space-y-4">
                  {recentPayments.length === 0 ? (
                    <p className="text-gray-500 text-center">{t('no_recent_payments')}</p>
                  ) : (
                    recentPayments.map(p => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm md:text-base">
                            $
                          </div>
                          <div>
                            <div className="font-medium text-white text-sm md:text-base">{p.amount} MDL</div>
                            <div className="text-[10px] md:text-xs text-gray-400">
                              {new Date(p.payment_date).toLocaleDateString()} • {getLocalizedName(p.student?.first_name, p.student?.last_name, language) || t('student')}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] md:text-xs text-gray-500">{t('payment_method')}</div>
                          <div className="text-xs md:text-sm text-gray-300">{p.payment_method || t('cash')}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white/5 rounded-3xl p-3 md:p-6 border border-white/10">
                <h2 className="text-base md:text-lg font-semibold text-white mb-3 md:mb-4 flex items-center gap-2">
                  <TrendingUp className="text-blue-500" size={20} />
                  {t('group_efficiency')}
                </h2>
                <div className="space-y-2 md:space-y-4">
                   {groupStats.map(g => (
                    <div key={g.id} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
                      <div>
                        <div className="font-medium text-white text-sm md:text-base">{g.name}</div>
                        <div className="text-[10px] md:text-xs text-gray-400">{g.studentsCount} {t('students_count')}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-400 text-sm md:text-base">
                          {(g.studentsCount * g.monthlyFee).toLocaleString()} MDL
                        </div>
                        <div className="text-[10px] md:text-xs text-gray-500">{t('potential')}</div>
                      </div>
                    </div>
                   ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Player Card (Diary) */}
      {selectedStudentId && (
        <PlayerCard 
          studentId={selectedStudentId} 
          onClose={() => setSelectedStudentId(null)} 
        />
      )}
    </div>
  );
}
