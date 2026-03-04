import { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { leadsAPI, funnelAPI, usersAPI, authAPI } from '../api/client';
import toast from 'react-hot-toast';
import { Loader2, Plus, Settings, Download, FileText, X } from 'lucide-react';
import KanbanBoard from '../components/crm/KanbanBoard';
import AnalyticsDashboard from '../components/crm/AnalyticsDashboard';
import LeadDetailsModal from '../components/crm/LeadDetailsModal';
import FunnelSettingsModal from '../components/crm/FunnelSettingsModal';
import { exportToExcel, exportToPDF, getDateString } from '../utils/exportUtils';

export default function CRM() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('funnel'); // 'dashboard' | 'funnel'
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contactFilter, setContactFilter] = useState('all');
  const [ownershipFilter, setOwnershipFilter] = useState('all');
  const [responsibleFilterId, setResponsibleFilterId] = useState('all');
  const [responsibleUsers, setResponsibleUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    phone: '',
    status: 'new',
    source: '',
    notes: '',
    responsible_id: null,
  });

  // Edit Modal State
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, leadId: null });
  const [rejectReason, setRejectReason] = useState('');

  // Default fallback stages if API fails or is empty initially
  const defaultStages = [
    { key: 'new', title: 'Новый лид', color: 'bg-blue-500' },
    { key: 'call', title: 'Звонок', color: 'bg-yellow-500' },
    { key: 'trial', title: 'Первая тренировка', color: 'bg-purple-500' },
    { key: 'offer', title: 'Оффер', color: 'bg-indigo-500' },
    { key: 'deal', title: 'Сделка', color: 'bg-green-500' },
    { key: 'success', title: 'Успех', color: 'bg-emerald-600' },
    { key: 'reject', title: 'Отказ', color: 'bg-red-500' },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (showCreateModal || showSettingsModal || selectedLeadId || rejectModal.open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showCreateModal, showSettingsModal, selectedLeadId, rejectModal.open]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [leadsRes, stagesRes, meRes, usersRes] = await Promise.all([
        leadsAPI.getAll(),
        funnelAPI.getAll().catch(() => ({ data: [] })), // Handle error gracefully
        authAPI.getMe().catch(() => null),
        usersAPI.getAll().catch(() => ({ data: [] })),
      ]);
      
      setLeads(leadsRes.data || []);
      if (meRes && meRes.data) {
        setCurrentUser(meRes.data);
        const role = (meRes.data.role || '').toLowerCase();
        if (role === 'admin' && !meRes.data.can_view_crm) {
          toast.error('Доступ к CRM отключен. Обратитесь к Руководителю.');
          setLoading(false);
          return;
        }
      }

      if (usersRes && Array.isArray(usersRes.data)) {
        const staffRoles = ['super_admin', 'owner', 'admin', 'accountant', 'coach'];
        const filtered = usersRes.data.filter(
          (u) => !u.deleted_at && staffRoles.includes((u.role || '').toLowerCase())
        );
        setResponsibleUsers(filtered);
      }
      
      if (stagesRes.data && stagesRes.data.length > 0) {
        setStages(stagesRes.data);
      } else {
        // Fallback to defaults if no stages found (or error)
        // Try to init defaults automatically if empty
        try {
            if (stagesRes.data && stagesRes.data.length === 0) {
                await funnelAPI.initDefaults();
                const newStages = await funnelAPI.getAll();
                setStages(newStages.data);
            } else {
                setStages(defaultStages);
            }
        } catch (e) {
            setStages(defaultStages);
        }
      }
    } catch (error) {
      console.error('Error fetching CRM data:', error);
      toast.error('Ошибка загрузки данных CRM');
      // Set defaults on error
      if (stages.length === 0) setStages(defaultStages);
    } finally {
      setLoading(false);
    }
  };

  const fetchStages = async () => {
    try {
        const res = await funnelAPI.getAll();
        if (res.data && res.data.length > 0) {
            setStages(res.data);
        }
    } catch (error) {
        console.error('Error refreshing stages:', error);
    }
  };

  const handleStatusChange = async (leadId, newStatus) => {
    if (newStatus === 'reject') {
      setRejectModal({ open: true, leadId });
      setRejectReason('');
      return;
    }

    const originalLeads = [...leads];
    const updatedLeads = leads.map((l) =>
      l.id === parseInt(leadId, 10) ? { ...l, status: newStatus } : l
    );
    setLeads(updatedLeads);

    try {
      await leadsAPI.updateStatus(leadId, newStatus);
      toast.success('Статус обновлен');
    } catch (error) {
      console.error('Error updating status:', error);
      if (error?.response?.status === 401) {
        toast.error('Сессия истекла. Войдите снова.');
        try {
          sessionStorage.setItem('auth_notice', 'Сессия истекла. Пожалуйста, войдите снова.');
        } catch (e) {
          void e;
        }
        setTimeout(() => {
          window.location.href = '/login';
        }, 300);
      } else {
        toast.error('Ошибка обновления статуса');
      }
      setLeads(originalLeads);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectModal.leadId) return;
    if (!rejectReason) {
      toast.error('Выберите причину отказа');
      return;
    }

    const { leadId } = rejectModal;
    const originalLeads = [...leads];
    const updatedLeads = leads.map((l) =>
      l.id === parseInt(leadId, 10) ? { ...l, status: 'reject', rejection_reason: rejectReason } : l
    );
    setLeads(updatedLeads);

    try {
      await leadsAPI.updateStatus(leadId, 'reject', rejectReason);
      toast.success('Статус обновлен');
      setRejectModal({ open: false, leadId: null });
      setRejectReason('');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Ошибка обновления статуса');
      setLeads(originalLeads);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createFormData.name || !createFormData.phone) {
      toast.error('Заполните имя и телефон');
      return;
    }
    const digits = createFormData.phone.replace(/\D/g, '');
    if (digits.length < 8) {
      toast.error('Телефон должен содержать минимум 8 цифр');
      return;
    }

    try {
      setCreating(true);
      // Use first stage as default if not set
      const initialStatus = createFormData.status || (stages.length > 0 ? stages[0].key : 'new');
      
      await leadsAPI.create({
        ...createFormData,
        status: initialStatus,
        responsible_id: createFormData.responsible_id || currentUser?.id || null,
      });
      toast.success('Лид создан');
      setShowCreateModal(false);
      setCreateFormData({ name: '', phone: '', status: initialStatus, source: '', notes: '' });
      
      // Refresh leads
      const res = await leadsAPI.getAll();
      setLeads(res.data || []);
    } catch (error) {
      console.error('Error creating lead:', error);
      if (error?.response?.status === 401) {
        toast.error('Сессия истекла. Войдите снова.');
        try { sessionStorage.setItem('auth_notice', 'Сессия истекла. Пожалуйста, войдите снова.'); } catch (e) { void e; }
        setTimeout(() => { window.location.href = '/login'; }, 300);
      } else {
        const detail = error?.response?.data?.detail;
        if (Array.isArray(detail) && detail.length > 0 && detail[0]?.msg) {
          toast.error(detail[0].msg);
        } else if (typeof detail === 'string') {
          toast.error(detail);
        } else {
          toast.error('Ошибка создания лида');
        }
      }
    } finally {
      setCreating(false);
    }
  };
  
  const handleDelete = async (id) => {
    if (!window.confirm('Удалить лид?')) return;
    
    try {
      await leadsAPI.delete(id);
      setLeads(leads.filter(l => l.id !== id));
      toast.success('Лид удален');
      if (selectedLeadId === id) setSelectedLeadId(null);
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast.error('Ошибка удаления');
    }
  };

  const handleLeadUpdate = (updatedLead) => {
    setLeads(leads.map(l => l.id === updatedLead.id ? updatedLead : l));
  };

  const todayBounds = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const tomorrowStart = new Date(start);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);
    return { start, end, tomorrowStart, tomorrowEnd };
  }, []);

  const { start, end, tomorrowStart, tomorrowEnd } = todayBounds;

  const ownershipFilterPredicate = useMemo(() => (lead) => {
    if (responsibleFilterId !== 'all') {
      return lead.responsible_id === parseInt(responsibleFilterId, 10);
    }
    if (ownershipFilter === 'all' || !currentUser) return true;
    return lead.responsible_id === currentUser.id;
  }, [responsibleFilterId, ownershipFilter, currentUser]);

  const baseVisibleLeads = useMemo(() => leads.filter(ownershipFilterPredicate), [leads, ownershipFilterPredicate]);

  const leadsWithNextCategory = useMemo(() => baseVisibleLeads.map(l => {
    if (!l.next_contact_date) {
      return { lead: l, category: 'none' };
    }
    const date = new Date(l.next_contact_date);
    if (date < start) {
      return { lead: l, category: 'overdue' };
    }
    if (date >= start && date <= end) {
      return { lead: l, category: 'today' };
    }
    if (date >= tomorrowStart && date <= tomorrowEnd) {
      return { lead: l, category: 'tomorrow' };
    }
    return { lead: l, category: 'future' };
  }), [baseVisibleLeads, start, end, tomorrowStart, tomorrowEnd]);

  const overdueLeads = useMemo(() => leadsWithNextCategory.filter(x => x.category === 'overdue').map(x => x.lead), [leadsWithNextCategory]);
  const todayLeads = useMemo(() => leadsWithNextCategory.filter(x => x.category === 'today').map(x => x.lead), [leadsWithNextCategory]);
  const tomorrowLeads = useMemo(() => leadsWithNextCategory.filter(x => x.category === 'tomorrow').map(x => x.lead), [leadsWithNextCategory]);

  const todayTasks = useMemo(() => baseVisibleLeads.flatMap((lead) =>
    (lead.tasks || [])
      .filter((task) => !task.completed && task.due_date)
      .map((task) => ({ lead, task }))
      .filter(({ task }) => {
        const date = new Date(task.due_date);
        return date >= start && date <= end;
      })
  ), [baseVisibleLeads, start, end]);

  const leadsForBoard = useMemo(() => contactFilter === 'overdue'
    ? overdueLeads
    : contactFilter === 'today'
      ? todayLeads
      : baseVisibleLeads, [contactFilter, overdueLeads, todayLeads, baseVisibleLeads]);

  const getStageTitle = (status) => {
    const stage = stages.find(s => s.key === status);
    return stage ? stage.title : '';
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const exportLeads = async (type) => {
    try {
      const dataToExport = baseVisibleLeads.map((l) => {
        const responsible = responsibleUsers.find((u) => u.id === l.responsible_id);
        return {
          name: l.name || '',
          phone: l.phone || '',
          statusTitle: getStageTitle(l.status) || l.status,
          responsibleName: responsible ? responsible.full_name : '',
          source: l.source || '',
          createdAt: l.created_at ? new Date(l.created_at).toLocaleString([], { hour12: false }) : '',
          nextContact: l.next_contact_date ? new Date(l.next_contact_date).toLocaleString([], { hour12: false }) : '',
          firstCall: l.first_call_at ? new Date(l.first_call_at).toLocaleString([], { hour12: false }) : '',
          firstTrial: l.first_trial_at ? new Date(l.first_trial_at).toLocaleString([], { hour12: false }) : '',
        };
      });
      const columns = {
        name: 'Имя',
        phone: 'Телефон',
        statusTitle: 'Этап',
        responsibleName: 'Ответственный',
        source: 'Источник',
        createdAt: 'Создан',
        nextContact: 'Следующее касание',
        firstCall: 'Первый звонок',
        firstTrial: 'Первая тренировка',
      };
      const filename = `crm_leads_${getDateString()}`;
      if (type === 'excel') {
        exportToExcel(dataToExport, columns, filename);
      } else {
        const title = 'CRM Лиды';
        await exportToPDF(dataToExport, columns, filename, title, null, 'landscape');
      }
    } catch (e) {
      console.error('Export error:', e);
      toast.error('Ошибка экспорта');
    }
  };

  const role = (currentUser?.role || '').toLowerCase();
  const canViewCrmDashboard =
    role === 'super_admin' ||
    role === 'owner' ||
    (role === 'admin' && currentUser?.can_view_analytics);

  return (
    <div className="flex flex-col min-h-screen xl:h-[calc(100vh-80px)] xl:overflow-hidden bg-gradient-to-br from-[#0f1115] to-[#181a20] relative">
      {/* Header Section */}
      <div className="shrink-0 p-4 md:p-6 pb-2 space-y-4 md:space-y-6 sticky top-0 z-30 bg-[#0f1115]/95 backdrop-blur-md border-b border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 filter drop-shadow-lg">
                CRM Система
              </span>
              <span className="hidden md:inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 backdrop-blur-sm">
                v2.0
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 backdrop-blur-sm transition-all hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
              title="Настройки воронки"
            >
              <Settings size={20} />
            </button>
            <div className="w-px h-8 bg-white/10 mx-1 hidden md:block"></div>
            <button
              onClick={() => exportLeads('excel')}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-emerald-400 border border-white/5 backdrop-blur-sm transition-all hover:border-emerald-500/30"
              title="Экспорт в Excel"
            >
              <Download size={20} />
            </button>
            <button
              onClick={() => exportLeads('pdf')}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-red-400 border border-white/5 backdrop-blur-sm transition-all hover:border-red-500/30"
              title="Экспорт в PDF"
            >
              <FileText size={20} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="ml-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all duration-300 flex items-center gap-2 border border-white/10 whitespace-nowrap"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Добавить лид</span>
              <span className="sm:hidden">Создать</span>
            </button>
          </div>
        </div>

        {/* Tabs & Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex bg-black/20 p-1 rounded-xl backdrop-blur-sm border border-white/5 w-fit">
            {canViewCrmDashboard && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 shadow-sm border border-blue-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                Дашборд
              </button>
            )}
            <button
              onClick={() => setActiveTab('funnel')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                activeTab === 'funnel'
                  ? 'bg-gradient-to-r from-blue-500/20 to-indigo-500/20 text-blue-300 shadow-sm border border-blue-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Воронка
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex bg-black/20 p-1 rounded-xl backdrop-blur-sm border border-white/5">
              <button
                onClick={() => {
                  setOwnershipFilter('all');
                  setResponsibleFilterId('all');
                }}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  ownershipFilter === 'all'
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                Все
              </button>
              <button
                onClick={() => {
                  setOwnershipFilter('mine');
                  setResponsibleFilterId('all');
                }}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  ownershipFilter === 'mine'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                Мои
              </button>
            </div>

            <div className="relative group">
              <select
                value={responsibleFilterId}
                onChange={(e) => {
                  const value = e.target.value || 'all';
                  setResponsibleFilterId(value);
                  setOwnershipFilter('all');
                }}
                className="w-full sm:w-auto appearance-none bg-black/20 hover:bg-black/30 border border-white/10 hover:border-white/20 rounded-xl px-4 py-2 pr-8 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer backdrop-blur-sm"
              >
                <option value="all" className="bg-[#1C1E24]">Все ответственные</option>
                {responsibleUsers.map((u) => (
                  <option key={u.id} value={u.id} className="bg-[#1C1E24]">
                    {u.full_name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>
        </div>

        {/* Tasks Preview Area */}
        {activeTab === 'funnel' && (
          <div className="relative hidden xl:block">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-2xl blur-xl"></div>
            <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 transition-all hover:border-white/20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg border border-amber-500/20">
                    <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-200">План действий</h3>
                    <p className="text-xs text-gray-500">Запланированные контакты и задачи</p>
                  </div>
                </div>
                
                <div className="flex bg-black/20 p-1 rounded-lg backdrop-blur-sm border border-white/5 self-start md:self-auto">
                  <button
                    onClick={() => setContactFilter('all')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      contactFilter === 'all'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Все
                  </button>
                  <button
                    onClick={() => setContactFilter('overdue')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      contactFilter === 'overdue'
                        ? 'bg-red-500/20 text-red-300'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Просрочено
                  </button>
                  <button
                    onClick={() => setContactFilter('today')}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                      contactFilter === 'today'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Сегодня
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Today Column */}
                <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      Сегодня
                    </span>
                    <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                      {todayLeads.length + todayTasks.length}
                    </span>
                  </div>
                  
                  {todayLeads.length === 0 && todayTasks.length === 0 ? (
                    <div className="text-center py-6 text-gray-600 text-xs italic">
                      Нет задач на сегодня
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                      {todayLeads.map((lead) => (
                        <button
                          key={`lead-${lead.id}`}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="w-full text-left p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/10 hover:border-amber-500/30 transition-all group"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-200 truncate group-hover:text-white">{lead.name}</div>
                              <div className="text-[10px] text-gray-400 truncate mt-0.5">{getStageTitle(lead.status)}</div>
                            </div>
                            <div className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {formatTime(lead.next_contact_date)}
                            </div>
                          </div>
                        </button>
                      ))}
                      {todayTasks.map(({ lead, task }) => (
                        <button
                          key={`task-${task.id}`}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="w-full text-left p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/10 hover:border-emerald-500/30 transition-all group"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-200 truncate group-hover:text-white flex items-center gap-1">
                                <span className="text-emerald-400">✓</span> {task.title}
                              </div>
                              <div className="text-[10px] text-gray-400 truncate mt-0.5">{lead.name}</div>
                            </div>
                            <div className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {formatTime(task.due_date)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tomorrow Column */}
                <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-blue-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                      Завтра
                    </span>
                    <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                      {tomorrowLeads.length}
                    </span>
                  </div>
                  
                  {tomorrowLeads.length === 0 ? (
                    <div className="text-center py-6 text-gray-600 text-xs italic">
                      Нет задач на завтра
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[20vh] md:max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                      {tomorrowLeads.map((lead) => (
                        <button
                          key={lead.id}
                          onClick={() => setSelectedLeadId(lead.id)}
                          className="w-full text-left p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/10 hover:border-blue-500/30 transition-all group"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-200 truncate group-hover:text-white">{lead.name}</div>
                              <div className="text-[10px] text-gray-400 truncate mt-0.5">{getStageTitle(lead.status)}</div>
                            </div>
                            <div className="text-[10px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {formatTime(lead.next_contact_date)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 xl:overflow-hidden relative px-4 md:px-6 pb-24 md:pb-4 min-h-0">
        {activeTab === 'dashboard' && canViewCrmDashboard ? (
          <div className="h-full overflow-y-auto custom-scrollbar pr-2">
             <AnalyticsDashboard leads={leads} stages={stages} users={responsibleUsers} />
          </div>
        ) : (
          <div className="h-full xl:h-full">
            {/* Tasks Preview Area - Moved inside scrollable area for landscape/tablet */}
            <div className="mb-6 xl:hidden">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-2xl blur-xl"></div>
                <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 transition-all hover:border-white/20">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-br from-amber-500/20 to-orange-500/20 rounded-lg border border-amber-500/20">
                        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-200">План действий</h3>
                        <p className="text-xs text-gray-500">Запланированные контакты и задачи</p>
                      </div>
                    </div>
                    
                    <div className="flex bg-black/20 p-1 rounded-lg backdrop-blur-sm border border-white/5 self-start md:self-auto">
                      <button
                        onClick={() => setContactFilter('all')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          contactFilter === 'all'
                            ? 'bg-white/10 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Все
                      </button>
                      <button
                        onClick={() => setContactFilter('overdue')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          contactFilter === 'overdue'
                            ? 'bg-red-500/20 text-red-300'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Просрочено
                      </button>
                      <button
                        onClick={() => setContactFilter('today')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                          contactFilter === 'today'
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        Сегодня
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Today Column */}
                    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Сегодня
                        </span>
                        <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                          {todayLeads.length + todayTasks.length}
                        </span>
                      </div>
                      
                      {todayLeads.length === 0 && todayTasks.length === 0 ? (
                        <div className="text-center py-6 text-gray-600 text-xs italic">
                          Нет задач на сегодня
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                          {todayLeads.map((lead) => (
                            <button
                              key={`lead-${lead.id}`}
                              onClick={() => setSelectedLeadId(lead.id)}
                              className="w-full text-left p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/10 hover:border-amber-500/30 transition-all group"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-gray-200 truncate group-hover:text-white">{lead.name}</div>
                                  <div className="text-[10px] text-gray-400 truncate mt-0.5">{getStageTitle(lead.status)}</div>
                                </div>
                                <div className="text-[10px] font-mono text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  {formatTime(lead.next_contact_date)}
                                </div>
                              </div>
                            </button>
                          ))}
                          {todayTasks.map(({ lead, task }) => (
                            <button
                              key={`task-${task.id}`}
                              onClick={() => setSelectedLeadId(lead.id)}
                              className="w-full text-left p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/10 hover:border-emerald-500/30 transition-all group"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-gray-200 truncate group-hover:text-white flex items-center gap-1">
                                    <span className="text-emerald-400">✓</span> {task.title}
                                  </div>
                                  <div className="text-[10px] text-gray-400 truncate mt-0.5">{lead.name}</div>
                                </div>
                                <div className="text-[10px] font-mono text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  {formatTime(task.due_date)}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Tomorrow Column */}
                    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-blue-400 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          Завтра
                        </span>
                        <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                          {tomorrowLeads.length}
                        </span>
                      </div>
                      
                      {tomorrowLeads.length === 0 ? (
                        <div className="text-center py-6 text-gray-600 text-xs italic">
                          Нет задач на завтра
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[20vh] md:max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
                          {tomorrowLeads.map((lead) => (
                            <button
                              key={lead.id}
                              onClick={() => setSelectedLeadId(lead.id)}
                              className="w-full text-left p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/10 hover:border-blue-500/30 transition-all group"
                            >
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-gray-200 truncate group-hover:text-white">{lead.name}</div>
                                  <div className="text-[10px] text-gray-400 truncate mt-0.5">{getStageTitle(lead.status)}</div>
                                </div>
                                <div className="text-[10px] font-mono text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                                  {formatTime(lead.next_contact_date)}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <KanbanBoard 
              leads={leadsForBoard} 
              stages={stages} 
              loading={loading}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onLeadClick={(lead) => setSelectedLeadId(lead.id)}
            />
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[110] p-0 md:p-4 transition-all duration-300" onClick={() => setShowCreateModal(false)}>
          <div className="bg-[#1C1E24] border-0 md:border border-white/10 rounded-none md:rounded-2xl w-full md:max-w-2xl h-[100dvh] md:h-auto md:max-h-[90dvh] flex flex-col shadow-2xl shadow-black/50 animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 md:p-5 border-b border-white/10 shrink-0 bg-gradient-to-r from-blue-600/10 to-purple-600/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <Plus size={20} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-white">Новый лид</h2>
                  <p className="text-xs text-gray-400">Добавление нового лида в воронку</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            {/* Content */}
            <div className="p-4 md:p-5 overflow-y-auto custom-scrollbar flex-1 min-h-0">
              <form id="create-lead-form" onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Имя</label>
                  <input
                    type="text"
                    value={createFormData.name}
                    onChange={(e) => setCreateFormData({...createFormData, name: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-gray-600"
                    placeholder="Введите имя клиента"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Телефон</label>
                  <input
                    type="tel"
                    value={createFormData.phone}
                    onChange={(e) => setCreateFormData({...createFormData, phone: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-gray-600"
                    placeholder="+373 XXX XX XXX"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Этап</label>
                    <select
                      value={createFormData.status}
                      onChange={(e) => setCreateFormData({...createFormData, status: e.target.value})}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all appearance-none"
                    >
                      {stages.map(stage => (
                          <option key={stage.key} value={stage.key} className="bg-[#1C1E24]">{stage.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Источник</label>
                    <select
                      value={createFormData.source}
                      onChange={(e) => setCreateFormData({...createFormData, source: e.target.value})}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all appearance-none"
                    >
                      <option value="" className="bg-[#1C1E24]">Не указан</option>
                      <option value="instagram" className="bg-[#1C1E24]">Instagram</option>
                      <option value="facebook" className="bg-[#1C1E24]">Facebook</option>
                      <option value="google" className="bg-[#1C1E24]">Google</option>
                      <option value="referral" className="bg-[#1C1E24]">Рекомендация</option>
                      <option value="other" className="bg-[#1C1E24]">Другое</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Ответственный</label>
                  <select
                    value={createFormData.responsible_id || (currentUser?.id ?? '')}
                    onChange={(e) =>
                      setCreateFormData({
                        ...createFormData,
                        responsible_id: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all appearance-none"
                  >
                    <option value={currentUser?.id ?? ''} className="bg-[#1C1E24]">
                      {currentUser ? `Текущий пользователь (${currentUser.full_name})` : 'Не выбран'}
                    </option>
                    {responsibleUsers
                      .filter((u) => !currentUser || u.id !== currentUser.id)
                      .map((u) => (
                        <option key={u.id} value={u.id} className="bg-[#1C1E24]">
                          {u.full_name} ({u.role})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Заметка</label>
                  <textarea
                    value={createFormData.notes}
                    onChange={(e) => setCreateFormData({...createFormData, notes: e.target.value})}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all h-24 resize-none placeholder:text-gray-600"
                    placeholder="Дополнительная информация о лиде..."
                  />
                </div>
              </form>
            </div>
            <div className="p-5 pb-28 md:pb-5 border-t border-white/10 shrink-0 flex justify-end gap-3 bg-black/40 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all font-medium"
              >
                Отмена
              </button>
              <button
                type="submit"
                form="create-lead-form"
                disabled={creating}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                {creating && <Loader2 className="animate-spin" size={18} />}
                Создать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <FunnelSettingsModal 
            onClose={() => setShowSettingsModal(false)}
            onUpdate={fetchStages}
        />
      )}

      {/* Edit Modal */}
      {selectedLeadId && (
        <LeadDetailsModal 
          leadId={selectedLeadId} 
          onClose={() => setSelectedLeadId(null)} 
          onUpdate={handleLeadUpdate}
          stages={stages}
          users={responsibleUsers}
        />
      )}

      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[110] p-0 md:p-4" onClick={() => setRejectModal({ open: false, leadId: null })}>
          <div className="bg-[#1C1E24] rounded-none md:rounded-2xl border-0 md:border border-white/10 w-full max-w-md h-full md:h-auto md:max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-white/10 shrink-0 bg-gradient-to-r from-red-500/10 to-orange-500/10">
              <h2 className="text-xl font-bold text-white mb-1">Причина отказа</h2>
              <p className="text-sm text-gray-400">
                Почему сделка не состоялась?
              </p>
            </div>
            <div className="p-6 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Выберите причину *</label>
                <select
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                >
                  <option value="">Выберите причину</option>
                  <option value="expensive">Дорого</option>
                  <option value="schedule">Расписание не подходит</option>
                  <option value="other_academy">Выбрали другую академию</option>
                  <option value="relocation">Переезд</option>
                  <option value="other">Другое</option>
                </select>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 shrink-0 flex justify-end gap-3 bg-black/20">
              <button
                type="button"
                onClick={() => {
                  setRejectModal({ open: false, leadId: null });
                  setRejectReason('');
                }}
                className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-colors font-medium"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 hover:shadow-red-500/40 transition-all"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
