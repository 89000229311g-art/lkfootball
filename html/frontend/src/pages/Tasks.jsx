import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { tasksAPI, usersAPI } from '../api/client';
import KanbanBoard from '../components/crm/KanbanBoard';
import TaskCard from '../components/tasks/TaskCard';
import TasksAnalytics from '../components/tasks/TasksAnalytics';
import { Plus, X, Loader2, Calendar, User, Flag, BarChart2, Layout } from 'lucide-react';
import toast from 'react-hot-toast';

const stages = [
  { key: 'todo', title: 'К выполнению', color: 'bg-blue-500' },
  { key: 'in_progress', title: 'В работе', color: 'bg-yellow-500' },
  { key: 'review', title: 'На проверке', color: 'bg-purple-500' },
  { key: 'done', title: 'Готово', color: 'bg-emerald-500' },
];

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('board'); // 'board' or 'analytics'
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    status: 'todo',
    priority: 'medium',
    due_date: '',
    assignee_id: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksRes, usersRes] = await Promise.all([
        tasksAPI.getAll(),
        usersAPI.getAll({ roles: ['super_admin', 'admin', 'coach', 'owner', 'accountant'] })
      ]);
      
      // Handle different response structures (direct array or { data: [...] })
      // For tasks (using List response)
      const tasksData = Array.isArray(tasksRes.data) ? tasksRes.data : (tasksRes.data?.data || []);
      
      // For users (using Pagination response {data: [...], total: ...})
      const usersData = Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.data || []);
      
      console.log('Tasks loaded:', tasksData); // Debug log
      setTasks(tasksData);
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    // Optimistic update
    const originalTasks = [...tasks];
    setTasks(prev => prev.map(t => t.id === parseInt(taskId) ? { ...t, status: newStatus } : t));

    try {
      await tasksAPI.update(taskId, { status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Ошибка обновления статуса');
      setTasks(originalTasks);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Вы уверены, что хотите удалить эту задачу?')) return;
    try {
      await tasksAPI.delete(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Задача удалена');
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Ошибка удаления задачи');
    }
  };

  const fetchAnalytics = async () => {
    try {
      setLoadingAnalytics(true);
      const res = await tasksAPI.getAnalytics(30);
      setAnalyticsData(res.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Ошибка загрузки статистики');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (view === 'analytics' && !analyticsData) {
      fetchAnalytics();
    }
  }, [view]);

  const openCreateModal = () => {
    setEditingTask(null);
    setFormData({
      title: '',
      description: '',
      status: 'todo',
      priority: 'medium',
      due_date: '',
      assignee_id: '',
    });
    setShowModal(true);
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ? task.due_date.slice(0, 10) : '',
      assignee_id: task.assignee_id || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return;

    try {
      setSaving(true);
      const payload = {
        title: formData.title,
        description: formData.description || null,
        status: formData.status || 'todo',
        priority: formData.priority || 'medium',
        assignee_id: formData.assignee_id ? parseInt(formData.assignee_id) : null,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
      };

      if (editingTask) {
        const res = await tasksAPI.update(editingTask.id, payload);
        setTasks(prev => prev.map(t => t.id === editingTask.id ? res.data : t));
        toast.success('Задача обновлена');
      } else {
        const res = await tasksAPI.create(payload);
        setTasks(prev => [...prev, res.data]);
        toast.success('Задача создана');
      }
      setShowModal(false);
    } catch (error) {
      console.error('Error saving task:', error);
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0F1117] text-white overflow-hidden">
      {/* Header */}
      <div className="flex-none p-4 md:p-6 border-b border-white/10 flex justify-between items-center bg-[#0F1117]/80 backdrop-blur-md z-10">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Задачник
          </h1>
          <p className="text-white/50 text-sm">Управление задачами и проектами</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-[#1C1E24] p-1 rounded-xl border border-white/10 flex">
            <button
              onClick={() => setView('board')}
              className={`p-2 rounded-lg transition-all ${
                view === 'board' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/50 hover:text-white'
              }`}
              title="Доска"
            >
              <Layout size={20} />
            </button>
            <button
              onClick={() => setView('analytics')}
              className={`p-2 rounded-lg transition-all ${
                view === 'analytics' ? 'bg-blue-600 text-white shadow-lg' : 'text-white/50 hover:text-white'
              }`}
              title="Статистика"
            >
              <BarChart2 size={20} />
            </button>
          </div>

          <button
            onClick={openCreateModal}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus size={20} />
            <span className="hidden sm:inline">Новая задача</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'board' ? (
          <div className="h-full overflow-y-auto sm:overflow-hidden p-4 md:p-6 custom-scrollbar">
            <KanbanBoard
              leads={tasks}
              stages={stages}
              loading={loading}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onLeadClick={openEditModal}
              renderCard={(task, { onDelete, onClick }) => (
                <TaskCard task={task} users={users} onDelete={onDelete} onClick={onClick} />
              )}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-4 md:p-6 custom-scrollbar">
            <TasksAnalytics data={analyticsData} days={30} loading={loadingAnalytics} />
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[110] flex items-center justify-center p-0 md:p-4">
          <div className="bg-[#1C1E24] w-full max-w-lg h-full md:h-auto md:max-h-[90dvh] rounded-none md:rounded-2xl border-0 md:border border-white/10 shadow-2xl overflow-hidden animate-scale-in flex flex-col">
            {/* Header */}
            <div className="p-4 md:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-600/10 to-cyan-600/10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <Plus size={20} className="text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-white">
                    {editingTask ? 'Редактирование задачи' : 'Новая задача'}
                  </h2>
                  <p className="text-xs text-gray-400">
                    {editingTask ? 'Изменение деталей задачи' : 'Создание новой задачи'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            {/* Content */}
            <form onSubmit={handleSubmit} className="p-4 md:p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
              <div>
                <label className="block text-sm text-white/70 mb-1">Название</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full bg-[#0F1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors"
                  placeholder="Введите название задачи..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-white/70 mb-1">Описание</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-[#0F1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none transition-colors min-h-[100px]"
                  placeholder="Детали задачи..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Статус</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value})}
                    className="w-full bg-[#0F1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
                  >
                    {stages.map(s => (
                      <option key={s.key} value={s.key}>{s.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-1">Приоритет</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({...formData, priority: e.target.value})}
                    className="w-full bg-[#0F1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/70 mb-1">Исполнитель</label>
                  <select
                    value={formData.assignee_id}
                    onChange={e => setFormData({...formData, assignee_id: e.target.value})}
                    className="w-full bg-[#0F1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Не назначен</option>
                    {Array.isArray(users) && users.map(u => (
                      <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-white/70 mb-1">Срок</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={e => setFormData({...formData, due_date: e.target.value})}
                    className="w-full bg-[#0F1117] border border-white/10 rounded-xl px-4 py-2.5 text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 className="animate-spin" size={18} />}
                  {editingTask ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
