import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Info } from 'lucide-react';
import { birthdaysAPI } from '../api/client';

export default function BirthdayTemplateModal({ onClose, t }) {
  const [templates, setTemplates] = useState({ group_template: '', individual_template: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await birthdaysAPI.getTemplates();
      setTemplates(res.data);
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await birthdaysAPI.updateTemplates(templates);
      onClose();
      alert(t('templates_saved') || 'Шаблоны сохранены');
    } catch (error) {
      console.error("Error saving templates:", error);
      alert(t('error_saving_templates') || 'Ошибка при сохранении');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-[#1A1D24] border border-white/10 rounded-2xl w-full max-w-2xl p-6 shadow-2xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              🎉 {t('birthday_templates') || 'Шаблоны поздравлений'}
            </h2>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition">
              <X size={20} />
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-white/50">
              {t('loading') || 'Загрузка...'}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pr-2">
              
              {/* Info Box */}
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
                <Info className="text-blue-400 shrink-0" size={20} />
                <div className="text-sm text-blue-200">
                  <p className="font-bold mb-1">{t('available_variables') || 'Доступные переменные:'}</p>
                  <ul className="list-disc list-inside space-y-1 opacity-80">
                    <li>{`{first_name}`} - {t('first_name') || 'Имя'}</li>
                    <li>{`{last_name}`} - {t('last_name') || 'Фамилия'}</li>
                    <li>{`{group_name}`} - {t('group_name') || 'Название группы'}</li>
                  </ul>
                </div>
              </div>

              {/* Group Template */}
              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  {t('group_greeting_template') || 'Поздравление в чат группы'}
                </label>
                <textarea
                  value={templates.group_template}
                  onChange={(e) => setTemplates({...templates, group_template: e.target.value})}
                  className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-brand-yellow/50 resize-none font-mono text-sm"
                  placeholder="Введите текст..."
                />
              </div>

              {/* Individual Template */}
              <div>
                <label className="block text-sm font-bold text-white mb-2">
                  {t('individual_greeting_template') || 'Поздравление родителю (ЛС)'}
                </label>
                <textarea
                  value={templates.individual_template}
                  onChange={(e) => setTemplates({...templates, individual_template: e.target.value})}
                  className="w-full h-32 bg-black/20 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-brand-yellow/50 resize-none font-mono text-sm"
                  placeholder="Введите текст..."
                />
              </div>

            </div>
          )}

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/5">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl transition font-medium"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-brand-yellow hover:bg-yellow-400 text-black rounded-xl transition font-bold flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? '...' : <><Save size={18} /> {t('save')}</>}
            </button>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
