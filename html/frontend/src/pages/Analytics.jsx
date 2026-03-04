import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { eventsAPI, groupsAPI, studentsAPI, paymentsAPI, attendanceAPI, analyticsAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { ArrowLeft, TrendingUp, TrendingDown, Users, Calendar, DollarSign, Activity, FileText, Trophy, CheckCircle2, AlertCircle, Download, Loader2 } from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart
} from 'recharts';
import FinancialAnalytics from '../components/analytics/FinancialAnalytics';
import TopPlayersAnalytics from '../components/analytics/TopPlayersAnalytics';
import { exportToExcel, getDateString, downloadBlob } from '../utils/exportUtils';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import CoachAnalytics from '../components/analytics/CoachAnalytics';

const PeriodControls = ({ selectedYear, setSelectedYear, selectedMonth, setSelectedMonth, t }) => {
  const currentYear = new Date().getFullYear();
  // Generate years: dynamic range (20 past, 30 future)
  const years = Array.from({ length: 51 }, (_, i) => (currentYear - 20) + i); 

  const months = [
    { value: '', label: t('all_months') || 'Все месяцы' },
    { value: '01', label: t('january') || 'Январь' },
    { value: '02', label: t('february') || 'Февраль' },
    { value: '03', label: t('march') || 'Март' },
    { value: '04', label: t('april') || 'Апрель' },
    { value: '05', label: t('may') || 'Май' },
    { value: '06', label: t('june') || 'Июнь' },
    { value: '07', label: t('july') || 'Июль' },
    { value: '08', label: t('august') || 'Август' },
    { value: '09', label: t('september') || 'Сентябрь' },
    { value: '10', label: t('october') || 'Октябрь' },
    { value: '11', label: t('november') || 'Ноябрь' },
    { value: '12', label: t('december') || 'Декабрь' },
  ];

  return (
    <div className="flex flex-col md:flex-row flex-wrap gap-4 items-start md:items-center mb-6 bg-white/5 p-2 rounded-xl w-full md:w-fit border border-white/10">
      <div className="flex items-center gap-2 w-full md:w-auto">
        <span className="text-white/50 text-sm ml-2">{t('year') || 'Год'}:</span>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="bg-[#1C1E24] border border-white/10 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-500 transition-colors cursor-pointer hover:bg-white/5 flex-1 md:flex-none"
        >
          {years.map(year => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 w-full md:w-auto md:mr-2">
        <span className="text-white/50 text-sm">{t('month') || 'Месяц'}:</span>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-[#1C1E24] border border-white/10 text-white rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-500 transition-colors cursor-pointer hover:bg-white/5 flex-1 md:flex-none"
        >
          {months.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default function Analytics() {
  const { t, language } = useLanguage();
  const { user } = useAuth(); // Get current user
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);

  // 🛡️ Security Check: Redirect if admin doesn't have analytics permission
  useEffect(() => {
    if (user?.role === 'admin' && !user?.can_view_analytics) {
      navigate('/');
    }
  }, [user, navigate]);
  
  // Data State
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState(location.state?.activeTab || 'comparison');
  
  // Filter State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(''); // '' means all months

  // Tab Specific Reports
  const [financialReport, setFinancialReport] = useState(null);
  const [attendanceReport, setAttendanceReport] = useState(null);
  const [coachReport, setCoachReport] = useState([]);
  const [topPlayers, setTopPlayers] = useState([]);

  // Remove duplicate getDateRange definition and use the one defined in render scope
  // The logic was moved inside the component body above


  // Export State
  const printRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const localeMap = { ru: 'ru-RU', en: 'en-US', ro: 'ro-RO' };
  const loc = localeMap[language] || 'ru-RU';

  // Get date range based on filters
  const getDateRange = () => {
    let start, end;
    if (selectedMonth) {
      // Specific month (UTC to avoid timezone shifts)
      const mIndex = parseInt(selectedMonth) - 1;
      start = new Date(Date.UTC(selectedYear, mIndex, 1));
      end = new Date(Date.UTC(selectedYear, mIndex + 1, 0));
    } else {
      // Whole year
      start = new Date(Date.UTC(selectedYear, 0, 1));
      end = new Date(Date.UTC(selectedYear, 11, 31));
    }
    return { 
      start, 
      end, 
      startStr: start.toISOString().split('T')[0], 
      endStr: end.toISOString().split('T')[0] 
    };
  };

  // Memoize date range to prevent unnecessary re-renders
  const { start, end, startStr, endStr } = getDateRange();

  useEffect(() => {
    fetchAllData();
  }, []);

  

  const loadCoachReport = useCallback(async () => {
    try {
      const res = await analyticsAPI.getCoachPerformance(startStr, endStr);
      const data = res.data || [];
      // Calculate scores
      const rankedData = data.map(coach => {
        const score = (
          (coach.win_rate * 0.3) + 
          (coach.attendance_rate * 0.3) + 
          (coach.retention_rate * 0.2) + 
          (coach.avg_skill_score_pct * 0.2)
        );
        return { ...coach, score: Math.round(score * 10) / 10 };
      }).sort((a, b) => b.score - a.score);
      
      setCoachReport(rankedData);
    } catch (e) {
      console.error('Error loading coach report:', e);
    }
  }, [startStr, endStr]);

  const loadTopPlayers = useCallback(async () => {
    try {
      // Pass null for group_id for now (or add a group filter later)
      // Use selectedMonth and selectedYear
      // If selectedMonth is empty string, pass null to API to trigger yearly aggregation
      // Increased limit to 500 to show full list as requested
      const res = await analyticsAPI.getTopPlayers(null, selectedMonth || null, selectedYear, 500);
      setTopPlayers(res.data);
    } catch (e) {
      console.error('Error loading top players:', e);
    }
  }, [selectedMonth, selectedYear]);

  const loadFinancialReport = useCallback(async () => {
    try {
      // Use startStr/endStr from render scope
      const res = await analyticsAPI.getFinancialReport('month', 12, startStr, endStr);
      setFinancialReport(res.data);
    } catch (e) {
      console.error('Error loading financial report:', e);
    }
  }, [startStr, endStr]);

  const loadAttendanceReport = useCallback(async () => {
    try {
      // Use startStr/endStr from render scope
      const res = await analyticsAPI.getAttendance('month', 12, startStr, endStr);
      setAttendanceReport(res.data);
    } catch (e) {
      console.error('Error loading attendance report:', e);
    }
  }, [startStr, endStr]);

  // Fetch reports when filters or tab change
  useEffect(() => {
    if (activeTab === 'financial') {
      loadFinancialReport();
    } else if (activeTab === 'attendance') {
      loadAttendanceReport();
    } else if (activeTab === 'top_players') {
      loadTopPlayers();
    } else if (activeTab === 'coaches') {
      loadCoachReport();
    }
  }, [activeTab, loadFinancialReport, loadAttendanceReport, loadTopPlayers, loadCoachReport]);

  const fetchAllData = async () => {
    try {
      const results = await Promise.allSettled([
        eventsAPI.getAll(),
        groupsAPI.getAll(),
        studentsAPI.getAll(),
        paymentsAPI.getAll(),
        attendanceAPI.getAll()
      ]);
      
      const [eventsRes, groupsRes, studentsRes, paymentsRes, attendanceRes] = results;

      if (eventsRes.status === 'fulfilled') {
        setEvents(eventsRes.value.data.data || []);
      } else {
        console.error('Events API failed:', eventsRes.reason);
      }

      if (groupsRes.status === 'fulfilled') {
        setGroups(groupsRes.value.data.data || []);
      } else {
        console.error('Groups API failed:', groupsRes.reason);
      }

      if (studentsRes.status === 'fulfilled') {
        setStudents(studentsRes.value.data.data || []);
      } else {
        console.error('Students API failed:', studentsRes.reason);
      }
      
      if (paymentsRes.status === 'fulfilled') {
        const allPayments = paymentsRes.value.data.data || paymentsRes.value.data || [];
        const completedPayments = allPayments.filter(p => p.status === 'completed' && !p.deleted_at);
        setPayments(completedPayments);
      } else {
        console.error('Payments API failed:', paymentsRes.reason);
      }
      
      if (attendanceRes.status === 'fulfilled') {
        setAttendance(attendanceRes.value.data || []);
      } else {
        console.error('Attendance API failed:', attendanceRes.reason);
      }

    } catch (error) {
      console.error('Error in fetchAllData wrapper:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats for a specific period (Internal Frontend Calculation)
  const getStatsForPeriod = (startDate, endDate) => {
    // If no events/payments loaded yet, return zeros but don't break
    if (!events.length && !payments.length && !attendance.length && !students.length) {
      return {
        trainings: 0,
        matches: 0,
        tournaments: 0,
        revenue: 0,
        attendanceRate: 0,
        financialReport: 0,
        paymentsCount: 0,
        activeStudents: 0,
        totalStudents: 0,
        debtorsCount: 0
      };
    }

    const periodEvents = events.filter(e => {
      const eventDate = new Date(e.start_time);
      return eventDate >= startDate && eventDate <= endDate;
    });

    const periodPayments = payments.filter(p => {
      const dateToCheck = p.payment_period ? new Date(p.payment_period) : new Date(p.payment_date);
      return dateToCheck >= startDate && dateToCheck <= endDate;
    });

    const revenue = periodPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const trainingsCount = periodEvents.filter(e => e.type?.toLowerCase() === 'training').length;
    const matchesCount = periodEvents.filter(e => {
      const type = e.type?.toLowerCase();
      return type === 'match' || type === 'game';
    }).length;
    const tournamentsCount = periodEvents.filter(e => e.type?.toLowerCase() === 'tournament').length;

    let attendanceRate = 0;
    const periodAttendance = attendance.filter(a => {
      const date = new Date(a.date);
      return date >= startDate && date <= endDate;
    });

    if (periodAttendance.length > 0) {
      const totalPresent = periodAttendance.filter(a => a.status === 'present').length;
      attendanceRate = Math.round((totalPresent / periodAttendance.length) * 100);
    }
    
    // Student stats are generally static/snapshot based in this simple system,
    // but for "active in period" we could check payment/attendance activity.
    // However, the user issue is that switching to 2027 shows same student counts.
    // Realistically, we only have "current" student list.
    // To fix this visual confusion for future dates, we can show 0 if the period is far in future
    // OR just clarify these are "Current Active Students".
    // Let's implement a check: if period start > current date, show 0 activity-based stats,
    // but Total Students remains valid (they are registered).
    // The user complained "Why 2027 stats didn't change?".
    // If we look at "Active" students, usually it implies currently active.
    // If we look at a past/future year, we can't easily reconstruct historical student state without a complex history table.
    // But we CAN filter "Active" based on having ANY attendance or payment in that period.
    
    const activeStudentIds = new Set([
        ...periodAttendance.map(a => a.student_id),
        ...periodPayments.map(p => p.student_id)
    ]);
    
    const activeStudentsCount = activeStudentIds.size;
    
    // For debtors, we need period-specific logic which is hard on frontend.
    // Let's stick to "Active in Period" = has attendance or payment.
    
    // Total students is snapshot, so it's always current count.
    // BUT for 2027 it should probably show 0 active if no one paid/attended.
    
    return {
      trainings: trainingsCount,
      matches: matchesCount,
      tournaments: tournamentsCount,
      revenue,
      attendanceRate,
      financialReport: revenue,
      paymentsCount: periodPayments.length,
      activeStudents: activeStudentsCount, // Dynamic based on activity
      totalStudents: students.length, // Static snapshot
      debtorsCount: students.filter(s => s.is_debtor).length // Static snapshot
    };
  };

  // Get comparison data based on selected filters
  const getComparisonData = () => {
    let currentStart, currentEnd, prevStart, prevEnd;
    let currentLabel, previousLabel;

    if (selectedMonth) {
        // Compare Month vs Previous Month (using UTC)
        const mIndex = parseInt(selectedMonth) - 1;
        
        currentStart = new Date(Date.UTC(selectedYear, mIndex, 1));
        currentEnd = new Date(Date.UTC(selectedYear, mIndex + 1, 0));
        currentLabel = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(currentStart);

        prevStart = new Date(Date.UTC(selectedYear, mIndex - 1, 1));
        prevEnd = new Date(Date.UTC(selectedYear, mIndex, 0));
        previousLabel = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' }).format(prevStart);
    } else {
        // Compare Year vs Previous Year (using UTC)
        currentStart = new Date(Date.UTC(selectedYear, 0, 1));
        currentEnd = new Date(Date.UTC(selectedYear, 11, 31));
        currentLabel = `${selectedYear}`;

        prevStart = new Date(Date.UTC(selectedYear - 1, 0, 1));
        prevEnd = new Date(Date.UTC(selectedYear - 1, 11, 31));
        previousLabel = `${selectedYear - 1}`;
    }

    // Force recalculation for current period using fresh state filters (handled by getStatsForPeriod which uses args)
    // But we also need to make sure `events`, `payments`, `attendance` are loaded.
    const current = getStatsForPeriod(currentStart, currentEnd);
    const previous = getStatsForPeriod(prevStart, prevEnd);

    return { current, previous, currentLabel, previousLabel };
  };

  // Get comparison data (consolidated below as `comparison`)

  const calcChange = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
  };

  const formatCurrency = (amount) => {
    return `${amount.toLocaleString()} MDL`;
  };

  const handleExport = async (type = 'excel') => {
    const filename = `Analytics_${activeTab}_${getDateString()}`;
    setIsExporting(true);

    try {
      if (type === 'excel') {
        let dataToExport = [];
        let columns = {};

        if (activeTab === 'financial' && financialReport) {
          dataToExport = financialReport.data.map(d => ({
            period: d.period,
            revenue: d.revenue,
            salary: d.salary || 0,
            expense: d.expense || 0,
            net_profit: d.net_profit || 0,
            currency: 'MDL'
          }));
          columns = { 
            period: t('period') || 'Period', 
            revenue: t('revenue_label') || 'Revenue', 
            salary: t('salary_label') || 'Salary',
            expense: t('expenses_label') || 'Expenses',
            net_profit: t('net_profit') || 'Net Profit',
            currency: t('currency') || 'Currency' 
          };
        } else if (activeTab === 'attendance' && attendanceReport) {
          dataToExport = attendanceReport.by_groups.map(g => ({
            group: g.group_name,
            rate: `${g.rate}%`,
            present: g.present,
            absent: g.total - g.present,
            total: g.total
          }));
          columns = { 
            group: t('group_label') || 'Group', 
            rate: t('attendance_rate') || 'Attendance Rate', 
            present: t('present') || 'Present', 
            absent: t('absent') || 'Absent', 
            total: t('total_records') || 'Total Records' 
          };
        } else if (activeTab === 'comparison') {
          const comp = getComparisonData();
          const metrics = [
            { label: t('trainings_count'), current: comp.current.trainings, prev: comp.previous.trainings },
            { label: t('matches_played'), current: comp.current.matches, prev: comp.previous.matches },
            { label: t('revenue_label'), current: comp.current.revenue, prev: comp.previous.revenue },
            { label: t('attendance_rate'), current: comp.current.attendanceRate, prev: comp.previous.attendanceRate }
          ];
          dataToExport = metrics.map(m => ({
            metric: m.label,
            current: m.current,
            previous: m.prev,
            change: calcChange(m.current, m.prev) + '%'
          }));
          columns = { 
            metric: t('metric') || 'Metric', 
            current: t('current_period') || 'Current Period', 
            previous: t('previous_period') || 'Previous Period', 
            change: t('changes') || 'Change' 
          };
        } else if (activeTab === 'top_players') {
           // Use existing topPlayers state
           if (topPlayers && topPlayers.length > 0) {
              dataToExport = topPlayers.map((p, idx) => ({
                 rank: idx + 1,
                 name: p.name,
                 group: p.group_name,
                 total_score: p.total_score,
                 skill_rating: p.metrics?.skill_rating || 0,
                 attendance: `${p.metrics?.attendance_pct || 0}%`,
                 discipline: p.metrics?.discipline_rating || 0,
                 technique: p.details?.technique || 0,
                 tactics: p.details?.tactics || 0,
                 physical: p.details?.physical || 0,
                 speed: p.details?.speed || 0
              }));
              columns = {
                 rank: t('rank') || 'Rank',
                 name: t('student') || 'Student',
                 group: t('group_label') || 'Group',
                 total_score: t('total_points') || 'Total Score',
                 skill_rating: t('skills') || 'Skills Rating',
                 attendance: t('attendance') || 'Attendance',
                 discipline: t('discipline') || 'Discipline',
                 technique: t('technique') || 'Technique',
                 tactics: t('tactics') || 'Tactics',
                 physical: t('physical') || 'Physical',
                 speed: t('speed') || 'Speed'
              };
           }
        } else if (activeTab === 'coaches') {
           // Fetch coach data specifically for export
           try {
              const res = await analyticsAPI.getCoachPerformance(startStr, endStr);
              const rawData = res.data || [];
              
              // Replicate scoring logic from CoachAnalytics
              const coachData = rawData.map(coach => {
                const score = (
                  (coach.win_rate * 0.3) + 
                  (coach.attendance_rate * 0.3) + 
                  (coach.retention_rate * 0.2) + 
                  (coach.avg_skill_score_pct * 0.2)
                );
                return { ...coach, score: Math.round(score * 10) / 10 };
              }).sort((a, b) => b.score - a.score);

              dataToExport = coachData.map((c, idx) => ({
                 rank: idx + 1,
                 name: c.name,
                 score: c.score,
                 win_rate: `${c.win_rate}% (${c.wins}/${c.total_games})`,
                 attendance_rate: `${c.attendance_rate}%`,
                 retention_rate: `${c.retention_rate}% (${c.active_students}/${c.total_students})`,
                 skills_dev: `${c.avg_skill_score_pct}%`,
                 discipline: c.avg_discipline
              }));

              columns = {
                 rank: t('rank') || 'Rank',
                 name: t('coach') || 'Coach',
                 score: t('score') || 'Score',
                 win_rate: t('win_rate') || 'Win Rate',
                 attendance_rate: t('attendance') || 'Attendance',
                 retention_rate: t('retention') || 'Retention',
                 skills_dev: t('development') || 'Development',
                 discipline: t('discipline') || 'Discipline'
              };
           } catch (err) {
              console.error("Failed to fetch coach data for export", err);
           }
        } else {
          // Overview
          // Create summary rows first
          const comp = getComparisonData();
          const summaryRows = [
            { name: t('total_students'), students: comp.current.totalStudents ?? 0, coach: '' },
            { name: t('groups_count'), students: groups.length, coach: '' },
            { name: t('active_students'), students: comp.current.activeStudents ?? 0, coach: '' },
            { name: t('debtors_count'), students: comp.current.debtorsCount ?? 0, coach: '' },
            { name: '', students: '', coach: '' } // Spacer
          ];

          const groupsData = groups.map(g => ({
            name: g.name,
            students: students.filter(s => s.group_id === g.id).length,
            coach: g.coach?.full_name || '-'
          }));

          dataToExport = [...summaryRows, ...groupsData];
          
          columns = { 
            name: t('group_label') || 'Group / Metric', 
            students: t('count') || 'Count', 
            coach: t('coach') || 'Coach' 
          };
        }

        if (dataToExport.length > 0) {
            exportToExcel(dataToExport, columns, filename);
        } else {
            // Optional: Alert user no data to export
            console.warn("No data to export");
        }
      } else {
        if (!printRef.current) return;
        
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for render
        
        try {
          const canvas = await html2canvas(printRef.current, {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false
          });
          
          const imgData = canvas.toDataURL('image/png');
          const pdf = new jsPDF({
            orientation: 'landscape',
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
        }
      }
    } catch (error) {
       console.error("Export error:", error);
    } finally {
       setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  const comparison = getComparisonData();
  
  const comparisonMetrics = [
    { 
      key: 'trainings', 
      label: t('trainings_count') || 'Кол-во тренировок', 
      icon: <Activity className="w-5 h-5 text-blue-400" />,
      current: comparison.current.trainings, 
      previous: comparison.previous.trainings 
    },
    { 
      key: 'matches', 
      label: t('matches_played') || 'Сыграно матчей', 
      icon: <TrendingUp className="w-5 h-5 text-green-400" />,
      current: comparison.current.matches, 
      previous: comparison.previous.matches 
    },
    { 
      key: 'tournaments', 
      label: t('tournaments_count') || 'Кол-во турниров', 
      icon: <Trophy className="w-5 h-5 text-yellow-400" />,
      current: comparison.current.tournaments, 
      previous: comparison.previous.tournaments 
    },
    { 
      key: 'revenue', 
      label: t('revenue_label'), 
      icon: <DollarSign className="w-5 h-5 text-yellow-400" />,
      current: comparison.current.revenue, 
      previous: comparison.previous.revenue, 
      isCurrency: true 
    },
    { 
      key: 'attendanceRate', 
      label: t('attendance_tab'), 
      icon: <Users className="w-5 h-5 text-purple-400" />,
      current: comparison.current.attendanceRate, 
      previous: comparison.previous.attendanceRate,
      suffix: '%'
    },
    { 
      key: 'financialReport', 
      label: t('financial_report'), 
      icon: <FileText className="w-5 h-5 text-orange-400" />,
      current: comparison.current.financialReport, 
      previous: comparison.previous.financialReport,
      isCurrency: true
    },
  ];

  return (
    <div className="min-h-screen bg-[#0F1117] p-4 md:p-6 text-white overflow-x-hidden">
      {/* Hidden printable section */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <div ref={printRef} className="p-8 bg-white text-black min-w-[1100px] font-sans">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-4">
            <div>
              <h1 className="text-3xl font-bold uppercase tracking-wider">{t('analytics_report') || 'Analytics Report'}</h1>
              <div className="text-gray-600 mt-1 uppercase font-bold text-lg">
                {t(activeTab + '_tab') || activeTab}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">{t('date') || 'Date'}</div>
              <div className="font-bold">{new Date().toLocaleDateString()}</div>
              <div className="text-sm text-gray-500 mt-1">{t('period')}: {selectedYear} {selectedMonth ? `/${selectedMonth}` : ''}</div>
            </div>
          </div>

          {/* PDF CONTENT RENDERING */}
          <div className="space-y-6">
            
            {/* 1. OVERVIEW PRINT */}
            {activeTab === 'overview' && (
              <>
                {/* Summary Cards Row */}
                <div className="grid grid-cols-4 gap-4 mb-8">
                  <div className="p-4 border border-gray-300 rounded bg-gray-50">
                    <div className="text-sm text-gray-500">{t('total_students')}</div>
                    <div className="text-2xl font-bold">{comparison.current.totalStudents}</div>
                  </div>
                  <div className="p-4 border border-gray-300 rounded bg-gray-50">
                    <div className="text-sm text-gray-500">{t('groups_count')}</div>
                    <div className="text-2xl font-bold">{groups.length}</div>
                  </div>
                  <div className="p-4 border border-gray-300 rounded bg-gray-50">
                    <div className="text-sm text-gray-500">{t('active_in_period')}</div>
                    <div className="text-2xl font-bold text-green-600">{comparison.current.activeStudents}</div>
                  </div>
                  <div className="p-4 border border-gray-300 rounded bg-gray-50">
                    <div className="text-sm text-gray-500">{t('debtors_count')}</div>
                    <div className="text-2xl font-bold text-red-600">{comparison.current.debtorsCount}</div>
                  </div>
                </div>

                {/* Groups Table */}
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">{t('group_label')}</th>
                      <th className="border p-2 text-left">{t('coach')}</th>
                      <th className="border p-2 text-right">{t('students_title')}</th>
                      <th className="border p-2 text-right">{t('active')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map(g => {
                      const groupStudents = students.filter(s => s.group_id === g.id);
                      // Simplified active count for print (reusing logic if possible or just total)
                      // We can assume total for now to save space, or replicate active logic
                      return (
                        <tr key={g.id}>
                          <td className="border p-2 font-medium">{g.name}</td>
                          <td className="border p-2">{g.coach?.full_name || '-'}</td>
                          <td className="border p-2 text-right">{groupStudents.length}</td>
                          <td className="border p-2 text-right">-</td> 
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* 2. COMPARISON PRINT */}
            {activeTab === 'comparison' && (
              <div className="grid grid-cols-2 gap-6">
                {comparisonMetrics.map(m => (
                  <div key={m.key} className="border p-4 rounded bg-gray-50">
                    <div className="text-gray-500 text-sm mb-1">{m.label}</div>
                    <div className="flex justify-between items-end">
                       <div className="text-2xl font-bold">
                         {m.isCurrency ? formatCurrency(m.current) : m.current} {m.suffix}
                       </div>
                       <div className="text-sm text-gray-500">
                         Prev: {m.isCurrency ? formatCurrency(m.previous) : m.previous}
                       </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3. FINANCIAL PRINT */}
            {activeTab === 'financial' && financialReport && financialReport.data && (
              <>
                 <div className="grid grid-cols-4 gap-4 mb-8">
                    <div className="p-4 border rounded">
                      <div className="text-sm text-gray-500">Revenue</div>
                      <div className="text-xl font-bold text-green-600">{formatCurrency(financialReport.total_revenue || 0)}</div>
                    </div>
                    <div className="p-4 border rounded">
                      <div className="text-sm text-gray-500">Salary</div>
                      <div className="text-xl font-bold text-blue-600">{formatCurrency(financialReport.total_salary || 0)}</div>
                    </div>
                    <div className="p-4 border rounded">
                      <div className="text-sm text-gray-500">Expenses</div>
                      <div className="text-xl font-bold text-orange-600">{formatCurrency(financialReport.total_expense || 0)}</div>
                    </div>
                    <div className="p-4 border rounded">
                      <div className="text-sm text-gray-500">Net Profit</div>
                      <div className={`text-xl font-bold ${financialReport.net_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(financialReport.net_profit || 0)}
                      </div>
                    </div>
                 </div>
                 
                 <table className="w-full border-collapse text-sm">
                   <thead>
                     <tr className="bg-gray-100">
                       <th className="border p-2 text-left">{t('period')}</th>
                       <th className="border p-2 text-right">{t('revenue_label')}</th>
                       <th className="border p-2 text-right">{t('salary_label')}</th>
                       <th className="border p-2 text-right">{t('expenses_label')}</th>
                       <th className="border p-2 text-right">{t('net_profit')}</th>
                     </tr>
                   </thead>
                   <tbody>
                     {financialReport.data.map((row, i) => (
                       <tr key={i}>
                         <td className="border p-2">{row.period}</td>
                         <td className="border p-2 text-right">{formatCurrency(row.revenue || 0)}</td>
                         <td className="border p-2 text-right">{formatCurrency(row.salary || 0)}</td>
                         <td className="border p-2 text-right">{formatCurrency(row.expense || 0)}</td>
                         <td className="border p-2 text-right font-bold">{formatCurrency(row.net_profit || 0)}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
              </>
            )}

            {/* 4. ATTENDANCE PRINT */}
            {activeTab === 'attendance' && attendanceReport && (
              <>
                <div className="grid grid-cols-4 gap-4 mb-8">
                  <div className="p-4 border rounded bg-gray-50">
                    <div className="text-sm text-gray-500">{t('total_records')}</div>
                    <div className="text-xl font-bold">{attendanceReport.total_records}</div>
                  </div>
                  <div className="p-4 border rounded bg-gray-50">
                    <div className="text-sm text-gray-500">{t('attendance_rate')}</div>
                    <div className="text-xl font-bold text-purple-600">{attendanceReport.attendance_rate}%</div>
                  </div>
                </div>

                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border p-2 text-left">{t('group_label')}</th>
                      <th className="border p-2 text-center">{t('attendance_rate')}</th>
                      <th className="border p-2 text-right">{t('present')}</th>
                      <th className="border p-2 text-right">{t('absent')}</th>
                      <th className="border p-2 text-right">{t('total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceReport.by_groups.map((g, i) => (
                      <tr key={i}>
                        <td className="border p-2 font-medium">{g.group_name}</td>
                        <td className="border p-2 text-center font-bold">{g.rate}%</td>
                        <td className="border p-2 text-right text-green-600">{g.present}</td>
                        <td className="border p-2 text-right text-red-600">{g.total - g.present}</td>
                        <td className="border p-2 text-right">{g.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* 5. TOP PLAYERS PRINT */}
            {activeTab === 'top_players' && topPlayers && (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-1 text-center">#</th>
                    <th className="border p-1 text-left">{t('student')}</th>
                    <th className="border p-1 text-left">{t('group_label')}</th>
                    <th className="border p-1 text-center">{t('total_points')}</th>
                    <th className="border p-1 text-center">{t('skills')}</th>
                    <th className="border p-1 text-center">{t('attendance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topPlayers.slice(0, 50).map((p, idx) => (
                    <tr key={idx}>
                      <td className="border p-1 text-center">{idx + 1}</td>
                      <td className="border p-1 font-bold">{p.name}</td>
                      <td className="border p-1 text-gray-600">{p.group_name}</td>
                      <td className="border p-1 text-center font-bold text-blue-600">{p.total_score}</td>
                      <td className="border p-1 text-center">{p.metrics?.skill_rating}</td>
                      <td className="border p-1 text-center">{p.metrics?.attendance_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            
            {/* 6. COACHES PRINT */}
            {activeTab === 'coaches' && coachReport.length > 0 && (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-center w-10">#</th>
                    <th className="border p-2 text-left">{t('coach')}</th>
                    <th className="border p-2 text-center">{t('score')}</th>
                    <th className="border p-2 text-center">{t('win_rate')}</th>
                    <th className="border p-2 text-center">{t('attendance')}</th>
                    <th className="border p-2 text-center">{t('retention')}</th>
                    <th className="border p-2 text-center">{t('development')}</th>
                  </tr>
                </thead>
                <tbody>
                  {coachReport.map((c, idx) => (
                    <tr key={idx}>
                      <td className="border p-2 text-center">{idx + 1}</td>
                      <td className="border p-2 font-bold">{c.name}</td>
                      <td className="border p-2 text-center font-bold text-yellow-600">{c.score}</td>
                      <td className="border p-2 text-center">{c.win_rate}%</td>
                      <td className="border p-2 text-center">{c.attendance_rate}%</td>
                      <td className="border p-2 text-center">{c.retention_rate}%</td>
                      <td className="border p-2 text-center">{c.avg_skill_score_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between text-xs text-gray-500">
            <div>Generated by Football Academy System</div>
            <div>Page 1</div>
          </div>
        </div>
      </div>

      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-6">
        <button 
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg bg-white/5 hover:bg-yellow-500/20 hover:text-yellow-400 transition-colors border border-white/10"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-2">
            <span className="text-3xl md:text-4xl">📊</span>
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
              {t('analytics_title')}
            </span>
          </h1>
          <p className="text-white/50 text-sm md:text-base">{t('analytics_subtitle')}</p>
        </div>
        
        <div className="flex-1" />
        
        {/* Export Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('excel')}
            disabled={isExporting}
            className={`p-3 md:p-2 bg-white/5 hover:bg-white/10 text-green-400 rounded-lg border border-white/10 transition active:scale-95 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={t('export_excel') || "Export Excel"}
          >
            {isExporting ? <Loader2 size={24} className="animate-spin md:w-5 md:h-5" /> : <FileText className="w-6 h-6 md:w-5 md:h-5" />}
          </button>
          <button
            onClick={() => handleExport('pdf')}
            disabled={isExporting}
            className={`p-3 md:p-2 bg-white/5 hover:bg-white/10 text-red-400 rounded-lg border border-white/10 transition active:scale-95 ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={t('export_pdf') || "Export PDF"}
          >
            {isExporting ? <Loader2 size={24} className="animate-spin md:w-5 md:h-5" /> : <FileText className="w-6 h-6 md:w-5 md:h-5" />}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white/5 border border-white/10 p-1 flex rounded-xl overflow-x-auto mb-6 no-scrollbar snap-x touch-pan-x">
        {[
          { id: 'comparison', label: t('comparison_tab'), icon: <TrendingUp className="w-4 h-4" /> },
          { id: 'overview', label: t('overview_tab'), icon: <Activity className="w-4 h-4" /> },
          { id: 'coaches', label: t('coaches_tab') || 'Тренеры', icon: <Trophy className="w-4 h-4" /> },
          { id: 'attendance', label: t('attendance_tab'), icon: <Users className="w-4 h-4" /> },
          { id: 'financial', label: t('financial_tab'), icon: <DollarSign className="w-4 h-4" /> },
          { id: 'top_players', label: t('top_players') || 'Топ Игроков', icon: <Trophy className="w-4 h-4" /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 md:px-6 py-3 flex items-center gap-2 font-medium transition-all rounded-lg whitespace-nowrap snap-center ${
              activeTab === tab.id
                ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20'
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* GLOBAL FILTER - Applied to all tabs */}
      <div className="mb-2">
         <div className="text-xs text-white/40 mb-2 uppercase font-bold tracking-wider ml-1">{t('period_filter') || 'Фильтр периода'}</div>
         <PeriodControls 
            selectedYear={selectedYear} 
            setSelectedYear={setSelectedYear} 
            selectedMonth={selectedMonth} 
            setSelectedMonth={setSelectedMonth} 
            t={t} 
         />
      </div>

      {/* Comparison Tab */}
      {activeTab === 'comparison' && (
        <div className="space-y-6">
          <div className="text-lg text-white/80 font-medium">
             {comparison.currentLabel} vs {comparison.previousLabel}
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {comparisonMetrics.map((metric) => {
              const change = calcChange(metric.current, metric.previous);
              const isPositive = change >= 0;
              
              return (
                <div 
                  key={metric.key} 
                  className="bg-white/5 border border-white/10 p-6 rounded-2xl hover:border-yellow-500/30 transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-white/10 rounded-lg">
                      {metric.icon}
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-bold ${
                      isPositive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {Math.abs(change)}%
                    </div>
                  </div>
                  
                  <div className="text-white/50 text-sm mb-1">{metric.label}</div>
                  <div className="text-2xl font-bold text-white">
                    {metric.isCurrency ? formatCurrency(metric.current) : metric.current}
                    {metric.suffix}
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-white/10 flex justify-between text-xs">
                    <div className="text-white/50">
                      {t('previous') || 'Пред.'}: <span className="text-white/70">
                        {metric.isCurrency ? formatCurrency(metric.previous) : metric.previous}
                        {metric.suffix}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="text-4xl mb-2">👥</div>
              <div className="text-3xl font-bold text-white">{comparison.current.totalStudents}</div>
              <div className="text-white/50 text-sm">{t('total_students')}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="text-4xl mb-2">📋</div>
              <div className="text-3xl font-bold text-white">{groups.length}</div>
              <div className="text-white/50 text-sm">{t('groups_count')}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
              <div className="text-4xl mb-2">✅</div>
              <div className="text-3xl font-bold text-emerald-400">{comparison.current.activeStudents}</div>
              <div className="text-white/50 text-sm">{t('active_in_period') || 'Активны в периоде'}</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
              <div className="text-4xl mb-2">🚩</div>
              <div className="text-3xl font-bold text-red-400">{comparison.current.debtorsCount}</div>
              <div className="text-white/50 text-sm">{t('with_debt')}</div>
            </div>
          </div>

          {/* Groups Overview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 overflow-x-auto">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              📊 {t('groups_stats')}
            </h3>
            <div className="space-y-3 min-w-[500px]">
              {groups.slice(0, 6).map(group => {
                const groupStudents = students.filter(s => s.group_id === group.id);
                // Active count based on period activity (not just status)
                // Filter students who have payments or attendance in this period
                const activeCount = groupStudents.filter(s => {
                    const hasAttendance = attendance.some(a => 
                        a.student_id === s.id && 
                        new Date(a.date) >= start && 
                        new Date(a.date) <= end
                    );
                    const hasPayment = payments.some(p => 
                        p.student_id === s.id && 
                        (p.payment_period ? new Date(p.payment_period) : new Date(p.payment_date)) >= start &&
                        (p.payment_period ? new Date(p.payment_period) : new Date(p.payment_date)) <= end
                    );
                    return hasAttendance || hasPayment;
                }).length;

                const fillPercent = group.max_students ? Math.round((groupStudents.length / group.max_students) * 100) : 50;
                
                return (
                  <div key={group.id} className="flex items-center gap-4">
                    <div className="w-40 font-medium text-white truncate">{group.name}</div>
                    <div className="flex-1 h-4 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full transition-all"
                        style={{ width: `${Math.min(fillPercent, 100)}%` }}
                      />
                    </div>
                    <div className="w-36 text-right text-white/70 text-sm">
                      {groupStudents.length} {t('students_short')} ({activeCount} {t('active')})
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Coach Analytics Tab */}
      {activeTab === 'coaches' && (
        <CoachAnalytics startDate={startStr} endDate={endStr} />
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <div className="space-y-6">
          {/* Attendance Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="text-4xl mb-2">📅</div>
              <div className="text-3xl font-bold text-white">{attendanceReport?.total_records || 0}</div>
              <div className="text-white/50 text-sm">{t('total_records') || 'Всего записей'}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
              <div className="text-4xl mb-2">✅</div>
              <div className="text-3xl font-bold text-emerald-400">{attendanceReport?.present || 0}</div>
              <div className="text-white/50 text-sm">{t('present') || 'Присутствовал'}</div>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-5">
              <div className="text-4xl mb-2">📊</div>
              <div className="text-3xl font-bold text-purple-400">{attendanceReport?.attendance_rate || 0}%</div>
              <div className="text-white/50 text-sm">{t('attendance_rate') || 'Посещаемость'}</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
              <div className="text-4xl mb-2">❌</div>
              <div className="text-3xl font-bold text-red-400">{attendanceReport?.absent || 0}</div>
              <div className="text-white/50 text-sm">{t('absent') || 'Пропустил'}</div>
            </div>
          </div>

          {/* Attendance by Groups */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-400" />
              {t('groups_stats')}
            </h3>
            <div className="space-y-4">
              {attendanceReport?.by_groups?.map(group => (
                   <div key={group.group_id} className="p-4 bg-white/5 rounded-xl">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{group.group_name}</span>
                        <span className="text-yellow-400 font-bold">{group.rate}%</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                         <div className="h-full bg-purple-500 rounded-full" style={{ width: `${group.rate}%` }}></div>
                      </div>
                      <div className="mt-2 text-xs text-white/40 flex justify-between">
                        <span>{t('present')}: {group.present}</span>
                        <span>{t('total')}: {group.total}</span>
                      </div>
                   </div>
              ))}
              {(!attendanceReport?.by_groups || attendanceReport.by_groups.length === 0) && (
                <div className="text-center text-white/30 py-8">
                  {t('no_data_period') || 'Нет данных за выбранный период'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Financial Tab */}
      {activeTab === 'financial' && financialReport && (
        <FinancialAnalytics 
          data={financialReport} 
          isLoading={loading} 
          startDate={startStr} 
          endDate={endStr}
          onRefresh={loadFinancialReport}
        />
      )}

      {/* Top Players Tab */}
      {activeTab === 'top_players' && topPlayers && (
        <TopPlayersAnalytics 
          data={topPlayers} 
          isLoading={false} 
          month={selectedMonth}
          year={selectedYear}
        />
      )}
    </div>
  );
}
