import React, { useMemo } from 'react';
import { AlertCircle, CheckCircle, Clock, Search, Filter, FileText, Loader2, XCircle } from 'lucide-react';
import { studentsAPI } from '../api/client';
import { loggingAPI } from '../api/client';
import toast from 'react-hot-toast';

const MedicalMonitoring = ({ students, groups = [], onStudentClick, t, baseUrl, selectedGroup, onGroupChange, onExport, isExporting, onRefresh }) => {
  const [localSearchQuery, setLocalSearchQuery] = React.useState('');

  const filterGroupId = selectedGroup || 'all';
  
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      const matchesGroup = filterGroupId !== 'all' ? String(student.group_id) === String(filterGroupId) : true;
      const matchesSearch = localSearchQuery 
        ? `${student.last_name} ${student.first_name}`.toLowerCase().includes(localSearchQuery.toLowerCase())
        : true;
      return matchesGroup && matchesSearch;
    });
  }, [students, filterGroupId, localSearchQuery]);

  const getGroupName = (student) => {
    if (student.group?.name) return student.group.name;
    if (student.group_id && groups.length > 0) {
      const group = groups.find(g => String(g.id) === String(student.group_id));
      return group ? group.name : '-';
    }
    return '-';
  };

  const sortedStudents = useMemo(() => {
    return [...filteredStudents].sort((a, b) => {
      return (a.last_name || '').localeCompare(b.last_name || '');
    });
  }, [filteredStudents]);

  const getStatus = (student) => {
    // Logic matches Students.jsx getMedStatus
    if (student.medical_certificate_file) {
        if (!student.medical_certificate_expires) return 'valid'; 
    }
    
    if (!student.medical_certificate_expires) return 'missing';
    
    const today = new Date();
    const expiry = new Date(student.medical_certificate_expires);
    // Normalize dates to midnight for accurate comparison
    today.setHours(0,0,0,0);
    expiry.setHours(0,0,0,0);
    
    if (expiry < today) return 'expired';
    
    const warningDate = new Date();
    warningDate.setDate(today.getDate() + 30);
    warningDate.setHours(0,0,0,0);
    
    if (expiry < warningDate) return 'warning';
    
    return 'valid';
  };

  const stats = useMemo(() => {
    let expired = 0;
    let warning = 0;
    let missing = 0;
    
    filteredStudents.forEach(s => {
      const status = getStatus(s);
      if (status === 'expired') expired++;
      else if (status === 'warning') warning++;
      else if (status === 'missing') missing++;
    });
    
    return { expired, warning, missing };
  }, [filteredStudents]);

  const getImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `${baseUrl || ''}${url}`;
  };

  const [updatingId, setUpdatingId] = React.useState(null);

  const handleQuickUpdate = async (e, studentId, isValid) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Prevent double clicks
    if (updatingId) return;
    
    setUpdatingId(studentId);
    
    try {
      let data = {};
      if (isValid) {
        const today = new Date();
        const expiry = new Date();
        expiry.setMonth(today.getMonth() + 6); // Default 6 months
        
        // Ensure date is valid
        if (isNaN(expiry.getTime())) {
           throw new Error("Invalid date calculation");
        }

        // Use local date components to avoid timezone shifts
        const year = expiry.getFullYear();
        const month = String(expiry.getMonth() + 1).padStart(2, '0');
        const day = String(expiry.getDate()).padStart(2, '0');
        
        data = {
           medical_certificate_expires: `${year}-${month}-${day}`
        };
      } else {
        data = {
           medical_certificate_expires: null
        };
      }
      
      await studentsAPI.update(studentId, data);
      
      // Short delay to show the spinner briefly if needed, or just refresh
      if (onRefresh) {
        await onRefresh();
      }
      
      toast.success(isValid ? (t('cert_updated_valid') || 'Справка обновлена') : (t('cert_updated_missing') || 'Справка удалена'));
    } catch (error) {
      console.error("Failed to update medical status", error);
      toast.error(t('error_updating_status') || 'Ошибка обновления статуса');
      let msg = "Unknown error";
      if (error.response) {
         // Server responded with a status code outside 2xx range
         msg = `Server Error: ${error.response.status} - ${error.response.data?.detail || JSON.stringify(error.response.data) || ''}`;
      } else if (error.request) {
         // The request was made but no response was received
         msg = "Network Error: No response received from server. Please check your connection.";
      } else {
         // Something happened in setting up the request that triggered an Error
         msg = error.message;
      }
      loggingAPI.logFrontendError(
        'Failed to update medical status',
        { component: 'MedicalMonitoring', translationKey: 'error_updating_status' },
        msg
      );
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder={t('search_placeholder') || "Поиск..."}
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div className="w-full md:w-64 relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <select
            value={filterGroupId}
            onChange={(e) => onGroupChange && onGroupChange(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 appearance-none"
          >
            <option value="all">{t('all_groups') || "Все группы"}</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
        </div>

        {/* Export Buttons */}
        {onExport && (
          <div className="flex gap-2">
            <button
              onClick={() => onExport('excel')}
              className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-green-400 hover:bg-white/10 hover:text-green-300 transition-colors"
              title={t('export_excel') || 'Export Excel'}
            >
              <FileText size={20} />
            </button>
            <button
              onClick={() => onExport('pdf')}
              disabled={isExporting}
              className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-red-400 hover:bg-white/10 hover:text-red-300 transition-colors disabled:opacity-50"
              title={t('export_pdf') || 'Export PDF'}
            >
              {isExporting ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />}
            </button>
          </div>
        )}
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-red-500/20 rounded-full text-red-400">
            <AlertCircle size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {stats.expired}
            </div>
            <div className="text-sm text-gray-400">{t('expired_certificates_stat') || 'Истек срок'}</div>
          </div>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-yellow-500/20 rounded-full text-yellow-400">
            <Clock size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {stats.warning}
            </div>
            <div className="text-sm text-gray-400">{t('expiring_soon_stat') || 'Скоро истекает'}</div>
          </div>
        </div>

        <div className="bg-gray-500/10 border border-gray-500/20 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-gray-500/20 rounded-full text-gray-400">
            <AlertCircle size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">
              {stats.missing}
            </div>
            <div className="text-sm text-gray-400">{t('missing_certificates_stat') || 'Нет справки'}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#0F1117] rounded-xl border border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-400">
            <thead className="bg-white/5 uppercase font-medium">
              <tr>
                <th className="px-6 py-4">{t('student_th') || 'Ученик'}</th>
                <th className="px-6 py-4">{t('group_th') || 'Группа'}</th>
                <th className="px-6 py-4">{t('expiry_date') || 'Срок действия'}</th>
                <th className="px-6 py-4">{t('status_th') || 'Статус'}</th>
                <th className="px-6 py-4 text-center">{t('quick_actions') || 'Быстро'}</th>
                <th className="px-6 py-4 text-right">{t('actions_th') || 'Действия'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedStudents.map(student => {
                const status = getStatus(student);
                return (
                  <tr 
                    key={student.id} 
                    onClick={() => onStudentClick(student.id)}
                    className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
                        {student.avatar_url ? (
                          <img src={getImageUrl(student.avatar_url)} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <span>{student.last_name?.[0] || student.first_name?.[0]}</span>
                        )}
                      </div>
                      {student.last_name} {student.first_name}
                    </td>
                    <td className="px-6 py-4">{getGroupName(student)}</td>
                    <td className="px-6 py-4">
                      {student.medical_certificate_expires ? new Date(student.medical_certificate_expires).toLocaleDateString(t('locale') || 'ru-RU') : '-'}
                    </td>
                    <td className="px-6 py-4">
                      {status === 'valid' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                          <CheckCircle size={12} /> {t('status_valid') || 'Действительна'}
                        </span>
                      )}
                      {status === 'warning' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                          <Clock size={12} /> {t('status_expiring') || 'Скоро истекает'}
                        </span>
                      )}
                      {status === 'expired' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                          <AlertCircle size={12} /> {t('status_expired') || 'Истекла'}
                        </span>
                      )}
                      {status === 'missing' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20">
                          <AlertCircle size={12} /> {t('status_missing') || 'Отсутствует'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-center gap-2">
                        {updatingId === student.id ? (
                          <Loader2 className="w-5 h-5 animate-spin text-yellow-500" />
                        ) : (
                          <>
                            <button 
                              onClick={(e) => handleQuickUpdate(e, student.id, true)}
                              className="p-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 transition-colors border border-green-500/20"
                              title={t('mark_valid_6m') || "Продлить на 6 мес."}
                            >
                              <CheckCircle size={18} />
                            </button>
                            <button 
                              onClick={(e) => handleQuickUpdate(e, student.id, false)}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors border border-red-500/20"
                              title={t('mark_missing') || "Отметить как отсутствующую"}
                            >
                              <XCircle size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onStudentClick(student.id);
                        }}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        {t('open_card') || 'Открыть карточку'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MedicalMonitoring;
