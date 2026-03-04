import { useState, useEffect, useMemo } from 'react';
import { groupsAPI, usersAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { transliterate } from '../utils/transliteration';
import { Phone, Users } from 'lucide-react';

export default function Groups() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [groups, setGroups] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferSourceGroup, setTransferSourceGroup] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    age_group: '',
    coach_id: '',
    coach_ids: [],  // Multiple coaches
    subscription_type: 'by_calendar',
    monthly_fee: 1200,
    classes_per_month: 8,
    payment_due_day: 10,
  });
  const [searchQuery, setSearchQuery] = useState('');

  const canEdit = user && user.role !== 'parent';
  const canSeeFinancials = user && ['super_admin', 'admin', 'accountant'].includes(user.role?.toLowerCase());

  const filteredGroups = useMemo(() => {
    const list = searchQuery.trim()
      ? groups.filter(g =>
        g.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        transliterate(g.name, language)?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.age_group?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        coaches.find(c => c.id === g.coach_id)?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        transliterate(coaches.find(c => c.id === g.coach_id)?.full_name, language)?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      : [...groups];

    return list.sort((a, b) => {
      const getAgeValue = (str) => {
        if (!str) return 999;
        const s = str.toString().trim();
        
        // Handle "U-X" format (e.g., "U-10", "U10")
        const uMatch = s.match(/U-?(\d+)/i);
        if (uMatch) return parseInt(uMatch[1]);
        
        // Handle 4-digit year (e.g., "2015")
        const yearMatch = s.match(/^(\d{4})$/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          const currentYear = new Date().getFullYear();
          if (year > 1900 && year <= currentYear + 1) {
             return currentYear - year;
          }
        }
        
        // Handle simple number as age
        const numMatch = s.match(/^(\d+)$/);
        if (numMatch) {
          const num = parseInt(numMatch[1]);
          // If number is large (like 2015), treat as year
          if (num > 1900) return new Date().getFullYear() - num;
          return num;
        }

        // Try to find any number
        const anyNum = s.match(/(\d+)/);
        if (anyNum) return parseInt(anyNum[0]);
        
        return 999;
      };

      const ageA = getAgeValue(a.age_group);
      const ageB = getAgeValue(b.age_group);
      
      return ageA - ageB;
    });
  }, [groups, searchQuery, coaches, language]);

  useEffect(() => { fetchGroups(); fetchCoaches(); }, []);

  const fetchGroups = async () => {
    try {
      const response = await groupsAPI.getAll();
      const payload = response.data;
      // Поддерживаем оба формата ответа: { data: [...] } и [...]
      const list = Array.isArray(payload) ? payload : (payload?.data || []);
      setGroups(list);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCoaches = async () => {
    try {
      const response = await usersAPI.getAll();
      const allUsers = response.data?.data || response.data || [];
      setCoaches(allUsers.filter(u => u.role?.toLowerCase() === 'coach'));
    } catch (error) {
      console.error('Error fetching coaches:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError(t('enter_group_name_error'));
      return;
    }

    setSaving(true);
    try {
      const submitData = {
        name: formData.name.trim(),
        age_group: formData.age_group || null,
        coach_id: formData.coach_id ? parseInt(formData.coach_id) : null,
        coach_ids: formData.coach_ids.length > 0 ? formData.coach_ids.map(id => parseInt(id)) : null,
        subscription_type: formData.subscription_type,
        monthly_fee: parseFloat(formData.monthly_fee) || 0,
        classes_per_month: parseInt(formData.classes_per_month) || 8,
        payment_due_day: parseInt(formData.payment_due_day) || 10,
      };

      if (editingGroup) {
        await groupsAPI.update(editingGroup.id, submitData);
        setSuccessMessage(t('group_updated_success'));
      } else {
        await groupsAPI.create(submitData);
        setSuccessMessage(t('group_created_success'));
      }
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchGroups();
      closeModal();
    } catch (error) {
      console.error('Error saving group:', error);
      setError(error.response?.data?.detail || t('save_error'));
    } finally {
      setSaving(false);
    }
  };

  // Открыть модал удаления
  const openDeleteModal = (group) => {
    setGroupToDelete(group);
    setShowDeleteModal(true);
  };

  // Закрыть модал удаления
  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setGroupToDelete(null);
  };

  // Удалить группу вместе с учениками
  const handleDeleteWithStudents = async () => {
    if (!groupToDelete) return;
    setDeleting(true);
    try {
      const response = await groupsAPI.delete(groupToDelete.id);
      const studentsDeleted = response.data?.students_deleted || 0;
      if (studentsDeleted > 0) {
        setSuccessMessage(`✅ ${t('group_deleted_success')} (${studentsDeleted} ${t('students_lower')}).`);
      } else {
        setSuccessMessage(`✅ ${t('group_deleted_success')}!`);
      }
      setTimeout(() => setSuccessMessage(''), 4000);
      fetchGroups();
      closeDeleteModal();
    } catch (error) {
      console.error('Delete error:', error);
      setError(error.response?.data?.detail || t('group_delete_error'));
    } finally {
      setDeleting(false);
    }
  };

  // Перевести учеников в другую группу и удалить текущую
  const handleTransferAndDelete = async (targetGroupId) => {
    if (!groupToDelete) return;
    setDeleting(true);
    try {
      // Сначала переводим учеников
      await groupsAPI.transferAllStudents(groupToDelete.id, targetGroupId);
      // Затем удаляем группу
      await groupsAPI.delete(groupToDelete.id);
      const targetGroup = groups.find(g => g.id === targetGroupId);
      setSuccessMessage(`✅ ${t('students_transferred_success')} -> "${targetGroup?.name}", ${t('group_deleted_success')}!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      fetchGroups();
      closeDeleteModal();
    } catch (error) {
      console.error('Transfer and delete error:', error);
      setError(error.response?.data?.detail || t('students_transfer_error'));
    } finally {
      setDeleting(false);
    }
  };

  const handleTransferAllStudents = async (sourceGroupId, targetGroupId) => {
    try {
      const response = await groupsAPI.transferAllStudents(sourceGroupId, targetGroupId);
      setSuccessMessage(response.data?.message || t('students_transferred_success'));
      setTimeout(() => setSuccessMessage(''), 4000);
      setShowTransferModal(false);
      setTransferSourceGroup(null);
      fetchGroups();
    } catch (error) {
      alert(error.response?.data?.detail || t('transfer_error'));
    }
  };

  const openTransferModal = (group) => {
    setTransferSourceGroup(group);
    setShowTransferModal(true);
  };

  const openModal = (group = null) => {
    setError('');
    if (group) {
      setEditingGroup(group);
      // Extract coach IDs from coaches array if available
      const coachIds = group.coaches?.map(c => c.id) || [];
      setFormData({
        name: group.name || '',
        age_group: group.age_group || '',
        coach_id: group.coach_id || '',
        coach_ids: coachIds,
        subscription_type: group.subscription_type || 'by_calendar',
        monthly_fee: group.monthly_fee || 1200,
        classes_per_month: group.classes_per_month || 8,
        payment_due_day: group.payment_due_day || 10,
      });
    } else {
      setEditingGroup(null);
      setFormData({
        name: '',
        age_group: '',
        coach_id: '',
        coach_ids: [],
        subscription_type: 'by_calendar',
        monthly_fee: 1200,
        classes_per_month: 8,
        payment_due_day: 10,
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingGroup(null);
    setError('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-yellow-500 text-lg">{t('loading')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-2 md:p-6 pb-24 md:pb-6 text-white">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-3">
              <Users className="text-yellow-400 w-8 h-8 md:w-10 md:h-10" />
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                {t('groups_title')}
              </span>
            </h1>
            <p className="text-gray-500 mt-1 md:mt-2 text-sm md:text-base">
              {t('total_groups')}: {groups.length}
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => openModal()}
              className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black rounded-xl font-semibold shadow-lg shadow-yellow-500/25 transition-all hover:scale-105"
            >
              + {t('create_group')}
            </button>
          )}
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 mb-6 backdrop-blur-sm animate-fade-up">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <span className="text-emerald-400 font-semibold text-lg">{successMessage}</span>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <input
              type="text"
              placeholder={t('search_group')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-5 py-4 pl-14 bg-white/5 text-white rounded-2xl border border-white/10 focus:border-yellow-500/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 transition-all text-lg placeholder-gray-500"
              style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.03)' }}
            />
            <span className="absolute left-5 top-4 text-gray-500 text-xl">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-5 top-4 text-gray-500 hover:text-white w-8 h-8 rounded-lg hover:bg-white/10 transition flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="mt-3 text-sm text-gray-500">
              {t('found_groups')} <span className="text-yellow-400 font-semibold">{filteredGroups.length}</span>
            </div>
          )}
        </div>

        {/* Groups Grid */}
        {filteredGroups.length === 0 ? (
          <div className="text-center py-24 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-sm">
            <div className="text-7xl mb-6">📚</div>
            <div className="text-gray-400 text-xl mb-6">{searchQuery ? t('no_results') : t('no_groups')}</div>
            {canEdit && !searchQuery && (
              <button
                onClick={() => openModal()}
                className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black px-8 py-3 rounded-xl font-semibold shadow-lg shadow-yellow-500/25 transition-all hover:scale-105"
              >
                + {t('create_first_group')}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGroups.map((group, index) => {
              const groupCoach = coaches.find(c => c.id === group.coach_id);
              // Handle both legacy coach_id and new many-to-many coaches
              // If group.coaches is populated (length > 0), use it.
              // Otherwise, fallback to the single coach found by coach_id.
              const allCoaches = (group.coaches && group.coaches.length > 0) 
                ? group.coaches 
                : (groupCoach ? [groupCoach] : []);
              
              // Use students_count from backend if available, otherwise fallback to students array length
              const studentsCount = group.students_count !== undefined ? group.students_count : (group.students?.length || 0);

              return (
                <div
                  key={group.id}
                  className="group bg-white/5 rounded-2xl border border-white/10 p-6 hover:border-yellow-500/30 hover:bg-white/[0.07] transition-all duration-300 animate-fade-up"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-black font-bold text-lg">
                        {transliterate(group.name?.charAt(0), language) || 'G'}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white">{transliterate(group.name, language)}</h3>
                        {group.age_group && (
                          <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">
                            {group.age_group}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Coaches - показываем всех тренеров */}
                  <div className="mb-4 p-3 bg-white/5 rounded-xl border border-white/5">
                    <div className="text-xs text-gray-500 mb-1">
                      {allCoaches.length > 1 ? t('coaches') : t('coach')}
                    </div>
                    {allCoaches.length > 0 ? (
                      <div className="space-y-2">
                        {allCoaches.map((coach, idx) => (
                          <div key={coach.id || idx} className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center">
                              {coach.avatar_url ? (
                                <img src={coach.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                              ) : (
                                <span className="text-blue-400 text-xs">⚽</span>
                              )}
                            </div>
                            <span className="text-white text-sm font-medium">{transliterate(coach.full_name, language)}</span>
                            {coach.phone && (
                              <a 
                                href={`tel:${coach.phone}`}
                                className="text-gray-400 hover:text-green-400 transition-colors ml-1"
                                title={t('call') || 'Позвонить'}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone size={12} />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-orange-400">
                        <span>⚠️</span>
                        <span className="text-sm">{t('no_coach_assigned')}</span>
                      </div>
                    )}
                  </div>

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-xs text-gray-500 mb-1">{t('students_count')}</div>
                      <div className="text-white font-bold text-lg">{studentsCount}</div>
                    </div>
                    {canSeeFinancials && (
                      <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                        <div className="text-xs text-gray-500 mb-1">{t('monthly_fee')}</div>
                        <div className="text-emerald-400 font-bold">{group.monthly_fee || 0} MDL</div>
                      </div>
                    )}
                  </div>

                  {/* Subscription Type */}
                  <div className="text-sm text-gray-400 mb-4 flex items-center gap-2">
                    {group.subscription_type === 'by_class' ? (
                      <>
                        <span className="text-blue-400">📊</span>
                        <span>{t('by_class')} ({group.classes_per_month || 8} {t('per_month')})</span>
                      </>
                    ) : (
                      <>
                        <span className="text-purple-400">📅</span>
                        <span>{t('by_calendar')} ({t('payment_due_day')} {group.payment_due_day || 10})</span>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <div className="flex gap-2 pt-4 border-t border-white/10">
                      <button
                        onClick={() => openModal(group)}
                        className="flex-1 px-3 py-2.5 bg-blue-500/20 text-blue-400 rounded-xl hover:bg-blue-500/30 transition font-medium border border-blue-500/30 text-sm"
                      >
                        ✏️ {t('edit')}
                      </button>
                      {studentsCount > 0 && (
                        <button
                          onClick={() => openTransferModal(group)}
                          className="px-3 py-2.5 bg-purple-500/20 text-purple-400 rounded-xl hover:bg-purple-500/30 transition border border-purple-500/30"
                          title={t('transfer_students')}
                        >
                          🔄
                        </button>
                      )}
                      <button
                        onClick={() => openDeleteModal(group)}
                        className="px-3 py-2.5 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition border border-red-500/30"
                        title={t('delete_group')}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeModal}>
            <div className="bg-[#1C1E24] rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-white/10 animate-scale-in" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-white/10 shrink-0">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="text-2xl">{editingGroup ? '✏️' : '➕'}</span>
                  {editingGroup ? t('edit_group') : t('create_group')}
                </h2>
              </div>

              <div className="overflow-y-auto p-6">
                <form id="group-form" onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl">
                      {error}
                    </div>
                  )}

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('group_name')} *</label>
                    <input
                      type="text"
                      placeholder="U-10 Group A"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none placeholder-gray-500"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                      required
                    />
                  </div>

                  {/* Age Group */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('age_group')}</label>
                    <input
                      type="text"
                      placeholder="U-10 / 2015"
                      value={formData.age_group}
                      onChange={(e) => setFormData({ ...formData, age_group: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none placeholder-gray-500"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                    />
                  </div>

                  {/* Coach Selection - Multiple */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      {t('coaches')} <span className="text-gray-600">({t('select_multiple') || 'select multiple'})</span>
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-white/5 border border-white/10 rounded-xl">
                      {coaches.length === 0 ? (
                        <div className="text-gray-500 text-sm py-2">{t('no_coaches_available')}</div>
                      ) : (
                        coaches.map(coach => (
                          <label
                            key={coach.id}
                            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${formData.coach_ids.includes(coach.id)
                              ? 'bg-yellow-500/20 border border-yellow-500/30'
                              : 'hover:bg-white/5'
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.coach_ids.includes(coach.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    coach_ids: [...formData.coach_ids, coach.id],
                                    coach_id: formData.coach_id || coach.id  // Set first as primary
                                  });
                                } else {
                                  const newIds = formData.coach_ids.filter(id => id !== coach.id);
                                  setFormData({
                                    ...formData,
                                    coach_ids: newIds,
                                    coach_id: formData.coach_id === coach.id ? (newIds[0] || '') : formData.coach_id
                                  });
                                }
                              }}
                              className="w-4 h-4 rounded text-yellow-500 focus:ring-yellow-500 focus:ring-offset-0 bg-white/10 border-white/20"
                            />
                            <div className="flex items-center gap-2 flex-1">
                              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                                {coach.avatar_url ? (
                                  <img src={coach.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <span className="text-blue-400 text-sm">⚽</span>
                                )}
                              </div>
                              <span className="text-white">{transliterate(coach.full_name, language)}</span>
                            </div>
                            {formData.coach_id == coach.id && (
                              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                                {t('main_coach')}
                              </span>
                            )}
                          </label>
                        ))
                      )}
                    </div>
                    {formData.coach_ids.length > 0 && (
                      <div className="mt-2 text-sm text-gray-500">
                        {t('selected_coaches_count')}: <span className="text-yellow-400">{formData.coach_ids.length}</span>
                      </div>
                    )}
                  </div>

                  {/* Subscription Type */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('subscription_type')}</label>
                    <select
                      value={formData.subscription_type}
                      onChange={(e) => setFormData({ ...formData, subscription_type: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                    >
                      <option value="by_class" style={{ backgroundColor: '#1C1E24' }}>📊 {t('by_class')}</option>
                      <option value="by_calendar" style={{ backgroundColor: '#1C1E24' }}>📅 {t('by_calendar')}</option>
                    </select>
                  </div>

                  {/* Monthly Fee */}
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">{t('monthly_fee')} (MDL)</label>
                    <input
                      type="number"
                      placeholder="1200"
                      value={formData.monthly_fee}
                      onChange={(e) => setFormData({ ...formData, monthly_fee: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none placeholder-gray-500"
                      style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                      min="0"
                      step="50"
                    />
                  </div>

                  {/* Classes Per Month */}
                  {formData.subscription_type === 'by_class' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">{t('classes_per_month')}</label>
                      <input
                        type="number"
                        placeholder="8"
                        value={formData.classes_per_month}
                        onChange={(e) => setFormData({ ...formData, classes_per_month: e.target.value })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none placeholder-gray-500"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                        min="1"
                        max="31"
                      />
                    </div>
                  )}

                  {/* Payment Due Day */}
                  {formData.subscription_type === 'by_calendar' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">{t('payment_due_day')}</label>
                      <input
                        type="number"
                        placeholder="10"
                        value={formData.payment_due_day}
                        onChange={(e) => setFormData({ ...formData, payment_due_day: e.target.value })}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none placeholder-gray-500"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
                        min="1"
                        max="31"
                      />
                    </div>
                  )}
                </form>
              </div>

              {/* Buttons */}
              <div className="p-6 border-t border-white/10 shrink-0">
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-5 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition font-medium"
                    disabled={saving}
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    form="group-form"
                    className="flex-1 px-5 py-3.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black rounded-xl font-bold shadow-lg shadow-yellow-500/25 transition-all disabled:opacity-50"
                    disabled={saving}
                  >
                    {saving ? `⏳ ${t('saving')}` : (editingGroup ? `💾 ${t('save')}` : `✅ ${t('create')}`)}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Transfer Students Modal */}
        {showTransferModal && transferSourceGroup && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowTransferModal(false); setTransferSourceGroup(null); }}>
            <div className="bg-[#1C1E24] rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-white/10 animate-scale-in" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-white/10 shrink-0">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="text-2xl">🔄</span>
                  {t('transfer_students')}
                </h2>
                <p className="text-gray-500 mt-2">
                  {t('from_group')}: <span className="text-white font-medium">{transliterate(transferSourceGroup.name, language)}</span>
                  <br />
                  {t('students_count')}: <span className="text-yellow-400 font-bold">{transferSourceGroup.students?.length || 0}</span>
                </p>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">{t('transfer_to')}</label>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {groups
                      .filter(g => g.id !== transferSourceGroup.id)
                      .map(group => (
                        <button
                          key={group.id}
                          onClick={() => handleTransferAllStudents(transferSourceGroup.id, group.id)}
                          className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/30 rounded-xl transition-colors text-left"
                        >
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-black font-bold">
                            {transliterate(group.name?.charAt(0), language) || 'G'}
                          </div>
                          <div className="flex-1">
                            <div className="text-white font-medium">{transliterate(group.name, language)}</div>
                            <div className="text-xs text-gray-500">
                              {group.students?.length || 0} {t('students_lower')}
                            </div>
                          </div>
                          <span className="text-purple-400">→</span>
                        </button>
                      ))}
                  </div>
                  {groups.filter(g => g.id !== transferSourceGroup.id).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      {t('no_other_groups')}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => { setShowTransferModal(false); setTransferSourceGroup(null); }}
                  className="w-full px-5 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition font-medium"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Group Modal */}
        {showDeleteModal && groupToDelete && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setShowDeleteModal(false); setGroupToDelete(null); }}>
            <div className="bg-[#1C1E24] rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden border border-white/10 animate-scale-in" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-white/10 shrink-0">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <span className="text-2xl">🗑️</span>
                  {t('delete_group_title')}
                </h2>
                <p className="text-gray-400 mt-2">
                  {t('group_label')}: <span className="text-white font-medium">{transliterate(groupToDelete.name, language)}</span>
                </p>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                {(groupToDelete.students?.length || 0) > 0 ? (
                  <>
                    {/* Группа с учениками */}
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                      <div className="flex items-center gap-3 text-amber-400">
                        <span className="text-2xl">⚠️</span>
                        <div>
                          <div className="font-semibold">{t('group_has_students')}</div>
                          <div className="text-sm opacity-80">
                            {groupToDelete.students.length} {t('students_lower')}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="text-sm text-gray-400 mb-2">{t('select_action')}:</div>

                    {/* Вариант 1: Перевести в другую группу */}
                    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xl">🔄</span>
                        <span className="text-white font-medium">{t('transfer_students')}</span>
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">{t('recommended')}</span>
                      </div>
                      <div className="text-sm text-gray-500 mb-3">
                        {t('select_group_transfer')}:
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {groups
                          .filter(g => g.id !== groupToDelete.id)
                          .map(group => (
                            <button
                              key={group.id}
                              onClick={() => handleTransferAndDelete(group.id)}
                              disabled={deleting}
                              className="w-full flex items-center gap-3 p-2.5 bg-white/5 hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/30 rounded-lg transition-colors text-left disabled:opacity-50"
                            >
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center text-black font-bold text-sm">
                                {transliterate(group.name?.charAt(0), language) || 'G'}
                              </div>
                              <div className="flex-1">
                                <div className="text-white text-sm font-medium">{transliterate(group.name, language)}</div>
                                <div className="text-xs text-gray-500">{group.students?.length || 0} {t('students_lower')}</div>
                              </div>
                              <span className="text-purple-400">→</span>
                            </button>
                          ))}
                        {groups.filter(g => g.id !== groupToDelete.id).length === 0 && (
                          <div className="text-center py-4 text-gray-500 text-sm">
                            {t('no_other_groups')}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Вариант 2: Удалить вместе с учениками */}
                    <button
                      onClick={handleDeleteWithStudents}
                      disabled={deleting}
                      className="w-full flex items-center gap-3 p-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl transition-colors text-left disabled:opacity-50"
                    >
                      <span className="text-xl">🗑️</span>
                      <div className="flex-1">
                        <div className="text-red-400 font-medium">{t('delete_with_students')}</div>
                        <div className="text-xs text-gray-500">
                          {t('delete_with_students_desc')}
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  /* Группа без учеников */
                  <>
                    <div className="text-gray-400 text-center py-4">
                      {t('group_empty_safe_delete')}
                    </div>
                    <button
                      onClick={handleDeleteWithStudents}
                      disabled={deleting}
                      className="w-full px-5 py-3.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/25 transition-all disabled:opacity-50"
                    >
                      {deleting ? `⏳ ${t('loading')}` : `🗑️ ${t('delete_group')}`}
                    </button>
                  </>
                )}

                {/* Кнопка отмены */}
                <button
                  type="button"
                  onClick={() => { closeDeleteModal(); setError(''); }}
                  disabled={deleting}
                  className="w-full px-5 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition font-medium disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
