import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { skillsAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import SkillEvaluator from './dashboard/coach/SkillEvaluator';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend
} from 'recharts';
import { 
  Plus, ChevronRight, TrendingUp, History, Award, Layers, User, Edit3, 
  Table as TableIcon, LayoutList, FileText, Download,
  Calendar, ChevronLeft, Star, AlertCircle, X, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcel } from '../utils/exportUtils';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const AcademicDiary = forwardRef(({ 
  studentId: propStudentId, 
  isCoach, 
  isAdmin, 
  isParent, 
  t: propT, 
  hideEvaluation = false,
  selectedYear: propSelectedYear,
  onYearChange,
  hideHeaderOnMobile = false
}, ref) => {
  const { id } = useParams();
  const studentId = propStudentId || id;
  const { t: hookT } = useLanguage();
  const t = propT || hookT;
  
  const [ratings, setRatings] = useState([]);
  const [internalSelectedYear, setInternalSelectedYear] = useState(new Date().getFullYear());
  
  const selectedYear = propSelectedYear || internalSelectedYear;
  const setSelectedYear = (year) => {
    if (onYearChange) {
      onYearChange(year);
    } else {
      setInternalSelectedYear(year);
    }
  };

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('diary'); // 'diary', 'analytics', 'discipline'
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [creationSettings, setCreationSettings] = useState(() => {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    // Normalize to end of quarter (3, 6, 9, 12)
    const normalizedMonth = Math.ceil(currentMonth / 3) * 3;
    
    return {
      month: normalizedMonth,
      year: today.getFullYear()
    };
  });
  const historyRef = useRef(null);

  useImperativeHandle(ref, () => ({
    exportExcel: handleExport,
    // Add PDF export if needed
    exportPDF: () => {
       alert("PDF Export for Diary coming soon"); 
    }
  }));

  useEffect(() => {
    fetchRatings();
  }, [studentId]);

  const fetchRatings = async () => {
    try {
      setLoading(true);
      const res = await skillsAPI.getStudentSkills(studentId);
      const data = Array.isArray(res.data) 
        ? res.data.filter(item => item && typeof item === 'object') 
        : [];
      setRatings(data);
    } catch (error) {
      console.error("Error fetching ratings:", error);
      setRatings([]);
    } finally {
      setLoading(false);
    }
  };

  // --- Data Processing ---

  const availableYears = useMemo(() => {
    const years = new Set(ratings.map(r => r.rating_year));
    years.add(new Date().getFullYear());
    years.add(2025); // Ensure 2025 is always available
    
    // Filter years starting from 2025
    return Array.from(years)
      .filter(year => year >= 2025)
      .sort((a, b) => b - a); // Descending
  }, [ratings]);

  const monthlyData = useMemo(() => {
    // Fill all 12 months for the selected year
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    return months.map(month => {
      const rating = ratings.find(r => r.rating_year === selectedYear && r.rating_month === month);
      return {
        month,
        name: new Date(2000, month - 1).toLocaleString(t('locale') || 'ru', { month: 'short' }),
        fullName: new Date(2000, month - 1).toLocaleString(t('locale') || 'ru', { month: 'long' }),
        ...rating,
        avg: rating ? ((rating.technique + rating.tactics + rating.physical + rating.discipline + (rating.speed || 5)) / 5).toFixed(1) : null
      };
    });
  }, [ratings, selectedYear, t]);

  const quartersData = useMemo(() => {
    const quarters = [
      { id: 1, name: t('quarter_1') || 'I Квартал', targetMonth: 3 },
      { id: 2, name: t('quarter_2') || 'II Квартал', targetMonth: 6 },
      { id: 3, name: t('quarter_3') || 'III Квартал', targetMonth: 9 },
      { id: 4, name: t('quarter_4') || 'IV Квартал', targetMonth: 12 },
    ];

    return quarters.map(q => {
      // Find rating for the specific representative month
      // Allow for month within the quarter (e.g. 1, 2, 3 -> Q1)
      const rating = ratings.find(r => 
        r.rating_year === selectedYear && 
        r.rating_month >= q.targetMonth - 2 && 
        r.rating_month <= q.targetMonth
      );
      
      let avg = null;
      if (rating) {
        avg = ((rating.technique + rating.tactics + rating.physical + rating.discipline + (rating.speed || 5)) / 5).toFixed(1);
      }

      return {
        ...q,
        rating,
        avg
      };
    });
  }, [ratings, selectedYear, t]);

  const yearlyStats = useMemo(() => {
    const calculateAvg = (year) => {
      const yearRatings = ratings.filter(r => r.rating_year === year);
      if (yearRatings.length === 0) return null;
      
      const sum = yearRatings.reduce((acc, r) => ({
        technique: acc.technique + (r.technique || 0),
        tactics: acc.tactics + (r.tactics || 0),
        physical: acc.physical + (r.physical || 0),
        discipline: acc.discipline + (r.discipline || 0),
        speed: acc.speed + (r.speed || 0),
      }), { technique: 0, tactics: 0, physical: 0, discipline: 0, speed: 0 });
      
      const count = yearRatings.length;
      return {
        technique: (sum.technique / count).toFixed(1),
        tactics: (sum.tactics / count).toFixed(1),
        physical: (sum.physical / count).toFixed(1),
        discipline: (sum.discipline / count).toFixed(1),
        speed: (sum.speed / count).toFixed(1),
        gpa: ((sum.technique + sum.tactics + sum.physical + sum.discipline + sum.speed) / (count * 5)).toFixed(1)
      };
    };

    return {
      current: calculateAvg(selectedYear),
      previous: calculateAvg(selectedYear - 1)
    };
  }, [ratings, selectedYear]);

  // Long-term progress data
  const longTermData = useMemo(() => {
    return ratings
      .filter(r => r.rating_month % 3 === 0) // Focus on quarters
      .sort((a, b) => {
        if (a.rating_year !== b.rating_year) return a.rating_year - b.rating_year;
        return a.rating_month - b.rating_month;
      })
      .map(r => ({
        period: `${r.rating_year} Q${r.rating_month / 3}`,
        avg: parseFloat(((r.technique + r.tactics + r.physical + r.discipline + (r.speed || 5)) / 5).toFixed(1)),
        technique: r.technique,
        tactics: r.tactics,
        physical: r.physical,
        discipline: r.discipline,
        speed: r.speed
      }));
  }, [ratings]);

  const radarData = useMemo(() => {
    const current = yearlyStats.current;
    const previous = yearlyStats.previous;
    
    if (!current) return [];

    const metrics = [
      { key: 'technique', label: t('skill_technique') || 'Техника' },
      { key: 'tactics', label: t('skill_tactics') || 'Тактика' },
      { key: 'physical', label: t('skill_physical') || 'Физика' },
      { key: 'discipline', label: t('skill_discipline') || 'Дисциплина' },
      { key: 'speed', label: t('skill_speed') || 'Скорость' },
    ];

    return metrics.map(m => ({
      subject: m.label,
      A: current ? parseFloat(current[m.key]) : 0,
      B: previous ? parseFloat(previous[m.key]) : 0,
      fullMark: 10
    }));
  }, [yearlyStats, t]);

  // --- Handlers ---

  const handleExport = () => {
    const data = monthlyData.filter(m => m.id).map(item => ({
      period: `${item.fullName} ${selectedYear}`,
      technique: item.technique,
      tactics: item.tactics,
      physical: item.physical,
      discipline: item.discipline,
      speed: item.speed,
      average: item.avg
    }));
    
    exportToExcel(data, {
      period: t('period'),
      technique: t('skill_technique'),
      tactics: t('skill_tactics'),
      physical: t('skill_physical'),
      discipline: t('skill_discipline'),
      speed: t('skill_speed'),
      average: t('average')
    }, `Academic_Diary_${studentId}_${selectedYear}`);
  };

  if (loading) return <div className="p-8 text-center"><div className="animate-spin inline-block w-8 h-8 border-4 border-yellow-500 rounded-full border-t-transparent"></div></div>;

  return (
    <div className="bg-[#0F1117] min-h-full text-white p-4 md:p-6 font-sans relative">
      
      {/* Header */}
      <div className={`sticky top-0 z-20 bg-[#0F1117]/95 backdrop-blur-xl py-4 -mt-4 mb-8 gap-4 flex flex-col md:flex-row justify-end md:justify-between items-start md:items-center border-b border-white/5 transition-all duration-300 ${hideHeaderOnMobile ? 'hidden lg:flex' : 'flex'}`}>
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-brand-yellow flex items-center gap-3">
            <Award className="w-8 h-8 text-yellow-500" />
            {t('academic_diary') || 'Дневник футболиста'} <span className="text-sm text-gray-500">{t('academic_diary_restored') || '(v2.1)'}</span>
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            {t('long_term_tracking') || 'Система отслеживания прогресса'}
          </p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto justify-end">
          {/* Year Selector */}
          <div className="flex bg-[#1C1E26] rounded-xl p-1 border border-white/10 overflow-x-auto max-w-[300px] scrollbar-hide">
            {availableYears.map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                  selectedYear === year 
                    ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
          
          <button 
            onClick={handleExport}
            className="p-3 bg-[#1C1E26] rounded-xl border border-white/10 hover:bg-white/5 text-white/70 hover:text-white transition-all"
            title={t('export_excel')}
          >
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Timeline & Report Card (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Quarterly Grid */}
          <div className="bg-[#1C1E26] rounded-2xl p-6 border border-white/5 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2 text-brand-yellow">
                <Calendar className="w-5 h-5 text-brand-yellow" />
                {t('academic_performance') || 'Успеваемость'}
              </h3>
              <div className="text-sm text-gray-400">
                {t('gpa') || 'Средний балл'}: <span className="text-yellow-400 font-bold text-lg">{yearlyStats.current?.gpa || '-'}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {quartersData.map((quarter) => (
                <motion.div 
                  key={quarter.id} 
                  className={`bg-[#13151A] rounded-2xl p-5 border transition-all duration-300 ${
                    quarter.rating ? 'border-white/10 hover:border-yellow-500/30' : 'border-white/10 opacity-100 ring-1 ring-white/5'
                  }`}
                  whileHover={quarter.rating ? { scale: 1.02 } : {}}
                >
                   <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                      <h4 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className={`w-2 h-8 rounded-full ${quarter.rating ? 'bg-yellow-500' : 'bg-white/10'}`}></span>
                        {quarter.name}
                      </h4>
                      {quarter.avg ? (
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-lg text-lg font-bold ${
                            quarter.avg >= 8 ? 'bg-emerald-500/20 text-emerald-400' :
                            quarter.avg >= 6 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {quarter.avg}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-white/40 font-bold uppercase tracking-wider bg-white/5 px-2 py-1 rounded-lg">{t('no_grades') || 'Нет оценок'}</span>
                      )}
                   </div>

                   {quarter.rating ? (
                      <div className="space-y-3">
                        {/* Mini Table for Stats */}
                        <div className="bg-black/20 rounded-xl overflow-hidden border border-white/5">
                          <div className="grid grid-cols-2 text-[10px] uppercase font-bold text-white/40 bg-white/5 p-2 border-b border-white/5">
                            <div>{t('skill') || 'Навык'}</div>
                            <div className="text-right">{t('score') || 'Балл'}</div>
                          </div>
                          
                          <div className="divide-y divide-white/5">
                            {[
                              { label: t('skill_technique') || 'Техника', value: quarter.rating.technique, color: 'text-blue-400' },
                              { label: t('skill_tactics') || 'Тактика', value: quarter.rating.tactics, color: 'text-purple-400' },
                              { label: t('skill_physical') || 'Физика', value: quarter.rating.physical, color: 'text-red-400' },
                              { label: t('skill_speed') || 'Скорость', value: quarter.rating.speed || '-', color: 'text-yellow-400' },
                              { label: t('skill_discipline') || 'Дисциплина', value: quarter.rating.discipline, color: quarter.rating.discipline < 5 ? 'text-red-500 font-black' : 'text-emerald-400' }
                            ].map((stat, idx) => (
                              <div key={idx} className="flex justify-between items-center p-2 hover:bg-white/5 transition-colors text-sm">
                                <span className="text-gray-300 font-medium">{stat.label}</span>
                                <span className={`font-bold ${stat.color}`}>{stat.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        {quarter.rating.coach_comment && (
                          <div className="mt-3 bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3">
                            <div className="text-[10px] text-yellow-500/60 uppercase font-bold mb-1 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-yellow-500"></span>
                              {t('comment')}
                            </div>
                            <p className="text-xs text-gray-300 italic leading-relaxed">"{quarter.rating.coach_comment}"</p>
                          </div>
                        )}
                        
                        {quarter.rating.talent_tags && quarter.rating.talent_tags.length > 0 && (
                           <div className="flex flex-wrap gap-1.5 mt-2">
                              {quarter.rating.talent_tags.map(tag => (
                                <span key={tag} className="text-[10px] px-2 py-0.5 bg-gradient-to-r from-blue-500/10 to-blue-600/10 text-blue-300 rounded-md border border-blue-500/20 font-medium">
                                  #{t(tag) || tag}
                                </span>
                              ))}
                           </div>
                        )}
                      </div>
                   ) : (
                     <div className="h-32 flex items-center justify-center text-gray-700 text-sm italic">
                       {t('awaiting_evaluation') || 'Ожидает оценки'}
                     </div>
                   )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Actions */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Radar Chart Comparison */}
          <div className="bg-[#1C1E26] rounded-2xl p-6 border border-white/5 shadow-xl">
            <h3 className="text-lg font-bold mb-4 text-center">
              {t('season_comparison') || 'Сравнение сезонов'}
            </h3>
            <div className="flex justify-center items-center gap-4 mb-4 text-xs">
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-yellow-500/50"></span>
                <span className="text-gray-400">{selectedYear}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-blue-500/50"></span>
                <span className="text-gray-400">{selectedYear - 1}</span>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#ffffff20" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                  <Radar name={selectedYear} dataKey="A" stroke="#EAB308" fill="#EAB308" fillOpacity={0.4} />
                  <Radar name={selectedYear - 1} dataKey="B" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.4} />
                  <Tooltip contentStyle={{backgroundColor: '#1F2937', borderColor: '#374151'}} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Long-term Progress Chart */}
          <div className="bg-[#1C1E26] rounded-2xl p-6 border border-white/5 shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              {t('long_term_progress') || 'Прогресс за все время'}
            </h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={longTermData}>
                  <defs>
                    <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="period" stroke="#9CA3AF" fontSize={10} tickMargin={10} />
                  <YAxis domain={[0, 10]} hide />
                  <Tooltip 
                    contentStyle={{backgroundColor: '#1F2937', borderColor: '#374151', fontSize: '12px'}}
                    itemStyle={{color: '#10B981'}}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="avg" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorAvg)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Discipline Tracking */}
          <div className="bg-[#1C1E26] rounded-2xl p-6 border border-white/5 shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-red-400">
              <AlertCircle className="w-5 h-5" />
              {t('discipline_tracker') || 'Дисциплина'}
            </h3>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-lg">
                <span className="text-gray-400 text-sm">{t('current_rating') || 'Текущий рейтинг'}</span>
                <span className={`text-2xl font-bold ${
                  (yearlyStats.current?.discipline || 0) >= 8 ? 'text-emerald-400' :
                  (yearlyStats.current?.discipline || 0) >= 5 ? 'text-yellow-400' :
                  'text-red-500'
                }`}>
                  {yearlyStats.current?.discipline || '-'}
                </span>
              </div>
              
              <div className="max-h-[300px] overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-700">
                {ratings.filter(r => r.rating_year === selectedYear && r.coach_comment).map(r => (
                  <div key={r.id} className="bg-white/5 p-3 rounded-lg text-sm border-l-2 border-yellow-500">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{new Date(2000, r.rating_month - 1).toLocaleString(t('locale') || 'ru', { month: 'long' })}</span>
                      <span className="font-bold text-yellow-500">{t('discipline_short') || 'Disc'}: {r.discipline}</span>
                    </div>
                    <p className="text-gray-300 italic">"{r.coach_comment}"</p>
                  </div>
                ))}
                {ratings.filter(r => r.rating_year === selectedYear && r.coach_comment).length === 0 && (
                  <div className="text-center text-gray-500 py-4 text-sm">
                    {t('no_comments') || 'Нет комментариев тренера за этот год'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {(isCoach || isAdmin) && !hideEvaluation && (
             <div className="bg-[#1C1E26] rounded-2xl p-6 border border-white/5 shadow-xl">
                 <h3 className="text-lg font-bold mb-4 text-white">{t('actions') || 'Действия'}</h3>
                 <button
                  onClick={() => setIsCreating(true)}
                  className="w-full py-4 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-xl font-bold text-black shadow-lg hover:shadow-yellow-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Edit3 className="w-5 h-5" />
                  {t('add_new_evaluation') || 'Добавить оценку'}
                </button>
             </div>
          )}
        </div>
      </div>

      {/* Evaluation Modal */}
      {createPortal(
        <AnimatePresence>
          {isCreating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-[#1C1E26] w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] md:max-h-[90vh] flex flex-col"
              >
                <div className="p-4 md:p-6 border-b border-white/10 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setIsCreating(false)} 
                      className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-colors flex items-center gap-2"
                    >
                      <ChevronLeft size={20} />
                      <span className="text-sm font-bold hidden md:inline">{t('back') || 'Назад'}</span>
                    </button>
                    <h2 className="text-lg md:text-xl font-bold text-white">
                      {t('new_evaluation') || 'Новая оценка'}
                    </h2>
                  </div>
                  <button onClick={() => setIsCreating(false)} className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-4 md:p-6 flex-1 flex flex-col min-h-0 overflow-hidden">
                  {/* Quarter/Year Selection */}
                  <div className="flex flex-col md:flex-row gap-4 mb-6 shrink-0">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">{t('quarter') || 'Квартал'}</label>
                      <div className="relative">
                        <select
                          value={Math.ceil(creationSettings.month / 3)}
                          onChange={(e) => {
                              const quarter = parseInt(e.target.value);
                              setCreationSettings({...creationSettings, month: quarter * 3});
                          }}
                          className="w-full bg-[#13151A] border border-white/20 rounded-xl px-4 py-3.5 text-white font-bold focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all appearance-none"
                        >
                          <option value={1}>{t('quarter_1') || 'I Квартал (Янв-Март)'}</option>
                          <option value={2}>{t('quarter_2') || 'II Квартал (Апр-Июнь)'}</option>
                          <option value={3}>{t('quarter_3') || 'III Квартал (Июль-Сент)'}</option>
                          <option value={4}>{t('quarter_4') || 'IV Квартал (Окт-Дек)'}</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={16} />
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wider">{t('year') || 'Год'}</label>
                      <div className="relative">
                        <select
                          value={creationSettings.year}
                          onChange={(e) => setCreationSettings({...creationSettings, year: parseInt(e.target.value)})}
                          className="w-full bg-[#13151A] border border-white/20 rounded-xl px-4 py-3.5 text-white font-bold focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all appearance-none"
                        >
                          {Array.from({ length: 11 }, (_, i) => 2025 + i).map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={16} />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-h-0 flex flex-col">
                    {(() => {
                      const existingRating = ratings.find(r => 
                        r.rating_year === creationSettings.year && 
                        r.rating_month === creationSettings.month
                      );

                      return (
                        <>
                          {existingRating && (
                            <div className="mb-4 bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl flex items-center gap-2 text-yellow-400 text-sm">
                              <AlertCircle size={16} />
                              {t('rating_exists_editing') || 'Оценка за этот период уже существует. Вы редактируете её.'}
                            </div>
                          )}
                          <SkillEvaluator 
                            key={`${creationSettings.year}-${creationSettings.month}`}
                            studentId={studentId} 
                            t={t}
                            isLoading={isSaving}
                            onSave={async (data) => {
                              const payload = {
                                  student_id: studentId,
                                  rating_month: creationSettings.month,
                                  rating_year: creationSettings.year,
                                  technique: parseInt(data.skills.technique || 0),
                                  tactics: parseInt(data.skills.tactics || 0),
                                  physical: parseInt(data.skills.physical || 0),
                                  discipline: parseInt(data.skills.discipline || 0),
                                  speed: parseInt(data.skills.speed || 0),
                                  talent_tags: data.tags || [],
                                  coach_comment: data.skills.coach_comment || ""
                              };
                              try {
                                  setIsSaving(true);
                                  await skillsAPI.rateStudent(payload);
                                  await fetchRatings();
                                  setIsCreating(false);
                                  // Success feedback
                                  alert("✅ " + (t('skills_saved') || 'Оценки успешно сохранены'));
                              } catch (e) {
                                  console.error("Error saving rating:", e);
                                  alert(`${t('error_saving_rating') || 'Ошибка при сохранении'}: ${e.response?.data?.detail || e.message}`);
                              } finally {
                                  setIsSaving(false);
                              }
                            }} 
                            initialData={existingRating || null}
                          />
                        </>
                      );
                    })()}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

    </div>
  );
});

export default AcademicDiary;
