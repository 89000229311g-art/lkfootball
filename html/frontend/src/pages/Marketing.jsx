import { useMemo, useState, useEffect } from 'react';
import { Settings, Plus, X, Loader2 } from 'lucide-react';
import KanbanBoard from '../components/crm/KanbanBoard';
import MarketingDashboard from '../components/marketing/MarketingDashboard';
import MarketingCard from '../components/marketing/MarketingCard';
import { useAuth } from '../context/AuthContext';
import { marketingAPI } from '../api/client';
import toast from 'react-hot-toast';

const stages = [
  { key: 'planning', title: 'Идея / Планирование', color: 'bg-blue-500' },
  { key: 'preparing', title: 'В подготовке', color: 'bg-indigo-500' },
  { key: 'active', title: 'Запущено (активно)', color: 'bg-emerald-500' },
  { key: 'paused', title: 'Остановлено / Анализ', color: 'bg-amber-500' },
  { key: 'scaling', title: 'Масштабирование', color: 'bg-purple-500' },
  { key: 'archived', title: 'Архив', color: 'bg-gray-500' },
];

export default function Marketing() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('funnel');
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    status: 'planning',
    budget: '',
    source: '',
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  useEffect(() => {
    if (showCreateModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showCreateModal]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);
      const res = await marketingAPI.getCampaigns();
      setCampaigns(res.data || []);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      toast.error('Ошибка загрузки кампаний');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    // Optimistic update
    const original = [...campaigns];
    setCampaigns(prev => prev.map(c => c.id === parseInt(id) ? { ...c, status: newStatus } : c));

    try {
      await marketingAPI.updateCampaign(id, { status: newStatus });
      toast.success('Статус обновлен');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Ошибка обновления статуса');
      setCampaigns(original);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      setCreating(true);
      const payload = {
        ...formData,
        budget: parseFloat(formData.budget) || 0,
      };
      const res = await marketingAPI.createCampaign(payload);
      setCampaigns([...campaigns, res.data]);
      toast.success('Кампания создана');
      setShowCreateModal(false);
      setFormData({ name: '', status: 'planning', budget: '', source: '' });
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast.error('Ошибка создания кампании');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить кампанию?')) return;
    
    const original = [...campaigns];
    setCampaigns(prev => prev.filter(c => c.id !== id));

    try {
      await marketingAPI.deleteCampaign(id);
      toast.success('Кампания удалена');
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast.error('Ошибка удаления');
      setCampaigns(original);
    }
  };

  const leadsForBoard = useMemo(
    () =>
      campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        budget: c.budget,
        spend: c.total_spend || c.spend, // Use total_spend calculated from expenses
        leads: c.leads,
        payingStudents: c.paying_students, // API uses snake_case
        revenue: c.revenue,
        source: c.source,
      })),
    [campaigns]
  );

  const role = user?.role?.toLowerCase() || '';
  if (role === 'admin' && !user?.can_view_marketing) {
    return (
      <div className="p-4 md:p-6 h-[calc(100vh-80px)] flex items-center justify-center">
        <div className="max-w-md text-center bg-[#1C1E24] border border-red-500/30 rounded-3xl p-6">
          <div className="text-3xl mb-3">⛔</div>
          <div className="text-xl font-bold text-white mb-2">Доступ к Маркетингу ограничен</div>
          <div className="text-gray-400 text-sm">
            Обратитесь к Руководителю, чтобы выдать администратору право «Доступ к Маркетингу» в разделе Пользователи.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen md:h-[calc(100vh-80px)] landscape:md:h-auto md:overflow-hidden landscape:md:overflow-visible bg-gradient-to-br from-[#0f1115] to-[#181a20]">
      {/* Header Section */}
      <div className="shrink-0 p-4 md:p-6 pb-2 space-y-4 md:space-y-6 sticky top-0 z-30 bg-[#0f1115]/95 backdrop-blur-md border-b border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-rose-400 to-yellow-400 filter drop-shadow-lg">
                Маркетинг
              </span>
              <span className="hidden md:inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-pink-500/10 text-pink-400 border border-pink-500/20 backdrop-blur-sm">
                BETA
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <button
              type="button"
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 backdrop-blur-sm transition-all hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
            >
              <Settings size={20} />
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="ml-2 px-5 py-2.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white rounded-xl font-semibold shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 transition-all duration-300 flex items-center gap-2 border border-white/10 whitespace-nowrap"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Новая кампания</span>
              <span className="sm:hidden">Создать</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex bg-black/20 p-1 rounded-xl backdrop-blur-sm border border-white/5 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('funnel')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                activeTab === 'funnel'
                  ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 shadow-sm border border-pink-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Воронка кампаний
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-pink-500/20 to-rose-500/20 text-pink-200 shadow-sm border border-pink-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Дашборд маркетинга
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 md:overflow-hidden landscape:md:overflow-visible landscape:md:h-auto relative px-4 md:px-6 pb-24 md:pb-4">
        {loading ? (
           <div className="flex items-center justify-center h-full text-gray-400 gap-2">
             <Loader2 className="animate-spin text-pink-500" size={24} /> 
             <span className="text-lg">Загрузка...</span>
           </div>
        ) : activeTab === 'dashboard' ? (
          <div className="h-full overflow-y-auto custom-scrollbar pr-2">
            <MarketingDashboard campaigns={campaigns} />
          </div>
        ) : (
          <div className="h-full">
            <KanbanBoard
              leads={leadsForBoard}
              stages={stages}
              loading={loading}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onLeadClick={() => {}} // Details view not implemented yet
              renderCard={(item, handlers) => (
                <MarketingCard
                  campaign={item}
                  onDelete={handlers.onDelete}
                  onClick={handlers.onClick}
                />
              )}
            />
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-md p-0 md:p-4 transition-all duration-300" onClick={() => setShowCreateModal(false)}>
          <div className="bg-[#1C1E24] border-0 md:border border-white/10 rounded-none md:rounded-2xl w-full h-full md:h-auto md:max-h-[90dvh] md:max-w-lg landscape:max-w-3xl landscape:h-[90dvh] flex flex-col shadow-2xl shadow-black/50 animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 md:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-pink-600/10 to-rose-600/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center">
                  <Plus size={20} className="text-pink-400" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-white">Новая кампания</h3>
                  <p className="text-xs text-gray-400">Создание маркетинговой кампании</p>
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
            <div className="overflow-y-auto p-4 md:p-5 custom-scrollbar flex-1 min-h-0">
              <form id="create-campaign-form" onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Название *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all placeholder:text-gray-600"
                    placeholder="Например: Таргет VK Осень"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Источник</label>
                    <select
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all appearance-none"
                    >
                      <option value="" className="bg-[#1C1E24]">Не выбран</option>
                      <option value="VK" className="bg-[#1C1E24]">VK</option>
                      <option value="Instagram" className="bg-[#1C1E24]">Instagram</option>
                      <option value="Telegram" className="bg-[#1C1E24]">Telegram</option>
                      <option value="Yandex" className="bg-[#1C1E24]">Яндекс</option>
                      <option value="2GIS" className="bg-[#1C1E24]">2GIS</option>
                      <option value="Offline" className="bg-[#1C1E24]">Оффлайн</option>
                      <option value="Other" className="bg-[#1C1E24]">Другое</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Бюджет (MDL)</label>
                    <input
                      type="number"
                      min="0"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all placeholder:text-gray-600"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Статус</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all appearance-none"
                  >
                    {stages.map((s) => (
                      <option key={s.key} value={s.key} className="bg-[#1C1E24]">{s.title}</option>
                    ))}
                  </select>
                </div>
              </form>
            </div>

            <div className="p-4 md:p-5 pb-28 md:pb-5 border-t border-white/10 flex justify-end gap-3 bg-black/40 backdrop-blur-md shrink-0">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all font-medium"
              >
                Отмена
              </button>
              <button
                type="submit"
                form="create-campaign-form"
                disabled={creating}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold shadow-lg shadow-pink-500/20 hover:shadow-pink-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creating && <Loader2 size={18} className="animate-spin" />}
                Создать
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
