import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { hrCandidatesAPI, settingsAPI } from '../../api/client';
import toast from 'react-hot-toast';

const defaultTemplates = [
  {
    key: 'invite_interview',
    title: 'Приглашение на интервью',
    body:
      'Здравствуйте, {{имя кандидата}}! Это {{ваше имя}} из футбольной академии.\n' +
      'Приглашаем вас на собеседование на позицию {{должность}} {{дата и время}} по адресу: {{адрес}}.\n' +
      'Подтвердите, пожалуйста, сможете ли вы прийти.',
  },
  {
    key: 'invite_trial',
    title: 'Пробная тренировка / тестовое задание',
    body:
      'Здравствуйте, {{имя кандидата}}! Предлагаем пройти {{тестовое задание / пробную тренировку}} по позиции {{должность}}.\n' +
      'Дата и время: {{дата и время}}.\n' +
      'Если формат вам подходит, подтвердите участие, пожалуйста.',
  },
  {
    key: 'offer',
    title: 'Оффер и онбординг',
    body:
      'Здравствуйте, {{имя кандидата}}! Мы готовы сделать вам оффер на позицию {{должность}} в нашей академии.\n' +
      'Давайте согласуем дату выхода и обсудим условия онбординга.',
  },
];

export default function CandidateDetailsModal({ candidateId, onClose, onUpdate, stages }) {
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState(defaultTemplates);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [messageText, setMessageText] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await hrCandidatesAPI.getById(candidateId);
        setCandidate(res.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [candidateId]);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        const res = await settingsAPI.getAll();
        const items = Array.isArray(res.data) ? res.data : [];
        const tplSetting = items.find((s) => s.key === 'hr.message_templates');
        if (tplSetting && tplSetting.value) {
          const parsed = JSON.parse(tplSetting.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTemplates(parsed);
          }
        }
      } finally {
        setTemplatesLoading(false);
      }
    };
    loadTemplates();
  }, []);

  if (!candidate) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[110] p-4">
        <div className="bg-[#1C1E24] rounded-2xl border border-white/10 w-full max-w-lg p-6 flex flex-col items-center justify-center gap-4">
          {loading ? (
            <>
              <Loader2 className="animate-spin text-emerald-400" size={28} />
              <div className="text-gray-400 text-sm">Загрузка кандидата...</div>
            </>
          ) : (
            <>
              <div className="text-gray-400 text-sm">Кандидат не найден</div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 transition-colors"
              >
                Закрыть
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const handleFieldChange = (field, value) => {
    setCandidate({ ...candidate, [field]: value });
  };

  const getRoleTitle = () => {
    if (!candidate?.target_role) return '';
    if (candidate.target_role === 'coach') return 'Тренер';
    if (candidate.target_role === 'admin') return 'Администратор';
    if (candidate.target_role === 'accountant') return 'Бухгалтер';
    return candidate.target_role;
  };

  const applyPlaceholders = (body) => {
    if (!body) return '';
    let text = body;
    const name = candidate.full_name || '';
    const roleTitle = getRoleTitle();
    text = text.replace(/{{имя кандидата}}/gi, name);
    text = text.replace(/{{должность}}/gi, roleTitle);
    return text;
  };

  const handleApplyTemplate = (body) => {
    if (!body) return;
    const processed = applyPlaceholders(body);
    setMessageText(processed);
    const current = candidate.notes || '';
    const next = current ? `${current}\n\n${processed}` : processed;
    setCandidate({ ...candidate, notes: next });
    toast.success('Шаблон подготовлен и добавлен в заметки кандидата');
  };

  const handleCopyMessage = async () => {
    const text = messageText || '';
    if (!text.trim()) {
      toast.error('Нет текста для копирования');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Текст скопирован в буфер обмена');
    } catch (e) {
      void e;
      toast.error('Не удалось скопировать текст');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      full_name: candidate.full_name,
      target_role: candidate.target_role,
      phone: candidate.phone,
      email: candidate.email,
      experience_years: candidate.experience_years,
      experience_summary: candidate.experience_summary,
      stage: candidate.stage,
      next_interview_at: candidate.next_interview_at,
      notes: candidate.notes,
    };
    const res = await hrCandidatesAPI.update(candidate.id, payload);
    onUpdate(res.data);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[110] p-0 md:p-4">
      <div className="bg-[#1C1E24] rounded-none md:rounded-2xl border-0 md:border border-white/10 w-full max-w-2xl shadow-2xl flex flex-col h-full md:h-auto md:max-h-[90dvh] overflow-hidden">
        <div className="p-5 border-b border-white/10 flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white">{candidate.full_name}</h2>
            <div className="text-sm text-gray-400">
              {candidate.target_role === 'coach'
                ? 'Тренер'
                : candidate.target_role === 'admin'
                ? 'Администратор'
                : candidate.target_role === 'accountant'
                ? 'Бухгалтер'
                : candidate.target_role}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-400 mb-1">ФИО</div>
                <input
                  type="text"
                  value={candidate.full_name || ''}
                  onChange={(e) => handleFieldChange('full_name', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Роль</div>
                <select
                  value={candidate.target_role || 'coach'}
                  onChange={(e) => handleFieldChange('target_role', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="coach">Тренер</option>
                  <option value="admin">Администратор</option>
                  <option value="accountant">Бухгалтер</option>
                </select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Телефон</div>
                  <input
                    type="tel"
                    value={candidate.phone || ''}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Email</div>
                  <input
                    type="email"
                    value={candidate.email || ''}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Опыт (лет)</div>
                <input
                  type="number"
                  value={candidate.experience_years || ''}
                  onChange={(e) =>
                    handleFieldChange('experience_years', e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-400 mb-1">Этап воронки</div>
                <select
                  value={candidate.stage || ''}
                  onChange={(e) => handleFieldChange('stage', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.key}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Дата следующего собеседования</div>
                <input
                  type="datetime-local"
                  value={
                    candidate.next_interview_at
                      ? candidate.next_interview_at.slice(0, 16)
                      : ''
                  }
                  onChange={(e) => handleFieldChange('next_interview_at', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Заметки</div>
                <textarea
                  value={candidate.notes || ''}
                  onChange={(e) => handleFieldChange('notes', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white h-32 resize-none focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="mt-2 bg-white/5 border border-white/10 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Шаблоны сообщений
              </div>
              {templatesLoading && <Loader2 className="animate-spin text-emerald-400" size={16} />}
            </div>
            {templates.length === 0 ? (
              <div className="text-xs text-gray-500">
                Пока нет шаблонов. Добавьте их в настройках воронки найма.
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                {templates.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => handleApplyTemplate(tpl.body)}
                    className="w-full text-left text-xs bg-[#1C1E24] hover:bg-[#23262f] border border-white/10 rounded-lg px-3 py-2 text-gray-200 transition-colors"
                  >
                    <div className="font-semibold mb-1 text-gray-100">{tpl.title}</div>
                    <div className="text-gray-400 whitespace-pre-line">
                      {tpl.body}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Текст сообщения кандидату
              </div>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-medium transition-colors"
              >
                Скопировать для WhatsApp/Telegram
              </button>
            </div>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Выберите шаблон выше, чтобы автоматически подставить имя и должность кандидата"
              className="w-full bg-[#14161C] border border-white/10 rounded-lg px-3 py-2 text-sm text-white h-28 resize-none focus:outline-none focus:border-emerald-500"
            />
          </div>

        </div>

        <div className="p-4 border-t border-white/10 flex justify-end gap-2 pb-28 md:pb-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="animate-spin" size={16} />}
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
