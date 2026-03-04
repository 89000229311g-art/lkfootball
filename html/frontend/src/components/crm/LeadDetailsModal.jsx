import { useState, useEffect } from 'react';
import { Loader2, X, Save, Calendar } from 'lucide-react';
import { leadsAPI, settingsAPI } from '../../api/client';
import toast from 'react-hot-toast';
import CustomDatePicker from '../CustomDatePicker';

export default function LeadDetailsModal({ leadId, onClose, onUpdate, stages = [], users = [] }) {
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    age: '',
    status: '',
    source: '',
    notes: '',
    next_contact_date: null,
    responsible_id: null,
    rejection_reason: '',
  });

  const callChecklist = [
    'Уточнить, кто принимает решение и кто будет заниматься.',
    'Понять возраст ребенка, опыт и уровень мотивации.',
    'Выяснить цели: здоровье, дисциплина, профессиональный спорт.',
    'Согласовать удобные дни и время тренировок.',
    'Проговорить формат пробной тренировки и стоимость абонемента.',
  ];

  const defaultTemplates = [
    {
      key: 'first_contact',
      title: 'Первый контакт после заявки',
      body:
        'Здравствуйте, {{имя родителя}}! Это {{ваше имя}} из футбольной академии {{название}}.\n' +
        'Вы оставляли заявку на тренировку для {{имя ребенка}}. Подскажите, удобно сейчас пару минут поговорить?',
    },
    {
      key: 'invite_trial',
      title: 'Приглашение на пробную тренировку',
      body:
        'Здравствуйте, {{имя родителя}}! Приглашаем {{имя ребенка}} на пробную тренировку в нашу футбольную академию {{название}}.\n' +
        'Тренировка пройдет {{дата и время}} по адресу: {{адрес}}.\n' +
        'Форма: спортивная одежда и обувь, бутылка воды.\n' +
        'Подтвердите, пожалуйста, сможете ли вы прийти.',
    },
    {
      key: 'training_reminder',
      title: 'Напоминание о тренировке',
      body:
        'Здравствуйте, {{имя родителя}}! Напоминаем, что завтра у {{имя ребенка}} пробная тренировка в {{время}} в академии {{название}}.\n' +
        'Если планы изменятся, напишите нам, пожалуйста.',
    },
    {
      key: 'after_trial_followup',
      title: 'Дожим после пробной',
      body:
        'Здравствуйте, {{имя родителя}}! Как впечатления у {{имя ребенка}} после пробной тренировки в нашей академии {{название}}?\n' +
        'Готовы ли вы продолжить и оформить абонемент, чтобы ребенок прогрессировал регулярно?',
    },
  ];
  const [messageTemplates, setMessageTemplates] = useState(defaultTemplates);

  useEffect(() => {
    if (leadId) {
      fetchLead();
      fetchTemplates();
    }
  }, [leadId]);

  const fetchLead = async () => {
    try {
      setLoading(true);
      const res = await leadsAPI.getById(leadId);
      const data = res.data;
      setLead(data);
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setFormData({
        name: data.name || '',
        phone: data.phone || '',
        age: data.age || '',
        status: data.status || 'new',
        source: data.source || '',
        notes: data.notes || '',
        next_contact_date: data.next_contact_date ? new Date(data.next_contact_date) : null,
        responsible_id: data.responsible_id || null,
        rejection_reason: data.rejection_reason || '',
      });
    } catch (error) {
      console.error('Error fetching lead details:', error);
      toast.error('Ошибка загрузки данных');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true);
      const res = await settingsAPI.getAll();
      const items = Array.isArray(res.data) ? res.data : [];
      const tplSetting = items.find((s) => s.key === 'crm.message_templates');
      if (tplSetting && tplSetting.value) {
        try {
          const parsed = JSON.parse(tplSetting.value);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessageTemplates(parsed);
          }
        } catch (e) {
          // ignore parse error, keep defaults
        }
      }
    } catch (e) {
      // ignore load error, keep defaults
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.status === 'reject' && !formData.rejection_reason) {
      toast.error('Выберите причину отказа');
      return;
    }
    try {
      setSaving(true);
      const updateData = {
        ...formData,
        age: formData.age ? parseInt(formData.age) : null,
        next_contact_date: formData.next_contact_date ? formData.next_contact_date.toISOString() : null,
        rejection_reason: formData.status === 'reject' ? formData.rejection_reason : null,
      };
      
      const res = await leadsAPI.update(leadId, updateData);
      toast.success('Данные обновлены');
      onUpdate(res.data);
      onClose();
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (!leadId) return null;

  const handleCopy = async (text, templateTitle = '') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Текст скопирован в буфер обмена');
      try {
        const ts = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
        const entry = `[${timestamp}] Отправлен шаблон: ${templateTitle}`;
        const currentNotes = formData.notes || '';
        const newNotes = currentNotes ? `${currentNotes}\n${entry}` : entry;
        const res = await leadsAPI.update(leadId, { notes: newNotes });
        setFormData((prev) => ({ ...prev, notes: res.data?.notes ?? newNotes }));
        onUpdate(res.data ?? { ...lead, notes: newNotes });
      } catch (e) {
        // If API fails, keep local update to not block workflow
        const ts = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const timestamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())} ${pad(ts.getHours())}:${pad(ts.getMinutes())}`;
        const entry = `[${timestamp}] Отправлен шаблон: ${templateTitle}`;
        const currentNotes = formData.notes || '';
        const newNotes = currentNotes ? `${currentNotes}\n${entry}` : entry;
        setFormData((prev) => ({ ...prev, notes: newNotes }));
      }
    } catch (error) {
      toast.error('Не удалось скопировать текст');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-0 md:p-4 animate-fade-in">
      <div className="bg-[#1C1E24] rounded-none md:rounded-2xl border-0 md:border border-white/10 w-full max-w-2xl shadow-2xl flex flex-col h-full md:h-auto md:max-h-[90dvh] animate-scale-in overflow-hidden">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-bold text-white">Карточка лида</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
          ) : (
            <>
              <div className="mb-4 flex gap-2 border-b border-white/10 pb-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    activeTab === 'details'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  Данные лида
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('scripts')}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    activeTab === 'scripts'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
                >
                  Скрипт и шаблоны
                </button>
              </div>

              {activeTab === 'details' ? (
                <form id="lead-form" onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Имя ребенка / Родителя *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Телефон *</label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Возраст ребенка</label>
                      <input
                        type="number"
                        value={formData.age}
                        onChange={(e) => setFormData({...formData, age: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                        placeholder="Лет"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Источник</label>
                      <select
                        value={formData.source}
                        onChange={(e) => setFormData({...formData, source: e.target.value})}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Не указан</option>
                        <option value="instagram">Instagram</option>
                        <option value="facebook">Facebook</option>
                        <option value="google">Google</option>
                        <option value="referral">Рекомендация</option>
                        <option value="other">Другое</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-4">
                    <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider mb-2">Планирование</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Статус воронки</label>
                        <select
                          value={formData.status}
                          onChange={(e) => setFormData({...formData, status: e.target.value})}
                          className="w-full bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                        >
                          {stages.length > 0 ? (
                            stages.map(stage => (
                              <option key={stage.key} value={stage.key}>{stage.title}</option>
                            ))
                          ) : (
                            <>
                              <option value="new">Новый лид</option>
                              <option value="call">Звонок</option>
                              <option value="trial">Первая тренировка</option>
                              <option value="offer">Оффер</option>
                              <option value="deal">Сделка</option>
                              <option value="success">Успех</option>
                              <option value="reject">Отказ</option>
                            </>
                          )}
                        </select>
                      </div>
                      {formData.status === 'reject' && (
                        <div>
                          <label className="block text-sm text-gray-400 mb-1">Причина отказа *</label>
                          <select
                            value={formData.rejection_reason}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                rejection_reason: e.target.value,
                              })
                            }
                            className="w-full bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-red-500"
                          >
                            <option value="">Выберите причину</option>
                            <option value="expensive">Дорого</option>
                            <option value="schedule">Расписание не подходит</option>
                            <option value="other_academy">Выбрали другую академию</option>
                            <option value="relocation">Переезд</option>
                            <option value="other">Другое</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Следующее касание</label>
                        <div className="relative">
                          <CustomDatePicker
                            selected={formData.next_contact_date}
                            onChange={(date) => setFormData({...formData, next_contact_date: date})}
                            className="w-full bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 pl-10"
                            placeholderText="Выберите дату"
                            showTimeSelect
                            dateFormat="dd.MM.yyyy HH:mm"
                          />
                          <Calendar className="absolute left-3 top-2.5 text-gray-500 pointer-events-none" size={16} />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Ответственный</label>
                        <select
                          value={formData.responsible_id || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              responsible_id: e.target.value ? parseInt(e.target.value, 10) : null,
                            })
                          }
                          className="w-full bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="">Не выбран</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name} ({u.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">История взаимодействий / Заметки</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 min-h-[120px] resize-none"
                      placeholder="Запишите результат звонка или важные детали..."
                    />
                  </div>

                  <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider">Задачи по лиду</h3>
                  <div className="flex gap-2 text-[11px] text-gray-400">
                    <button
                      type="button"
                      onClick={() => {
                        setNewTaskTitle('Позвонить завтра');
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        setNewTaskDueDate(d);
                      }}
                      className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20"
                    >
                      Позвонить завтра
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewTaskTitle('Отправить прайс');
                        setNewTaskDueDate(new Date());
                      }}
                      className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20"
                    >
                      Отправить прайс
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewTaskTitle('Договориться о пробной тренировке');
                        setNewTaskDueDate(new Date());
                      }}
                      className="px-2 py-1 bg-white/10 rounded-lg hover:bg-white/20"
                    >
                      Пробная тренировка
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Добавить задачу..."
                    className="flex-1 bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm"
                  />
                  <div className="relative">
                    <CustomDatePicker
                      selected={newTaskDueDate}
                      onChange={(date) => setNewTaskDueDate(date)}
                      className="w-40 bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500 text-sm pl-9"
                      placeholderText="Дата"
                      showTimeSelect
                      dateFormat="dd.MM.yyyy HH:mm"
                    />
                    <Calendar className="absolute left-2 top-2.5 text-gray-500 pointer-events-none" size={14} />
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newTaskTitle.trim()) {
                        toast.error('Введите текст задачи');
                        return;
                      }
                      try {
                        const payload = {
                          title: newTaskTitle.trim(),
                          due_date: newTaskDueDate ? newTaskDueDate.toISOString() : null,
                        };
                        const res = await leadsAPI.createTask(leadId, payload);
                        setTasks([...tasks, res.data]);
                        setNewTaskTitle('');
                        setNewTaskDueDate(null);
                      } catch (error) {
                        toast.error('Не удалось добавить задачу');
                      }
                    }}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
                  >
                    Добавить
                  </button>
                </div>

                <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                  {tasks.length === 0 ? (
                    <div className="text-xs text-gray-500">
                      Пока нет задач. Добавьте первое действие по лиду.
                    </div>
                  ) : (
                    tasks.map((task) => (
                      <label
                        key={task.id}
                        className="flex items-center gap-2 text-sm bg-[#1C1E24] border border-white/5 rounded-lg px-3 py-1.5"
                      >
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={async (e) => {
                            const next = e.target.checked;
                            try {
                              const res = await leadsAPI.updateTask(leadId, task.id, { completed: next });
                              setTasks(tasks.map((t) => (t.id === task.id ? res.data : t)));
                            } catch (error) {
                              toast.error('Не удалось обновить задачу');
                            }
                          }}
                          className="form-checkbox h-4 w-4 text-blue-500 rounded border-white/20 bg-transparent"
                        />
                        <div className="flex-1 min-w-0">
                          <div className={`truncate ${task.completed ? 'text-gray-500 line-through' : 'text-gray-100'}`}>
                            {task.title}
                          </div>
                          {task.due_date && (
                            <div className="text-[11px] text-gray-500">
                              {new Date(task.due_date).toLocaleString([], { hour12: false })}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await leadsAPI.deleteTask(leadId, task.id);
                              setTasks(tasks.filter((t) => t.id !== task.id));
                            } catch (error) {
                              toast.error('Не удалось удалить задачу');
                            }
                          }}
                          className="text-xs text-gray-500 hover:text-red-400"
                        >
                          ×
                        </button>
                      </label>
                    ))
                  )}
                </div>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                    <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider">Скрипт звонка</h3>
                    <p className="text-sm text-gray-300">
                      Используйте эти пункты как ориентир во время разговора, адаптируя под конкретную семью.
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-sm text-gray-100">
                      {callChecklist.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </div>

                  <div className="bg-white/5 p-4 rounded-xl border border-white/5 space-y-3">
                    <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider">Шаблоны сообщений</h3>
                    <p className="text-xs text-gray-400">
                      Подставьте имена, даты и адрес. Нажмите «Скопировать текст» и вставьте в мессенджер.
                    </p>
                    <div className="space-y-3">
                      {templatesLoading && (
                        <div className="text-xs text-gray-500">Загрузка шаблонов...</div>
                      )}
                      {messageTemplates.map((tpl) => (
                        <div
                          key={tpl.key}
                          className="border border-white/10 rounded-xl px-3 py-2 bg-[#171820]"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="text-sm font-semibold text-white">{tpl.title}</div>
                            <button
                              type="button"
                              onClick={() => handleCopy(tpl.body, tpl.title)}
                              className="px-2 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-500 text-white"
                            >
                              Скопировать текст
                            </button>
                          </div>
                          <div className="text-xs text-gray-200 whitespace-pre-line">
                            {tpl.body}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex justify-end gap-3 bg-[#1C1E24] rounded-none md:rounded-b-2xl shrink-0 pb-28 md:pb-5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
          >
            Отмена
          </button>
          {activeTab === 'details' ? (
            <button
              type="submit"
              form="lead-form"
              disabled={saving || loading}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold shadow-lg shadow-blue-500/25 transition-all duration-200 flex items-center gap-2"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              Сохранить
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
