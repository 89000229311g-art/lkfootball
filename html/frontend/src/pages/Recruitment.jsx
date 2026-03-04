import { useState, useEffect, useMemo, useCallback } from 'react';
import { hrCandidatesAPI, hrFunnelAPI, usersAPI, analyticsAPI, authAPI } from '../api/client';
import toast from 'react-hot-toast';
import { Loader2, Plus, Settings } from 'lucide-react';
import KanbanBoard from '../components/crm/KanbanBoard';
import FunnelSettingsModal from '../components/crm/FunnelSettingsModal';
import CandidateCard from '../components/hr/CandidateCard';
import CandidateDetailsModal from '../components/hr/CandidateDetailsModal';
import RecruitmentAnalyticsDashboard from '../components/hr/RecruitmentAnalyticsDashboard';

export default function Recruitment() {
  const [activeTab, setActiveTab] = useState('funnel');
  const [candidates, setCandidates] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [staff, setStaff] = useState([]);
  const [studentStats, setStudentStats] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const [createFormData, setCreateFormData] = useState({
    full_name: '',
    target_role: '',
    phone: '',
    email: '',
    experience_years: '',
    experience_summary: '',
    stage: 'new',
    next_interview_at: null,
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (showCreateModal || showSettingsModal || selectedCandidateId) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [showCreateModal, showSettingsModal, selectedCandidateId]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const meRes = await authAPI.getMe().catch(() => null);

      if (meRes && meRes.data) {
        setCurrentUser(meRes.data);
        const role = (meRes.data.role || '').toLowerCase();
        if (role === 'admin' && !meRes.data.can_view_recruitment) {
          toast.error('Доступ к Найму отключен. Обратитесь к Руководителю.');
          setLoading(false);
          return;
        }
      }

      const [candidatesRes, stagesRes, staffRes] = await Promise.all([
        hrCandidatesAPI.getAll().catch(() => ({ data: [] })),
        hrFunnelAPI.getAll().catch(() => ({ data: [] })),
        usersAPI.getAll({ roles: ['coach', 'admin', 'accountant'] }).catch(() => ({ data: [] })),
      ]);

      setCandidates(candidatesRes.data || []);
      setStages(stagesRes.data || []);
      setStaff(Array.isArray(staffRes.data) ? staffRes.data : []);

      let stats = null;
      const role = (meRes?.data?.role || '').toLowerCase();
      const canViewAnalytics =
        role === 'super_admin' ||
        role === 'owner' ||
        (role === 'admin' && meRes?.data?.can_view_analytics);

      if (canViewAnalytics && typeof analyticsAPI.getStudentSummary === 'function') {
        const studentsRes = await analyticsAPI
          .getStudentSummary()
          .catch(() => ({ data: null }));
        stats = studentsRes.data || null;
      }

      setStudentStats(stats);
    } catch {
      toast.error('Ошибка загрузки данных найма');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = useCallback(async (candidateId, newStage) => {
    setCandidates((prev) => {
      const updated = prev.map((c) =>
        c.id === parseInt(candidateId, 10) ? { ...c, stage: newStage } : c
      );
      return updated;
    });
    try {
      await hrCandidatesAPI.updateStatus(candidateId, newStage);
      toast.success('Статус обновлен');
    } catch {
      toast.error('Ошибка обновления статуса');
      fetchData(); // Revert on error
    }
  }, []);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Удалить кандидата из найма?')) return;
    try {
      await hrCandidatesAPI.delete(id);
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      toast.success('Кандидат удален');
      setSelectedCandidateId((currentId) => currentId === id ? null : currentId);
    } catch {
      toast.error('Ошибка удаления кандидата');
    }
  }, []);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createFormData.full_name || !createFormData.phone) {
      toast.error('Заполните ФИО и телефон');
      return;
    }
    try {
      setCreating(true);
      const payload = {
        ...createFormData,
        experience_years: createFormData.experience_years
          ? parseInt(createFormData.experience_years, 10)
          : null,
      };
      const res = await hrCandidatesAPI.create(payload);
      setShowCreateModal(false);
      setCreateFormData({
        full_name: '',
        target_role: '',
        phone: '',
        email: '',
        experience_years: '',
        experience_summary: '',
        stage: 'new',
        next_interview_at: null,
        notes: '',
      });
      setCandidates((prev) => [...prev, res.data]);
      toast.success('Кандидат добавлен');
    } catch {
      toast.error('Ошибка создания кандидата');
    } finally {
      setCreating(false);
    }
  };

  const handleCandidateUpdate = (updated) => {
    setCandidates(candidates.map((c) => (c.id === updated.id ? updated : c)));
  };

  const boardItems = useMemo(() => candidates.map((c) => ({
    ...c,
    status: c.stage,
  })), [candidates]);

  const handleLeadClick = useCallback((candidate) => {
    setSelectedCandidateId(candidate.id);
  }, []);

  const role = (currentUser?.role || '').toLowerCase();
  const canViewRecruitmentDashboard =
    role === 'super_admin' ||
    role === 'owner' ||
    (role === 'admin' && currentUser?.can_view_analytics);

  return (
    <div className="flex flex-col min-h-screen md:h-[calc(100vh-80px)] landscape:md:h-auto md:overflow-hidden landscape:md:overflow-visible bg-gradient-to-br from-[#0f1115] to-[#181a20]">
      {/* Header Section */}
      <div className="shrink-0 p-4 md:p-6 pb-2 space-y-4 md:space-y-6 sticky top-0 z-30 bg-[#0f1115]/95 backdrop-blur-md border-b border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-400 filter drop-shadow-lg">
                Найм
              </span>
              <span className="hidden md:inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 backdrop-blur-sm">
                BETA
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 backdrop-blur-sm transition-all hover:border-white/20 hover:shadow-[0_0_15px_rgba(255,255,255,0.05)]"
              title="Настройки HR-воронки"
            >
              <Settings size={20} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="ml-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all duration-300 flex items-center gap-2 border border-white/10 whitespace-nowrap"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">Новый кандидат</span>
              <span className="sm:hidden">Создать</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex bg-black/20 p-1 rounded-xl backdrop-blur-sm border border-white/5 w-fit">
            <button
              onClick={() => setActiveTab('funnel')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                activeTab === 'funnel'
                  ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 shadow-sm border border-emerald-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Воронка найма
            </button>
            {canViewRecruitmentDashboard && (
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 shadow-sm border border-emerald-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                Дашборд найма
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 md:overflow-hidden landscape:md:overflow-visible landscape:md:h-auto relative px-4 md:px-6 pb-24 md:pb-4">
        {activeTab === 'dashboard' && canViewRecruitmentDashboard ? (
          <div className="h-full overflow-y-auto custom-scrollbar pr-2">
            <RecruitmentAnalyticsDashboard
              candidates={candidates}
              stages={stages}
              staff={staff}
              studentStats={studentStats}
            />
          </div>
        ) : (
          <div className="h-full">
            <KanbanBoard
              leads={boardItems}
              stages={stages}
              loading={loading}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onLeadClick={handleLeadClick}
              renderCard={(item, handlers) => (
                <CandidateCard
                  candidate={item}
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-0 md:p-4 transition-all duration-300" onClick={() => setShowCreateModal(false)}>
          <div className="bg-[#1C1E24]/95 border-0 md:border border-white/10 rounded-none md:rounded-2xl w-full md:max-w-2xl h-full md:h-auto md:max-h-[85dvh] flex flex-col shadow-2xl shadow-black/50 animate-scale-in overflow-hidden backdrop-blur-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 md:p-5 border-b border-white/10 shrink-0 bg-gradient-to-r from-emerald-600/10 to-teal-600/10">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <div className="p-1.5 bg-emerald-500/20 rounded-lg border border-emerald-500/20">
                  <Plus size={18} className="text-emerald-400" />
                </div>
                Новый кандидат
              </h2>
            </div>
            
            <div className="overflow-y-auto p-5 custom-scrollbar flex-1 min-h-0">
              <form id="create-candidate-form" onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">ФИО</label>
                  <input
                    type="text"
                    value={createFormData.full_name}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, full_name: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600"
                    placeholder="Иванов Иван Иванович"
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Роль</label>
                    <input
                      type="text"
                      value={createFormData.target_role}
                      onChange={(e) =>
                        setCreateFormData({ ...createFormData, target_role: e.target.value })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600"
                      placeholder="Например: Тренер, Администратор..."
                      list="roles-list"
                    />
                    <datalist id="roles-list">
                      <option value="Тренер" />
                      <option value="Администратор" />
                      <option value="Бухгалтер" />
                      <option value="Маркетолог" />
                      <option value="Врач" />
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Опыт (лет)</label>
                    <input
                      type="number"
                      value={createFormData.experience_years}
                      onChange={(e) =>
                        setCreateFormData({
                          ...createFormData,
                          experience_years: e.target.value,
                        })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Телефон</label>
                  <input
                    type="tel"
                    value={createFormData.phone}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, phone: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600"
                    placeholder="+373 XXX XX XXX"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Email</label>
                  <input
                    type="email"
                    value={createFormData.email}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, email: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-gray-600"
                    placeholder="candidate@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-400 uppercase tracking-wider ml-1">Кратко об опыте</label>
                  <textarea
                    value={createFormData.experience_summary}
                    onChange={(e) =>
                      setCreateFormData({ ...createFormData, experience_summary: e.target.value })
                    }
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all h-24 resize-none placeholder:text-gray-600"
                    placeholder="Опишите ключевые навыки и достижения..."
                  />
                </div>
              </form>
            </div>

            <div className="p-4 md:p-5 pb-28 md:pb-5 border-t border-white/10 shrink-0 bg-black/40 backdrop-blur-md flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-5 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all font-medium"
              >
                Отмена
              </button>
              <button
                type="submit"
                form="create-candidate-form"
                disabled={creating}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all disabled:opacity-50 disabled:shadow-none flex items-center gap-2"
              >
                {creating && <Loader2 className="animate-spin" size={18} />}
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <FunnelSettingsModal
          variant="hr"
          onClose={() => setShowSettingsModal(false)}
          onUpdate={fetchData}
        />
      )}

      {selectedCandidateId && (
        <CandidateDetailsModal
          candidateId={selectedCandidateId}
          onClose={() => setSelectedCandidateId(null)}
          onUpdate={handleCandidateUpdate}
          stages={stages}
        />
      )}
    </div>
  );
}
