import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { parentAPI, studentsAPI } from '../../api/client';
import { getLocalizedName } from '../../utils/transliteration';
import { Calendar, User, FileText, Check, Clock, AlertTriangle, Plus, X } from 'lucide-react';
import CustomDatePicker from '../CustomDatePicker';

export default function AbsenceRequestModal({ onClose, onSuccess }) {
  const { t, language } = useLanguage();
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [formData, setFormData] = useState({
    studentId: '',
    date: new Date().toISOString().split('T')[0],
    reason: 'illness', // illness, family, other
    note: ''
  });

  useEffect(() => {
    fetchChildren();
  }, []);

  const fetchChildren = async () => {
    try {
      // Use parentAPI to get children
      const res = await parentAPI.getChildren();
      const myChildren = res.data?.data || res.data || [];
      
      setChildren(myChildren);
      
      if (myChildren.length > 0) {
        setFormData(prev => ({ ...prev, studentId: myChildren[0].id }));
      }
    } catch (err) {
      console.error(err);
      // Fallback if parentAPI fails (e.g. for admin testing)
      try {
        const res = await studentsAPI.getAll({ limit: 100 });
        const allStudents = res.data?.data || res.data || [];
        setChildren(allStudents);
        if (allStudents.length > 0) {
           setFormData(prev => ({ ...prev, studentId: allStudents[0].id }));
        }
      } catch (e) {
         console.error("Fallback failed", e);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      // Construct reason string
      const reasonText = getReasonLabel(formData.reason) + (formData.note ? `: ${formData.note}` : '');
      
      // Use the updated API method that handles params correctly
      await parentAPI.createAbsenceRequest(formData.studentId, formData.date, reasonText);
      
      setIsSuccess(true);
      if (onSuccess) onSuccess();
      
      // Auto close after 3 seconds or let user close manually
      // setTimeout(onClose, 3000); 
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || t('error_sending_message') || "Ошибка отправки заявки");
    } finally {
      setSubmitting(false);
    }
  };

  const getReasonLabel = (key) => {
    const reasons = {
      illness: t('sickness') || 'Болезнь',
      family: t('family_circumstances') || 'Семейные обстоятельства',
      other: t('other') || 'Другое'
    };
    return reasons[key] || key;
  };

  if (loading) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#1C1E24] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] landscape:max-h-[85vh]">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            {t('report_absence')}
          </h3>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in duration-300 flex-1">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-2">
              <Check className="w-10 h-10 text-green-500" />
            </div>
            <h3 className="text-2xl font-bold text-white">{t('request_sent_success') || 'Запрос отправлен!'}</h3>
            <p className="text-white/60 max-w-xs">
              {t('wait_for_feedback') || 'Ваш запрос успешно передан тренеру. Ожидайте подтверждения.'}
            </p>
            <button 
              onClick={onClose}
              className="mt-6 px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold transition-all w-full"
            >
              {t('close') || 'Закрыть'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 pb-24">
            {/* Child Selector */}
            <div>
              <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('child_label')}</label>
              <div className="relative">
                <select
                  required
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white appearance-none focus:outline-none focus:border-orange-500"
                  value={formData.studentId}
                  onChange={e => setFormData({...formData, studentId: e.target.value})}
                >
                  {children.map(child => (
                    <option key={child.id} value={child.id}>
                      {getLocalizedName(child.first_name, child.last_name, language)}
                    </option>
                  ))}
                </select>
                <User className="absolute right-4 top-3.5 w-5 h-5 text-white/20 pointer-events-none" />
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('absence_date')}</label>
              <div className="relative">
                <CustomDatePicker
                  selected={formData.date ? new Date(formData.date) : null}
                  onChange={(date) => {
                      if (!date) return;
                      const year = date.getFullYear();
                      const month = String(date.getMonth() + 1).padStart(2, '0');
                      const day = String(date.getDate()).padStart(2, '0');
                      setFormData({...formData, date: `${year}-${month}-${day}`});
                  }}
                  minDate={new Date()}
                  placeholder={t('select_date')}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('reason')}</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {['illness', 'family', 'other'].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setFormData({...formData, reason: r})}
                    className={`w-full px-3 py-2 rounded-2xl text-[10px] sm:text-xs leading-tight text-center break-all whitespace-normal min-h-[44px] sm:min-h-[40px] border transition-all ${
                      formData.reason === r
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                    style={{ hyphens: 'auto', maxWidth: '100%' }}
                  >
                    {getReasonLabel(r)}
                  </button>
                ))}
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('comment')}</label>
              <textarea
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 min-h-[80px]"
                placeholder={t('additional_details')}
                value={formData.note}
                onChange={e => setFormData({...formData, note: e.target.value})}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Clock className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                {t('send_to_coach')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
