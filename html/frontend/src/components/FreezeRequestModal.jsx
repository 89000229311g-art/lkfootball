import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, FileText, Upload, Loader2, AlertCircle, CheckCircle, Check } from 'lucide-react';
import { studentsAPI, parentAPI, uploadAPI as fileUploadAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import CustomDatePicker from './CustomDatePicker';

export default function FreezeRequestModal({ studentId, onClose, onSuccess, isAdmin }) {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    end_date: null,
    reason: '',
    file_url: null
  });
  const [uploading, setUploading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [children, setChildren] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(studentId || '');
  const [childrenLoading, setChildrenLoading] = useState(false);

  useEffect(() => {
    if (!studentId && !isAdmin) {
      setChildrenLoading(true);
      parentAPI.getChildren()
        .then((res) => {
          const data = res.data?.data || res.data || [];
          const list = Array.isArray(data) ? data : [];
          setChildren(list);
          if (list.length > 0) {
            setSelectedStudentId(list[0].id);
          }
        })
        .catch((err) => {
          console.error(err);
          setError(t('error_loading_children') || 'Ошибка загрузки списка учеников');
        })
        .finally(() => {
          setChildrenLoading(false);
        });
    }
  }, [studentId, isAdmin, t]);

  // Min date: tomorrow
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const uploadData = new FormData();
      uploadData.append('file', file);
      const response = await fileUploadAPI.uploadMedicalDoc(uploadData);
      const fileUrl = response.url || response.data?.url || response;
      setFormData(prev => ({ ...prev, file_url: fileUrl }));
    } catch (err) {
      console.error(err);
      const detail = err.response?.data?.detail;
      setError(detail || t('upload_error') || 'Error uploading file');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.end_date) {
      setError(t('select_end_date') || 'Please select an end date');
      return;
    }

    const targetStudentId = studentId || selectedStudentId;
    if (!targetStudentId) {
      setError(t('select_child_for_freeze') || 'Пожалуйста, выберите ученика');
      return;
    }

    setLoading(true);
    setError(null);
    
    // Convert Date to YYYY-MM-DD string with local timezone adjustment
    // Using simple ISO split might give wrong date due to timezone
    const year = formData.end_date.getFullYear();
    const month = String(formData.end_date.getMonth() + 1).padStart(2, '0');
    const day = String(formData.end_date.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`;

    try {
      await studentsAPI.requestFreeze(targetStudentId, {
        end_date: formattedDate,
        reason: formData.reason,
        file_url: formData.file_url
      });
      setIsSuccess(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || t('freeze_request_error') || 'Error requesting freeze');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] overflow-y-auto bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <div className="flex min-h-full items-center justify-center p-4 landscape:p-2">
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="bg-[#1A1D24] w-full max-w-md landscape:max-w-none landscape:w-[95vw] rounded-2xl border border-white/10 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh] landscape:max-h-[95vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 landscape:p-3 border-b border-white/10 flex justify-between items-center bg-[#252830] shrink-0">
              <h3 className="text-lg landscape:text-base font-bold text-white">
                {isAdmin ? t('freeze_subscription') : t('request_freeze')}
              </h3>
              <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            {isSuccess ? (
              <div className="p-6 landscape:p-4 flex flex-col items-center justify-center text-center space-y-3 landscape:space-y-2 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 landscape:w-14 landscape:h-14 bg-green-500/20 rounded-full flex items-center justify-center mb-1">
                  <Check className="w-8 h-8 landscape:w-6 landscape:h-6 text-green-500" />
                </div>
                <h3 className="text-xl landscape:text-lg font-bold text-white">{t('request_sent_success')}</h3>
                <p className="text-white/60 max-w-xs text-sm landscape:text-xs">
                  {t('freeze_request_sent_desc')}
                </p>
                <button 
                  onClick={onClose}
                  className="mt-4 landscape:mt-3 px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold transition-all w-full"
                >
                  {t('close')}
                </button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} className="p-4 landscape:p-3 space-y-4 landscape:space-y-3 overflow-y-auto flex-1 w-full landscape:max-w-full">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg landscape:rounded p-3 landscape:p-2 flex gap-2 landscape:gap-1">
                <AlertCircle className="w-4 h-4 landscape:w-3 landscape:h-3 text-blue-400 shrink-0 mt-0.5" />
                <div className="text-sm landscape:text-xs text-blue-200/80">
                  {isAdmin ? t('freeze_admin_info') : t('freeze_parent_info')}
                </div>
              </div>

              <div className="space-y-4 landscape:space-y-3">
              {!studentId && !isAdmin && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white/80 flex items-center gap-2">
                    {t('child_label') || 'Ученик'}
                  </label>
                  <div className="relative">
                    <select
                      value={selectedStudentId}
                      onChange={(e) => setSelectedStudentId(e.target.value)}
                      disabled={childrenLoading}
                      className="w-full landscape:w-[95%] bg-black/20 border border-white/10 rounded-lg landscape:rounded px-3 py-2 landscape:px-2 landscape:py-1.5 text-white focus:outline-none focus:border-brand-yellow transition-colors text-sm landscape:text-xs"
                    >
                      {children.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.full_name || `${child.first_name} ${child.last_name}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Date Picker */}
              <div className="space-y-1 landscape:space-y-0.5">
                <label className="text-sm landscape:text-xs font-medium text-white/80 flex items-center gap-1 landscape:gap-0.5">
                  <Calendar size={14} className="text-brand-yellow" />
                  {t('freeze_until') || 'Заморозить по (включительно)'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <CustomDatePicker
                    selected={formData.end_date}
                    onChange={(date) => setFormData({ ...formData, end_date: date })}
                    minDate={minDate}
                    placeholder={t('select_date') || "Выберите дату"}
                    className="w-full landscape:w-[95%] bg-black/20 border border-white/10 rounded-lg landscape:rounded px-3 py-2 landscape:px-2 landscape:py-1.5 text-white focus:outline-none focus:border-brand-yellow transition-colors text-sm landscape:text-xs"
                    required
                  />
                </div>
              </div>
              </div>

              <div className="space-y-6">
              {/* Reason */}
              <div className="space-y-1 landscape:space-y-0.5">
                <label className="text-sm landscape:text-xs font-medium text-white/80 flex items-center gap-1 landscape:gap-0.5">
                  <FileText size={14} className="text-brand-yellow" />
                  {t('reason') || 'Причина / Комментарий'}
                </label>
                <textarea
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder={t('freeze_reason_placeholder') || "Например: Болезнь, Отъезд..."}
                  className="w-full landscape:w-[95%] bg-black/20 border border-white/10 rounded-lg landscape:rounded px-3 py-2 landscape:px-2 landscape:py-1.5 text-white focus:outline-none focus:border-brand-yellow transition-colors min-h-[80px] landscape:min-h-[60px] resize-none text-sm landscape:text-xs"
                />
              </div>

              {/* File Upload */}
              <div className="space-y-1 landscape:space-y-0.5">
                <label className="text-sm landscape:text-xs font-medium text-white/80 flex items-center gap-1 landscape:gap-0.5">
                  <Upload size={14} className="text-brand-yellow" />
                  {t('attach_document') || 'Прикрепить справку (необязательно)'}
                </label>
                
                <div className="relative">
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="freeze-file-upload"
                    accept="image/*,.pdf"
                  />
                  <label
                    htmlFor="freeze-file-upload"
                    className={`w-full landscape:w-[95%] flex items-center justify-center gap-2 landscape:gap-1 px-3 py-2 landscape:px-2 landscape:py-1.5 rounded-lg landscape:rounded border border-dashed cursor-pointer transition-all text-sm landscape:text-xs ${
                      formData.file_url 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-black/20 border-white/20 hover:bg-white/5 text-white/60 hover:text-white'
                    }`}
                  >
                    {uploading ? (
                      <Loader2 className="w-4 h-4 landscape:w-3 landscape:h-3 animate-spin" />
                    ) : formData.file_url ? (
                      <>
                        <CheckCircle className="w-4 h-4 landscape:w-3 landscape:h-3" />
                        <span className="truncate max-w-[150px] landscape:max-w-[120px]">{t('file_uploaded') || 'Файл загружен'}</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 landscape:w-3 landscape:h-3" />
                        <span>{t('click_to_upload') || 'Нажмите для загрузки'}</span>
                      </>
                    )}
                  </label>
                </div>
              </div>
              </div>

              {error && (
                <div className="text-red-400 text-sm landscape:text-xs bg-red-500/10 p-2 landscape:p-1.5 rounded-lg flex items-center gap-1 landscape:gap-0.5">
                  <AlertCircle size={14} landscape:size={12} />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || uploading}
                className="w-full landscape:w-[95%] bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 landscape:py-1.5 rounded-lg landscape:rounded transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 landscape:gap-0.5 text-sm landscape:text-xs"
              >
                {loading ? <Loader2 className="w-4 h-4 landscape:w-3 landscape:h-3 animate-spin" /> : (isAdmin ? (t('confirm_freeze') || 'Подтвердить заморозку') : (t('send_request') || 'Отправить заявку'))}
              </button>
            </form>
            )}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
