import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import api from '../api/client';
import notificationSound from '../utils/notificationSound';
import { ChevronLeft, FileText } from 'lucide-react';
import PlayerCard from '../components/PlayerCard';
import FreezeRequestModal from '../components/FreezeRequestModal';

// ==================== EXTERNAL COMPONENTS ====================
const NewPostModal = ({ isOpen, onClose, groups, onCreated }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ title: '', content: '', post_type: 'news', group_id: '', is_pinned: false });
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!formData.content.trim()) return;
    setSaving(true);
    try {
      const data = {
        ...formData,
        group_id: (formData.group_id && formData.group_id !== '') ? parseInt(formData.group_id) : null
      };
      await api.posts.create(data);
      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create post:', err);
      const errorMsg = err.response?.data?.detail || err.message || t('error_creating_post');
      // Only alert if it's not a 401 (which is handled by interceptor)
      if (err.response?.status !== 401) {
        alert(errorMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#23272E] border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-4 shrink-0">
          <h2 className="text-xl font-bold text-white">{t('new_post')}</h2>
        </div>
        
        <div className="p-6 py-0 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('post_type')}</label>
            <select
              value={formData.post_type}
              onChange={(e) => setFormData({ ...formData, post_type: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 bg-[#2D323B] text-white border-gray-600 focus:ring-2 focus:ring-green-500 focus:outline-none"
              style={{ color: 'white', backgroundColor: '#2D323B' }}
            >
              <option value="news" style={{ backgroundColor: '#2D323B' }}>📰 {t('news')}</option>
              <option value="announcement" style={{ backgroundColor: '#2D323B' }}>📢 {t('announcement')}</option>
              <option value="schedule" style={{ backgroundColor: '#2D323B' }}>📅 {t('schedule')}</option>
              <option value="match_report" style={{ backgroundColor: '#2D323B' }}>⚽ {t('match_report')}</option>
              <option value="event" style={{ backgroundColor: '#2D323B' }}>🏆 {t('event')}</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('group_optional')}</label>
            <select
              value={formData.group_id}
              onChange={(e) => setFormData({ ...formData, group_id: e.target.value })}
              className="w-full border rounded px-3 py-2 bg-[#2D323B] text-white border-gray-700 focus:ring-2 focus:ring-green-500"
              style={{ color: 'white', backgroundColor: '#2D323B' }}
            >
              <option value="" style={{ backgroundColor: '#2D323B' }}>{t('for_all_academy')}</option>
              {groups.map(g => (
                <option key={g.id} value={g.id} style={{ backgroundColor: '#2D323B' }}>{g.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('title_optional')}</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border rounded px-3 py-2 bg-[#2D323B] text-white border-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ color: 'white', backgroundColor: '#2D323B' }}
              placeholder={t('optional')}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('text_required')}</label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              className="w-full border rounded px-3 py-2 h-32 bg-[#2D323B] text-white border-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              style={{ color: 'white', backgroundColor: '#2D323B' }}
              placeholder={t('post_content_placeholder')}
              required
            />
          </div>
        </div>
        
        <div className="p-6 pt-4 shrink-0 flex justify-end space-x-2 bg-[#23272E]">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 border border-gray-600 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-50 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleCreate}
              disabled={saving}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg disabled:opacity-50 transition-all shadow-lg shadow-green-900/20"
            >
              {saving ? '...' : t('publish')}
            </button>
        </div>
      </div>
    </div>
  );
  };

const NewPollModal = ({ isOpen, onClose, groupId, onCreated }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ question: '', options: ['', ''] });
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!formData.question.trim() || formData.options.filter(o => o.trim()).length < 2) return;
    setSaving(true);
    try {
      const data = {
        question: formData.question,
        options: formData.options.filter(o => o.trim()),
        group_id: (groupId && groupId !== '') ? parseInt(groupId) : null
      };
      await api.polls.create(data);
      onCreated();
      onClose();
    } catch {
      alert(t('error_creating_poll'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#23272E] border border-gray-700 rounded-lg w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
        <div className="p-6 pb-4 shrink-0">
          <h2 className="text-xl font-bold text-white">📊 {t('create_poll')}</h2>
        </div>
        
        <div className="p-6 py-0 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('question_required')}</label>
            <input
              type="text"
              value={formData.question}
              onChange={(e) => setFormData({ ...formData, question: e.target.value })}
              className="w-full border rounded px-3 py-2 bg-[#2D323B] text-white border-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
              style={{ color: 'white', backgroundColor: '#2D323B' }}
              placeholder={t('poll_question_placeholder')}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">{t('options_required')}</label>
            <div className="space-y-2">
              {formData.options.map((opt, idx) => (
                <div key={idx} className="flex space-x-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const newOptions = [...formData.options];
                      newOptions[idx] = e.target.value;
                      setFormData({ ...formData, options: newOptions });
                    }}
                    className="flex-1 border rounded px-3 py-2 bg-[#2D323B] text-white border-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                    style={{ color: 'white', backgroundColor: '#2D323B' }}
                    placeholder={`${t('option_placeholder')} ${idx + 1}`}
                  />
                  {formData.options.length > 2 && (
                    <button
                      onClick={() => setFormData({ ...formData, options: formData.options.filter((_, i) => i !== idx) })}
                      className="text-red-500 hover:text-red-400 p-1"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setFormData({ ...formData, options: [...formData.options, ''] })}
              className="text-green-500 text-sm hover:underline mt-2 font-medium"
            >
              + {t('add_option')}
            </button>
          </div>
        </div>
        
        <div className="p-6 pt-4 shrink-0 flex justify-end space-x-2 bg-[#23272E]">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 border border-gray-700 rounded text-gray-400 hover:bg-gray-800 disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '...' : t('create_poll')}
          </button>
        </div>
      </div>
    </div>
  );
};

const MessageInput = ({ onSend, placeholder }) => {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setText('');
    } catch {
      return;
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-3 border-t border-gray-700 bg-[#23272E] flex space-x-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
        placeholder={placeholder || t('type_message')}
        disabled={sending}
        className="flex-1 border rounded px-3 py-2 bg-[#2D323B] text-white border-gray-700 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        style={{ color: 'white', backgroundColor: '#2D323B' }}
      />
      <button
        onClick={handleSend}
        disabled={sending}
        className="bg-green-600 text-white px-3 py-2 md:px-4 md:py-2 rounded hover:bg-green-700 disabled:opacity-50 transition-colors shadow-lg shadow-green-900/20 shrink-0"
      >
        {sending ? (
          <span className="animate-spin">⏳</span>
        ) : (
          <>
            <span className="md:hidden">➤</span>
            <span className="hidden md:inline">{t('send')}</span>
          </>
        )}
      </button>
    </div>
  );
};

const DirectChatModal = ({ recipient, isOpen, onClose, currentUser }) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!recipient) return;
    setLoading(true);
    try {
      const res = await api.messages.getDirectMessages(recipient.id);
      setMessages(res.data || []);
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Failed to load direct messages:', err);
    } finally {
      setLoading(false);
    }
  }, [recipient, scrollToBottom]);



  useEffect(() => {
    if (isOpen && recipient) {
      loadMessages();
    }
  }, [isOpen, recipient, loadMessages]);

  const handleSend = async (text) => {
    if (!text.trim() || !recipient) return;
    try {
      const res = await api.messages.sendDirectMessage(recipient.id, text.trim());
      const newMsg = res.data || res;
      setMessages(prev => [...prev, newMsg]);
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Failed to send direct message:', err);
      alert(t('error_sending_message'));
    }
  };

  if (!isOpen || !recipient) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[#23272E] border border-gray-700 rounded-lg w-full max-w-2xl h-[600px] max-h-[90vh] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-[#1C2127] rounded-t-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
              {recipient.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <div className="font-bold text-white">{recipient.name}</div>
              <div className="text-xs text-gray-400">{t('private_chat')}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl px-2">
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#1C2127]" style={{ display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">{t('loading')}</div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">{t('no_messages')}</div>
          ) : (
            <div style={{ marginTop: 'auto' }}>
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender_id === currentUser?.id ? 'justify-end' : 'justify-start'} mb-3`}>
                  <div className={`max-w-[80%] px-4 py-2 rounded-lg ${msg.sender_id === currentUser?.id ? 'bg-blue-600 text-white' : 'bg-[#2D323B] text-gray-200 border border-gray-700'}`}>
                    <div>{msg.content}</div>
                    <div className="text-xs opacity-50 mt-1 text-right">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', hour12: false })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <MessageInput onSend={handleSend} placeholder={t('type_message')} />
      </div>
    </div>
  );
};

const BulkSMSSection = ({ students, groups, debtors, api, t }) => {
  const [mailingData, setMailingData] = useState({
    message: '',
    targetType: 'all', // all, groups, debtors, custom
    selectedGroupIds: [],
    selectedStudentIds: [],
  });
  const [isSending, setIsSending] = useState(false);

  const recipientsCount = useMemo(() => {
    const { targetType, selectedGroupIds, selectedStudentIds } = mailingData;
    switch (targetType) {
      case 'all':
        return students.filter(s => s.status === 'active').length;
      case 'groups': {
        const groupIds = new Set(selectedGroupIds.map(Number));
        return students.filter(s => s.status === 'active' && groupIds.has(Number(s.group_id))).length;
      }
      case 'debtors':
        return debtors.length;
      case 'custom':
        return selectedStudentIds.length;
      default:
        return 0;
    }
  }, [students, debtors, mailingData.targetType, mailingData.selectedGroupIds, mailingData.selectedStudentIds]);

  const canSend = !isSending && recipientsCount > 0 && mailingData.message.trim().length >= 3;

  const handleSendBulkSMS = async () => {
    if (mailingData.message.trim().length < 3) {
      alert(`${t('message_too_short')} (${t('min_3_chars')})`);
      return;
    }

    if (recipientsCount === 0) {
      alert(t('no_recipients'));
      return;
    }

    if (!window.confirm(t('confirm_send_bulk').replace('{count}', recipientsCount))) return;

    setIsSending(true);
    try {
      const requestData = {
        message: mailingData.message.trim(),
        all_students: mailingData.targetType === 'all',
        debtors_only: mailingData.targetType === 'debtors',
      };
      
      if (mailingData.targetType === 'groups' && mailingData.selectedGroupIds.length > 0) {
        requestData.group_ids = mailingData.selectedGroupIds.map(id => parseInt(id));
      }
      
      if (mailingData.targetType === 'custom' && mailingData.selectedStudentIds.length > 0) {
        requestData.student_ids = mailingData.selectedStudentIds.map(id => parseInt(id));
      }
      
      console.log('📤 Sending bulk SMS:', requestData);
      const response = await api.messages.sendBulkSMS(requestData);
      console.log('✅ SMS response:', response.data);
      
      alert(t('bulk_sms_sent_success').replace('{count}', response.data?.sent || recipientsCount));
      setMailingData({ ...mailingData, message: '', selectedGroupIds: [], selectedStudentIds: [], targetType: 'all' });
    } catch (err) {
      console.error('❌ SMS error:', err);
      const errorMsg = err.response?.data?.detail || err.message || t('unknown_error');
      alert(t('send_error_prefix') + errorMsg);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6" id="mailings-content">
      <div className="bg-[#23272E] p-6 landscape:p-4 rounded-xl border border-gray-700 shadow-xl landscape:shadow-lg">
        <h2 className="text-xl font-bold mb-4 landscape:mb-3 text-white flex items-center gap-2">
          <span>✉️ {t('bulk_sms_title')}</span>
        </h2>

        {/* Target Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-400 mb-3">{t('send_to_label')}</label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'all', label: `👥 ${t('recipients_all')}`, count: students.filter(s => s.status === 'active').length },
              { id: 'groups', label: `📚 ${t('recipients_groups')}`, count: null },
              { id: 'debtors', label: `⚠️ ${t('recipients_debtors')}`, count: debtors.length },
              { id: 'custom', label: `✏️ ${t('recipients_custom')}`, count: null }
            ].map(target => (
              <button
                key={target.id}
                onClick={() => setMailingData({ ...mailingData, targetType: target.id })}
                className={`px-4 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                  mailingData.targetType === target.id
                    ? 'bg-yellow-500/20 border-yellow-500 text-yellow-500 font-bold'
                    : 'bg-[#2D323B] border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                {target.label}
                {target.count !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    mailingData.targetType === target.id ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {target.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Group Selection */}
        {mailingData.targetType === 'groups' && (
          <div className="mb-6 p-4 bg-[#1C2127] rounded-xl border border-gray-700">
            <label className="block text-sm font-medium text-gray-400 mb-3">{t('select_groups_label')}</label>
            <div className="flex flex-wrap gap-2">
              {groups.map(g => {
                const isSelected = mailingData.selectedGroupIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => {
                      const newGroups = isSelected
                        ? mailingData.selectedGroupIds.filter(id => id !== g.id)
                        : [...mailingData.selectedGroupIds, g.id];
                      setMailingData({ ...mailingData, selectedGroupIds: newGroups });
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-[#2D323B] border-gray-600 text-gray-400'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Custom Student Selection */}
        {mailingData.targetType === 'custom' && (
          <div className="mb-6 p-4 bg-[#1C2127] rounded-xl border border-gray-700">
            <label className="block text-sm font-medium text-gray-400 mb-3">{t('select_students_label')}</label>
            <div className="max-h-48 overflow-y-auto grid grid-cols-2 gap-2">
              {students.map(s => {
                const isSelected = mailingData.selectedStudentIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      const newIds = isSelected
                        ? mailingData.selectedStudentIds.filter(id => id !== s.id)
                        : [...mailingData.selectedStudentIds, s.id];
                      setMailingData({ ...mailingData, selectedStudentIds: newIds });
                    }}
                    className={`text-left px-3 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'bg-blue-600/20 border-blue-600 text-white'
                        : 'bg-[#2D323B] border-gray-700 text-gray-400'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-500'}`}>
                      {isSelected && <span className="text-[10px] flex items-center justify-center">✓</span>}
                    </div>
                    <span className="truncate">{s.first_name} {s.last_name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Message Input */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-medium text-gray-400">{t('message_text_label')}</label>
            <span className={`text-xs ${mailingData.message.length > 160 ? 'text-orange-400' : 'text-gray-500'}`}>
              {mailingData.message.length} / 300 {mailingData.message.length > 70 ? '(~2 SMS)' : '(1 SMS)'}
            </span>
          </div>
          <textarea
            value={mailingData.message}
            onChange={(e) => setMailingData({ ...mailingData, message: e.target.value })}
            className="w-full h-32 p-4 bg-[#2D323B] text-white border border-gray-600 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:outline-none"
            style={{ color: 'white', backgroundColor: '#2D323B' }}
            placeholder={t('enter_sms_text') || "Введите текст SMS..."}
          />
          
          {/* Templates */}
          <div className="mt-3">
            <span className="text-xs text-gray-500 mr-2">{t('templates_label')}</span>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                t('reminder_training_tomorrow_text') || 'Напоминаем о тренировке завтра. Ждём вас!',
                t('training_cancelled_tech') || 'Тренировка сегодня отменена по техническим причинам.',
                t('schedule_change_reminder_text') || 'Изменение в расписании! Просим проверить личный кабинет.',
                t('payment_reminder_text') || 'Уважаемые родители, напоминаем о необходимости оплаты обучения.'
              ].map(tpl => (
                <button
                  key={tpl}
                  onClick={() => setMailingData({ ...mailingData, message: tpl })}
                  className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 px-2 py-1 rounded transition-colors"
                >
                  {tpl.substring(0, 30)}...
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recipients Info & Send Button */}
        <div className="flex items-center justify-between p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👥</span>
            <div>
              <div className="text-yellow-500 font-bold">{t('total_recipients')} {recipientsCount}</div>
              <div className="text-gray-500 text-xs">{t('will_send_sms_note')}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={handleSendBulkSMS}
              disabled={!canSend}
              className={`px-8 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 transform active:scale-95 ${
                canSend 
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black shadow-orange-500/20 hover:scale-105' 
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
              }`}
            >
              {isSending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-white mr-2"></div>
                  {t('sending_button')}
                </>
              ) : (
                <>
                  📣 {t('send_bulk_button')}
                </>
              )}
            </button>
            {!canSend && (
              <span className="text-xs text-gray-500 animate-pulse">
                {recipientsCount === 0 ? t('select_recipients_hint') || 'Выберите получателей' : 
                 mailingData.message.trim().length === 0 ? t('enter_message_hint') || 'Введите текст сообщения' : 
                 mailingData.message.trim().length < 3 ? t('min_3_chars') : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function Communications() {
  const { user } = useAuth();
  const { t } = useLanguage();
  
  useEffect(() => {
    console.log("DEBUG: Communications component mounted - Version 2.2");
  }, []);
  const [activeTab, setActiveTab] = useState('feed'); // feed, teamChats, mailings, support
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [students, setStudents] = useState([]);
  const [debtors, setDebtors] = useState([]);

  // Feed state
  const [posts, setPosts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('');
  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const feedLimit = 10;

  // Modal state moved to components
  const [showNewPostModal, setShowNewPostModal] = useState(false);
  
  // Polls state moved to components
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollGroupId, setPollGroupId] = useState('');
  
  // Direct Chat
  const [directChatUser, setDirectChatUser] = useState(null);
  
  // Team Chats state
  const [teamChats, setTeamChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const messagesEndRef = useRef(null);
  
  // Support chats (for admin)
  const [supportChats, setSupportChats] = useState([]);
  const [selectedSupportChat, setSelectedSupportChat] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [, setUsers] = useState([]);
  
  // Notifications state (НОВОЕ)
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [unreadCounts, setUnreadCounts] = useState({ group_chat: 0, support: 0, feed: 0 });
  
  // Sound & Auto-refresh state
  const [soundEnabled, setSoundEnabled] = useState(notificationSound.enabled);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const autoRefreshIntervalRef = useRef(null);
  const lastMessageCountRef = useRef(0);
  const lastFreezeRequestCountRef = useRef(0);
  const lastAbsenceRequestCountRef = useRef(0);
  const lastChatIdRef = useRef(null);
  const lastSupportMessageCountRef = useRef(0);
  const lastSupportIdRef = useRef(null);
  const isFirstLoadRef = useRef(true);

  // Absence Requests state
  const [absenceRequests, setAbsenceRequests] = useState([]);
  const [pendingAbsenceCount, setPendingAbsenceCount] = useState(0);
  const [absenceStatusFilter, setAbsenceStatusFilter] = useState('all'); // all, pending, approved, rejected

  // Freeze Requests state
  const [freezeRequests, setFreezeRequests] = useState([]);
  const [freezeStatusFilter, setFreezeStatusFilter] = useState('all'); // Default to 'all' to match Absence Requests
  const [selectedStudentId, setSelectedStudentId] = useState(null);

  const birthdayStudents = useMemo(() => {
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();
    return students.filter(s => {
      if (!s.birthday) return false;
      const bday = new Date(s.birthday);
      return bday.getMonth() === todayMonth && bday.getDate() === todayDate;
    });
  }, [students]);

  const isAdmin = user?.role && ['super_admin', 'admin', 'owner'].includes(user.role.toLowerCase());
  const isCoach = user?.role?.toLowerCase() === 'coach';
  const isParent = user?.role?.toLowerCase() === 'parent';

  useEffect(() => {
    // Handle URL parameters for tab selection
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    } else if (isCoach) {
      setActiveTab('absence');
    }
  }, [isCoach]);

  // Функция для преобразования роли в читаемый вид
  const getRoleDisplay = (role) => {
    const roleMap = {
      'super_admin': t('role_owner_emoji'),
      'owner': t('role_owner_emoji'),
      'admin': t('role_admin_emoji'),
      'coach': t('role_coach_emoji'),
      'parent': t('role_parent_emoji')
    };
    return roleMap[role?.toLowerCase()] || t('user_role');
  };

  // Цвет для роли
  const getRoleColor = (role) => {
    const colorMap = {
      'super_admin': 'text-yellow-400',
      'owner': 'text-yellow-400',
      'admin': 'text-blue-400',
      'coach': 'text-green-400',
      'parent': 'text-purple-400'
    };
    return colorMap[role?.toLowerCase()] || 'text-gray-400';
  };

  const loadUnreadCounts = useCallback(async () => {
    try {
      const res = await api.messages.getTotalUnreadCount();
      const data = res.data || {};
      setUnreadCounts({
        group_chat: data.group_chat || 0,
        support: data.support || 0,
        feed: data.feed || 0
      });
    } catch (err) {
      console.error('Failed to load unread counts:', err);
    }
  }, []);

  const loadFreezeRequests = useCallback(async () => {
    setLoading(true);
    try {
      const status = freezeStatusFilter === 'all' ? null : freezeStatusFilter;
      let res;
      if (isAdmin) {
        res = await api.students.getAllFreezeRequests(status);
      } else if (isParent) {
        res = await api.students.getMyFreezeRequests(status);
      } else {
        setFreezeRequests([]);
        return;
      }
      const raw = res.data;
      const data = Array.isArray(raw?.data)
        ? raw.data
        : (Array.isArray(raw) ? raw : []);
      setFreezeRequests(data);
      if (freezeStatusFilter === 'pending') {
          lastFreezeRequestCountRef.current = data.length;
      }
    } catch (err) {
      console.error('Failed to load freeze requests:', err);
    } finally {
      setLoading(false);
    }
  }, [freezeStatusFilter, isAdmin, isParent]);

  const handleApproveFreeze = async (studentId, requestId) => {
    if (!window.confirm(t('confirm_approve_freeze'))) return;
    try {
      await api.students.approveFreeze(studentId, requestId);
      loadFreezeRequests(); // Refresh list
      notificationSound.playNotification('success');
    } catch {
      alert(t('error_approving_freeze'));
    }
  };

  const handleRejectFreeze = async (studentId, requestId) => {
    if (!window.confirm(t('confirm_reject_freeze'))) return;
    try {
      await api.students.rejectFreeze(studentId, requestId);
      loadFreezeRequests(); // Refresh list
    } catch {
      alert(t('error_rejecting_freeze'));
    }
  };

  const handleAdminUploadFreezeFile = async (event, requestId) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await api.fileUpload.uploadMedicalDoc(formData);
      const fileUrl = uploadRes.url || uploadRes.data?.url || uploadRes;
      await api.students.updateFreezeFile(requestId, fileUrl);
      await loadFreezeRequests();
    } catch (err) {
      console.error('Failed to update freeze request file:', err);
      alert(t('upload_error') || 'Ошибка загрузки файла');
    } finally {
      event.target.value = '';
      setLoading(false);
    }
  };

  const loadAbsenceRequests = useCallback(async () => {
    setLoading(true);
    try {
      const status = absenceStatusFilter === 'all' ? null : absenceStatusFilter;
      const res = await api.parent.getAllAbsenceRequests(status);
      let requests = res.data || [];
      if (isCoach) {
        let coachGroups = groups;
        if (coachGroups.length === 0) {
           try {
             const groupsRes = await api.messages.getGroups();
             coachGroups = groupsRes.data?.data || groupsRes.data || [];
             if (Array.isArray(coachGroups)) {
                setGroups(coachGroups);
             } else {
                coachGroups = [];
             }
           } catch (e) {
             console.error("Error fetching groups for filtering:", e);
             coachGroups = [];
           }
        }
        if (coachGroups.length > 0) {
            const coachGroupIds = coachGroups.map(g => g.id);
            requests = requests.filter(req => coachGroupIds.includes(req.group_id));
        } else {
            requests = [];
        }
      }

      setAbsenceRequests(requests);
    } catch (err) {
      console.error('Failed to load absence requests:', err);
    } finally {
      setLoading(false);
    }
  }, [absenceStatusFilter, isCoach, groups]);

  const handleApproveAbsence = async (id) => {
    if (!window.confirm(t('confirm_approve_absence'))) return;
    try {
      await api.parent.approveAbsenceRequest(id);
      loadAbsenceRequests(); // Refresh list
    } catch {
      alert(t('error_approving_absence'));
    }
  };

  const handleRejectAbsence = async (id) => {
    if (!window.confirm(t('confirm_reject_absence'))) return;
    try {
      await api.parent.rejectAbsenceRequest(id);
      loadAbsenceRequests(); // Refresh list
    } catch {
      alert(t('error_rejecting_absence'));
    }
  };

  const loadMailingData = useCallback(async () => {
    setLoading(true);
    try {
      const [groupsRes, studentsRes] = await Promise.all([
        api.groups.getAll(),
        api.students.getAll()
      ]);
      const groupsData = groupsRes.data?.data || groupsRes.data || [];
      const studentsData = studentsRes.data?.data || studentsRes.data || [];
      setGroups(groupsData);
      setStudents(studentsData);
      setDebtors(studentsData.filter(s => s.is_debtor === true || (s.balance !== undefined && s.balance <= 0)));
    } catch (err) {
      console.error('Failed to load mailing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);



  const chatContainerRef = useRef(null);
  const isChatInitialLoad = useRef(true);

  const scrollToBottom = useCallback((force = false) => {
    const container = chatContainerRef.current;
    if (container) {
      if (force) {
        container.scrollTop = container.scrollHeight;
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
      if (isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    } else {
      // Fallback only if container ref is missing but element ref exists
      // Use block: 'nearest' to avoid scrolling the whole page
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, []);

  const loadChatMessages = useCallback(async (groupId) => {
    try {
      const res = await api.messages.getGroupMessages(groupId);
      setChatMessages(res.data.data || res.data || []);
      
      // Mark as read when loading messages
      try {
        await api.messages.markGroupChatRead(groupId);
        await loadUnreadCounts();
      } catch (e) {
        console.error("Failed to mark chat as read", e);
      }

      // Force scroll on manual load
      setTimeout(() => scrollToBottom(true), 100);
    } catch (err) {
      console.error('Failed to load chat messages:', err);
    }
  }, [scrollToBottom, loadUnreadCounts]);

  useEffect(() => {
    if (isChatInitialLoad.current) {
        scrollToBottom(true);
        if (chatMessages.length > 0) isChatInitialLoad.current = false;
    } else {
        scrollToBottom(false);
    }
  }, [chatMessages, supportMessages, scrollToBottom]);

  useEffect(() => {
    if (selectedChat || selectedSupportChat) {
      isChatInitialLoad.current = true;
      setTimeout(() => scrollToBottom(true), 100);
    }
  }, [selectedChat, selectedSupportChat, scrollToBottom]);

  const loadGroups = useCallback(async () => {
    try {
      // Используем messages/groups - он фильтрует группы по роли пользователя
      const res = await api.messages.getGroups();
      const data = res.data?.data || res.data;
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load groups:', err);
      setGroups([]);
    }
  }, []);

  const loadPosts = useCallback(async (pageNum = 1) => {
    // Removed loading check to prevent dependency loop
    setLoading(true);
    try {
      const params = selectedGroupFilter ? { group_id: selectedGroupFilter } : {};
      params.limit = 10;
      params.skip = (pageNum - 1) * 10;

      const res = await api.posts.getAll(params);
      const newPosts = res.data || [];
      
      if (pageNum === 1) {
        setPosts(newPosts);
      } else {
        setPosts(prev => [...prev, ...newPosts]);
      }
      setFeedHasMore(newPosts.length === 10);
      setFeedPage(pageNum);
      setError('');
    } catch (err) {
      console.error('Failed to load posts:', err);
      const errorDetail = err.response?.data?.detail || err.message;
      setError(`${t('comm_feed_error')} (${errorDetail})`);
    } finally {
      setLoading(false);
    }
  }, [selectedGroupFilter, t]);

  const loadTeamChats = useCallback(() => {
    setTeamChats(groups);
  }, [groups]);



  const loadSupportData = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const chatsRes = await api.messages.getSupportChats();
        const rawChats = chatsRes.data || [];
        const mappedChats = rawChats.map((item) => {
          const userInfo = item.user || {};
          return {
            id: userInfo.id,
            user_id: userInfo.id,
            user_name: userInfo.full_name || `ID ${userInfo.id}`,
            user_role: userInfo.role,
            unread_count: item.unread_count ?? 0,
            last_message_at: item.last_message_at || null,
          };
        });
        setSupportChats(mappedChats);
      } else {
        const messagesRes = await api.messages.getSupport();
        const allMessages = messagesRes.data || [];
        const supportMsgs = allMessages.filter(m => m.chat_type?.toLowerCase() !== 'system');
        setSupportMessages(supportMsgs);
        const usersRes = await api.auth.getUsers();
        setUsers((usersRes.data.data || usersRes.data || []).filter(
          u => u.id !== user?.id && ['super_admin', 'admin', 'owner'].includes(u.role?.toLowerCase())
        ));
      }
    } catch (err) {
      console.error('Failed to load support data:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id]);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🔄 Loading notifications...');
      const [notifRes, unreadRes] = await Promise.all([
        api.messages.getNotifications(),
        api.messages.getUnreadNotificationsCount()
      ]);
      console.log('✅ Notifications loaded:', notifRes.data);
      const notificationsData = Array.isArray(notifRes.data?.data)
        ? notifRes.data.data
        : (Array.isArray(notifRes.data) ? notifRes.data : []);
      setNotifications(notificationsData);
      const unreadCount = unreadRes.data?.unread_count || 0;
      setUnreadNotificationsCount(unreadCount);

      if (unreadCount > 0) {
        try {
          await api.messages.markAllAsRead();
          setUnreadNotificationsCount(0);
          await loadUnreadCounts();
        } catch (e) {
          console.error("Failed to mark notifications as read", e);
        }
      }
    } catch (err) {
      console.error('❌ Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [loadUnreadCounts]);



  const loadSupportMessages = useCallback(async (userId) => {
    try {
      const res = await api.messages.getSupportChatWith(userId);
      setSupportMessages(res.data || []);
      setTimeout(scrollToBottom, 100);
      await loadUnreadCounts();
    } catch (err) {
      console.error('Failed to load support messages:', err);
    }
  }, [scrollToBottom, loadUnreadCounts]);

  useEffect(() => {
    if (selectedChat) loadChatMessages(selectedChat.id);
  }, [selectedChat, loadChatMessages]);

  useEffect(() => {
    if (selectedSupportChat) loadSupportMessages(selectedSupportChat.id);
  }, [selectedSupportChat, loadSupportMessages]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // Auto-select group for parents with single group
  useEffect(() => {
    if (isParent && groups.length === 1) {
      if (activeTab === 'feed' && !selectedGroupFilter) {
        setSelectedGroupFilter(groups[0].id);
      }
      if (activeTab === 'teamChats' && !selectedChat) {
        setSelectedChat(groups[0]);
      }
    }
  }, [isParent, groups, activeTab, selectedGroupFilter, selectedChat]);

  useEffect(() => {
    if (activeTab === 'feed') loadPosts();
    if (activeTab === 'teamChats') loadTeamChats();
    if (activeTab === 'mailings') loadMailingData();
    if (activeTab === 'support') loadSupportData();
    if (activeTab === 'notifications') {
      loadNotifications();
      if (isParent) {
        loadAbsenceRequests();
        loadFreezeRequests();
      }
    }
    if (activeTab === 'absence') loadAbsenceRequests();
    if (activeTab === 'freeze') loadFreezeRequests();
    
    // Always load unread counts to keep tabs updated
    loadUnreadCounts();
  }, [
    activeTab,
    selectedGroupFilter,
    absenceStatusFilter,
    freezeStatusFilter,
    isParent,
    loadPosts,
    loadTeamChats,
    loadMailingData,
    loadSupportData,
    loadNotifications,
    loadAbsenceRequests,
    loadFreezeRequests,
    loadUnreadCounts
  ]);

  useEffect(() => {
    loadUnreadCounts();
  }, [loadUnreadCounts]);

  // Special Effect: Auto-select chat when entering teamChats tab for parents with 1 group
  useEffect(() => {
    if (activeTab === 'teamChats' && isParent && teamChats.length === 1 && !selectedChat) {
      setSelectedChat(teamChats[0]);
    }
  }, [activeTab, isParent, teamChats, selectedChat]);



  // ==================== SOUND & AUTO-REFRESH ====================
  const toggleSound = useCallback(() => {
    const newState = notificationSound.toggle();
    setSoundEnabled(newState);
    if (newState) {
      notificationSound.playNotification('success');
    }
  }, []);

  // Check for new messages with sound notification
  const checkForNewMessages = useCallback(async () => {
    if (!autoRefresh) return;
    
    try {
      // Update unread counts for tabs
      await loadUnreadCounts();

      const unreadRes = await api.messages.getUnreadNotificationsCount();
      const newUnreadCount = unreadRes.data?.unread_count || 0;
      
      if (!isFirstLoadRef.current && newUnreadCount > unreadNotificationsCount && unreadNotificationsCount > 0) {
        console.log('🔔 New notification detected!', newUnreadCount);
        notificationSound.playNotification('message');
        
        // Show browser notification
        notificationSound.showNotification(
          t('new_notification_title'),
          t('new_notification_body'),
          { type: 'message' }
        );
      }
      
      setUnreadNotificationsCount(newUnreadCount);
      
      if (selectedChat && activeTab === 'teamChats') {
        const res = await api.messages.getGroupMessages(selectedChat.id);
        const newMessages = res.data.data || res.data || [];
        
        if (!isFirstLoadRef.current && newMessages.length > lastMessageCountRef.current && lastMessageCountRef.current > 0) {
          const latestMsg = newMessages[newMessages.length - 1];
          if (latestMsg && latestMsg.sender_id !== user?.id) {
            console.log('🔔 New chat message!');
            notificationSound.playNotification('message');
          }
        }
        
        const lengthChanged = newMessages.length !== lastMessageCountRef.current;
        const lastMsgId = newMessages.length > 0 ? newMessages[newMessages.length - 1].id : null;
        const idChanged = lastMsgId !== lastChatIdRef.current;

        if (lengthChanged || idChanged) {
            setChatMessages(newMessages);
            lastChatIdRef.current = lastMsgId;
            
            // Mark as read if we are looking at the chat and there are new messages
            try {
                await api.messages.markGroupChatRead(selectedChat.id);
            } catch (e) { console.error("Failed to mark read in polling", e); }
        }
        
        lastMessageCountRef.current = newMessages.length;
      }
      
      if (activeTab === 'support' && (selectedSupportChat || !isAdmin)) {
        let newMsgs = [];
        if (isAdmin && selectedSupportChat) {
          const res = await api.messages.getSupportChatWith(selectedSupportChat.user_id);
          newMsgs = res.data || [];
        } else if (!isAdmin) {
          const res = await api.messages.getSupport();
          newMsgs = res.data || [];
        }

        if (newMsgs.length > 0) {
           if (!isFirstLoadRef.current && newMsgs.length > lastSupportMessageCountRef.current && lastSupportMessageCountRef.current > 0) {
             const latestMsg = newMsgs[newMsgs.length - 1];
             if (latestMsg && latestMsg.sender_id !== user?.id) {
               notificationSound.playNotification('message');
             }
           }
        }

        const lengthChanged = newMsgs.length !== lastSupportMessageCountRef.current;
        const lastMsgId = newMsgs.length > 0 ? newMsgs[newMsgs.length - 1].id : null;
        const idChanged = lastMsgId !== lastSupportIdRef.current;

        if (lengthChanged || idChanged) {
            setSupportMessages(newMsgs);
            lastSupportIdRef.current = lastMsgId;
        }
        lastSupportMessageCountRef.current = newMsgs.length;
      }

      if (isAdmin) {
        try {
          const res = await api.students.getPendingFreezeRequests();
          const currentFreezeRequests = res.data || [];
          const count = currentFreezeRequests.length;

          if (!isFirstLoadRef.current && count > lastFreezeRequestCountRef.current) {
             console.log('❄️ New freeze request detected!');
             notificationSound.playNotification('message'); // Or a specific sound if available
             notificationSound.showNotification(
                t('new_freeze_request_title'),
                t('new_freeze_request_body'),
                { type: 'message' }
             );
          }
          
          lastFreezeRequestCountRef.current = count;
          setFreezeRequests(currentFreezeRequests);
        } catch (err) {
          console.error('Failed to check freeze requests:', err);
        }
      }

      if (isAdmin || isCoach) {
        try {
          const res = await api.parent.getAllAbsenceRequests('pending');
          const currentRequests = res.data || [];
          const count = currentRequests.length;
          setPendingAbsenceCount(count);

          if (!isFirstLoadRef.current && count > lastAbsenceRequestCountRef.current) {
             console.log('📅 New absence request detected!');
             notificationSound.playNotification('message');
             notificationSound.showNotification(
                t('new_absence_request_title'),
                t('new_absence_request_body'),
                { type: 'message' }
             );
          }
          lastAbsenceRequestCountRef.current = count;
        } catch (err) {
          console.error('Failed to check absence requests:', err);
        }
      }

      if (isFirstLoadRef.current) {
        isFirstLoadRef.current = false;
      }

    } catch (err) {
      console.error('Auto-refresh check failed:', err);
    }
  }, [
    loadUnreadCounts,
    autoRefresh,
    selectedChat,
    selectedSupportChat,
    activeTab,
    isAdmin,
    isCoach,
    user?.id,
    unreadNotificationsCount,
    supportMessages.length,
    t
  ]);

  // Setup auto-refresh interval with ref to prevent resetting
  const checkForNewMessagesRef = useRef(checkForNewMessages);
  useEffect(() => {
    checkForNewMessagesRef.current = checkForNewMessages;
  }, [checkForNewMessages]);

  useEffect(() => {
    if (autoRefresh) {
      // Initial check
      checkForNewMessagesRef.current();
      
      // Set interval (30 seconds to reduce server load)
      const id = setInterval(() => checkForNewMessagesRef.current(), 30000);
      autoRefreshIntervalRef.current = id;
      
      return () => clearInterval(id);
    }
  }, [autoRefresh]);

  // Request notification permission on mount
  useEffect(() => {
    notificationSound.requestPermission();
  }, []);

  const handleLikePost = async (postId) => {
    try {
      const res = await api.posts.like(postId);
      setPosts(posts.map(p => p.id === postId ? { ...p, likes_count: res.data.likes_count, user_liked: res.data.liked } : p));
    } catch (err) {
      console.error('Failed to like post:', err);
    }
  };

  const handleConfirmPost = async (postId) => {
    try {
      await api.posts.confirmRead(postId);
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, user_confirmed: true, confirmations_count: (p.confirmations_count || 0) + 1 } : p));
      await loadUnreadCounts();
    } catch (err) {
      console.error('Failed to confirm post:', err);
      alert('Не удалось подтвердить прочтение');
    }
  };

  const handleDeletePost = async (postId) => {
    if (!confirm(t('delete_post_confirm'))) return;
    try {
      await api.posts.delete(postId);
      loadPosts();
    } catch {
      alert(t('delete_error'));
    }
  };

  const handleCongratulate = async (studentId, name) => {
    if (!confirm(`${t('congratulate_confirm')} ${name}?`)) return;
    try {
      await api.students.congratulate(studentId);
      alert(t('congratulation_sent'));
      notificationSound.playNotification('success');
    } catch (err) {
      console.error(err);
      alert(t('error_prefix') + (err.response?.data?.detail || err.message));
    }
  };

  // ==================== CHAT ACTIONS ====================
  const handleSendMessage = async (text) => {
    if (!text.trim() || !selectedChat) return;
    
    try {
      console.log('📤 Sending group message to:', selectedChat.id);
      await api.messages.sendGroupMessage(selectedChat.id, text.trim());
      await loadChatMessages(selectedChat.id);
      await loadUnreadCounts();
    } catch (err) {
      console.error('Failed to send message:', err);
      const errorMsg = err.response?.data?.detail || err.message || t('unknown_error');
      alert(t('send_error_prefix') + errorMsg);
      throw err;
    }
  };

  const handleSendSupportMessage = async (text) => {
    if (!text.trim()) return;
    
    try {
      if (isAdmin && selectedSupportChat) {
        // Админ отвечает пользователю
        console.log('📤 Admin replying to:', selectedSupportChat.user_id);
        await api.messages.replyToSupport(selectedSupportChat.user_id, text.trim());
        const chatRes = await api.messages.getSupportChatWith(selectedSupportChat.user_id);
        setSupportMessages(chatRes.data || []);
        await loadUnreadCounts();
      } else {
        // Тренер/родитель пишет в поддержку
        console.log('📤 Sending support message');
        await api.messages.sendSupport(text.trim());
        await loadSupportData();
        await loadUnreadCounts();
      }
    } catch (err) {
      console.error('Failed to send support message:', err);
      const errorMsg = err.response?.data?.detail || err.message || t('unknown_error');
      alert(t('send_error_prefix') + errorMsg);
      throw err;
    }
  };

  const handleVote = async (pollId, optionIndex) => {
    try {
      await api.polls.vote(pollId, optionIndex);
      if (selectedChat) loadChatMessages(selectedChat.id);
    } catch (err) {
      console.error('Failed to vote:', err);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!confirm(t('delete_message_confirm'))) return;
    try {
      await api.messages.deleteMessage(messageId);
      if (selectedChat) loadChatMessages(selectedChat.id);
    } catch (err) {
      console.error('Failed to delete message:', err);
      alert(t('delete_error'));
    }
  };

  // 🌟 HELPER FOR GROUP CHAT TITLE
  const getGroupChatTitle = () => {
    if (!selectedChat) return null;
    return (
        <div className="flex flex-col">
            <span className="font-medium text-white text-lg md:text-xl">{t('nav_communications')}</span>
             <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="text-yellow-500 font-bold">{selectedChat.name}</span>
                <span className="hidden sm:inline">• {t('group_chat_label')}</span>
             </div>
        </div>
    );
  };

  // ==================== RENDER TABS ====================
  const renderTabs = () => (
    <div className={`bg-[#13161A] -mx-4 px-4 md:mx-0 md:px-0 md:bg-transparent mb-4 transition-all pt-1 pb-1 md:pt-0 md:pb-0 landscape:pt-0 landscape:pb-0`}>
      <div className="flex flex-row overflow-x-auto md:overflow-visible landscape:overflow-x-auto bg-[#23272E] rounded-xl md:rounded-t-lg md:rounded-b-none shadow-lg md:shadow-sm border border-white/10 md:border-b md:border-x-0 md:border-t-0 no-scrollbar p-1 md:p-0 gap-0 md:gap-0 items-center landscape:justify-between landscape:px-0.5">
        {(isAdmin || isCoach) && (
          <button
            onClick={() => setActiveTab('absence')}
            className={`relative flex-none flex items-center justify-center gap-1 md:gap-1 px-2 py-1 md:px-3 md:py-3 rounded-lg md:rounded-none transition-all ${
              activeTab === 'absence' 
                ? 'bg-yellow-500 text-black md:bg-green-600/20 md:text-green-400 md:border-b-2 md:border-green-500 shadow-md md:shadow-none font-bold' 
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            <span className="text-[10px] md:text-base whitespace-nowrap">{t('absence_requests')}</span>
            {pendingAbsenceCount > 0 && (
              <span className="absolute top-1 right-1 md:static md:ml-1 bg-red-500 text-white text-[10px] md:text-xs rounded-full px-1.5 py-0.5 min-w-[16px] md:min-w-[20px] text-center flex items-center justify-center flex-shrink-0">
                {pendingAbsenceCount}
              </span>
            )}
          </button>
        )}
        <button
            onClick={() => setActiveTab('feed')}
            className={`relative flex-auto flex items-center justify-center gap-1 md:gap-1 landscape:gap-0.5 px-1 py-1 landscape:px-0.5 landscape:py-0.5 md:px-3 md:py-3 rounded-lg md:rounded-none transition-all ${
              activeTab === 'feed' 
                ? 'bg-yellow-500 text-black md:bg-green-600/20 md:text-green-400 md:border-b-2 md:border-green-500 shadow-md md:shadow-none font-bold' 
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
          <span className="text-[10px] md:text-base whitespace-nowrap">{t('feed_tab')}</span>
          {unreadCounts.feed > 0 && (
            <span className="absolute top-1 right-1 md:static md:ml-1 bg-red-500 text-white text-[10px] md:text-xs landscape:text-[5px] rounded-full px-1.5 py-0.5 landscape:px-0 landscape:py-0 min-w-[16px] md:min-w-[20px] landscape:min-w-[6px] text-center flex items-center justify-center flex-shrink-0">
              {unreadCounts.feed}
            </span>
          )}
        </button>
        <button
            onClick={() => setActiveTab('teamChats')}
            className={`relative flex-auto flex items-center justify-center gap-1 md:gap-1 landscape:gap-0.5 px-1 py-1 landscape:px-0.5 landscape:py-0.5 md:px-3 md:py-3 rounded-lg md:rounded-none transition-all ${
              activeTab === 'teamChats' 
                ? 'bg-yellow-500 text-black md:bg-green-600/20 md:text-green-400 md:border-b-2 md:border-green-500 shadow-md md:shadow-none font-bold' 
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
          <span className="text-[10px] md:text-base whitespace-nowrap">{t('group_chats_tab')}</span>
          {unreadCounts.group_chat > 0 && (
            <span className="absolute top-1 right-1 md:static md:ml-1 bg-red-500 text-white text-[10px] md:text-xs landscape:text-[5px] rounded-full px-1.5 py-0.5 landscape:px-0 landscape:py-0 min-w-[16px] md:min-w-[20px] landscape:min-w-[6px] text-center flex items-center justify-center flex-shrink-0">
              {unreadCounts.group_chat}
            </span>
          )}
        </button>
        {isAdmin && (
          <button
            onClick={() => setActiveTab('mailings')}
            className={`relative flex-auto flex items-center justify-center gap-1 md:gap-1 landscape:gap-0.5 px-1 py-1 landscape:px-0.5 landscape:py-0.5 md:px-3 md:py-3 rounded-lg md:rounded-none transition-all ${
               activeTab === 'mailings' 
                 ? 'bg-yellow-500 text-black md:bg-green-600/20 md:text-green-400 md:border-b-2 md:border-green-500 shadow-md md:shadow-none font-bold' 
                 : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
             }`}
          >
            <span className="text-[10px] md:text-base whitespace-nowrap">{t('mailings_tab')}</span>
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => setActiveTab('freeze')}
            className={`relative flex-auto flex items-center justify-center gap-1 md:gap-1 landscape:gap-0.5 px-1 py-1 landscape:px-0.5 landscape:py-0.5 md:px-3 md:py-3 rounded-lg md:rounded-none transition-all ${
               activeTab === 'freeze' 
                 ? 'bg-yellow-500 text-black md:bg-green-600/20 md:text-green-400 md:border-b-2 md:border-green-500 shadow-md md:shadow-none font-bold' 
                 : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
             }`}
          >
            <span className="text-[10px] md:text-base whitespace-nowrap">{t('freeze_requests')}</span>
            {freezeRequests.length > 0 && (
              <span className="absolute top-1 right-1 md:static md:ml-1 bg-red-500 text-white text-[10px] md:text-xs rounded-full px-1.5 py-0.5 min-w-[16px] md:min-w-[20px] text-center flex items-center justify-center flex-shrink-0">
                {freezeRequests.length}
              </span>
            )}
          </button>
        )}
        {(isParent) && (
        <button
          onClick={() => setActiveTab('notifications')}
          className={`relative flex-auto flex items-center justify-center gap-1 md:gap-1 landscape:gap-0.5 px-1 py-1 landscape:px-0.5 landscape:py-0.5 md:px-3 md:py-3 rounded-lg md:rounded-none transition-all ${
            activeTab === 'notifications' 
              ? 'bg-yellow-500 text-black md:bg-green-600/20 md:text-green-400 md:border-b-2 md:border-green-500 shadow-md md:shadow-none font-bold' 
              : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
          }`}
        >
          <span className="text-[10px] md:text-base whitespace-nowrap">{t('notifications')}</span>
          {unreadNotificationsCount > 0 && (
              <span className="absolute top-1 right-1 md:static md:ml-1 bg-red-500 text-white text-[10px] md:text-xs landscape:text-[5px] rounded-full px-1.5 py-0.5 landscape:px-0 landscape:py-0 min-w-[16px] md:min-w-[20px] landscape:min-w-[6px] text-center flex items-center justify-center flex-shrink-0">
                    {unreadNotificationsCount}
                  </span>
            )}
        </button>
        )}
        
        {isParent && (
           <button
             onClick={() => setShowFreezeModal(true)}
             className={`relative flex-auto flex items-center justify-center gap-1 md:gap-1 landscape:gap-0.5 px-1 py-1 landscape:px-0.5 landscape:py-0.5 md:px-3 md:py-3 rounded-lg md:rounded-none transition-all text-blue-400 hover:bg-white/5 hover:text-blue-300 whitespace-nowrap`}
           >
             <span className="text-[10px] md:text-base whitespace-nowrap">{t('stud_request_freeze')}</span>
           </button>
        )}
        
        <button
            onClick={() => setActiveTab('support')}
            className={`relative flex-auto flex items-center justify-center gap-1 md:gap-1 landscape:gap-0.5 px-1 py-1 landscape:px-0.5 landscape:py-0.5 md:px-3 md:py-3 rounded-lg md:rounded-none transition-all ${
               activeTab === 'support' 
                 ? 'bg-yellow-500 text-black md:bg-green-600/20 md:text-green-400 md:border-b-2 md:border-green-500 shadow-md md:shadow-none font-bold' 
                 : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
             }`}
          >
            <span className="text-[10px] md:text-base whitespace-nowrap">{isAdmin ? t('dialogs_tab') : t('support_tab')}</span>
            {unreadCounts.support > 0 && (
              <span className="absolute top-1 right-1 md:static md:ml-1 bg-red-500 text-white text-[10px] md:text-xs landscape:text-[5px] rounded-full px-1.5 py-0.5 landscape:px-0 landscape:py-0 min-w-[16px] md:min-w-[20px] landscape:min-w-[6px] text-center flex items-center justify-center flex-shrink-0">
                {unreadCounts.support}
              </span>
            )}
          </button>
      </div>
    </div>
  );


  // ==================== FREEZE REQUESTS RENDER ====================
  const renderFreezeRequests = () => (
    <div className="space-y-6 landscape:space-y-4">
      <div className="bg-[#23272E] p-6 landscape:p-4 rounded-xl border border-gray-700 shadow-xl landscape:shadow-lg">
        <h2 className="text-xl font-bold mb-4 landscape:mb-3 text-white flex items-center gap-2">
          {t('freeze_requests')}
        </h2>

        {/* Filter */}
        <div className="flex gap-2 mb-4 landscape:mb-3 flex-wrap landscape:flex-nowrap landscape:overflow-x-auto landscape:pb-1">
          {['all', 'pending', 'approved', 'rejected'].map(status => (
            <button
              key={status}
              onClick={() => setFreezeStatusFilter(status)}
              className={`px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-lg text-sm font-medium transition-colors flex-shrink-0 whitespace-nowrap border border-transparent ${
                freezeStatusFilter === status 
                  ? 'bg-blue-600 text-white border-blue-500' 
                  : 'bg-[#2D323B] text-gray-400 hover:text-white border-gray-600'
              }`}
            >
              {t(`status_${status}`) || status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        <div className="space-y-3 landscape:space-y-2">
          {freezeRequests.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {t('no_freeze_requests')}
            </div>
          ) : (
            freezeRequests.map(req => (
              <div key={req.id} className="bg-[#1C2127] p-4 landscape:p-3 rounded-xl border border-gray-700 flex flex-col md:flex-row justify-between gap-4 landscape:gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1 landscape:mb-0.5">
                    <span 
                      className="font-bold text-white text-lg landscape:text-base cursor-pointer hover:text-blue-400 hover:underline transition-colors"
                      onClick={() => req.student && setSelectedStudentId(req.student_id)}
                    >
                      {req.student ? `${req.student.first_name} ${req.student.last_name}` : 'Unknown'}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                      ID: {req.student_id}
                    </span>
                  </div>
                  <div className="text-gray-300 text-sm mb-2 landscape:mb-1">
                    📅 {t('period')}: <span className="font-medium text-white">
                      {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                      <span className="text-gray-400 ml-2 text-xs">
                        ({Math.ceil((new Date(req.end_date) - new Date(req.start_date)) / (1000 * 60 * 60 * 24)) + 1} {t('days_short')})
                      </span>
                    </span>
                  </div>
                  
                  {/* Reason Box */}
                  {req.reason && (
                    <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 landscape:p-2 rounded-lg mb-3 landscape:mb-2">
                      <div className="text-xs text-yellow-500 font-bold uppercase mb-1 landscape:mb-0.5">{t('reason')}:</div>
                      <div className="text-gray-200 text-sm italic">
                        "{t(req.reason) || req.reason}"
                      </div>
                    </div>
                  )}

                  {/* File Attachment */}
                  {(req.file_url || isAdmin) && (
                    <div className="mb-3 landscape:mb-2 flex flex-col gap-2 landscape:gap-1">
                      {req.file_url && (
                        <a 
                          href={req.file_url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-2 landscape:px-2 landscape:py-1.5 rounded-lg transition-colors text-sm font-medium"
                        >
                          <FileText size={16} />
                          {t('view_document')}
                        </a>
                      )}
                      {isAdmin && (
                        <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-gray-300 bg-gray-800/60 hover:bg-gray-700/80 px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-lg border border-gray-700/80 transition-colors">
                          📎 {req.file_url ? t('change_document') : t('add_document')}
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) => handleAdminUploadFreezeFile(e, req.id)}
                          />
                        </label>
                      )}
                    </div>
                  )}

                  <div className="mt-2 landscape:mt-1 text-xs text-gray-500 flex items-center gap-2 landscape:gap-1">
                    <span className="bg-gray-800 px-2 py-1 landscape:px-1.5 landscape:py-0.5 rounded">
                      👤 {t('requested_by')}: <span className="text-gray-300 font-medium">{req.requested_by ? req.requested_by.full_name : t('parent_default')}</span>
                    </span>
                    <span>•</span>
                    <span>{new Date(req.created_at).toLocaleString([], { hour12: false })}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 min-w-[140px]">
                  <div className={`px-3 py-1 landscape:px-2 landscape:py-0.5 rounded-full text-xs font-bold uppercase ${
                    req.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                    req.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {t(`status_${req.status}`) || req.status}
                  </div>
                  
                  {isAdmin && req.status === 'pending' && (
                    <div className="flex gap-2 landscape:gap-1 mt-auto">
                      <button
                        onClick={() => handleApproveFreeze(req.student_id, req.id)}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-lg text-sm transition"
                      >
                        ✅ {t('approve')}
                      </button>
                      <button
                        onClick={() => handleRejectFreeze(req.student_id, req.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 landscape:px-2 landscape:py-1 rounded-lg text-sm transition"
                      >
                        ❌ {t('reject')}
                      </button>
                    </div>
                  )}

                  {req.processed_by_id && req.status !== 'pending' && (
                     <div className="text-xs text-gray-500 mt-1">
                       Обработал: ID {req.processed_by_id}
                     </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // ==================== ABSENCE REQUESTS RENDER ====================
  const renderAbsenceRequests = () => (
    <div className="space-y-6">
      <div className="bg-[#23272E] p-4 md:p-6 rounded-xl border border-gray-700 shadow-xl">
        {/* Header removed as per request to avoid duplication */}
        
        {/* Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
          {['all', 'pending', 'approved', 'rejected'].map(status => (
            <button
              key={status}
              onClick={() => setAbsenceStatusFilter(status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                absenceStatusFilter === status 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-[#2D323B] text-gray-400 hover:text-white'
              }`}
            >
              {t(`status_${status}`) || status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {absenceRequests.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {t('no_absence_requests')}
            </div>
          ) : (
            absenceRequests.map(req => (
              <div key={req.id} className="bg-[#1C2127] p-3 md:p-4 rounded-xl border border-gray-700 flex flex-col md:flex-row justify-between gap-3 md:gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span 
                      className="font-bold text-white text-lg cursor-pointer hover:text-blue-400 hover:underline transition-colors"
                      onClick={() => setSelectedStudentId(req.student_id)}
                    >
                      {req.student_name}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
                      {req.group_name}
                    </span>
                  </div>
                  <div className="text-gray-300 text-sm mb-2">
                    📅 {t('absence_date')} <span className="font-medium text-white">{new Date(req.absence_date).toLocaleDateString()}</span>
                  </div>
                  {req.reason && (
                    <div className="text-gray-400 text-sm italic bg-[#23272E] p-2 rounded border border-gray-800">
                      "{t(req.reason) || req.reason}"
                    </div>
                  )}
                  <div className="mt-2 text-xs text-gray-500">
                    Запросил: {req.requested_by} • {new Date(req.created_at).toLocaleString([], { hour12: false })}
                  </div>
                </div>

                <div className="flex flex-col items-start md:items-end gap-2 min-w-[140px] w-full md:w-auto mt-2 md:mt-0 border-t md:border-t-0 border-gray-800 pt-2 md:pt-0">
                  <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase self-start md:self-end ${
                    req.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                    req.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                    'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {t(`status_${req.status}`) || req.status}
                  </div>
                  
                  {req.status === 'pending' && (
                    <div className="flex gap-2 mt-auto flex-wrap w-full md:w-auto">
                      <button
                        onClick={() => handleApproveAbsence(req.id)}
                        className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 text-white px-3 py-2 md:py-1.5 rounded-lg text-sm transition flex items-center justify-center gap-1"
                      >
                        ✅ {t('approve')}
                      </button>
                      <button
                        onClick={() => handleRejectAbsence(req.id)}
                        className="flex-1 md:flex-none bg-red-600 hover:bg-red-700 text-white px-3 py-2 md:py-1.5 rounded-lg text-sm transition flex items-center justify-center gap-1"
                      >
                        ❌ {t('reject')}
                      </button>
                    </div>
                  )}
                  
                  {req.approved_by && (
                    <div className="text-xs text-gray-500 mt-1 self-start md:self-end">
                      {req.status === 'approved' ? t('approved_by') : t('rejected_by')}: {req.approved_by}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  // ==================== MAILINGS (BULK SMS) ====================
  const renderMailings = () => (
    <div className="space-y-6" id="mailings-content">
      <BulkSMSSection 
        students={students} 
        groups={groups} 
        debtors={debtors} 
        api={api} 
        t={t} 
      />

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#23272E] p-5 rounded-xl border border-orange-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-500 text-xl">⚠️</div>
              <div>
                <div className="text-white font-bold">{t('remind_debtors_title')}</div>
                <div className="text-gray-500 text-sm">{t('debtors_count')}: {debtors.length}</div>
              </div>
            </div>
          </div>
          
          {/* Debtors list */}
          {debtors.length > 0 && (
            <div className="mb-4 max-h-48 overflow-y-auto bg-[#1C2127] rounded-lg border border-gray-700">
              <div className="p-2 text-xs text-gray-500 border-b border-gray-700 sticky top-0 bg-[#1C2127]">
                {t('debtors_list')}
              </div>
              {debtors.slice(0, 10).map(d => {
                const group = groups.find(g => g.id === d.group_id);
                return (
                  <div key={d.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-800 last:border-0">
                    <div>
                      <span className="text-gray-200">{d.first_name} {d.last_name}</span>
                      {group && <span className="text-gray-500 text-xs ml-2">({group.name})</span>}
                    </div>
                    <button
                      onClick={async () => {
                        if (window.confirm(`${t('send_reminder_button')} ${d.first_name} ${d.last_name}?`)) {
                          try {
                            await api.students.sendPaymentReminder(d.id);
                            notificationSound.playNotification('success');
                            alert(t('reminder_sent'));
                          } catch (err) {
                            notificationSound.playNotification('error');
                            alert(t('error_prefix') + (err.response?.data?.detail || err.message));
                          }
                        }
                      }}
                      className="text-xs bg-orange-600/20 text-orange-400 px-2 py-1 rounded hover:bg-orange-600/30"
                    >
                      📤 {t('send_reminder_button')}
                    </button>
                  </div>
                );
              })}
              {debtors.length > 10 && (
                <div className="p-2 text-xs text-gray-500 text-center">
                  {t('more_debtors').replace('{count}', debtors.length - 10)}
                </div>
              )}
            </div>
          )}
          
          <button
            onClick={async () => {
              if (debtors.length === 0) return alert(t('no_debtors'));
              if (window.confirm(t('confirm_send_all_debtors').replace('{count}', debtors.length))) {
                try {
                  const res = await api.students.sendReminderToAllDebtors();
                  notificationSound.playNotification('success');
                  alert(t('reminders_sent_count').replace('{count}', res.data?.sent || debtors.length));
                } catch (err) {
                  notificationSound.playNotification('error');
                  alert('Ошибка: ' + (err.response?.data?.detail || err.message));
                }
              }
            }}
            disabled={debtors.length === 0}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            📣 {t('send_all_debtors_button')} ({debtors.length})
          </button>
        </div>
        
        <div className="bg-[#23272E] p-5 rounded-xl border border-blue-500/30">
          <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-full flex items-center justify-center text-blue-500 text-xl">🎂</div>
                <div>
                  <div className="text-white font-bold">{t('birthdays_title')}</div>
                  <div className="text-gray-500 text-sm">{t('birthdays_today')}</div>
                </div>
             </div>
          </div>
          
          {/* List of birthday students */}
          <div className="space-y-2">
            {birthdayStudents.length === 0 ? (
                <div className="text-gray-500 text-sm pl-16">{t('no_birthdays_today')}</div>
            ) : (
                birthdayStudents.map(s => (
                    <div key={s.id} className="flex items-center justify-between pl-16">
                        <span className="text-white font-medium">{s.first_name} {s.last_name}</span>
                        <button 
                            onClick={() => handleCongratulate(s.id, s.first_name)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        >
                            🎉 {t('congratulate_button')}
                        </button>
                    </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
  const renderFeed = () => (
    <div className="space-y-4" id="feed-content">
      {/* Filter and Create */}
      <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 mb-6">
        {!(isParent && groups.length === 1) && (
          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            className="w-full md:w-auto border border-white/10 rounded-xl px-4 py-2.5 bg-white/5 text-white focus:ring-2 focus:ring-green-500 focus:outline-none transition-all hover:bg-white/10"
            style={{ color: 'white', backgroundColor: '#1C2127' }}
          >
            <option value="">{t('all_groups_option')}</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        )}
        
        {isAdmin && (
          <button
            onClick={() => setShowNewPostModal(true)}
            className="w-full md:w-auto bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-green-900/20 transition-all transform hover:scale-105"
          >
            + {t('new_post')}
          </button>
        )}
      </div>

      {/* Posts List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <div className="text-gray-400">{t('loading')}</div>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
          <div className="text-4xl mb-4">📰</div>
          <div className="text-gray-400 text-lg">{t('no_announcements')}</div>
        </div>
      ) : (
        <>
        {posts.map(post => (
          <div 
            key={post.id} 
            className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 transition-all hover:bg-white/[0.07] hover:border-white/20 shadow-lg"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
              <div className="flex items-center gap-3 w-full">
                <div className="w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-white font-bold text-lg shadow-inner">
                  {post.author_name?.[0] || 'A'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-lg truncate">{post.author_name}</span>
                    {post.group_name && (
                      <span className="bg-blue-500/20 text-blue-300 text-xs px-2.5 py-0.5 rounded-full border border-blue-500/30 font-medium whitespace-nowrap">
                        {post.group_name}
                      </span>
                    )}
                  </div>
                  <div className="text-gray-400 text-xs mt-0.5">
                    {new Date(post.created_at).toLocaleString([], { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <div className="flex items-center gap-1 text-gray-500 bg-black/20 px-2 py-1 rounded-lg text-xs">
                  <span>👁</span>
                  <span>{post.views_count}</span>
                </div>
                {isAdmin && (
                  <div className="flex gap-1">
                    <button 
                      onClick={() => handleDeletePost(post.id)} 
                      className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Удалить"
                    >
                      🗑
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {post.title && <h3 className="font-bold text-xl mb-3 text-white leading-tight">{post.title}</h3>}
            
            <div className="text-gray-200 whitespace-pre-wrap leading-relaxed text-base mb-4 bg-black/10 p-4 rounded-xl border border-white/5">
              {post.content}
            </div>
            
            {/* Media */}
            {post.media_urls && post.media_urls.length > 0 && (
              <div className={`mt-4 grid gap-2 ${
                post.media_urls.length === 1 ? 'grid-cols-1' : 
                post.media_urls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
              }`}>
                {post.media_urls.map((url, idx) => (
                  <div key={idx} className="relative group overflow-hidden rounded-xl border border-white/10">
                    <img 
                      src={url} 
                      alt="" 
                      loading="lazy"
                      className="w-full h-48 object-cover transition-transform duration-500 group-hover:scale-110" 
                    />
                  </div>
                ))}
              </div>
            )}
            
            {/* Attachments */}
            {post.attachments && post.attachments.length > 0 && (
              <div className="mt-4 space-y-2">
                {post.attachments.map((att, idx) => (
                  <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer" 
                     className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                      📎
                    </div>
                    <span className="text-blue-300 group-hover:text-blue-200 font-medium text-sm">{att.name}</span>
                  </a>
                ))}
              </div>
            )}
            
            {/* Like button */}
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center">
              {post.requires_confirmation && (
                <div className="mr-3">
                  {post.user_confirmed ? (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-green-600/20 text-green-300 border border-green-600/30">
                      ✔ Подтверждено
                    </span>
                  ) : (
                    <button
                      onClick={() => handleConfirmPost(post.id)}
                      className="px-3 py-1.5 rounded-lg text-sm bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-500/30 transition-colors"
                    >
                      Подтвердить прочтение
                    </button>
                  )}
                </div>
              )}
              <button
                onClick={() => handleLikePost(post.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                  post.user_liked 
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-red-400'
                }`}
              >
                <span className={`text-lg transition-transform ${post.user_liked ? 'scale-110' : ''}`}>
                  {post.user_liked ? '❤️' : '🤍'}
                </span>
                <span className="font-bold">{post.likes_count}</span>
              </button>
            </div>
          </div>
        ))}
        {feedHasMore && (
            <div className="text-center pt-4 pb-8">
              <button
                onClick={() => loadPosts(feedPage + 1)}
                disabled={loading}
                className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50 border border-gray-700"
              >
                {loading ? t('loading') : t('load_more')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  // ==================== TEAM CHATS ====================
  const renderTeamChats = () => (
    <div className="flex min-h-[320px] h-[calc(100vh-160px)] md:h-[calc(100vh-220px)] bg-[#23272E] rounded-lg border border-gray-700 overflow-hidden" id="chat-content">
      {/* Chat list */}
      <div className={`${selectedChat ? 'hidden md:block' : 'w-full'} ${isParent && teamChats.length === 1 ? 'hidden' : 'md:w-64'} border-r border-gray-700 bg-[#1C2127] overflow-y-auto`}>
        <div className={`p-3 font-medium text-gray-400 border-b border-gray-700 bg-[#23272E] ${isParent ? 'hidden landscape:hidden' : ''}`}>{t('group_chats_title')}</div>
        {teamChats.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            {t('no_groups_available')}
          </div>
        ) : (
          teamChats.map(chat => (
            <div
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={`p-3 cursor-pointer hover:bg-gray-800 border-b border-gray-700 ${selectedChat?.id === chat.id ? 'bg-green-900/20 border-l-4 border-green-500' : ''}`}
            >
              <div className="font-medium text-gray-200">{chat.name}</div>
              <div className="text-xs text-gray-500">{chat.students_count || 0} {t('students_count_suffix')}</div>
            </div>
          ))
        )}
      </div>

      {/* Chat area */}
      <div className={`${selectedChat || (isParent && teamChats.length === 1) ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-[#1C2127]`}>
        {selectedChat ? (
          <>
            <div className={`p-3 border-b border-gray-700 bg-[#23272E] flex justify-between items-center ${isParent && teamChats.length === 1 ? 'hidden md:flex' : ''}`}>
              <div className="flex items-center gap-2">
                {(!isParent || teamChats.length > 1) && (
                <button 
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden p-1 text-gray-400 hover:text-white"
                >
                  <ChevronLeft size={24} />
                </button>
                )}
                
                {/* 🌟 CUSTOM HEADER FOR GROUP CHAT - SIMPLIFIED */}
                <div>
                  <span className="font-medium text-white">{selectedChat.name}</span>
                  <span className="text-gray-500 text-sm ml-2 hidden sm:inline">{t('group_chat_label')}</span>
                </div>
                
              </div>
              {isAdmin && (
                <button
                  onClick={() => { setPollGroupId(selectedChat.id); setShowPollModal(true); }}
                  className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-500"
                >
                  📊 <span className="hidden sm:inline">{t('create_poll')}</span>
                </button>
              )}
            </div>
            
            <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#1C2127]" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ marginTop: 'auto' }}>
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'} mb-3`}>
                    <div className={`max-w-[85%] sm:max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender_id === user?.id ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'bg-[#2D323B] text-gray-200 border border-gray-700 shadow-lg'}`}>
                      {msg.sender_id !== user?.id && (
                        <div className={`text-xs font-medium mb-1 ${getRoleColor(msg.sender_role)}`}>
                          {getRoleDisplay(msg.sender_role)} {msg.sender_name}
                        </div>
                      )}
                      
                      <div className="flex justify-between items-start gap-2 group">
                        <div className="break-words">{msg.content}</div>
                        {(msg.sender_id === user?.id || isAdmin) && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteMessage(msg.id); }}
                                className="text-xs opacity-0 group-hover:opacity-100 transition-opacity text-white/50 hover:text-white bg-black/20 hover:bg-red-500/50 rounded px-1.5 py-0.5"
                                title={t('delete')}
                            >
                                ✕
                            </button>
                        )}
                      </div>
                      
                      {/* Poll in message */}
                      {msg.poll && (
                        <div className="mt-2 p-2 bg-[#1C2127] rounded border border-gray-700">
                          <div className="font-medium mb-2 text-white">📊 {msg.poll.question}</div>
                          {msg.poll.options.map((opt, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleVote(msg.poll.id, idx)}
                              className={`w-full text-left p-2 mb-1 rounded transition ${msg.poll.user_voted === idx ? 'bg-green-600 text-white' : 'bg-[#2D323B] text-gray-300 hover:bg-gray-700'}`}
                            >
                              {opt} {msg.poll.votes?.[idx]?.count > 0 && `(${msg.poll.votes[idx].count})`}
                            </button>
                          ))}
                        </div>
                      )}
                      
                      <div className="text-xs opacity-50 mt-1">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', hour12: false })}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>
            
            <MessageInput onSend={handleSendMessage} placeholder={t('write_to_group_placeholder')} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">
            {t('select_chat_placeholder')}
          </div>
        )}
      </div>
    </div>
  );

  // ==================== SUPPORT / DIRECT MESSAGES ====================
  const renderSupport = () => {
    // Для админов - показываем все чаты поддержки
    if (isAdmin) {
      return (
        <div className="flex min-h-[320px] h-[calc(100vh-220px)] bg-[#23272E] rounded-lg border border-gray-700 overflow-hidden shadow-xl" id="support-content">
          {/* Список чатов */}
          <div className={`${selectedSupportChat ? 'hidden md:block' : 'w-full'} md:w-72 border-r border-gray-700 bg-[#1C2127] overflow-y-auto`}>
            <div className="p-3 font-medium text-gray-400 border-b border-gray-700 bg-[#23272E]">
              📨 {t('incoming_requests')}
            </div>
            
            {supportChats.length > 0 ? supportChats.map(chat => (
              <div
                key={chat.user_id}
                onClick={async () => {
                  setSelectedSupportChat(chat);
                  const res = await api.messages.getSupportChatWith(chat.user_id);
                  setSupportMessages(res.data || []);
                }}
                className={`p-3 cursor-pointer hover:bg-gray-800 border-b border-gray-700 ${selectedSupportChat?.user_id === chat.user_id ? 'bg-green-900/20 border-l-4 border-green-500' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-200">{chat.user_name}</div>
                  {chat.unread_count > 0 && (
                    <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{chat.unread_count}</span>
                  )}
                </div>
                <div className={`text-xs ${getRoleColor(chat.user_role)}`}>{getRoleDisplay(chat.user_role)}</div>
                {chat.phone && <div className="text-xs text-gray-400 mt-0.5">📞 {chat.phone}</div>}
                {chat.group_info && <div className="text-xs text-blue-400 mt-0.5">⚽ {chat.group_info}</div>}
                <div className="text-xs text-gray-500 truncate mt-1">{chat.last_message}</div>
              </div>
            )) : (
              <div className="p-3 text-gray-600 text-sm">{t('no_support_requests')}</div>
            )}
          </div>

          {/* Область чата */}
          <div className={`${selectedSupportChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-[#1C2127]`}>
            {selectedSupportChat ? (
              <>
                <div className="p-3 border-b border-gray-700 bg-[#23272E]">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSelectedSupportChat(null)}
                      className="md:hidden p-1 text-gray-400 hover:text-white"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <div>
                      <span className="font-medium text-white">{selectedSupportChat.user_name}</span>
                      <span className={`text-sm ml-2 ${getRoleColor(selectedSupportChat.user_role)}`}>
                        {getRoleDisplay(selectedSupportChat.user_role)}
                      </span>
                      {selectedSupportChat.phone && (
                        <div className="text-sm text-gray-400 mt-1">
                          📞 {selectedSupportChat.phone}
                        </div>
                      )}
                      {selectedSupportChat.group_info && (
                        <div className="text-sm text-blue-400 mt-1">
                          ⚽ {selectedSupportChat.group_info}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#1C2127]" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ marginTop: 'auto' }}>
                    {supportMessages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'} mb-3`}>
                        <div className={`max-w-[85%] sm:max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender_id === user?.id ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'bg-[#2D323B] text-gray-200 border border-gray-700 shadow-lg'}`}>
                          {msg.sender_id !== user?.id && (
                            <div className={`text-xs font-medium mb-1 ${getRoleColor(msg.sender_role)}`}>
                              {getRoleDisplay(msg.sender_role)} {msg.sender_name}
                            </div>
                          )}
                          <div className="break-words">{msg.content}</div>
                          <div className="text-xs opacity-50 mt-1">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', hour12: false })}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>
                
                <MessageInput onSend={handleSendSupportMessage} placeholder={t('type_message')} />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-600">
                {t('select_dialog_placeholder')}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Для тренеров и родителей - один чат с поддержкой
    return (
      <div className="flex flex-col min-h-[320px] h-[calc(100vh-220px)] bg-[#23272E] rounded-lg border border-gray-700 overflow-hidden shadow-xl" id="support-content">
        <div className={`p-4 border-b border-gray-700 bg-[#23272E] flex-none ${isParent ? 'hidden md:block landscape:hidden' : ''}`}>
          <h2 className="font-medium text-white flex items-center gap-2">
            📞 {t('academy_support_title')}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            {t('write_to_admin_desc')}
          </p>
        </div>
        
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#1C2127]" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginTop: 'auto' }}>
            {supportMessages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                💬 {t('start_support_dialog')}
              </div>
            ) : (
              supportMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'} mb-3`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${msg.sender_id === user?.id ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'bg-[#2D323B] text-gray-200 border border-gray-700 shadow-lg'}`}>
                    {msg.sender_id !== user?.id && (
                      <div className={`text-xs font-medium mb-1 ${getRoleColor(msg.sender_role)}`}>
                        {getRoleDisplay(msg.sender_role)} {msg.sender_name}
                      </div>
                    )}
                    <div>{msg.content}</div>
                    <div className="text-xs opacity-50 mt-1">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', hour12: false })}
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>
        
        <MessageInput onSend={handleSendSupportMessage} placeholder={t('write_support_placeholder')} />
      </div>
    );
  };

  // Helper to localize notification content
  const localizeNotification = (content) => {
    if (!content) return '';
    const text = typeof content === 'string' ? content : String(content);
    if (text.includes('Заявка на пропуск одобрена')) {
      const lines = text.split('\n');
      return lines.map(line => {
        if (line.includes('Заявка на пропуск одобрена')) return t('absence_approved') || line;
        if (line.includes('Ученик:')) return line.replace('Ученик:', t('student_label') || 'Ученик:');
        if (line.includes('Дата:')) return line.replace('Дата:', t('date_label') || 'Дата:');
        return line;
      }).join('\n');
    }
    return text;
  };

  // ==================== NOTIFICATIONS ====================
  const renderNotifications = () => (
    <div className="bg-[#23272E] rounded-lg border border-gray-700 overflow-hidden shadow-xl">
      <div className={`p-4 border-b border-gray-700 bg-[#23272E] ${isParent ? 'hidden md:block landscape:hidden' : ''}`}>
        <h2 className="font-medium text-white flex items-center gap-2">
          🔔 {t('notifications')}
        </h2>
      </div>
      
      <div className="p-4 space-y-4 bg-[#1C2127] min-h-[400px] max-h-[600px] overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {t('no_notifications')}
          </div>
        ) : (
          notifications.map(msg => (
            <div key={msg.id} className="bg-[#2D323B] p-4 rounded-lg border border-gray-700 shadow flex items-start gap-3">
               <div className="bg-blue-600/20 text-blue-400 p-2 rounded-full">
                 ℹ️
               </div>
               <div className="flex-1">
                 <div className="text-gray-200 whitespace-pre-wrap">{localizeNotification(msg.content)}</div>
                 <div className="text-xs text-gray-500 mt-2">
                  {new Date(msg.created_at).toLocaleString([], { hour12: false })}
                 </div>
               </div>
            </div>
          ))
        )}

        {isParent && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-200 mb-2">
                📊 {t('my_absence_requests_stats')}
              </h3>
              {absenceRequests.length === 0 ? (
                <div className="text-xs text-gray-500">
                  {t('no_absence_requests_short')}
                </div>
              ) : (
                <div className="space-y-2">
                  {absenceRequests.map(req => (
                    <div key={req.id} className="bg-[#23272E] border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-medium truncate">
                          {req.student_name}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full uppercase ${
                          req.status === 'approved' ? 'bg-green-500/15 text-green-400' :
                          req.status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                          'bg-yellow-500/15 text-yellow-400'
                        }`}>
                          {t(`status_${req.status}`) || req.status}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-400 flex flex-wrap gap-2">
                        <span>📅 {new Date(req.absence_date).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{new Date(req.created_at).toLocaleString([], { hour12: false })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-200 mb-2">
                ❄️ {t('my_freeze_requests_stats')}
              </h3>
              {freezeRequests.length === 0 ? (
                <div className="text-xs text-gray-500">
                  {t('no_freeze_requests_short')}
                </div>
              ) : (
                <div className="space-y-2">
                  {freezeRequests.map(req => (
                    <div key={req.id} className="bg-[#23272E] border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-medium truncate">
                          {req.student ? `${req.student.first_name} ${req.student.last_name}` : `ID ${req.student_id}`}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full uppercase ${
                          req.status === 'approved' ? 'bg-green-500/15 text-green-400' :
                          req.status === 'rejected' ? 'bg-red-500/15 text-red-400' :
                          'bg-yellow-500/15 text-yellow-400'
                        }`}>
                          {t(`status_${req.status}`) || req.status}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-gray-400 flex flex-wrap gap-2">
                        <span>
                          📅 {new Date(req.start_date).toLocaleDateString()} - {new Date(req.end_date).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span>{new Date(req.created_at).toLocaleString([], { hour12: false })}</span>
                        {req.file_url && (
                          <>
                            <span>•</span>
                            <span className="text-blue-300">
                              {t('document_attached_short')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );



  return (
    <div className="min-h-screen bg-[#0F1117] p-1 md:p-6 text-white">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-4 mb-2 md:mb-4">
          <h1 className="text-xl md:text-4xl font-bold flex items-center gap-2">
            <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
              📨 {t('communications_title')}
            </span>
            <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-400">v3.2</span>
          </h1>
          
          {/* Sound & Notification Controls */}
          <div className="hidden md:flex items-center gap-2 w-full md:w-auto">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-all ${
                autoRefresh 
                  ? 'bg-green-600/20 text-green-400 border border-green-600' 
                  : 'bg-gray-700 text-gray-400 border border-gray-600'
              }`}
              title={t('auto_refresh')}
            >
              {autoRefresh ? '🔄' : '⏸️'} {t('auto_refresh')}
            </button>
            
            {/* Sound toggle */}
            <button
              onClick={toggleSound}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-all ${
                soundEnabled 
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-600' 
                  : 'bg-gray-700 text-gray-400 border border-gray-600'
              }`}
              title={t('sound_notifications')}
            >
              {soundEnabled ? '🔔' : '🔕'} {t('sound_notifications')}
            </button>
          </div>
        </div>
        
        {renderTabs()}
        
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
        
        {activeTab === 'feed' && renderFeed()}
        {activeTab === 'teamChats' && renderTeamChats()}
        {activeTab === 'mailings' && isAdmin && renderMailings()}
        {activeTab === 'support' && renderSupport()}
        {activeTab === 'notifications' && renderNotifications()}
        {activeTab === 'absence' && (isAdmin || isCoach) && renderAbsenceRequests()}
        {activeTab === 'freeze' && isAdmin && renderFreezeRequests()}
        
        {selectedStudentId && (
          <PlayerCard
            studentId={selectedStudentId}
            onClose={() => setSelectedStudentId(null)}
          />
        )}

        {isParent && showFreezeModal && (
          <FreezeRequestModal
            onClose={() => setShowFreezeModal(false)}
            isAdmin={false}
            onSuccess={() => {
              setShowFreezeModal(false);
              setActiveTab('notifications');
              loadAbsenceRequests();
              loadFreezeRequests();
            }}
          />
        )}

        <NewPostModal 
          isOpen={showNewPostModal} 
          onClose={() => setShowNewPostModal(false)}
          groups={groups}
          onCreated={loadPosts}
        />
        
        <NewPollModal 
          isOpen={showPollModal} 
          onClose={() => setShowPollModal(false)} 
          groupId={pollGroupId} 
          onCreated={() => selectedChat && loadChatMessages(selectedChat.id)} 
        />
        
        <DirectChatModal
          isOpen={!!directChatUser}
          recipient={directChatUser}
          onClose={() => setDirectChatUser(null)}
          currentUser={user}
        />
      </div>
    </div>
  );
}
