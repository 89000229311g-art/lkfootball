import { useState, useEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ru, enUS, ro } from 'date-fns/locale';
import { messagesAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Chat() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [groups, setGroups] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ 
    title: '', 
    content: '', 
    is_general: true, 
    group_ids: [],
    media: null,
    media_preview: null
  });
  const messagesEndRef = useRef(null);
  const prevMessagesLength = useRef(0);
  
  // Current selected chat
  const [selectedChat, setSelectedChat] = useState({ 
    type: 'announcements', 
    id: 'general', 
    name: t('general_announcements'),
    is_general: true 
  });

  const [showMobileChat, setShowMobileChat] = useState(false);
  const [editMode, setEditMode] = useState(null); // Message object being edited

  const isAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
  const isParent = user?.role?.toLowerCase() === 'parent';
  const isCoach = user?.role?.toLowerCase() === 'coach';

  const scrollToBottom = () => {
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };


  const loadInitialData = async () => {
    try {
      const groupsRes = await messagesAPI.getGroups();
      setGroups(groupsRes.data?.data || groupsRes.data || []);
    } catch (err) {
      console.error('Failed to load chat data:', err);
    }
  };

  const loadMessages = useCallback(async (isBackground = false) => {
    try {
      let res;
      if (selectedChat.type === 'announcements') {
        if (selectedChat.is_general) {
          res = await messagesAPI.getAnnouncements({ general_only: true });
        } else {
          res = await messagesAPI.getAnnouncements({ group_id: selectedChat.id });
        }
      } else if (selectedChat.type === 'group') {
        res = await messagesAPI.getGroupMessages(selectedChat.id);
      } else if (selectedChat.type === 'support') {
        // Чат поддержки (связь с администрацией)
        res = await messagesAPI.getSupport();
      }
      
      if (res) {
        // Sort messages by created_at ascending
        const rawData = res.data || [];
        const sortedData = [...rawData].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        
        // Only update state if data actually changed to prevent unnecessary re-renders
        setMessages(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(sortedData)) {
                return sortedData;
            }
            return prev;
        });
        if (!isBackground) setError(null);
      }
    } catch (err) {
      console.error('Failed to load messages:', err);
      // Only show error for initial load or manual interactions, not background polling
      if (!isBackground) {
        setError(t('chat_load_error') || `Ошибка загрузки чата: ${err.response?.data?.detail || err.message}`);
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [selectedChat, t]);

  // Effects placed after callback declarations to avoid TDZ runtime errors
  useEffect(() => {
    loadInitialData();
    const interval = setInterval(() => loadMessages(true), 5000); // Poll every 5 seconds for better responsiveness
    return () => clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    loadMessages(false);
  }, [loadMessages]);
  
  useEffect(() => {
    // Only scroll if messages length increased or chat switched
    if (messages.length > prevMessagesLength.current || showMobileChat) {
        scrollToBottom();
    }
    prevMessagesLength.current = messages.length;
  }, [messages, showMobileChat]); // Scroll when switching to chat view on mobile
  
  const handleEdit = (msg) => {
    setEditMode(msg);
    setNewMessage(msg.content);
    // Focus input? Maybe add ref
  };

  const handleDelete = async (msgId) => {
    if (!window.confirm(t('confirm_delete') || 'Вы уверены, что хотите удалить это сообщение?')) return;
    
    try {
      await messagesAPI.deleteMessage(msgId);
      loadMessages();
    } catch (err) {
      console.error('Failed to delete message:', err);
      alert(t('delete_error') || 'Ошибка удаления');
    }
  };

  const cancelEdit = () => {
    setEditMode(null);
    setNewMessage('');
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      if (editMode) {
        await messagesAPI.updateMessage(editMode.id, newMessage.trim());
        setEditMode(null);
      } else {
        if (selectedChat.type === 'group') {
          await messagesAPI.sendGroupMessage(selectedChat.id, newMessage.trim());
        } else if (selectedChat.type === 'support') {
          // Отправка в поддержку (связь с администрацией)
          await messagesAPI.sendSupport(newMessage.trim());
        }
      }
      setNewMessage('');
      loadMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('Ошибка отправки сообщения: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSending(false);
    }
  };

  const handleAnnouncementSubmit = (e) => {
    e.preventDefault();
    if (!announcementForm.content.trim()) {
      alert(t('announcement_content_required') || 'Содержание объявления обязательно');
      return;
    }
    
    // Проверка выбора групп если не общее объявление
    if (!announcementForm.is_general && (!announcementForm.group_ids || announcementForm.group_ids.length === 0)) {
      alert(t('select_at_least_one_group') || 'Пожалуйста, выберите хотя бы одну группу');
      return;
    }
    
    setShowConfirmation(true);
  };

  const sendAnnouncement = async () => {
    setSending(true);
    try {
      // Format message with title if present
      const fullContent = announcementForm.title 
        ? `📌 ${announcementForm.title}\n\n${announcementForm.content}`
        : announcementForm.content;
      
      await messagesAPI.createAnnouncement({
        content: fullContent,
        is_general: announcementForm.is_general,
        group_ids: announcementForm.group_ids
      });
      
      // TODO: Upload media if present
      // if (announcementForm.media) { ... }
      
      setAnnouncementForm({ 
        title: '', 
        content: '', 
        is_general: true, 
        group_ids: [],
        media: null,
        media_preview: null
      });
      setShowAnnouncement(false);
      setShowConfirmation(false);
      loadMessages();
      loadInitialData();
    } catch (err) {
      console.error('Failed to send announcement:', err);
      alert(t('error_sending_announcement'));
    } finally {
      setSending(false);
    }
  };

  const handleMediaChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Check file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      alert(t('invalid_file_type'));
      return;
    }
    
    // Check file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert(t('file_too_large'));
      return;
    }
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setAnnouncementForm({
        ...announcementForm,
        media: file,
        media_preview: e.target.result
      });
    };
    reader.readAsDataURL(file);
  };

  const removeMedia = () => {
    setAnnouncementForm({
      ...announcementForm,
      media: null,
      media_preview: null
    });
  };

  const getRecipientCount = () => {
    if (announcementForm.is_general) {
      return t('all_users');
    }
    const selectedGroups = groups.filter(g => announcementForm.group_ids.includes(g.id));
    const groupNames = selectedGroups.map(g => g.name).join(', ');
    return `${announcementForm.group_ids.length} ${t('groups')}: ${groupNames}`;
  };

  const selectChat = (chat) => {
    setSelectedChat(chat);
    setMessages([]);
    setLoading(true);
    setShowMobileChat(true);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = parseISO(dateStr);
      return format(date, 'HH:mm');
    } catch {
      return '';
    }
  };

  const getMessageDateHeader = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = parseISO(dateStr);
      const locale = language === 'ru' ? ru : (language === 'ro' ? ro : enUS);
      
      if (isToday(date)) {
        return t('today') || 'Сегодня';
      }
      if (isYesterday(date)) {
        return t('yesterday') || 'Вчера';
      }
      
      return format(date, 'EEEE, d MMMM yyyy', { locale });
    } catch {
      return '';
    }
  };

  const isOwnMessage = (message) => message.sender_id === user?.id;

  const getRoleIcon = (role) => {
    const icons = { super_admin: '👨‍💼', owner: '👨‍💼', admin: '🔧', coach: '🏃', parent: '👨‍👩‍👧' };
    return icons[role?.toLowerCase()] || '👤';
  };

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-gray-800">💬 {t('chat_title')}</h1>
        {isAdmin && (
          <button
            onClick={() => setShowAnnouncement(true)}
            className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition flex items-center gap-2"
          >
            📢 {t('new_announcement')}
          </button>
        )}
      </div>

      <div className="flex h-[calc(100%-3rem)] bg-white rounded-xl shadow-lg overflow-hidden">
        {/* Sidebar */}
        <div className={`w-full md:w-80 border-r bg-gray-50 flex flex-col overflow-y-auto ${showMobileChat ? 'hidden md:flex' : 'flex'}`}>
          {/* Announcements Section */}
          <div className="p-3 border-b bg-yellow-50 shrink-0">
            <div className="flex items-center gap-2 mb-3 px-2">
              <span className="text-yellow-600 text-lg">📢</span>
              <div>
                <div className="text-xs font-bold text-yellow-700 uppercase tracking-wider">
                  {t('announcements')}
                </div>
                <div className="text-xs text-yellow-600">
                  👨‍💼 {t('owners_and_admins_only')}
                </div>
              </div>
            </div>
            
            {/* General announcements */}
            <button
              onClick={() => selectChat({ type: 'announcements', id: 'general', name: t('general_announcements'), is_general: true })}
              className={`w-full p-3 text-left rounded-xl mb-1 transition ${
                selectedChat.type === 'announcements' && selectedChat.is_general
                  ? 'bg-yellow-100 border-l-4 border-yellow-500'
                  : 'hover:bg-gray-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">📢</span>
                <div>
                  <div className="font-semibold text-gray-800">{t('general_announcements')}</div>
                  <div className="text-xs text-gray-500">{t('for_everyone')}</div>
                </div>
              </div>
            </button>

            {/* Group announcements */}
            {groups.map(group => (
              <button
                key={`ann-${group.id}`}
                onClick={() => selectChat({ type: 'announcements', id: group.id, name: `${group.name} - ${t('announcements')}`, is_general: false })}
                className={`w-full p-3 text-left rounded-xl mb-1 transition ${
                  selectedChat.type === 'announcements' && selectedChat.id === group.id
                    ? 'bg-yellow-100 border-l-4 border-yellow-500'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📋</span>
                  <div>
                    <div className="font-medium text-gray-700">{group.name}</div>
                    <div className="text-xs text-gray-500">{t('group_announcements')}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Group Chats Section */}
          <div className="p-3 bg-green-50 shrink-0">
            <div className="flex items-center gap-2 mb-3 px-2">
              <span className="text-green-600 text-lg">💬</span>
              <div>
                <div className="text-xs font-bold text-green-700 uppercase tracking-wider">
                  {t('group_chats')}
                </div>
                <div className="text-xs text-green-600">
                  🏃 {t('coaches_parents_participate')}
                </div>
              </div>
            </div>
            
            {groups.map(group => (
              <button
                key={`chat-${group.id}`}
                onClick={() => selectChat({ type: 'group', id: group.id, name: group.name })}
                className={`w-full p-3 text-left rounded-xl mb-1 transition ${
                  selectedChat.type === 'group' && selectedChat.id === group.id
                    ? 'bg-green-100 border-l-4 border-green-500'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚽</span>
                  <div>
                    <div className="font-semibold text-gray-800">{group.name}</div>
                    <div className="text-xs text-gray-500">
                      {group.coach_name || t('no_coach')}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            
            {groups.length === 0 && (
              <div className="text-center text-gray-400 py-4 text-sm">
                {t('no_groups')}
              </div>
            )}
          </div>
          
          {/* Support Section - для родителей и тренеров */}
          {(isParent || isCoach) && (
            <div className="p-3 border-t bg-blue-50 shrink-0">
              <div className="flex items-center gap-2 mb-3 px-2">
                <span className="text-blue-600 text-lg">📞</span>
                <div>
                  <div className="text-xs font-bold text-blue-700 uppercase tracking-wider">
                    Поддержка
                  </div>
                  <div className="text-xs text-blue-600">
                    Связь с администрацией
                  </div>
                </div>
              </div>
              
              <button
                onClick={() => selectChat({ type: 'support', id: 'support', name: isCoach ? `📨 ${t('messages_and_support') || 'Сообщения и поддержка'}` : `📞 ${t('tech_support') || 'Поддержка'}` })}
                className={`w-full p-3 text-left rounded-xl transition ${
                  selectedChat.type === 'support'
                    ? 'bg-blue-100 border-l-4 border-blue-500'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💬</span>
                  <div>
                    <div className="font-semibold text-gray-800">
                      {isCoach ? (t('messages_and_support') || 'Сообщения и поддержка') : (t('write_to_admin') || 'Написать администрации')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {isCoach ? (t('notifications_and_admin') || 'Уведомления и связь с администрацией') : (t('questions_and_requests') || 'Вопросы и обращения')}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className={`flex-1 flex flex-col ${showMobileChat ? 'flex' : 'hidden md:flex'}`}>
          {/* Chat Header */}
          <div className={`p-4 border-b text-white flex items-center gap-3 ${
            selectedChat.type === 'support' 
              ? 'bg-gradient-to-r from-blue-600 to-blue-700'
              : selectedChat.type === 'announcements'
                ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                : 'bg-gradient-to-r from-green-600 to-green-700'
          }`}>
            <button 
              onClick={() => setShowMobileChat(false)}
              className="md:hidden p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <span className="text-xl">←</span>
            </button>
            <div>
              <h3 className="font-bold text-lg">{selectedChat.name}</h3>
              <div className="text-sm opacity-90">
              {selectedChat.type === 'announcements' && (selectedChat.is_general ? t('announcements_for_all') : t('announcements_for_group'))}
              {selectedChat.type === 'group' && t('group_chat_description')}
              {selectedChat.type === 'support' && (
                isCoach 
                  ? (t('system_messages_description') || 'Системные уведомления и связь с администрацией')
                  : (t('admin_will_see_messages') || 'Ваши сообщения увидит администрация академии')
              )}
            </div>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="animate-spin mr-2">⏳</div> {t('loading')}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-red-500 p-4 text-center">
                <span className="text-4xl mb-2">⚠️</span>
                <span className="mb-4 font-medium">{error}</span>
                <button 
                  onClick={() => { setLoading(true); loadMessages(); }} 
                  className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
                >
                  {t('retry') || 'Повторить'}
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <span className="text-4xl mb-2">💬</span>
                <span>{selectedChat.type === 'support' ? (t('write_first_question') || 'Напишите ваш первый вопрос') : t('no_messages_yet')}</span>
              </div>
            ) : (
              messages.map((msg, index) => {
                const own = isOwnMessage(msg);
                const isAnnouncement = msg.chat_type?.toLowerCase() === 'announcement';
                const isSupport = selectedChat.type === 'support';
                const canDelete = own || isAdmin; // Admin can delete any message
                const canEdit = own; // Only owner can edit
                
                // Date separator logic
                const currentDate = msg.created_at ? format(parseISO(msg.created_at), 'yyyy-MM-dd') : null;
                const prevDate = index > 0 && messages[index - 1].created_at 
                  ? format(parseISO(messages[index - 1].created_at), 'yyyy-MM-dd') 
                  : null;
                const showDateSeparator = currentDate && currentDate !== prevDate;
                
                return (
                  <div key={msg.id}>
                    {showDateSeparator && (
                      <div className="flex justify-center my-6">
                        <div className="bg-gray-200 text-gray-600 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm border border-gray-300">
                          {getMessageDateHeader(msg.created_at)}
                        </div>
                      </div>
                    )}
                    <div
                      className={`flex gap-3 group ${own ? 'flex-row-reverse' : 'flex-row'}`}
                    >
                    {/* Sender Avatar */}
                    <div className="flex-shrink-0 mt-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border-2 shadow-sm ${
                        own 
                          ? 'bg-green-100 border-green-400' 
                          : isAnnouncement 
                            ? 'bg-yellow-100 border-yellow-400'
                            : 'bg-blue-100 border-blue-400'
                      }`}>
                        {msg.sender_avatar_url ? (
                          <img 
                            src={`http://localhost:8000${msg.sender_avatar_url}`} 
                            alt={msg.sender_name} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-lg">{getRoleIcon(msg.sender_role)}</span>
                        )}
                      </div>
                    </div>

                    <div className={`flex flex-col ${own ? 'items-end' : 'items-start'} max-w-[85%] md:max-w-[70%]`}>
                      <div
                        className={`rounded-2xl p-3 md:p-4 shadow-sm relative text-sm md:text-base break-words w-full ${
                          isAnnouncement
                            ? 'bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-300 text-gray-800 rounded-tl-none'
                            : own
                              ? 'bg-gradient-to-br from-green-500 to-green-600 text-white rounded-tr-none'
                              : isSupport
                                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-tl-none'
                                : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                        }`}
                      >
                        {/* Sender info - всегда показываем для чужих сообщений */}
                        {(!own || isAnnouncement) && (
                          <div className={`text-xs font-bold mb-2 flex items-center gap-2 ${
                            isAnnouncement 
                              ? 'text-yellow-700' 
                              : own 
                                ? 'text-green-200'
                                : isSupport
                                  ? 'text-blue-200'
                                  : 'text-gray-600'
                          }`}>
                            <span className="text-base">{getRoleIcon(msg.sender_role)}</span>
                            <span>{msg.sender_name}</span>
                            {isAnnouncement && (
                              <span className="bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full text-xs font-bold">
                                📢 {t('announcement')}
                              </span>
                            )}
                          </div>
                        )}
                        
                        {/* Свои сообщения - показать "Вы" */}
                        {own && !isAnnouncement && (
                          <div className="text-xs font-bold mb-1 text-green-200 flex items-center gap-1">
                            <span>✓</span> {t('you') || 'Вы'}
                          </div>
                        )}
                        
                        {/* Message content */}
                        <div className="break-words whitespace-pre-wrap leading-relaxed min-w-0">{msg.content}</div>
                        
                        {/* Time */}
                        <div className={`text-xs mt-2 flex items-center gap-2 ${
                          isAnnouncement
                            ? 'text-yellow-600'
                            : own 
                              ? 'text-green-200' 
                              : isSupport
                                ? 'text-blue-200'
                                : 'text-gray-400'
                        }`}>
                          <span>🕐 {formatTime(msg.created_at)}</span>
                          {msg.group_name && selectedChat.type !== 'group' && (
                            <span>• {msg.group_name}</span>
                          )}
                          {msg.is_edited && (
                            <span className="italic opacity-70">({t('edited') || 'изменено'})</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className={`flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${own ? 'justify-end' : 'justify-start'}`}>
                        {canEdit && (
                          <button 
                            onClick={() => handleEdit(msg)}
                            className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-1 px-2 py-1 hover:bg-gray-100 rounded"
                            title={t('edit')}
                          >
                            ✏️
                          </button>
                        )}
                        {canDelete && (
                          <button 
                            onClick={() => handleDelete(msg.id)}
                            className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 hover:bg-gray-100 rounded"
                            title={t('delete')}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input - for group chats (not for parents) and support */}
          {((selectedChat.type === 'group' && !isParent) || selectedChat.type === 'support') && (
            <div className="bg-white border-t pb-safe">
              {editMode && (
                <div className="px-3 py-2 md:px-4 bg-blue-50 border-b flex justify-between items-center text-xs md:text-sm">
                  <div className="flex items-center gap-2 text-blue-700 truncate mr-2">
                    <span>✏️</span>
                    <span className="font-medium truncate">{t('editing_message') || 'Редактирование сообщения'}</span>
                  </div>
                  <button 
                    onClick={cancelEdit}
                    className="text-gray-500 hover:text-gray-700 whitespace-nowrap"
                  >
                    ✕ {t('cancel')}
                  </button>
                </div>
              )}
              <form onSubmit={sendMessage} className="p-2 md:p-4">
                <div className="flex gap-2 md:gap-3 items-end">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={selectedChat.type === 'support' ? (t('write_your_question') || 'Напишите ваш вопрос...') : t('type_message')}
                    className="flex-1 px-3 py-2 md:px-4 md:py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-white bg-[#2D323B] placeholder-gray-500 text-sm md:text-base min-w-0"
                    style={{ color: 'white', backgroundColor: '#2D323B' }}
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    disabled={sending || !newMessage.trim()}
                    className={`px-4 py-2 md:px-6 md:py-3 text-white rounded-xl disabled:opacity-50 transition font-medium flex items-center justify-center shrink-0 ${
                      editMode
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : selectedChat.type === 'support' 
                          ? 'bg-blue-600 hover:bg-blue-700' 
                          : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {sending ? (
                      <span className="animate-spin">⏳</span>
                    ) : editMode ? (
                      <>
                        <span className="md:hidden">💾</span>
                        <span className="hidden md:inline">{t('save') || 'Сохранить'}</span>
                      </>
                    ) : (
                      <>
                        <span className="md:hidden">➤</span>
                        <span className="hidden md:inline">{t('send')}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Read Only Notice for Parents in Group Chat */}
          {selectedChat.type === 'group' && isParent && (
            <div className="p-4 border-t bg-gray-50 text-center text-gray-500 italic">
              🔒 {t('group_chat_readonly_parent') || 'Только тренеры могут писать в группу. Для вопросов используйте тех. поддержку.'}
            </div>
          )}

          {/* Admin notice for announcements */}
          {selectedChat.type === 'announcements' && (
            <div className="p-4 border-t bg-yellow-50 text-center text-yellow-700">
              {isAdmin ? (
                <button
                  onClick={() => setShowAnnouncement(true)}
                  className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition"
                >
                  📢 {t('create_announcement')}
                </button>
              ) : (
                <span>📢 {t('announcements_read_only')}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Announcement Modal */}
      {showAnnouncement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6 rounded-t-2xl">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <span>📢</span> {t('new_announcement')}
              </h2>
            </div>
            
            <form onSubmit={handleAnnouncementSubmit} className="p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('announcement_title')}
                </label>
                <input
                  type="text"
                  value={announcementForm.title}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                  placeholder={t('announcement_title_placeholder')}
                  className="w-full px-4 py-3 border border-gray-700 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent text-white bg-[#2D323B] placeholder-gray-500"
                  style={{ color: 'white', backgroundColor: '#2D323B' }}
                  maxLength={100}
                />
                <div className="text-xs text-gray-500 mt-1">
                  {t('optional_short_summary')}
                </div>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('announcement_content')} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={announcementForm.content}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                  placeholder={t('announcement_content_placeholder')}
                  rows={5}
                  className="w-full px-4 py-3 border border-gray-700 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none text-white bg-[#2D323B] placeholder-gray-500"
                  style={{ color: 'white', backgroundColor: '#2D323B' }}
                  required
                />
              </div>

              {/* Media Upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('attach_media')}
                </label>
                
                {!announcementForm.media ? (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-yellow-500 hover:bg-yellow-50 transition">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <span className="text-3xl mb-2">📎</span>
                      <p className="text-sm text-gray-600 font-medium">{t('click_to_upload')}</p>
                      <p className="text-xs text-gray-500 mt-1">{t('supported_formats')}</p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/jpg,application/pdf"
                      onChange={handleMediaChange}
                    />
                  </label>
                ) : (
                  <div className="relative border-2 border-gray-300 rounded-xl p-4">
                    {announcementForm.media.type.startsWith('image/') ? (
                      <img
                        src={announcementForm.media_preview}
                        alt="Preview"
                        className="w-full h-48 object-contain rounded-lg"
                      />
                    ) : (
                      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                        <span className="text-4xl">📄</span>
                        <div>
                          <div className="font-medium text-gray-800">{announcementForm.media.name}</div>
                          <div className="text-sm text-gray-500">
                            {(announcementForm.media.size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={removeMedia}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-600 transition"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Audience selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  {t('recipients')} <span className="text-red-500">*</span>
                </label>
                
                {/* General Announcement Option */}
                <div className="mb-3">
                  <label className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer hover:bg-yellow-50 transition-colors ${announcementForm.is_general ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200'}`}>
                    <div className="pt-1">
                      <input
                        type="radio"
                        name="audience"
                        checked={announcementForm.is_general}
                        onChange={() => setAnnouncementForm({ ...announcementForm, is_general: true, group_ids: [] })}
                        className="w-5 h-5 text-yellow-600"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">📢</span>
                        <span className="font-bold text-gray-800">{t('send_to_all')}</span>
                      </div>
                      <div className="text-sm text-gray-600">{t('all_parents_coaches_see')}</div>
                    </div>
                  </label>
                </div>
                
                {/* Group-Specific Announcement Option */}
                <div>
                  <label className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer hover:bg-blue-50 transition-colors ${!announcementForm.is_general ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                    <div className="pt-1">
                      <input
                        type="radio"
                        name="audience"
                        checked={!announcementForm.is_general}
                        onChange={() => setAnnouncementForm({ ...announcementForm, is_general: false })}
                        className="w-5 h-5 text-blue-600"
                      />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">⚽</span>
                        <span className="font-bold text-gray-800">{t('specific_groups')}</span>
                      </div>
                      <div className="text-sm text-gray-600">{t('select_one_or_more_groups')}</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Group selection */}
              {!announcementForm.is_general && (
                <div className="bg-blue-50 p-4 rounded-xl border-2 border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-blue-600 text-lg">📋</span>
                    <h3 className="font-semibold text-blue-800">{t('select_groups')}</h3>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {groups.map(group => (
                      <label key={group.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border-2 cursor-pointer hover:border-blue-400 transition-colors">
                        <input
                          type="checkbox"
                          checked={announcementForm.group_ids.includes(group.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAnnouncementForm({
                                ...announcementForm,
                                group_ids: [...announcementForm.group_ids, group.id]
                              });
                            } else {
                              setAnnouncementForm({
                                ...announcementForm,
                                group_ids: announcementForm.group_ids.filter(id => id !== group.id)
                              });
                            }
                          }}
                          className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-800">{group.name}</div>
                          {group.coach_name && (
                            <div className="text-xs text-gray-600">{t('coach')}: {group.coach_name}</div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  
                  {announcementForm.group_ids.length > 0 && (
                    <div className="mt-3 pt-3 border-t-2 border-blue-200">
                      <div className="text-sm font-semibold text-blue-700">
                        ✓ {t('selected')}: {announcementForm.group_ids.length} {t('groups')}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setShowAnnouncement(false);
                    setAnnouncementForm({ 
                      title: '', 
                      content: '', 
                      is_general: true, 
                      group_ids: [],
                      media: null,
                      media_preview: null
                    });
                  }}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={!announcementForm.content.trim() || (!announcementForm.is_general && announcementForm.group_ids.length === 0)}
                  className="flex-1 px-4 py-3 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-bold"
                >
                  {t('continue')} →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">⚠️</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">{t('confirm_sending')}</h3>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-3">
                  <div className="font-semibold text-yellow-800 mb-1">{t('recipients')}:</div>
                  <div className="text-gray-700">{getRecipientCount()}</div>
                </div>
                {announcementForm.title && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2 text-left">
                    <div className="font-semibold text-gray-700 mb-1">📌 {announcementForm.title}</div>
                    <div className="text-sm text-gray-600 line-clamp-3">{announcementForm.content}</div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmation(false)}
                disabled={sending}
                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition font-medium disabled:opacity-50"
              >
                {t('back')}
              </button>
              <button
                onClick={sendAnnouncement}
                disabled={sending}
                className="flex-1 px-4 py-3 bg-yellow-500 text-white rounded-xl hover:bg-yellow-600 disabled:opacity-50 transition font-bold flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <div className="animate-spin">⏳</div>
                    {t('sending')}
                  </>
                ) : (
                  <>
                    <span>📢</span>
                    {t('publish')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
