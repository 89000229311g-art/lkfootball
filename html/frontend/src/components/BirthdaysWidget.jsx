import { useState, useEffect } from 'react';
import { birthdaysAPI } from '../api/client';
import UserAvatar from './UserAvatar';
import BirthdayTemplateModal from './BirthdayTemplateModal';
import { Gift, CheckCircle, Send, AlertCircle, Settings } from 'lucide-react';

export default function BirthdaysWidget({ t }) {
  const [birthdays, setBirthdays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  const fetchBirthdays = async () => {
    try {
      setLoading(true);
      const res = await birthdaysAPI.getToday();
      setBirthdays(res.data);
    } catch (error) {
      console.error("Error fetching birthdays:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBirthdays();
  }, []);

  const handleSend = async (studentId) => {
    try {
      setSending(studentId);
      await birthdaysAPI.send(studentId);
      // Refresh list to update status
      await fetchBirthdays();
    } catch (error) {
      console.error("Error sending birthday greeting:", error);
      alert(t('error_sending_greeting') || "Error sending greeting");
    } finally {
      setSending(null);
    }
  };

  if (loading) return null; // Or a skeleton

  // Show even if no birthdays so user can edit templates
  // if (birthdays.length === 0) return null;

  if (birthdays.length === 0 && !loading) {
      return (
        <div className="flex justify-end mb-6">
             <button 
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
             >
                <Settings size={16} />
                {t('birthday_templates') || 'Настроить поздравления'}
             </button>
             {showTemplateModal && <BirthdayTemplateModal t={t} onClose={() => setShowTemplateModal(false)} />}
        </div>
      );
  }

  return (
    <div className="bg-[#1A1D24] border border-white/5 rounded-2xl p-6 mb-6 animate-fade-in relative">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Gift className="text-pink-500" />
            {t('birthdays_today') || 'Именинники сегодня'}
        </h3>
        <button 
            onClick={() => setShowTemplateModal(true)}
            className="p-2 hover:bg-white/10 rounded-xl text-white/40 hover:text-white transition-colors"
            title={t('configure_templates') || 'Настроить шаблоны'}
        >
            <Settings size={20} />
        </button>
      </div>
      
      <div className="space-y-4">
        {birthdays.map((student) => (
          <div key={student.student_id} className="flex flex-col sm:flex-row sm:items-center justify-between bg-black/20 p-4 rounded-xl border border-white/5 gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <UserAvatar user={{ avatar_url: student.photo_url, first_name: student.full_name }} size="w-12 h-12" />
                <div className="absolute -top-1 -right-1 text-lg animate-bounce">🎂</div>
              </div>
              <div>
                <div className="font-bold text-white text-lg">{student.full_name}</div>
                <div className="text-xs text-white/50">{student.group_name || 'No Group'}</div>
                {student.error && <div className="text-xs text-red-400 mt-1">{student.error}</div>}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                student.group_sent ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              }`}>
                {student.group_sent ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {t('group_chat') || 'Группа'}
              </div>
              
              <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${
                student.parents_sent ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
              }`}>
                {student.parents_sent ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                {t('parent_chat') || 'Родитель'}
              </div>

              {(!student.group_sent || !student.parents_sent) && (
                <button
                  onClick={() => handleSend(student.student_id)}
                  disabled={sending === student.student_id}
                  className="ml-auto sm:ml-0 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 font-medium text-sm shadow-lg shadow-blue-500/20"
                  title={t('send_greeting') || 'Отправить поздравление'}
                >
                  {sending === student.student_id ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  {t('send') || 'Отправить'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showTemplateModal && <BirthdayTemplateModal t={t} onClose={() => setShowTemplateModal(false)} />}
    </div>
  );
}
