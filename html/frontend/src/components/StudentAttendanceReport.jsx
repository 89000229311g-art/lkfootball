import React, { useState, useEffect, forwardRef, useImperativeHandle, useMemo, useCallback } from 'react';
import { attendanceAPI } from '../api/client';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, Clock, AlertTriangle, Download, Calendar as CalendarIcon, List, FileText, X } from 'lucide-react';
import { exportToExcel, exportToPDF, getDateString } from '../utils/exportUtils';
import { getAcademyYears } from '../utils/dateUtils';

const StudentAttendanceReport = forwardRef(({ studentId, studentName, groupName, t, currentDate: propDate, onDateChange, viewMode: propViewMode, onViewModeChange, hideHeaderOnMobile = false }, ref) => {
  const [internalDate, setInternalDate] = useState(new Date());
  const [internalViewMode, setInternalViewMode] = useState(window.innerWidth < 768 ? 'list' : 'calendar'); // 'calendar' | 'list'
  
  const currentDate = propDate || internalDate;
  const setCurrentDate = (date) => {
    if (onDateChange) onDateChange(date);
    else setInternalDate(date);
  };

  const viewMode = propViewMode || internalViewMode;
  const setViewMode = useCallback((mode) => {
    if (onViewModeChange) onViewModeChange(mode);
    else setInternalViewMode(mode);
  }, [onViewModeChange]);
  
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState('');
  const [inputType, setInputType] = useState('text');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  
  const academyYears = getAcademyYears();

  const filteredDays = useMemo(() => {
    if (!report || !report.days) return [];
    let days = [...report.days].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (filterDate) {
      days = days.filter(day => day.date === filterDate);
    }
    return days;
  }, [report, filterDate]);

  const totalPages = Math.ceil(filteredDays.length / ITEMS_PER_PAGE);
  
  const paginatedDays = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDays.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredDays, currentPage]);

  useImperativeHandle(ref, () => ({
    exportExcel: handleExportExcel,
    exportPDF: handleExportPDF
  }));

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const res = await attendanceAPI.getStudentMonthlyReport(studentId, year, month);
      setReport(res.data);
    } catch (error) {
      console.error("Error fetching attendance report:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate, studentId]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setViewMode('list');
      } else {
        setViewMode('calendar');
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setViewMode]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleExportExcel = () => {
    if (!report || !report.days) return;

    const dataToExport = report.days.map(day => ({
      date: day.date,
      weekday: day.weekday,
      time: day.time,
      type: day.type,
      status: t(day.status) || day.status
    }));

    const columns = {
      date: t('date') || 'Дата',
      weekday: t('weekday') || 'День недели',
      time: t('time') || 'Время',
      type: t('type') || 'Тип',
      status: t('status') || 'Статус'
    };
    
    // Add Summary Row
    const summaryRow = {
      date: t('total') || 'ИТОГО:',
      weekday: '',
      time: '',
      type: '',
      status: `${t('present')}: ${report.stats.present}, ${t('rate')}: ${report.stats.attendance_rate}%`
    };
    dataToExport.push(summaryRow);

    const fileName = `${studentName ? studentName.replace(/\s+/g, '_') : 'student'}_attendance_${getDateString()}`;
    exportToExcel(dataToExport, columns, fileName);
  };

  const handleExportPDF = () => {
    if (!report || !report.days) return;

    const dataToExport = report.days.map(day => ({
      date: day.date,
      weekday: day.weekday,
      time: day.time,
      type: day.type,
      status: t(day.status) || day.status
    }));

    const columns = {
      date: t('date') || 'Дата',
      weekday: t('weekday') || 'День недели',
      time: t('time') || 'Время',
      type: t('type') || 'Тип',
      status: t('status') || 'Статус'
    };

    const monthStr = currentDate.toLocaleDateString(t('locale') || 'ru-RU', { month: 'long', year: 'numeric' });
    const title = `${t('attendance_report') || 'Табель посещаемости'}: ${studentName || ''} (${groupName || ''}) - ${monthStr}`;
    const fileName = `${studentName ? studentName.replace(/\s+/g, '_') : 'student'}_attendance_${getDateString()}`;

    exportToPDF(dataToExport, columns, fileName, title);
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'present': return 'bg-emerald-500 text-white border-emerald-500';
      case 'absent': return 'bg-red-500 text-white border-red-500';
      case 'late': return 'bg-yellow-500 text-black border-yellow-500';
      case 'sick': return 'bg-blue-500 text-white border-blue-500';
      default: return 'bg-gray-700 text-gray-400 border-gray-600';
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'present': return <CheckCircle size={14} />;
      case 'absent': return <XCircle size={14} />;
      case 'late': return <Clock size={14} />;
      case 'sick': return <AlertTriangle size={14} />;
      default: return null;
    }
  };

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0 = Sun
  
  // Adjust for Monday start
  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const calendarDays = [];
  for (let i = 0; i < startOffset; i++) {
    calendarDays.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i);
  }

  return (
    <div className="flex flex-col gap-4 min-h-full">
      {/* Header */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between shrink-0 gap-3 ${hideHeaderOnMobile ? 'hidden md:flex' : ''}`}>
        <div className="flex items-center justify-between md:justify-start gap-3 w-full md:w-auto">
          <h3 className="text-xl font-bold text-white flex items-center gap-2 truncate">
            📅 <span className="truncate">{t('attendance_report') || 'Табель посещаемости'}</span>
          </h3>
          
          <div className="flex bg-black/30 rounded-xl p-1 border border-white/5 scale-90 shrink-0">
            <button 
              onClick={() => setViewMode(viewMode === 'calendar' ? 'list' : 'calendar')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition text-xs font-bold ${viewMode === 'calendar' ? 'bg-brand-yellow text-black' : 'bg-white/10 text-white'}`}
              title={viewMode === 'calendar' ? (t('switch_to_list') || 'Список') : (t('switch_to_calendar') || 'Календарь')}
            >
              {viewMode === 'calendar' ? <List size={16} /> : <CalendarIcon size={16} />}
              <span>{viewMode === 'calendar' ? (t('calendar') || 'Календарь') : (t('list') || 'Список')}</span>
            </button>
          </div>
        </div>
        
        <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto overflow-x-auto">
           <div className="flex items-center gap-2 md:gap-4 bg-black/30 rounded-xl p-1 border border-white/5 shrink-0">
            <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-lg text-white transition">
              <ChevronLeft size={20} />
            </button>
            <div className="flex flex-col items-center">
              <span className="font-bold text-white min-w-[100px] md:min-w-[140px] text-center capitalize text-sm md:text-base leading-tight">
                {currentDate.toLocaleDateString(t('locale') || 'ru-RU', { month: 'long' })}
              </span>
              <select
                value={currentDate.getFullYear()}
                onChange={(e) => setCurrentDate(new Date(parseInt(e.target.value), currentDate.getMonth(), 1))}
                className="bg-transparent text-white/60 text-xs font-bold py-0 border-none outline-none appearance-none cursor-pointer hover:text-white text-center"
              >
                {academyYears.map(year => (
                  <option key={year} value={year} className="bg-[#1a1d24] text-white">
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-lg text-white transition">
              <ChevronRight size={20} />
            </button>
          </div>

          {report && (
            <div className="flex gap-1 shrink-0">
              <button 
                onClick={handleExportExcel}
                className="p-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg border border-green-500/30 transition flex items-center gap-2"
                title={t('export_excel')}
              >
                <FileText size={20} />
              </button>
              <button 
                onClick={handleExportPDF}
                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/30 transition flex items-center gap-2"
                title={t('export_pdf')}
              >
                <FileText size={20} />
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center items-center text-white/30">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-yellow"></div>
        </div>
      ) : report ? (
        <div className="flex flex-col gap-2">
          {/* Stats Summary - Compact Row */}
          <div className="flex items-center justify-between bg-white/5 rounded-xl p-2 border border-white/10 shrink-0 overflow-x-auto custom-scrollbar">
            <CompactStat label={t('present') || 'Присутствовал'} value={report.stats.present} color="text-emerald-400" />
            <div className="w-px h-6 bg-white/10"></div>
            <CompactStat label={t('absent') || 'Пропустил'} value={report.stats.absent} color="text-red-400" />
            <div className="w-px h-6 bg-white/10"></div>
            <CompactStat label={t('late') || 'Опоздал'} value={report.stats.late} color="text-yellow-400" />
            <div className="w-px h-6 bg-white/10"></div>
            <CompactStat label={t('sick') || 'Болел'} value={report.stats.sick} color="text-blue-400" />
            <div className="w-px h-6 bg-white/10"></div>
            <CompactStat label={t('rate') || 'Процент'} value={`${report.stats.attendance_rate}%`} color="text-white" />
          </div>

          {viewMode === 'calendar' && (
            <div className="border border-white/10 rounded-xl overflow-hidden shadow-lg shrink-0 flex flex-col h-[500px] md:h-[600px]">
              <div className="grid grid-cols-7 bg-white/5 border-b border-white/10 text-center py-2 text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">
                <div>{t('mon') || 'Пн'}</div>
                <div>{t('tue') || 'Вт'}</div>
                <div>{t('wed') || 'Ср'}</div>
                <div>{t('thu') || 'Чт'}</div>
                <div>{t('fri') || 'Пт'}</div>
                <div>{t('sat') || 'Сб'}</div>
                <div>{t('sun') || 'Вс'}</div>
              </div>
              <div className="grid grid-cols-7 grid-rows-6 gap-px bg-white/10 flex-1">
                {calendarDays.map((day, idx) => {
                  if (!day) return <div key={idx} className="bg-[#13151A]" />;
                  
                  const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const eventsForDay = report.days.filter(d => d.date === dateStr);
                  const isToday = new Date().toDateString() === new Date(dateStr).toDateString();

                  return (
                    <div key={idx} className={`bg-[#13151A] p-1 relative group hover:bg-white/5 transition flex flex-col gap-0.5 ${isToday ? 'bg-white/5' : ''}`}>
                      <div className="flex justify-between items-start">
                          <span className={`text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full ${isToday ? 'bg-brand-yellow text-black' : 'text-gray-500'}`}>{day}</span>
                      </div>
                      
                      <div className="space-y-0.5 flex-1 overflow-y-auto custom-scrollbar">
                        {eventsForDay.map((event, eIdx) => (
                          <div key={eIdx} className={`text-[8px] p-0.5 rounded flex items-center justify-between gap-1 ${getStatusColor(event.status)} bg-opacity-20 border border-opacity-30 cursor-pointer`}>
                            <div className="flex flex-col overflow-hidden leading-tight">
                              <span className="truncate font-mono font-bold">{event.time}</span>
                            </div>
                            {getStatusIcon(event.status)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* List View for Details - Only show in List Mode */}
          {viewMode === 'list' && (
             <div className="space-y-2 pb-6">
               {/* Date Filter */}
               <div className="flex items-center gap-2 mb-2">
                 <div className="relative">
                   <input 
                     type={inputType} 
                     onFocus={() => setInputType('date')} 
                     onBlur={() => { if(!filterDate) setInputType('text'); }}
                     placeholder={t('date') || 'Дата'}
                     value={filterDate} 
                     onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }} 
                     className="bg-black/20 text-white border border-white/10 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-brand-yellow w-full min-w-[120px]"
                   />
                   {filterDate && (
                     <button 
                       onClick={() => { setFilterDate(''); setCurrentPage(1); setInputType('text'); }}
                       className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                     >
                       <X size={14} />
                     </button>
                   )}
                 </div>
               </div>

               <div className="space-y-1.5">
                 {paginatedDays.map((day, idx) => (
                   <div key={idx} className="flex items-center justify-between p-2.5 bg-black/20 rounded-lg border border-white/5 hover:border-white/10 transition group">
                     <div className="flex items-center gap-3">
                       <div className={`w-2.5 h-2.5 rounded-full ${day.status === 'present' ? 'bg-emerald-500' : day.status === 'absent' ? 'bg-red-500' : day.status === 'sick' ? 'bg-blue-500' : 'bg-gray-500'}`} />
                       <div>
                         <div className="font-bold text-white text-sm">
                            {new Date(day.date).toLocaleDateString(t('locale') || 'ru-RU', { day: 'numeric', month: 'long' })}
                            <span className="text-gray-500 font-normal ml-2 text-xs">{day.weekday}</span>
                         </div>
                         <div className="text-[10px] text-gray-500 flex items-center gap-2 mt-0.5">
                            <span className="bg-white/5 px-1 py-0.5 rounded text-white/60">{day.time}</span>
                            <span>{day.type || 'Training'}</span>
                         </div>
                       </div>
                     </div>
                     <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(day.status)} bg-opacity-10`}>
                       {t(day.status) || day.status}
                     </div>
                   </div>
                 ))}
                 {paginatedDays.length === 0 && (
                   <div className="text-center text-white/30 py-6 text-sm">{t('no_events_found') || 'Занятия не найдены'}</div>
                 )}
               </div>

               {/* Pagination Controls */}
               {totalPages > 1 && (
                 <div className="flex items-center justify-center gap-2 mt-4">
                   <button 
                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                     disabled={currentPage === 1}
                     className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white transition"
                   >
                     <ChevronLeft size={16} />
                   </button>
                   <span className="text-sm text-white/60">
                     {currentPage} / {totalPages}
                   </span>
                   <button 
                     onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                     disabled={currentPage === totalPages}
                     className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white transition"
                   >
                     <ChevronRight size={16} />
                   </button>
                 </div>
               )}
             </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex justify-center items-center text-white/30">{t('no_data') || 'Нет данных'}</div>
      )}
    </div>
  );
});

export default StudentAttendanceReport;

const CompactStat = ({ label, value, color }) => (
  <div className="flex flex-col items-center justify-center min-w-[80px] px-2">
    <div className={`text-xl font-bold ${color} leading-none mb-1`}>{value}</div>
    <div className="text-[9px] uppercase font-bold tracking-wider text-white/40">{label}</div>
  </div>
);
