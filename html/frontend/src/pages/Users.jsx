import { useState, useEffect, useCallback, useMemo } from 'react';
import { Phone } from 'lucide-react';
import { usersAPI, studentsAPI, groupsAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import CustomDatePicker from '../components/CustomDatePicker';

export default function Users() {
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [filterRole, setFilterRole] = useState('all');
  const [formData, setFormData] = useState({
    phone: '+373',
    password: '',
    full_name: '',
    role: 'parent',
    child_first_name: '',
    child_last_name: '',
    child_dob: '',
    group_id: '',
    can_view_history: false,
    can_view_analytics: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteWithStudents, setDeleteWithStudents] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  
  // Archive state
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [archivedStudents, setArchivedStudents] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loadingArchived, setLoadingArchived] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersRes, studentsRes, groupsRes] = await Promise.all([
        usersAPI.getAll(),
        studentsAPI.getAll(),
        groupsAPI.getAll()
      ]);

      const usersPayload = usersRes.data;
      const usersList = Array.isArray(usersPayload)
        ? usersPayload
        : (usersPayload?.data || []);

      setUsers(usersList);
      setStudents(studentsRes.data?.data || studentsRes.data || []);
      setGroups(groupsRes.data?.data || groupsRes.data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchArchivedData = useCallback(async () => {
    try {
      setLoadingArchived(true);
      const [usersRes, studentsRes] = await Promise.all([
        usersAPI.getArchived(),
        studentsAPI.getArchived()
      ]);
      setArchivedUsers(usersRes.data?.data || usersRes.data || []);
      setArchivedStudents(studentsRes.data?.data || studentsRes.data || []);
    } catch (error) {
      console.error('Error loading archived data:', error);
    } finally {
      setLoadingArchived(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (showArchived) {
      fetchArchivedData();
    }
  }, [showArchived, fetchArchivedData]);

  const handleRestoreUser = async (user) => {
    if (!window.confirm(`Восстановить пользователя ${user.full_name}?`)) return;
    try {
      await usersAPI.restore(user.id);
      setDeleteMessage('✅ Пользователь восстановлен');
      setTimeout(() => setDeleteMessage(''), 4000);
      fetchData();
      fetchArchivedData();
    } catch (error) {
      console.error('Error restoring user:', error);
      alert('Ошибка восстановления: ' + (error.response?.data?.detail || error.message));
    }
  };

  const handleRestoreStudent = async (student) => {
    if (!window.confirm(`Восстановить ученика ${student.first_name} ${student.last_name}?`)) return;
    try {
      await studentsAPI.restore(student.id);
      setDeleteMessage('✅ Ученик восстановлен');
      setTimeout(() => setDeleteMessage(''), 4000);
      fetchData();
      fetchArchivedData();
    } catch (error) {
      console.error('Error restoring student:', error);
      alert('Ошибка восстановления: ' + (error.response?.data?.detail || error.message));
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      phone: user.phone || '',
      password: '',
      full_name: user.full_name || '',
      role: user.role,
      child_first_name: '',
      child_last_name: '',
      child_dob: '',
      group_id: '',
      can_view_history: user.can_view_history || false,
      can_view_analytics: user.can_view_analytics || false
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.phone || (!editingUser && !formData.password) || !formData.full_name) {
      setError(t('fill_all_fields'));
      return;
    }

    if (!editingUser && formData.role === 'parent' && (!formData.child_first_name || !formData.child_last_name || !formData.child_dob || !formData.group_id)) {
      setError(t('parent_create_error_child'));
      return;
    }

    try {
      setIsSubmitting(true);
      
      if (editingUser) {
        // UPDATE
        const payload = {
            full_name: formData.full_name,
            phone: formData.phone,
            role: formData.role
        };
        if (formData.password) {
            payload.password = formData.password;
        }
        if (currentUser?.role === 'super_admin' && formData.role === 'admin') {
            payload.can_view_history = formData.can_view_history;
            payload.can_view_analytics = formData.can_view_analytics;
        }
        await usersAPI.update(editingUser.id, payload);
      } else {
        // CREATE
        const payload = {
            phone: formData.phone,
            password: formData.password,
            full_name: formData.full_name,
            role: formData.role,
            can_view_history: formData.can_view_history,
            can_view_analytics: formData.can_view_analytics
        };

        if (formData.role === 'parent') {
            payload.child_full_name = `${formData.child_first_name.trim()} ${formData.child_last_name.trim()}`.trim();
            payload.child_birth_date = formData.child_dob;
            payload.child_group_id = parseInt(formData.group_id, 10);
        }

        await usersAPI.create(payload);
      }

      setShowModal(false);
      setEditingUser(null);
      setFormData({ 
        phone: '+373', 
        password: '', 
        full_name: '', 
        role: 'parent',
        child_first_name: '',
        child_last_name: '',
        child_dob: '',
        group_id: '',
        can_view_history: false,
        can_view_analytics: false
      });
      fetchData();
    } catch (error) {
      console.error('Error saving user:', error);
      let errorMsg = editingUser ? 'Ошибка при обновлении' : t('error_creating_user');
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMsg = error.response.data.detail.map(err => err.msg).join(', ');
        } else {
          errorMsg = error.response.data.detail;
        }
      }
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (user) => {
    if (user.role?.toLowerCase() === 'parent') {
      // Для родителя покажем специальный диалог
      const linkedStudents = students.filter(s => 
        s.guardians?.some(g => g.id === user.id) ||
        s.parent_phone === user.phone
      );
      setDeleteTarget({ ...user, linkedStudents });
      setDeleteWithStudents(false);
      setShowDeleteModal(true);
    } else {
      // Для остальных ролей - простой confirm
      if (!window.confirm(`Вы уверены, что хотите удалить пользователя ${user.full_name}?`)) {
        return;
      }
      try {
        const res = await usersAPI.delete(user.id, false);
        setDeleteMessage(res.data?.message || '✅ Пользователь удалён');
        setTimeout(() => setDeleteMessage(''), 4000);
        fetchData();
      } catch (error) {
        console.error('Error deleting user:', error);
        alert('Ошибка удаления: ' + (error.response?.data?.detail || error.message));
      }
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await usersAPI.delete(deleteTarget.id, deleteWithStudents);
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setDeleteMessage(res.data?.message || '✅ Удаление успешно');
      setTimeout(() => setDeleteMessage(''), 4000);
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Ошибка удаления: ' + (error.response?.data?.detail || error.message));
    }
  };

  const getRoleIcon = (role) => {
    const icons = { super_admin: '👨‍💼', admin: '🔧', coach: '⚽', parent: '👨‍👩‍👧' };
    return icons[role?.toLowerCase()] || '👤';
  };

  const getRoleLabel = (role) => {
    const labels = {
      super_admin: 'Руководитель академии',
      admin: 'Администратор',
      coach: 'Тренер',
      parent: 'Родитель'
    };
    return labels[role?.toLowerCase()] || role;
  };

  const getRoleColor = (role) => {
    const colors = {
      super_admin: 'bg-red-500',
      admin: 'bg-red-500',
      coach: 'bg-blue-500',
      parent: 'bg-green-500'
    };
    return colors[role?.toLowerCase()] || 'bg-gray-500';
  };

  const roleStats = useMemo(() => {
    let coachCount = 0;
    let parentCount = 0;
    let adminCount = 0;

    users.forEach((u) => {
      const role = u.role?.toLowerCase();
      if (role === 'coach') coachCount += 1;
      else if (role === 'parent') parentCount += 1;
      else if (role === 'admin') adminCount += 1;
    });

    return {
      coaches: coachCount,
      parents: parentCount,
      admins: adminCount,
      total: users.length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const base = filterRole === 'all'
      ? users
      : users.filter(u => u.role?.toLowerCase() === filterRole);

    return [...base].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [users, filterRole]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400 text-lg">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-3 md:p-6 overflow-x-hidden">
      <div className="w-full mx-auto max-w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="w-full md:w-auto">
            <h1 className="text-2xl md:text-4xl font-bold">
              👥 <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">Пользователи</span>
            </h1>
            <p className="text-gray-400 mt-1 text-sm md:text-base">Управление пользователями системы</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center w-full md:w-auto">
            {/* Filter Dropdown */}
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="w-full sm:w-auto px-4 py-3 bg-[#2D323B] text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
            >
              <option value="all">Все роли</option>
              <option value="parent">Родители</option>
              <option value="coach">Тренеры</option>
              <option value="admin">Админы</option>
            </select>
            
            <button
              onClick={() => setShowModal(true)}
              className="w-full sm:w-auto bg-[#FFC107] hover:bg-[#FFD54F] text-black px-6 py-3 rounded-lg font-medium shadow-lg transition flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span className="text-xl">+</span> Добавить
            </button>
          </div>
        </div>

        {/* Stats Cards - Vertical on Mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-[#23272E] rounded-xl border border-gray-700 p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-2xl shrink-0">⚽</div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-white truncate">{roleStats.coaches}</div>
              <div className="text-gray-400 text-sm truncate">Тренеры</div>
            </div>
          </div>
          <div className="bg-[#23272E] rounded-xl border border-gray-700 p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-2xl shrink-0">👨‍👩‍👧</div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-white truncate">{roleStats.parents}</div>
              <div className="text-gray-400 text-sm truncate">Родители</div>
            </div>
          </div>
          <div className="bg-[#23272E] rounded-xl border border-gray-700 p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-2xl shrink-0">🔧</div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-white truncate">{roleStats.admins}</div>
              <div className="text-gray-400 text-sm truncate">Админы</div>
            </div>
          </div>
          <div className="bg-[#23272E] rounded-xl border border-gray-700 p-4 flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center text-2xl shrink-0">👥</div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-white truncate">{roleStats.total}</div>
              <div className="text-gray-400 text-sm truncate">Всего</div>
            </div>
          </div>
        </div>

        {/* Archived Section (Collapsible) */}
        <div className="mb-6">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="w-full bg-[#23272E] rounded-xl border border-gray-700 p-3 md:p-4 flex items-center justify-between hover:border-gray-600 transition"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <span className="text-2xl shrink-0">📦</span>
              <div className="text-left min-w-0">
                <h3 className="text-white font-bold truncate">Бывшие пользователи и ученики</h3>
                <p className="text-gray-400 text-sm truncate">
                  {archivedUsers.length + archivedStudents.length > 0 
                    ? `${archivedUsers.length} пользователей, ${archivedStudents.length} учеников`
                    : 'Архив пуст'
                  }
                </p>
              </div>
            </div>
            <span className={`text-2xl text-gray-400 transition-transform shrink-0 ml-2 ${showArchived ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showArchived && (
            <div className="mt-3 bg-[#1A1E23] rounded-xl border border-gray-800 p-4 space-y-4">
              {loadingArchived ? (
                <div className="text-center py-8 text-gray-400">Загрузка...</div>
              ) : (
                <>
                  {/* Archived Users */}
                  {archivedUsers.length > 0 && (
                    <div>
                      <h4 className="text-orange-400 font-bold mb-3 flex items-center gap-2">
                        <span>👤</span> Архив пользователей ({archivedUsers.length})
                      </h4>
                      <div className="space-y-2">
                        {archivedUsers.map(user => (
                          <div key={user.id} className="bg-[#2D323B] rounded-lg p-3 border border-gray-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-lg">
                                {getRoleIcon(user.role)}
                              </div>
                              <div>
                                <div className="text-white font-medium">{user.full_name}</div>
                                <a href={`tel:${user.phone}`} className="text-gray-400 text-sm flex items-center gap-1 hover:text-green-400 transition-colors">
                                  <Phone size={12} />
                                  {user.phone}
                                </a>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                  <span className="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300">
                                    {getRoleLabel(user.role)}
                                  </span>
                                  {user.deletion_reason && (
                                    <span className="text-xs px-2 py-0.5 bg-red-900/30 border border-red-700 rounded text-red-300">
                                      {user.deletion_reason}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500">
                                    Удалён: {formatDate(user.deleted_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRestoreUser(user)}
                              className="px-3 py-1.5 bg-green-900/30 border border-green-700 text-green-400 rounded-lg hover:bg-green-900/50 transition text-sm font-medium"
                            >
                              ♻️ Восстановить
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Archived Students */}
                  {archivedStudents.length > 0 && (
                    <div>
                      <h4 className="text-blue-400 font-bold mb-3 flex items-center gap-2">
                        <span>👦</span> Архив учеников ({archivedStudents.length})
                      </h4>
                      <div className="space-y-2">
                        {archivedStudents
                          .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''))
                          .map(student => (
                          <div key={student.id} className="bg-[#2D323B] rounded-lg p-3 border border-gray-700 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-lg">👦</div>
                              <div>
                                <div className="text-white font-medium">{student.first_name} {student.last_name}</div>
                                <div className="flex gap-2 mt-1 flex-wrap">
                                  {student.last_group_name && (
                                    <span className="text-xs px-2 py-0.5 bg-purple-900/30 border border-purple-700 rounded text-purple-300">
                                      Группа: {student.last_group_name}
                                    </span>
                                  )}
                                  {student.last_parent_name && (
                                    <span className="text-xs px-2 py-0.5 bg-green-900/30 border border-green-700 rounded text-green-300">
                                      Родитель: {student.last_parent_name}
                                    </span>
                                  )}
                                  {student.last_parent_phone && (
                                    <span className="text-xs text-gray-400">
                                      📱 {student.last_parent_phone}
                                    </span>
                                  )}
                                </div>
                                <div className="flex gap-2 mt-1">
                                  {student.deletion_reason && (
                                    <span className="text-xs px-2 py-0.5 bg-red-900/30 border border-red-700 rounded text-red-300">
                                      {student.deletion_reason}
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-500">
                                    Удалён: {formatDate(student.deleted_at)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleRestoreStudent(student)}
                              className="px-3 py-1.5 bg-green-900/30 border border-green-700 text-green-400 rounded-lg hover:bg-green-900/50 transition text-sm font-medium"
                            >
                              ♻️ Восстановить
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {archivedUsers.length === 0 && archivedStudents.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      📭 Архив пуст. Удалённые пользователи и ученики будут отображаться здесь.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Users List */}
        {filteredUsers.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-gray-500 text-lg">Нет пользователей</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUsers.map((user) => {
              const userRole = user.role?.toLowerCase();
              const linkedStudents = userRole === 'parent'
                ? students.filter(s => s.guardian_ids?.includes(user.id))
                : [];
              const coachedGroups = userRole === 'coach'
                ? groups.filter(g => g.coach_id === user.id)
                : [];
              
              return (
                <div
                  key={user.id}
                  className="bg-[#2D323B] rounded-xl border border-gray-700 p-3 md:p-4 hover:border-gray-600 transition"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-4">
                    <div className="flex items-center gap-3 flex-1 w-full md:w-auto overflow-hidden">
                      {/* Avatar */}
                      <div className={`w-10 h-10 md:w-12 md:h-12 ${getRoleColor(user.role)} rounded-full flex items-center justify-center text-white text-lg md:text-xl shrink-0`}>
                        {getRoleIcon(user.role)}
                      </div>
                      
                      {/* User Info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-bold text-base md:text-lg truncate">{user.full_name}</div>
                        <a href={`tel:${user.phone}`} className="text-gray-400 text-sm flex items-center gap-1 hover:text-green-400 transition-colors truncate">
                          <Phone size={14} className="shrink-0" />
                          {user.phone}
                        </a>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold text-white ${getRoleColor(user.role)} bg-opacity-20 border border-current`}>
                            {getRoleLabel(user.role)}
                          </span>
                        </div>
                        
                        {/* Additional Info */}
                        {userRole === 'parent' && linkedStudents.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs text-gray-500 mb-1">👦 Дети:</div>
                            <div className="flex flex-wrap gap-1">
                              {linkedStudents.map(s => (
                                <span key={s.id} className="px-2 py-1 bg-blue-900 bg-opacity-30 border border-blue-700 text-blue-300 rounded text-xs truncate max-w-[150px]">
                                  {s.first_name} {s.last_name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {userRole === 'coach' && coachedGroups.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs text-gray-500 mb-1">📚 Группы ({coachedGroups.length}):</div>
                            <div className="flex flex-wrap gap-1">
                              {coachedGroups.map(g => (
                                <span key={g.id} className="px-2 py-1 bg-green-900 bg-opacity-30 border border-green-700 text-green-300 rounded text-xs truncate max-w-[150px]">
                                  {g.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center justify-end w-full md:w-auto gap-2 border-t md:border-t-0 border-gray-700 pt-3 md:pt-0 mt-1 md:mt-0">
                      {userRole === 'super_admin' ? (
                        <div className="w-full md:w-auto text-center px-3 py-2 border border-red-500 text-red-500 rounded text-sm font-bold bg-red-900/10">
                          Руководитель
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleEdit(user)}
                            className="w-full md:w-auto p-3 md:p-2 text-yellow-400 hover:text-yellow-300 bg-yellow-900/20 hover:bg-yellow-900/40 border border-yellow-900/50 rounded-lg transition flex items-center justify-center gap-2"
                            title="Редактировать"
                          >
                            <span className="md:hidden font-medium">Редактировать</span>
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            className="w-full md:w-auto p-3 md:p-2 text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 rounded-lg transition flex items-center justify-center gap-2"
                            title="Удалить"
                          >
                            <span className="md:hidden font-medium">Удалить</span>
                            🗑️
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add User Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 backdrop-blur-sm" onClick={() => setShowModal(false)}>
            <div className="bg-[#23272E] rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 flex flex-col max-h-[90dvh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-4 md:p-6 pb-4 shrink-0 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">{editingUser ? 'Редактировать пользователя' : 'Добавить пользователя'}</h2>
              </div>
              
              <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 md:p-6 py-4 overflow-y-auto custom-scrollbar flex-1 min-h-0 space-y-4">
                  {error && (
                    <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">
                      {error}
                    </div>
                  )}
                  <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">ФИО *</label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    className="w-full px-4 py-3 bg-[#2D323B] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
                    placeholder="Введите полное имя"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Телефон *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-4 py-3 bg-[#2D323B] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
                    placeholder="+373XXXXXXXX"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{editingUser ? 'Пароль (оставьте пустым, чтобы не менять)' : 'Пароль *'}</label>
                  <PasswordInput
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder={editingUser ? "Новый пароль" : "Введите пароль"}
                    className="w-full px-4 py-3 bg-[#2D323B] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Роль *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({...formData, role: e.target.value})}
                    className="w-full px-4 py-3 bg-[#2D323B] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
                  >
                    <option value="parent">👨‍👩‍👧 Родитель</option>
                    <option value="coach">⚽ Тренер</option>
                    {currentUser?.role?.toLowerCase() === 'super_admin' && (
                      <option value="admin">🔧 Администратор</option>
                    )}
                  </select>
                </div>

                {currentUser?.role?.toLowerCase() === 'super_admin' && formData.role === 'admin' && (
                  <div className="bg-[#1A1E23] p-4 rounded-lg border border-gray-700 space-y-3">
                      <h3 className="text-white font-bold text-sm">Доступы администратора</h3>
                      
                      <label className="flex items-center gap-3 cursor-pointer select-none hover:bg-white/5 p-2 rounded transition">
                          <input 
                              type="checkbox" 
                              checked={formData.can_view_analytics} 
                              onChange={(e) => setFormData({...formData, can_view_analytics: e.target.checked})}
                              className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500"
                          />
                          <span className="text-gray-300 text-sm">Просмотр финансовой аналитики</span>
                      </label>

                      <label className="flex items-center gap-3 cursor-pointer select-none hover:bg-white/5 p-2 rounded transition">
                          <input 
                              type="checkbox" 
                              checked={formData.can_view_history} 
                              onChange={(e) => setFormData({...formData, can_view_history: e.target.checked})}
                              className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-yellow-500 focus:ring-yellow-500"
                          />
                          <span className="text-gray-300 text-sm">Просмотр истории изменений</span>
                      </label>
                  </div>
                )}

                {/* Extra fields for Parent */}
                {formData.role === 'parent' && (
                  <div className="space-y-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl mt-2">
                    <h3 className="text-yellow-500 font-bold text-sm">👶 ДАННЫЕ РЕБЕНКА (ОБЯЗАТЕЛЬНО)</h3>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Имя ребенка *</label>
                        <input
                          type="text"
                          value={formData.child_first_name}
                          onChange={(e) => setFormData({...formData, child_first_name: e.target.value})}
                          className="w-full px-3 py-2 bg-[#2D323B] border border-gray-600 rounded-lg text-white text-sm"
                          placeholder="Имя"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Фамилия ребенка *</label>
                        <input
                          type="text"
                          value={formData.child_last_name}
                          onChange={(e) => setFormData({...formData, child_last_name: e.target.value})}
                          className="w-full px-3 py-2 bg-[#2D323B] border border-gray-600 rounded-lg text-white text-sm"
                          placeholder="Фамилия"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Дата рождения *</label>
                        <CustomDatePicker
                          selected={formData.child_dob ? new Date(formData.child_dob) : null}
                          onChange={(date) => {
                            if (date) {
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const day = String(date.getDate()).padStart(2, '0');
                              setFormData({...formData, child_dob: `${year}-${month}-${day}`});
                            } else {
                              setFormData({...formData, child_dob: ''});
                            }
                          }}
                          placeholder="Выберите дату"
                          className="w-full px-3 py-2 bg-[#2D323B] border border-gray-600 rounded-lg text-white text-sm"
                          maxDate={new Date()}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Группа *</label>
                        <select
                          value={formData.group_id}
                          onChange={(e) => setFormData({...formData, group_id: e.target.value})}
                          className="w-full px-3 py-2 bg-[#2D323B] border border-gray-600 rounded-lg text-white text-sm"
                        >
                          <option value="">Выберите группу</option>
                          {groups.map(g => (
                            <option key={g.id} value={g.id}>{g.name} ({g.age_group})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-blue-900 bg-opacity-20 border border-blue-700 text-blue-300 px-4 py-3 rounded-lg text-sm">
                  💡 {formData.role === 'parent' && 'Родитель и ребенок будут созданы и связаны автоматически'}
                  {formData.role === 'coach' && 'Тренера можно назначить на группу в разделе "Группы"'}
                  {formData.role === 'admin' && 'Администратор получит полный доступ к системе'}
                </div>

                </div>
                <div className="p-6 pt-4 shrink-0 flex gap-3 border-t border-gray-700 bg-[#23272E]">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => { setShowModal(false); setError(''); }}
                    className="flex-1 px-4 py-3 bg-[#2D323B] border border-gray-600 text-gray-300 rounded-lg hover:bg-[#353A42] transition disabled:opacity-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-3 bg-[#FFC107] text-black rounded-lg hover:bg-[#FFD54F] transition font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? <span className="animate-spin text-lg">⏳</span> : (editingUser ? 'Сохранить' : 'Создать')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && deleteTarget && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm" onClick={() => setShowDeleteModal(false)}>
            <div className="bg-[#23272E] rounded-xl shadow-2xl max-w-md w-full mx-4 border border-gray-700 flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-6 pb-4 shrink-0 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">
                  ⚠️ Удаление родителя
                </h2>
              </div>
              
              <div className="p-6 py-4 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                <p className="text-gray-300 mb-4">
                  Вы удаляете <span className="text-white font-bold">{deleteTarget.full_name}</span>
                </p>
              
              {deleteTarget.linkedStudents && deleteTarget.linkedStudents.length > 0 && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-4">
                  <p className="text-red-300 text-sm mb-2">
                    👦 У этого родителя есть связанные ученики:
                  </p>
                  <ul className="text-white text-sm mb-3">
                    {deleteTarget.linkedStudents.map(s => (
                      <li key={s.id}>• {s.first_name} {s.last_name}</li>
                    ))}
                  </ul>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deleteWithStudents}
                      onChange={(e) => setDeleteWithStudents(e.target.checked)}
                      className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-red-500 focus:ring-red-500"
                    />
                    <span className="text-red-300 text-sm">
                      Также удалить учеников (и их платежи, посещаемость)
                    </span>
                  </label>
                </div>
              )}
              
              </div>
              <div className="p-6 pt-4 shrink-0 flex gap-3 border-t border-gray-700 bg-[#23272E]">
                <button
                  onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }}
                  className="flex-1 px-4 py-3 bg-[#2D323B] border border-gray-600 text-gray-300 rounded-lg hover:bg-[#353A42] transition"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Success Message */}
        {deleteMessage && (
          <div className="fixed bottom-4 right-4 bg-green-900 border border-green-700 text-green-300 px-6 py-3 rounded-lg shadow-lg z-50">
            {deleteMessage}
          </div>
        )}
      </div>
    </div>
  );
}
