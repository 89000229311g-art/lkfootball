import { useState, useEffect } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ru, enUS, ro } from 'date-fns/locale';
import { messagesAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';

export default function NewsFeed() {
  const { t, language } = useLanguage();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread, read
  const limit = 10;

  useEffect(() => {
    loadAnnouncements(1);
  }, [filter]);

  const loadAnnouncements = async (pageNum) => {
    try {
      setLoading(true);
      const skip = (pageNum - 1) * limit;
      
      const res = await messagesAPI.getAnnouncements({ 
        skip, 
        limit 
      });
      
      const newAnnouncements = res.data || [];
      
      if (pageNum === 1) {
        setAnnouncements(newAnnouncements);
      } else {
        setAnnouncements(prev => [...prev, ...newAnnouncements]);
      }
      
      setHasMore(newAnnouncements.length === limit);
      setPage(pageNum);
    } catch (err) {
      console.error('Failed to load announcements:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      loadAnnouncements(page + 1);
    }
  };

  const markAsRead = async (messageId) => {
    try {
      await messagesAPI.markAsRead(messageId);
      setAnnouncements(prev =>
        prev.map(msg =>
          msg.id === messageId ? { ...msg, is_read: true } : msg
        )
      );
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = parseISO(dateStr);
      const locale = language === 'ru' ? ru : (language === 'ro' ? ro : enUS);
      
      if (isToday(date)) {
        return (t('today') || 'Сегодня') + ', ' + format(date, 'HH:mm');
      }
      if (isYesterday(date)) {
        return (t('yesterday') || 'Вчера') + ', ' + format(date, 'HH:mm');
      }
      
      return format(date, 'EEEE, d MMMM yyyy, HH:mm', { locale });
    } catch {
      return '';
    }
  };

  const getRoleIcon = (role) => {
    const icons = { super_admin: '👨‍💼', admin: '🔧', coach: '🏃', parent: '👨‍👩‍👧' };
    return icons[role?.toLowerCase()] || '👤';
  };

  const extractTitle = (content) => {
    // Проверяем, есть ли заголовок с эмодзи 📌
    const titleMatch = content.match(/^📌\s*(.+?)(\n\n|\n|$)/);
    if (titleMatch) {
      return {
        title: titleMatch[1].trim(),
        content: content.replace(/^📌\s*.+?(\n\n|\n)/, '').trim()
      };
    }
    return {
      title: null,
      content: content
    };
  };

  const filteredAnnouncements = announcements.filter(msg => {
    if (filter === 'unread') return !msg.is_read;
    if (filter === 'read') return msg.is_read;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-4xl font-bold mb-2 flex items-center gap-3">
          <span>📢</span>
          <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
            {t('news_feed')}
          </span>
        </h1>
        <p className="text-gray-600">{t('news_feed_description')}</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">{t('filter')}:</span>
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('all')}
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'unread'
                ? 'bg-yellow-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 bg-current rounded-full"></span>
              {t('unread')}
            </span>
          </button>
          <button
            onClick={() => setFilter('read')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === 'read'
                ? 'bg-gray-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t('read')}
          </button>
        </div>
      </div>

      {/* Announcements Feed */}
      <div className="space-y-4">
        {loading && page === 1 ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin text-4xl">⏳</div>
            <span className="ml-3 text-gray-600">{t('loading')}</span>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">
              {t('no_announcements')}
            </h3>
            <p className="text-gray-500">{t('no_announcements_description')}</p>
          </div>
        ) : (
          <>
            {filteredAnnouncements.map((msg) => {
              const { title, content } = extractTitle(msg.content);
              const isNew = !msg.is_read;

              return (
                <div
                  key={msg.id}
                  onClick={() => isNew && markAsRead(msg.id)}
                  className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden ${
                    isNew ? 'border-l-4 border-yellow-500' : 'border-l-4 border-transparent'
                  }`}
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-lg">
                          {getRoleIcon(msg.sender_role)}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-800 flex items-center gap-2">
                            {msg.sender_name}
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              {msg.sender_role === 'admin' || msg.sender_role === 'super_admin' 
                                ? t('role_admin') 
                                : t('role_coach')}
                            </span>
                          </div>
                          <div className="text-sm text-gray-500">{formatDate(msg.created_at)}</div>
                        </div>
                      </div>
                      {isNew && (
                        <div className="flex items-center gap-2 text-yellow-600">
                          <span className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></span>
                          <span className="text-xs font-semibold uppercase">{t('new')}</span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    {title && (
                      <h3 className="text-xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <span>📌</span>
                        {title}
                      </h3>
                    )}

                    {/* Content */}
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap mb-3">
                      {content}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        {msg.is_general ? (
                          <>
                            <span>🌐</span>
                            <span>{t('for_everyone')}</span>
                          </>
                        ) : msg.group_name ? (
                          <>
                            <span>⚽</span>
                            <span>{msg.group_name}</span>
                          </>
                        ) : null}
                      </div>
                      {!isNew && (
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                          <span>✓</span>
                          {t('viewed')}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load More Button */}
            {hasMore && (
              <div className="flex justify-center py-6">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin">⏳</div>
                      {t('loading')}
                    </>
                  ) : (
                    <>
                      <span>⬇️</span>
                      {t('load_more')}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* End Message */}
            {!hasMore && filteredAnnouncements.length > 0 && (
              <div className="text-center py-6 text-gray-500 text-sm">
                <div className="inline-flex items-center gap-2 bg-gray-100 px-4 py-2 rounded-full">
                  <span>✓</span>
                  {t('all_loaded')}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
