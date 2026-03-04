import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, GraduationCap, Loader2, ExternalLink } from 'lucide-react';
import { studentsAPI, usersAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { navigationConfig } from '../config/navigation';

// Simple debounce hook implementation
function useDebounceValue(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function GlobalSearch({ onSelect, placeholder }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ students: [], users: [], nav: [] });
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debouncedQuery = useDebounceValue(query, 300);
  const navigate = useNavigate();
  const wrapperRef = useRef(null);

  useEffect(() => {
    // Click outside handler
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults({ students: [], users: [], nav: [] });
      return;
    }

    const search = async () => {
      setLoading(true);
      try {
        // 1. Search in Navigation
        const role = user?.role?.toLowerCase() || 'parent';
        const menuItems = navigationConfig[role] || navigationConfig.parent;
        
        const navResults = menuItems.filter(item => {
          const label = t(item.labelKey)?.toLowerCase() || '';
          
          // Custom keywords map for better search experience
          const keywords = {
             'nav_personal': ['дневник', 'профиль', 'главная', 'home', 'личный', 'статистика', 'рейтинг', 'посещаемость', 'пропуски', 'табель', 'медосмотр', 'stats', 'attendance', 'medical'],
             'nav_payments': ['оплата', 'деньги', 'счет', 'платежи', 'квитанции', 'долг'],
             'nav_calendar': ['расписание', 'тренировки', 'календарь', 'события', 'матчи'],
             'nav_schedule': ['календарь', 'расписание', 'тренировки'],
             'nav_communications': ['сообщения', 'чат', 'письма', 'связь', 'новости'],
             'nav_settings': ['настройки', 'пароль', 'безопасность', 'профиль'],
             'nav_attendance': ['посещаемость', 'пропуски', 'табель', 'отметки'],
             'nav_students': ['ученики', 'игроки', 'футболисты', 'дети', 'список'],
             'nav_groups': ['группы', 'команды', 'составы'],
             'nav_users': ['пользователи', 'сотрудники', 'персонал', 'родители'],
             'nav_salary_management': ['зарплата', 'выплаты', 'финансы', 'отчеты'],
             'nav_my_salary': ['моя зарплата', 'доход', 'выплаты'],
             'nav_history': ['история', 'журнал', 'логи', 'действия'],
             'nav_coach_analytics': ['аналитика', 'статистика тренера', 'эффективность']
          };
          
          const itemKeywords = keywords[item.labelKey] || [];
          const hasKeywordMatch = itemKeywords.some(kw => 
             debouncedQuery.toLowerCase().includes(kw) || kw.includes(debouncedQuery.toLowerCase())
          );
          
          if (hasKeywordMatch) return true;

          return label.includes(debouncedQuery.toLowerCase());
        });

        // 2. Search in API (students/users)
        // Only for roles that can see students/users
        const canSearchDB = ['super_admin', 'admin', 'coach', 'accountant'].includes(role);
        
        let students = [];
        let users = [];

        if (canSearchDB) {
          const [studentsRes, usersRes] = await Promise.all([
            studentsAPI.getAll({ search: debouncedQuery, limit: 5 }),
            usersAPI.getAll({ search: debouncedQuery, limit: 5 })
          ]);
          students = studentsRes.data.data || [];
          users = usersRes.data.data || [];
        }

        setResults({
          students,
          users,
          nav: navResults
        });
        setShowResults(true);
      } catch (error) {
        console.error("Search failed", error);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [debouncedQuery, user, t]);

  const handleSelect = (type, item) => {
    setShowResults(false);
    setQuery('');
    if (onSelect) onSelect();

    if (type === 'nav') {
      navigate(item.path);
    } else if (type === 'student') {
      // Navigate to students page with search state to filter/highlight
      navigate('/students', { state: { openStudentId: item.id } }); 
    } else if (type === 'user') {
      navigate('/users-management', { state: { search: item.phone } });
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    
    // Use the logic from handleInputKeyDown
    if (results.nav.length > 0) {
      handleSelect('nav', results.nav[0]);
      return;
    }
    if (results.students.length > 0) {
      handleSelect('student', results.students[0]);
      return;
    }
    if (results.users.length > 0) {
      handleSelect('user', results.users[0]);
      return;
    }

    // Try immediate local search if no results
    if (query.length >= 2) {
       const role = user?.role?.toLowerCase() || 'parent';
       const menuItems = navigationConfig[role] || navigationConfig.parent;
       
       const navResults = menuItems.filter(item => {
         const label = t(item.labelKey)?.toLowerCase() || '';
         const keywords = {
            'nav_personal': ['дневник', 'профиль', 'главная', 'home', 'личный', 'статистика', 'рейтинг', 'посещаемость', 'пропуски', 'табель', 'медосмотр', 'stats', 'attendance', 'medical'],
            'nav_payments': ['оплата', 'деньги', 'счет', 'платежи', 'квитанции', 'долг'],
            'nav_calendar': ['расписание', 'тренировки', 'календарь', 'события', 'матчи'],
            'nav_schedule': ['календарь', 'расписание', 'тренировки'],
            'nav_communications': ['сообщения', 'чат', 'письма', 'связь', 'новости'],
            'nav_settings': ['настройки', 'пароль', 'безопасность', 'профиль'],
            'nav_attendance': ['посещаемость', 'пропуски', 'табель', 'отметки'],
            'nav_students': ['ученики', 'игроки', 'футболисты', 'дети', 'список'],
            'nav_groups': ['группы', 'команды', 'составы'],
            'nav_users': ['пользователи', 'сотрудники', 'персонал', 'родители'],
            'nav_salary_management': ['зарплата', 'выплаты', 'финансы', 'отчеты'],
            'nav_my_salary': ['моя зарплата', 'доход', 'выплаты'],
            'nav_history': ['история', 'журнал', 'логи', 'действия'],
            'nav_coach_analytics': ['аналитика', 'статистика тренера', 'эффективность']
         };
         
         const itemKeywords = keywords[item.labelKey] || [];
         const hasKeywordMatch = itemKeywords.some(kw => 
            query.toLowerCase().includes(kw) || kw.includes(query.toLowerCase())
         );
         
         if (hasKeywordMatch) return true;
         return label.includes(query.toLowerCase());
       });

       if (navResults.length > 0) {
          handleSelect('nav', navResults[0]);
       }
    }
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleFormSubmit(e);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        document.getElementById('global-search-input')?.focus();
    }
    if (e.key === 'Escape') setShowResults(false);
  }
  
  useEffect(() => {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md mx-auto">
      <form onSubmit={handleFormSubmit} className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors h-4 w-4" />
        <input
          id="global-search-input"
          type="text"
          value={query}
          onChange={(e) => {
              setQuery(e.target.value);
              if(e.target.value.length >= 2) setShowResults(true);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder || "Поиск (Cmd+K)"}
          className="w-full pl-10 pr-4 py-2 bg-secondary/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-muted-foreground/70"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin h-4 w-4" />
        )}
      </form>

      {showResults && (results.students.length > 0 || results.users.length > 0 || results.nav.length > 0) && (
        <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-200">
          <div className="max-h-[80vh] overflow-y-auto custom-scrollbar">
            {results.nav.length > 0 && (
              <div className="p-2 border-b border-border">
                <div className="text-xs font-medium text-muted-foreground px-2 mb-1 uppercase tracking-wider">Разделы</div>
                {results.nav.map(item => (
                  <button
                    key={item.path}
                    onClick={(e) => { e.preventDefault(); handleSelect('nav', item); }}
                    onTouchEnd={(e) => { e.preventDefault(); handleSelect('nav', item); }}
                    className="w-full flex items-center gap-3 p-2 hover:bg-primary/10 active:bg-primary/20 rounded-md transition-colors text-left"
                  >
                     <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 flex-shrink-0 text-lg">
                       {item.icon || <ExternalLink size={16} />}
                     </div>
                     <div className="min-w-0">
                       <div className="text-sm font-medium truncate">{t(item.labelKey)}</div>
                       <div className="text-xs text-muted-foreground truncate">Перейти</div>
                     </div>
                  </button>
                ))}
              </div>
            )}

            {results.students.length > 0 && (
              <div className="p-2">
                <div className="text-xs font-medium text-muted-foreground px-2 mb-1 uppercase tracking-wider">Ученики</div>
                {results.students.map(student => (
                  <button
                    key={student.id}
                    onClick={(e) => { e.preventDefault(); handleSelect('student', student); }}
                    onTouchEnd={(e) => { e.preventDefault(); handleSelect('student', student); }}
                    className="w-full flex items-center gap-3 p-2 hover:bg-primary/10 active:bg-primary/20 rounded-md transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 flex-shrink-0">
                      {student.avatar_url ? (
                        <img src={student.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <GraduationCap size={16} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{student.first_name} {student.last_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{student.group_name || 'Без группы'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            {results.users.length > 0 && (
              <div className="p-2 border-t border-border">
                <div className="text-xs font-medium text-muted-foreground px-2 mb-1 uppercase tracking-wider">Пользователи</div>
                {results.users.map(user => (
                  <button
                    key={user.id}
                    onClick={(e) => { e.preventDefault(); handleSelect('user', user); }}
                    onTouchEnd={(e) => { e.preventDefault(); handleSelect('user', user); }}
                    className="w-full flex items-center gap-3 p-2 hover:bg-primary/10 active:bg-primary/20 rounded-md transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-500 flex-shrink-0">
                      <User size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{user.full_name || 'Без имени'}</div>
                      <div className="text-xs text-muted-foreground truncate">{user.phone} • {user.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {showResults && query.length >= 2 && results.students.length === 0 && results.users.length === 0 && results.nav.length === 0 && !loading && (
         <div className="absolute top-full mt-2 w-full bg-card border border-border rounded-lg shadow-xl p-4 text-center text-muted-foreground text-sm z-50">
            Ничего не найдено
         </div>
      )}
    </div>
  );
}
