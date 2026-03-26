import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage, LANGUAGES } from '../context/LanguageContext.jsx';
import { useState, useRef, useEffect } from 'react';
import GlobalSearch from './GlobalSearch';
import { navigationConfig, roleLabelKeys } from '../config/navigation';
import { Search, Menu, X } from 'lucide-react';
import { messagesAPI } from '../api/client';

function normalizeRole(role) {
  if (!role) return null;
  const r = role.toString().toLowerCase().trim();
  if (r === 'super_admin' || r === 'super admin' || r === 'userrole.super_admin') return 'super_admin';
  if (r === 'owner' || r === 'userrole.owner') return 'owner';
  if (r === 'admin' || r === 'administrator' || r === 'userrole.admin') return 'admin';
  if (r === 'accountant' || r === 'userrole.accountant') return 'accountant';
  if (r === 'coach' || r === 'userrole.coach') return 'coach';
  if (r === 'parent' || r === 'userrole.parent') return 'parent';
  return r;
}

export default function Layout() {
  const auth = useAuth();
  const user = auth?.user;
  const logout = auth?.logout;
  
  // Safety check to prevent crash if context is missing
  if (!auth) {
    console.error('AuthContext is missing in Layout');
  }

  const { t, language, changeLanguage } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const fetchUnreadCount = async () => {
      try {
        if (!user) return;
        const response = await messagesAPI.getTotalUnreadCount();
        setUnreadCount(response.data.total);
      } catch (error) {
        console.error('Failed to fetch unread count', error);
      }
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Poll every 30 seconds
    return () => clearInterval(interval);
  }, [user]);

  // Swipe to close logic
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [isLandscape, setIsLandscape] = useState(false);

  const minSwipeDistance = 50;

  useEffect(() => {
    const handleOrientationChange = (e) => {
      setIsLandscape(e.matches);
    };

    const mediaQuery = window.matchMedia("(orientation: landscape)");
    setIsLandscape(mediaQuery.matches); // Set initial value

    // Use addListener for compatibility as requested, though addEventListener is modern standard
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleOrientationChange);
    } else {
      mediaQuery.addListener(handleOrientationChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleOrientationChange);
      } else {
        mediaQuery.removeListener(handleOrientationChange);
      }
    };
  }, []);

  const onTouchStart = (e) => {
    setTouchEnd(null); // Reset touch end
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEndHandler = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    if (isLeftSwipe) {
      setMobileMenuOpen(false);
    }
  };

  // Scroll active item into view on mount and route change
  useEffect(() => {
    if (scrollRef.current) {
      const activeLink = scrollRef.current.querySelector('.mobile-active-link');
      if (activeLink) {
        activeLink.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [location.pathname]);

  // Auto-focus search input when mobile search opens
  useEffect(() => {
    if (showMobileSearch) {
      setTimeout(() => {
        const input = document.getElementById('global-search-input');
        if (input) input.focus();
      }, 100);
    }
  }, [showMobileSearch]);

  // Normalize role to lowercase
  const normalizedRole = normalizeRole(user?.role) || 'parent';
  
  // Get base menu items for role
  let menuItems = [...(navigationConfig[normalizedRole] || navigationConfig.parent)];
  
  // Add history for admin if has permission (super_admin/owner always have it in config)
  if (normalizedRole === 'admin' && user?.can_view_history) {
    const settingsIndex = menuItems.findIndex(item => item.path === '/settings');
    if (settingsIndex !== -1 && !menuItems.find(item => item.path === '/history')) {
      menuItems.splice(settingsIndex, 0, { path: '/history', labelKey: 'nav_history', icon: '🕐' });
    }
  }

  // Add CRM for admin if has permission
  if (normalizedRole === 'admin' && user?.can_view_crm) {
    const settingsIndex = menuItems.findIndex(item => item.path === '/settings');
    if (!menuItems.find(item => item.path === '/crm')) {
      const insertIndex = settingsIndex !== -1 ? settingsIndex : menuItems.length;
      menuItems.splice(insertIndex, 0, { path: '/crm', labelKey: 'nav_crm', icon: '🧩' });
    }
  }

  // Add Recruitment for admin if has permission
  if (normalizedRole === 'admin' && user?.can_view_recruitment) {
    const settingsIndex = menuItems.findIndex(item => item.path === '/settings');
    const crmIndex = menuItems.findIndex(item => item.path === '/crm');
    if (!menuItems.find(item => item.path === '/recruitment')) {
      let insertIndex = settingsIndex !== -1 ? settingsIndex : menuItems.length;
      if (crmIndex !== -1) {
        insertIndex = crmIndex + 1;
      }
      menuItems.splice(insertIndex, 0, { path: '/recruitment', labelKey: 'nav_recruitment', icon: '🧑‍💼' });
    }
  }
  
  // Add Marketing for admin if has permission
  if (normalizedRole === 'admin' && user?.can_view_marketing) {
    const settingsIndex = menuItems.findIndex(item => item.path === '/settings');
    const recruitmentIndex = menuItems.findIndex(item => item.path === '/recruitment');
    const crmIndex = menuItems.findIndex(item => item.path === '/crm');
    if (!menuItems.find(item => item.path === '/marketing')) {
      let insertIndex = settingsIndex !== -1 ? settingsIndex : menuItems.length;
      if (recruitmentIndex !== -1) {
        insertIndex = recruitmentIndex + 1;
      } else if (crmIndex !== -1) {
        insertIndex = crmIndex + 1;
      }
      menuItems.splice(insertIndex, 0, { path: '/marketing', labelKey: 'nav_marketing', icon: '🎯' });
    }
  }
  
  // Add analytics for admin if has permission
  if (normalizedRole === 'admin' && user?.can_view_analytics) {
    // Insert analytics after dashboard (index 1)
    if (!menuItems.find(item => item.path === '/analytics')) {
      menuItems.splice(1, 0, { path: '/analytics', labelKey: 'nav_analytics', icon: '📈' });
    }
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-background text-foreground bg-gradient-mesh relative overflow-hidden">
      {/* Background Decor - Fixed container to prevent overflow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse-glow" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[400px] h-[400px] bg-primary/5 rounded-full blur-[120px] animate-float" />
      </div>

      {/* Landscape Mobile Burger Button */}
      <div className="fixed top-4 right-4 z-[9999] hidden landscape-burger lg:hidden">
        <div className="relative">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-10 h-10 bg-black/50 backdrop-blur-md border border-white/10 rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          
          {/* Right Side Drawer for Landscape Mode */}
          {mobileMenuOpen && (
            <div className="fixed inset-y-0 right-0 w-80 max-w-[90vw] bg-[#15171B]/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl z-[10000] flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-4 border-b border-white/10 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="font-bold text-white text-base">{t('menu') || 'Меню'}</h2>
                  <div className="text-xs text-white/40 truncate max-w-[180px]">
                    {user?.full_name || user?.phone}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {LANGUAGES.map(lang => (
                      <button 
                        key={lang.code}
                        onClick={() => changeLanguage(lang.code)}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all border ${
                          language === lang.code 
                            ? 'bg-brand-yellow text-black border-brand-yellow' 
                            : 'bg-white/5 text-white/60 border-transparent hover:text-white'
                        }`}
                      >
                        {lang.flag}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                <div className="space-y-1 pb-safe">
                  {menuItems.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) => {
                        return `flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                          isActive
                            ? 'bg-brand-yellow/10 text-brand-yellow font-medium border border-brand-yellow/20'
                            : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`;
                      }}
                    >
                      {({ isActive }) => (
                        <>
                          <span className={`text-xl ${isActive ? 'text-brand-yellow' : ''}`}>{item.icon}</span>
                          <span className={`text-sm ${isActive ? 'text-brand-yellow font-bold' : ''}`}>{t(item.labelKey)}</span>
                          {item.path === '/communications' && unreadCount > 0 && (
                            <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg animate-pulse">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
              
              <div className="p-4 border-t border-white/10 bg-white/5 shrink-0 pb-safe-offset-4">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-sm font-medium"
                >
                  <span>🚪</span>
                  {t('logout')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Header */}
      <div className="fixed top-2 left-2 right-2 h-14 bg-sidebar/90 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl z-50 lg:hidden landscape-hidden flex items-center justify-between px-4 transition-all duration-300">
        <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-primary-light bg-clip-text text-transparent">
          ☀️ Sunny Academy
        </h1>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowMobileSearch(!showMobileSearch)}
            className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors ${showMobileSearch ? 'bg-primary/20 text-primary' : 'bg-transparent text-muted-foreground'}`}
          >
            <Search size={18} />
          </button>
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Search Overlay */}
      <div className={`fixed top-[72px] left-2 right-2 bg-sidebar/90 backdrop-blur-xl p-3 z-[100] lg:hidden landscape-hidden transition-all duration-300 border border-white/10 rounded-3xl shadow-2xl ${showMobileSearch ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <GlobalSearch onSelect={() => setShowMobileSearch(false)} placeholder="Поиск..." />
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop visible, Mobile slide-in, Landscape slide-in */}
      <aside 
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEndHandler}
        className={`
        fixed lg:relative top-0 left-0 h-full w-[280px] lg:w-64
        bg-sidebar border-r border-border/50 text-sidebar-foreground 
        flex flex-col z-50 backdrop-blur-sm will-change-transform
        transform transition-transform duration-200 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        landscape:hidden lg:landscape:flex
      `}>
        <div className="p-6 border-b border-sidebar-border/50 lg:pt-6 landscape:pt-6">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary-light bg-clip-text text-transparent">
            ☀️ Sunny Football Academy
          </h1>
        </div>
        
        <nav className="flex-1 p-4 overflow-y-auto overscroll-contain">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) => {
                return `flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all duration-300 relative group ${
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
                }`;
              }}
            >
              {({ isActive }) => (
                <>
                  {/* Left Golden Stripe for Active State */}
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full shadow-[0_0_10px_hsl(45,100%,51%,0.5)]" />
                  )}
                  
                  <span className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                    {item.icon}
                  </span>
                  <span className="">{t(item.labelKey)}</span>
                  {item.path === '/communications' && unreadCount > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shadow-lg animate-pulse">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border/50 bg-sidebar/50">
          <div className="flex gap-2 mb-4 justify-center">
             {LANGUAGES.map(lang => (
               <button 
                 key={lang.code}
                 onClick={() => changeLanguage(lang.code)}
                 className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border ${
                   language === lang.code 
                     ? 'bg-primary/20 text-primary border-primary/50 shadow-glow' 
                     : 'bg-muted/50 text-muted-foreground border-transparent hover:border-primary/30 hover:text-primary'
                 }`}
               >
                 {lang.flag} {lang.code.toUpperCase()}
               </button>
             ))}
          </div>
          <div className="text-sm mb-3 px-2">
            <div className="font-bold text-foreground">{user?.full_name || user?.phone}</div>
            <div className="text-primary text-xs font-medium uppercase tracking-wider">{t(roleLabelKeys[normalizedRole]) || user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 hover:border-destructive/50 px-4 py-2.5 rounded-lg transition-all duration-300 flex items-center justify-center gap-2 group"
          >
            <span className="group-hover:-translate-x-1 transition-transform">🚪</span>
            {t('logout')}
          </button>
        </div>
      </aside>
      
      {/* Main content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden z-10 relative pt-[70px] lg:pt-0 landscape:pt-4 landscape-full-height landscape:pr-16 lg:landscape:pr-0 pb-[96px] lg:pb-0 landscape:pb-0 flex flex-col w-full transition-all duration-200 ease-in-out no-scrollbar">
        {/* Desktop Header with Global Search */}
        <header className="hidden lg:flex items-center justify-end px-8 py-3 bg-background/80 backdrop-blur-sm sticky top-0 z-30 border-b border-white/5">
           <div className="flex-1 max-w-2xl">
              <GlobalSearch />
           </div>
        </header>

        <div className="p-2 lg:p-8 w-full mx-auto animate-fade-in flex-1">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-4 left-4 right-4 bg-[#15171B]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-50 lg:hidden landscape-hidden overflow-hidden ring-1 ring-white/5">
        {/* Horizontal Scroll Container */}
        <div 
          ref={scrollRef}
          className="flex items-center h-[72px] px-2 overflow-x-auto gap-2 no-scrollbar scroll-smooth"
        >
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => {
                return `flex flex-col items-center justify-center gap-0.5 min-w-[68px] h-[60px] rounded-xl transition-all duration-300 active:scale-95 flex-shrink-0 relative ${
                  isActive
                    ? 'mobile-active-link'
                    : 'text-gray-500 hover:text-gray-300'
                }`;
              }}
            >
              {({ isActive }) => (
                <>
                  {/* Active Background Glow */}
                  {isActive && (
                    <div className="absolute inset-0 bg-yellow-500/10 rounded-xl border border-yellow-500/20 shadow-[inset_0_0_12px_rgba(234,179,8,0.1)]" />
                  )}
                  
                  {/* Icon */}
                  <div className={`relative z-10 p-1 transition-all duration-300 ${
                    isActive 
                      ? 'text-yellow-400 transform -translate-y-0.5 scale-110 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]' 
                      : ''
                  }`}>
                    <span className="text-2xl block h-7 w-7 flex items-center justify-center">{item.icon}</span>
                  </div>
                  
                  {/* Label */}
                  <span className={`text-[10px] font-bold truncate max-w-[64px] relative z-10 transition-all duration-300 ${
                    isActive 
                      ? 'text-yellow-400 opacity-100' 
                      : 'opacity-70'
                  }`}>
                    {t(item.labelKey)}
                  </span>
                  
                  {/* Bottom Dot for Active */}
                  {isActive && (
                    <div className="absolute bottom-1 w-1 h-1 bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(250,204,21,1)]" />
                  )}
                  
                  {/* Notification Badge */}
                  {item.path === '/communications' && unreadCount > 0 && (
                    <span className="absolute top-2 right-2 min-w-[16px] h-[16px] bg-red-500 text-white text-[9px] font-bold flex items-center justify-center rounded-full shadow-lg animate-pulse border border-[#15171B]">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
