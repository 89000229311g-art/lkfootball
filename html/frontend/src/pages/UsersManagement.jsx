import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usersAPI, studentsAPI, groupsAPI, authAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { transliterate, getLocalizedName } from '../utils/transliteration';
import PasswordInput from '../components/PasswordInput';
import CustomDatePicker from '../components/CustomDatePicker';
import { Download, FileText, Loader2, Phone } from 'lucide-react';
import { exportToExcel, exportToPDF, getDateString } from '../utils/exportUtils';

export default function UsersManagement() {
  const { t, language } = useLanguage();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    console.log("DEBUG: UsersManagement component mounted - Version 2.4 Mobile Archive Fix");
  }, []);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('parent');
  
  // 📦 Archive state
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [restoring, setRestoring] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState(''); // NEW: Group Filter
  const [selectedUsers, setSelectedUsers] = useState([]); // NEW: Selected users for mass actions
  
  // 🔐 Passwords tab state
  const [showPasswordsTab, setShowPasswordsTab] = useState(false);
  const [credentials, setCredentials] = useState([]);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [passwordSearch, setPasswordSearch] = useState('');
  
  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Export State
  // const printRef = useRef(null); // Unused after refactor
  // const [isExporting, setIsExporting] = useState(false); // Unused after refactor
  
  const [formData, setFormData] = useState({
    phone: '+373',
    phone_secondary: '',
    password: '',
    full_name: '',
    role: 'parent',
    child_first_name: '',
    child_last_name: '',
    child_dob: '',
    group_id: '',
    child_medical_info: '',
    child_medical_notes: '',
    assigned_group_ids: [],
  });
  
  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);


  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, studentsRes, groupsRes] = await Promise.all([
        usersAPI.getAll(),
        studentsAPI.getAll(),
        groupsAPI.getAll()
      ]);
      // Handle paginated responses (new format: {data: [...], total: ...})
      const usersData = usersRes.data?.data || usersRes.data || [];
      const studentsData = studentsRes.data?.data || studentsRes.data || [];
      const groupsData = groupsRes.data?.data || groupsRes.data || [];
      setUsers(usersData);
      setStudents(studentsData);
      setGroups(groupsData);
      
      // 📦 Load archived users
      try {
        const archivedRes = await usersAPI.getArchived();
        const archivedData = archivedRes.data?.data || archivedRes.data || [];
        setArchivedUsers(archivedData);
      } catch (e) {
        console.error('Error loading archived users:', e);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // 🔐 Fetch all credentials (for admins/owners)
  const fetchCredentials = async () => {
    setLoadingCredentials(true);
    try {
      const res = await authAPI.getCredentials();
      setCredentials(res.data?.credentials || []);
    } catch (error) {
      console.error('Error loading credentials:', error);
    } finally {
      setLoadingCredentials(false);
    }
  };
  
  // Check if current user can see passwords
  const canSeePasswords = currentUser?.role?.toLowerCase() === 'super_admin' || 
                          currentUser?.role?.toLowerCase() === 'owner' ||
                          currentUser?.role?.toLowerCase() === 'admin';
  
  // 📦 Restore user from archive
  const handleRestore = async (user) => {
    if (!window.confirm(`${t('restore_user_confirm')} ${transliterate(user.full_name, language)}?`)) return;
    
    setRestoring(user.id);
    try {
      await usersAPI.restore(user.id);
      setSuccessMessage(`✅ ${transliterate(user.full_name, language)} ${t('user_restored_success')}`);
      setTimeout(() => setSuccessMessage(''), 3000);
      await fetchData();
    } catch (error) {
      console.error('Error restoring user:', error);
      setDeleteError(`${t('restore_error')}: ${error.response?.data?.detail || error.message}`);
      setTimeout(() => setDeleteError(''), 5000);
    } finally {
      setRestoring(null);
    }
  };

  // Handle Select All
  const handleSelectAll = (filteredUsersList) => {
    if (selectedUsers.length === filteredUsersList.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsersList.map(u => u.id));
    }
  };

  // Handle Select User
  const handleSelectUser = (userId) => {
    if (selectedUsers.includes(userId)) {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
    } else {
      setSelectedUsers([...selectedUsers, userId]);
    }
  };

  // Handle Mass Delete
  const handleMassDelete = async () => {
    if (!window.confirm(`${t('confirm_delete_selected', 'Вы уверены, что хотите удалить выбранных пользователей?')} (${selectedUsers.length})`)) return;

    setLoading(true);
    try {
      await Promise.all(selectedUsers.map(id => usersAPI.delete(id)));
      setSuccessMessage(`${t('mass_delete_success', 'Выбранные пользователи успешно удалены')}`);
      setSelectedUsers([]);
      fetchData();
    } catch (error) {
      console.error('Error mass deleting users:', error);
      setError(t('mass_delete_error', 'Ошибка при массовом удалении'));
    } finally {
      setLoading(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  // Open modal for adding new user
  const openAddModal = (role) => {
    setEditingUser(null);
    setFormData({
      phone: '+373',
      phone_secondary: '',
      password: '',
      full_name: '',
      role: role,
      child_first_name: '',
      child_last_name: '',
      child_dob: '',
      group_id: '',
      child_medical_info: '',
      child_medical_notes: '',
      assigned_group_ids: [],
    });
    setError('');
    setAvatarFile(null);
    setAvatarPreview(null);
    setShowModal(true);
  };

  const openEditModal = (user) => {
    const userRole = user.role?.toLowerCase();
    const linkedStudents = userRole === 'parent'
      ? students.filter(s => s.guardian_ids?.includes(user.id))
      : [];
    const primaryStudent = linkedStudents.length > 0 ? linkedStudents[0] : null;
    const rawDob = primaryStudent?.dob || primaryStudent?.birth_date || '';
    const childDob = rawDob || '';

    const assignedGroupIds = userRole === 'coach'
      ? groups.filter(g => g.coach_id === user.id).map(g => g.id)
      : [];
    
    setEditingUser(user);
    setFormData({
      phone: user.phone || '+373',
      phone_secondary: user.phone_secondary || '',
      password: '',
      full_name: user.full_name || '',
      role: user.role || 'parent',
      child_first_name: primaryStudent?.first_name || '',
      child_last_name: primaryStudent?.last_name || '',
      child_dob: childDob,
      group_id: primaryStudent?.group_id || '',
      child_medical_info: primaryStudent?.medical_info || '',
      child_medical_notes: primaryStudent?.medical_notes || '',
      assigned_group_ids: assignedGroupIds,
      can_view_history: user.can_view_history || false,
      can_view_analytics: user.can_view_analytics || false,
      can_view_crm: user.can_view_crm || false,
      can_view_recruitment: user.can_view_recruitment || false,
      can_view_marketing: user.can_view_marketing || false,
    });
    setError('');
    setAvatarFile(null);
    setAvatarPreview(user.avatar_url ? user.avatar_url : null);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.phone || !formData.full_name) {
      setError(t('fill_required_fields_detailed'));
      return;
    }
    
    if (!editingUser && !formData.password) {
      setError(t('specify_password'));
      return;
    }

    if (formData.role === 'parent') {
      if (!formData.child_first_name || !formData.child_last_name || !formData.child_dob || !formData.group_id) {
        setError(t('parent_create_error_child'));
        return;
      }
    }

    setSaving(true);
    try {
      let userId;
      
      if (editingUser) {
        const updateData = {
          phone: formData.phone,
          phone_secondary: formData.phone_secondary || null,
          full_name: formData.full_name,
        };
        if (formData.password) {
          updateData.password = formData.password;
        }
        if (editingUser.role?.toLowerCase() === 'admin' && ['super_admin', 'owner'].includes(currentUser?.role?.toLowerCase())) {
          updateData.can_view_history = formData.can_view_history;
          updateData.can_view_analytics = formData.can_view_analytics;
          updateData.can_view_crm = formData.can_view_crm;
          updateData.can_view_recruitment = formData.can_view_recruitment;
          updateData.can_view_marketing = formData.can_view_marketing;
        }
        await usersAPI.update(editingUser.id, updateData);
        userId = editingUser.id;
        if (formData.role === 'parent') {
          const parentStudent = students.find(s => s.guardian_ids?.includes(userId));
          if (parentStudent) {
            const childUpdate = {};
            if (formData.child_first_name) {
              childUpdate.first_name = formData.child_first_name.trim();
            }
            if (formData.child_last_name) {
              childUpdate.last_name = formData.child_last_name.trim();
            }
            if (formData.child_dob) {
              childUpdate.dob = formData.child_dob;
            }
            const groupId = parseInt(formData.group_id);
            if (!isNaN(groupId) && groupId > 0) {
              childUpdate.group_id = groupId;
            } else {
              setError(t('select_child_group'));
              setSaving(false);
              return;
            }
            childUpdate.medical_info = formData.child_medical_info || '';
            childUpdate.medical_notes = formData.child_medical_notes || '';
            await studentsAPI.update(parentStudent.id, childUpdate);
          }
        }
      } else {
        const createData = {
          phone: formData.phone,
          phone_secondary: formData.phone_secondary || null,
          password: formData.password,
          full_name: formData.full_name,
          role: formData.role,
        };
        
        if (formData.role === 'parent' && formData.child_first_name && formData.child_last_name) {
          createData.child_full_name = `${formData.child_first_name} ${formData.child_last_name}`.trim();
          createData.child_birth_date = formData.child_dob;
          createData.child_medical_info = formData.child_medical_info;
          createData.child_medical_notes = formData.child_medical_notes;
          const groupId = parseInt(formData.group_id);
          if (!isNaN(groupId) && groupId > 0) {
            createData.child_group_id = groupId;
          } else {
            setError(t('select_child_group'));
            setSaving(false);
            return;
          }
        }
        
        const response = await usersAPI.create(createData);
        userId = response.data?.id || response.data?.data?.id;
        if (!userId) {
          console.error('API response missing ID:', response.data);
          throw new Error(t('user_id_error'));
        }
      }
      
      if (formData.role === 'coach' && userId) {
        await updateCoachGroupAssignments(userId, formData.assigned_group_ids || []);
      }
      
      // Handle avatar upload if new file selected
      if (avatarFile && userId) {
        const avatarFormData = new FormData();
        avatarFormData.append('file', avatarFile);
        await usersAPI.uploadAvatar(userId, avatarFormData);
      }
      
      setShowModal(false);
      setSearchQuery(''); // Clear search to show new user
      await fetchData();
      // Success notification (no blocking alert)
      setSuccessMessage(editingUser ? t('user_updated_success') : t('user_created_success'));
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('CRITICAL ERROR saving user:', error);
      let errorMsg = t('save_error_generic');
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMsg = error.response.data.detail.map(err => err.msg).join(', ');
        } else {
          errorMsg = error.response.data.detail;
        }
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setError(errorMsg);
      // No blocking alert - error shown in modal
    } finally {
      setSaving(false);
    }
  };

  const updateCoachGroupAssignments = async (coachId, groupIds) => {
    let assignCount = 0;
    let unassignCount = 0;
    
    for (const group of groups) {
      const shouldBeAssigned = groupIds.includes(group.id);
      const isCurrentlyAssigned = group.coach_id === coachId;
      
      if (shouldBeAssigned && !isCurrentlyAssigned) {
        try {
          await groupsAPI.update(group.id, { coach_id: coachId });
          assignCount++;
        } catch (e) {
          console.error('Error assigning coach to group:', e);
          throw new Error(`${t('group_assign_error')} ${group.name}`);
        }
      } else if (!shouldBeAssigned && isCurrentlyAssigned) {
        try {
          await groupsAPI.update(group.id, { coach_id: null });
          unassignCount++;
        } catch (e) {
          console.error('Error removing coach from group:', e);
          throw new Error(`${t('group_unassign_error')} ${group.name}`);
        }
      }
    }
    
    console.log(`Coach ${coachId}: assigned ${assignCount}, unassigned ${unassignCount} groups`);
  };

  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(null); // Track which user is being deleted
  // Removed unused deletingStudent state
  const [showingPassword, setShowingPassword] = useState({}); // {userId: password} - показанные пароли
  const [loadingPassword, setLoadingPassword] = useState(null); // userId который загружается

  // 🗑️ Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null); // { type: 'user' | 'student', data: object }
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');

  const handleDelete = (user) => {
    try {
      console.log('Delete requested for user:', user);
      if (!user || !user.id) {
        console.error('Invalid user object for delete');
        alert('Ошибка: Некорректный объект пользователя');
        return;
      }

      const userRole = user.role?.toLowerCase();
      const userName = user.full_name ? String(user.full_name) : 'User';
      const safeName = transliterate(userName, language);
      
      let confirmMessage = `${t('delete_user_confirm_title') || 'Вы уверены, что хотите удалить пользователя'} ${safeName}?`;
      
      // Для родителей - предупреждение о связанном удалении
      if (userRole === 'parent') {
        const linkedStudents = students.filter(s => s.guardian_ids?.includes(user.id));
        if (linkedStudents.length > 0) {
          const studentNames = linkedStudents.map(s => {
            const sName = s.first_name ? String(s.first_name) : '';
            const sLast = s.last_name ? String(s.last_name) : '';
            return getLocalizedName(sName, sLast, language);
          }).join(', ');
          confirmMessage += `

⚠️ ${t('delete_parent_warning') || 'Внимание!'}
`;
          confirmMessage += `${t('delete_parent_students') || 'Связанные ученики'}: ${studentNames}
`;
          confirmMessage += `${t('delete_parent_archive_warning') || 'Ученики будут перемещены в архив.'}`;
        }
      }
      
      // Для тренеров - предупреждение о группах
      if (userRole === 'coach') {
        const assignedGroups = groups.filter(g => g.coach_id === user.id);
        if (assignedGroups.length > 0) {
          const groupNames = assignedGroups.map(g => transliterate(g.name || '', language)).join(', ');
          confirmMessage += `

⚠️ ${t('delete_coach_warning') || 'Внимание!'}: ${groupNames}
`;
          confirmMessage += `${t('delete_coach_groups_warning') || 'Группы останутся без тренера.'}`;
        }
      }
      
      setItemToDelete({ type: 'user', data: user });
      setDeleteConfirmationText(confirmMessage);
      setShowDeleteModal(true);
    } catch (err) {
      console.error('CRITICAL ERROR in handleDelete:', err);
      setItemToDelete({ type: 'user', data: user });
      setDeleteConfirmationText(`${t('delete_user_confirm_title') || 'Удалить пользователя'}?`);
      setShowDeleteModal(true);
    }
  };

  const confirmDeleteAction = async () => {
    if (!itemToDelete) return;
    
    const { type, data } = itemToDelete;
    setShowDeleteModal(false); // Close modal immediately
    
    if (type === 'user') {
      setDeleting(data.id);
      setDeleteError('');
      
      try {
        const response = await usersAPI.delete(data.id);
        await fetchData();
        setSuccessMessage(response.data?.message || `${t('user_deleted_success') || 'Пользователь удалён'} ${data.full_name}`);
        setTimeout(() => setSuccessMessage(''), 4000);
      } catch (error) {
        console.error('Error deleting user:', error);
        const errorMsg = error.response?.data?.detail || error.message || 'Неизвестная ошибка';
        setDeleteError(`${t('delete_user_error') || 'Ошибка удаления'} ${data.full_name}: ${errorMsg}`);
        setTimeout(() => setDeleteError(''), 5000);
      } finally {
        setDeleting(null);
        setItemToDelete(null);
      }
    } else if (type === 'student') {
      // Logic for deleting student
      try {
        await studentsAPI.delete(data.id);
        setSuccessMessage(t('student_deleted_success') || 'Ученик удалён');
        setTimeout(() => setSuccessMessage(''), 3000);
        await fetchData();
      } catch (error) {
         console.error('Error deleting student:', error);
         setDeleteError(t('delete_student_error') || 'Ошибка удаления ученика');
         setTimeout(() => setDeleteError(''), 5000);
      } finally {
        setItemToDelete(null);
      }
    }
  };

  // 🔐 Показать/скрыть пароль пользователя
  const handleShowPassword = async (userId) => {
    // Если уже показан - скрыть
    if (showingPassword[userId]) {
      setShowingPassword(prev => {
        const updated = { ...prev };
        delete updated[userId];
        return updated;
      });
      return;
    }
    
    // Загружаем пароль с сервера
    setLoadingPassword(userId);
    try {
      const response = await usersAPI.getUserPassword(userId);
      setShowingPassword(prev => ({
        ...prev,
        [userId]: response.data.password || t('password_not_saved')
      }));
    } catch (error) {
      console.error('Error fetching password:', error);
      setDeleteError(`${t('password_load_error')}: ${error.response?.data?.detail || error.message}`);
      setTimeout(() => setDeleteError(''), 5000);
    } finally {
      setLoadingPassword(null);
    }
  };

  const toggleGroupAssignment = (groupId) => {
    setFormData(prev => ({
      ...prev,
      assigned_group_ids: prev.assigned_group_ids.includes(groupId)
      ? prev.assigned_group_ids.filter(id => id !== groupId)
      : [...prev.assigned_group_ids, groupId]
    }));
  };
  
  // Handle avatar file selection
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setAvatarPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };

  // Filter users by tab and search (using debounced search)
  const filteredUsers = useMemo(() => {
    let result = users.filter(u => {
      const matchesTab = u.role?.toLowerCase() === activeTab;
      if (!matchesTab) return false;
      
      // Filter by group
      if (selectedGroupFilter) {
        const groupId = parseInt(selectedGroupFilter);
        
        if (activeTab === 'parent') {
           // Check if parent has any child in this group
           const hasChildInGroup = students.some(s => 
             s.group_id === groupId && s.guardian_ids?.includes(u.id)
           );
           if (!hasChildInGroup) return false;
        } else if (activeTab === 'coach') {
           // Check if coach is assigned to this group
           const isCoachOfGroup = groups.some(g => 
             g.id === groupId && g.coach_id === u.id
           );
           if (!isCoachOfGroup) return false;
        } else {
           // For other roles, group filter hides them
           return false; 
        }
      }

      // Apply search filter with debounce
      if (debouncedSearch.trim()) {
        const query = debouncedSearch.toLowerCase();
        return u.full_name?.toLowerCase().includes(query) ||
               transliterate(u.full_name, language)?.toLowerCase().includes(query) ||
               u.phone?.includes(query) ||
               u.phone_secondary?.includes(query);
      }
      return true;
    });

    // Sort alphabetically by Full Name
    return result.sort((a, b) => (transliterate(a.full_name, language) || '').localeCompare(transliterate(b.full_name, language) || ''));
  }, [users, activeTab, debouncedSearch, language, selectedGroupFilter, students, groups]);
  
  // Get counts
  const counts = {
    parent: users.filter(u => u.role?.toLowerCase() === 'parent').length,
    coach: users.filter(u => u.role?.toLowerCase() === 'coach').length,
    admin: users.filter(u => u.role?.toLowerCase() === 'admin').length,
    archived: archivedUsers.length,
  };

  // Export Function
  const handleExport = (type = 'excel') => {
    const dataToExport = filteredUsers.map(u => {
      const userRole = u.role?.toLowerCase();
      let additionalInfo = '';
      
      if (userRole === 'parent') {
        const kids = students.filter(s => s.guardian_ids?.includes(u.id));
        additionalInfo = kids.map(k => getLocalizedName(k.first_name, k.last_name, language)).join(', ');
      } else if (userRole === 'coach') {
        const grps = groups.filter(g => g.coach_id === u.id);
        additionalInfo = grps.map(g => transliterate(g.name, language)).join(', ');
      }

      return {
        full_name: transliterate(u.full_name, language),
        phone: u.phone,
        role: t(`role_${userRole}`) || userRole,
        additional_info: additionalInfo,
        last_active: u.last_active ? new Date(u.last_active).toLocaleDateString() : '-'
      };
    });

    const columns = {
      full_name: t('full_name') || 'Full Name',
      phone: t('phone') || 'Phone',
      role: t('role') || 'Role',
      additional_info: t('additional_info') || 'Details (Kids/Groups)',
      last_active: t('last_active') || 'Last Active'
    };

    const filename = `Users_${activeTab}_${getDateString()}`;

    if (type === 'excel') {
      exportToExcel(dataToExport, columns, filename);
    } else {
      exportToPDF(dataToExport, columns, filename, t('users_list') || 'Users List');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0F1117]">
        <div className="text-yellow-500 text-lg">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-4 md:p-6 text-white overflow-x-hidden">
      {/* Background mesh gradient */}
      <div className="fixed inset-0 pointer-events-none bg-gradient-mesh opacity-50" />
      
      <div className="w-full mx-auto relative z-10 max-w-full">
        
        {/* Hidden printable section - REMOVED (Replaced with jspdf-autotable) */}

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold text-white flex items-center gap-4">
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">{t('users_management_title')}</span>
              <span className="text-xs bg-gradient-to-r from-yellow-500/20 to-amber-500/20 px-3 py-1 rounded-full text-yellow-400 border border-yellow-500/30">v2.8</span>
            </h1>
            <p className="text-gray-500 mt-2 text-lg">{t('users_management_subtitle')}</p>
          </div>
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

        {/* Delete Error Message */}
        {deleteError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 mb-6 backdrop-blur-sm animate-fade-up">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <span className="text-2xl">❌</span>
              </div>
              <span className="text-red-400 font-semibold text-lg">{deleteError}</span>
            </div>
          </div>
        )}

        {/* Tabs - Mobile Vertical, Desktop Row */}
        <div className="flex flex-col md:flex-row md:flex-wrap gap-3 mb-8">
          <button
            onClick={() => setActiveTab('parent')}
            className={`px-6 py-3.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-between md:justify-start gap-3 w-full md:w-auto ${
              activeTab === 'parent'
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">👨‍👩‍👧</span> {t('tab_parents')} 
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${activeTab === 'parent' ? 'bg-white/20' : 'bg-white/5'}`}>{counts.parent}</span>
          </button>
          <button
            onClick={() => setActiveTab('coach')}
            className={`px-6 py-3.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-between md:justify-start gap-3 w-full md:w-auto ${
              activeTab === 'coach'
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">⚽</span> {t('tab_coaches')} 
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${activeTab === 'coach' ? 'bg-white/20' : 'bg-white/5'}`}>{counts.coach}</span>
          </button>
          
          {/* Link to Coach Analytics (Ranking) */}
          {activeTab === 'coach' && (
            <button
              onClick={() => navigate('/analytics', { state: { activeTab: 'coaches' } })}
              className="px-6 py-3.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-start gap-3 bg-white/5 text-yellow-500 hover:bg-white/10 border border-yellow-500/30 w-full md:w-auto"
              title={t('view_coach_ranking') || "Посмотреть рейтинг тренеров"}
            >
              <span className="text-xl">📊</span> {t('coach_ranking') || 'Рейтинг'}
            </button>
          )
          }
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-6 py-3.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-between md:justify-start gap-3 w-full md:w-auto ${
              activeTab === 'admin'
                ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-500/25'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">🛡️</span> {t('tab_admins')} 
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${activeTab === 'admin' ? 'bg-white/20' : 'bg-white/5'}`}>{counts.admin}</span>
          </button>

          {/* Students without parents tab */}
           <button
            onClick={() => setActiveTab('students_no_parents')}
            className={`px-6 py-3.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-between md:justify-start gap-3 w-full md:w-auto ${
              activeTab === 'students_no_parents'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-lg shadow-amber-500/25'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span> {t('tab_students_no_parents')} 
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${activeTab === 'students_no_parents' ? 'bg-white/20' : 'bg-white/5'}`}>{counts.students_no_parents}</span>
          </button>
          
          {/* 📦 Archive Tab */}
          <button
            onClick={() => setShowArchive(!showArchive)}
            className={`px-6 py-3.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-between md:justify-start gap-3 w-full md:w-auto ${
              showArchive
                ? 'bg-gradient-to-r from-gray-600 to-gray-500 text-white shadow-lg shadow-gray-500/25'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">📦</span> {t('tab_archive')} 
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-sm font-bold ${showArchive ? 'bg-white/20' : 'bg-white/5'}`}>{counts.archived}</span>
          </button>
          
          {/* 🔐 Passwords Tab (only for admin/super_admin) */}
          {canSeePasswords && (
            <button
              onClick={() => {
                setShowPasswordsTab(!showPasswordsTab);
                if (!showPasswordsTab && credentials.length === 0) {
                  fetchCredentials();
                }
              }}
              className={`px-6 py-3.5 rounded-xl font-medium transition-all duration-200 flex items-center justify-start gap-3 w-full md:w-auto ${
                showPasswordsTab
                  ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/25'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
              }`}
            >
              <span className="text-xl">🔐</span> {t('passwords') || 'Все пароли'}
            </button>
          )}
          
          <div className="hidden md:block flex-1" />
          
          {/* Export Buttons */}
          <div className="flex gap-2 w-full md:w-auto">
            <button
              onClick={() => handleExport('excel')}
              className="flex-1 md:flex-none bg-white/5 hover:bg-white/10 text-green-400 border border-white/10 px-4 py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              title={t('export_excel') || 'Export Excel'}
            >
              <FileText size={20} /> <span className="md:hidden">Excel</span>
            </button>
            <button
              onClick={() => handleExport('pdf')}
              className="flex-1 md:flex-none bg-white/5 hover:bg-white/10 text-red-400 border border-white/10 px-4 py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
              title={t('export_pdf') || 'Export PDF'}
            >
              <FileText size={20} /> <span className="md:hidden">PDF</span>
            </button>
          </div>

          {activeTab !== 'students_no_parents' && (
            <button
                onClick={() => openAddModal(activeTab)}
                className="w-full md:w-auto bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black px-7 py-3.5 rounded-xl font-semibold shadow-lg shadow-yellow-500/25 transition-all duration-200 flex items-center justify-center gap-3 hover:scale-105 flex-shrink-0"
            >
                <span className="text-xl">+</span> {t('add_user')}
            </button>
          )}
        </div>

        {/* Search & Filter Bar */}
        <div className="mb-8 flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Поиск по имени, телефону..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-5 py-4 pl-14 bg-white/5 text-white rounded-2xl border border-white/10 focus:border-yellow-500/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 transition-all duration-200 text-lg placeholder-gray-500"
              style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.03)' }}
            />
            <span className="absolute left-5 top-4.5 text-gray-500 text-xl">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-5 top-4 text-gray-500 hover:text-white w-8 h-8 rounded-lg hover:bg-white/10 transition flex items-center justify-center"
              >
                ✕
              </button>
            )}
          </div>

          {/* Group Filter */}
          <div className="w-full md:w-64">
            <select
              value={selectedGroupFilter}
              onChange={(e) => setSelectedGroupFilter(e.target.value)}
              className="w-full h-full px-5 py-4 bg-white/5 text-white rounded-2xl border border-white/10 focus:border-yellow-500/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/20 transition-all duration-200 text-lg cursor-pointer appearance-none"
              style={{ color: 'white', backgroundColor: '#1C2127' }}
            >
              <option value="">{t('all_groups') || 'Все группы'}</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Mass Actions Bar */}
        {selectedUsers.length > 0 && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-3">
              <span className="text-yellow-400 font-bold text-lg">{selectedUsers.length}</span>
              <span className="text-gray-300">{t('users_selected', 'пользователей выбрано')}</span>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedUsers([])}
                className="px-4 py-2 text-gray-400 hover:text-white transition"
              >
                {t('cancel', 'Отмена')}
              </button>
              <button
                onClick={handleMassDelete}
                className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition shadow-lg shadow-red-500/20 flex items-center gap-2"
              >
                🗑️ {t('delete_selected', 'Удалить выбранные')}
              </button>
            </div>
          </div>
        )}

        {/* Search Results Count & Select All */}
        {(searchQuery || selectedGroupFilter || activeTab !== 'students_no_parents') && (
          <div className="mb-6 flex items-center justify-between">
             <div className="text-sm text-gray-500">
               Найдено: <span className="text-yellow-400 font-semibold">{filteredUsers.length}</span> пользователей
             </div>
             
             {filteredUsers.length > 0 && (
               <button 
                 onClick={() => handleSelectAll(filteredUsers)}
                 className="text-sm text-yellow-500 hover:text-yellow-400 font-medium transition"
               >
                 {selectedUsers.length === filteredUsers.length && filteredUsers.length > 0 ? 'Снять выделение' : 'Выбрать всех'}
               </button>
             )}
          </div>
        )}

        {/* 📦 Archive Section */}
        {showArchive && (
          <div className="mb-8 bg-gray-900/50 rounded-2xl border border-gray-700 p-6">
            <h3 className="text-xl font-bold text-gray-300 mb-4 flex items-center gap-2">
              📦 Архив удалённых пользователей ({archivedUsers.length})
            </h3>
            {archivedUsers.length === 0 ? (
              <div className="text-gray-500 text-center py-8">Архив пуст</div>
            ) : (
              <div className="grid gap-3">
                {archivedUsers
                  .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                  .map((user) => {
                  const roleEmoji = user.role === 'parent' ? '👨‍👩‍👧' : user.role === 'coach' ? '⚽' : '🛡️';
                  const roleLabel = user.role === 'parent' ? 'Родитель' : user.role === 'coach' ? 'Тренер' : 'Админ';
                  return (
                    <div key={user.id} className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 bg-gray-800/50 rounded-xl border border-gray-700 gap-4">
                      <div className="flex items-center gap-3 w-full md:w-auto overflow-hidden">
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-lg opacity-60 shrink-0">
                          {roleEmoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-gray-300 font-medium truncate">{user.full_name}</div>
                          <div className="text-sm text-gray-500 flex items-center gap-3 flex-wrap">
                            <span className="truncate">{user.phone}</span>
                            <span className="px-2 py-0.5 bg-gray-700 rounded text-xs whitespace-nowrap">{roleLabel}</span>
                            {user.deleted_at && (
                              <span className="text-red-400 text-xs whitespace-nowrap">Удалён: {new Date(user.deleted_at).toLocaleDateString('ru-RU')}</span>
                            )}
                          </div>
                          {user.deletion_reason && (
                            <div className="text-xs text-gray-600 mt-1 truncate">Причина: {user.deletion_reason}</div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRestore(user)}
                        disabled={restoring === user.id}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition flex items-center gap-2 disabled:opacity-50 whitespace-nowrap w-full md:w-auto justify-center shrink-0"
                      >
                        {restoring === user.id ? (
                          <><span className="animate-spin">⏳</span> Восстановление...</>
                        ) : (
                          <>♻️ Восстановить</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 🔐 Passwords Section */}
        {showPasswordsTab && (
          <div className="mb-8 bg-purple-900/20 rounded-2xl border border-purple-700/50 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-purple-300 flex items-center gap-2">
                🔐 Все учётные данные ({credentials.length})
              </h3>
              <button
                onClick={fetchCredentials}
                disabled={loadingCredentials}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition flex items-center gap-2 disabled:opacity-50"
              >
                {loadingCredentials ? '⏳ Загрузка...' : '🔄 Обновить'}
              </button>
            </div>
            
            {/* Search */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="🔍 Поиск по имени или телефону..."
                value={passwordSearch}
                onChange={(e) => setPasswordSearch(e.target.value)}
                className="w-full px-4 py-3 bg-purple-950/50 text-white rounded-xl border border-purple-700/50 focus:border-purple-500 focus:outline-none"
                style={{ color: 'white' }}
              />
            </div>
            
            {loadingCredentials ? (
              <div className="text-purple-400 text-center py-8">⏳ Загрузка паролей...</div>
            ) : credentials.length === 0 ? (
              <div className="text-purple-400 text-center py-8">Нет сохранённых паролей</div>
            ) : (
              <div className="overflow-x-auto">
                {/* Desktop Table */}
                <table className="hidden md:table w-full">
                  <thead>
                    <tr className="text-left text-purple-400 text-sm border-b border-purple-700/50">
                      <th className="pb-3 px-2">Пользователь</th>
                      <th className="pb-3 px-2">Роль</th>
                      <th className="pb-3 px-2">Логин</th>
                      <th className="pb-3 px-2">Пароль</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credentials
                      .filter(c => {
                        if (!passwordSearch) return true;
                        const search = passwordSearch.toLowerCase();
                        return c.full_name?.toLowerCase().includes(search) || 
                               c.login?.toLowerCase().includes(search);
                      })
                      .map((cred) => {
                        const roleColors = {
                          super_admin: 'bg-purple-500/20 text-purple-400',
                          admin: 'bg-rose-500/20 text-rose-400',
                          coach: 'bg-blue-500/20 text-blue-400',
                          parent: 'bg-emerald-500/20 text-emerald-400'
                        };
                        const roleEmoji = {
                          super_admin: '👨‍💼',
                          admin: '🛡️',
                          coach: '⚽',
                          parent: '👨‍👩‍👧'
                        };
                        return (
                          <tr key={cred.id} className="border-b border-purple-800/30 hover:bg-purple-900/30">
                            <td className="py-3 px-2">
                              <span className="text-white font-medium">{cred.full_name}</span>
                            </td>
                            <td className="py-3 px-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${roleColors[cred.role] || 'bg-gray-500/20 text-gray-400'}`}>
                                {roleEmoji[cred.role] || '👤'} {cred.role_display || cred.role}
                              </span>
                            </td>
                            <td className="py-3 px-2">
                              <span className="text-gray-300 font-mono text-sm">{cred.login}</span>
                            </td>
                            <td className="py-3 px-2">
                              <span className="text-yellow-400 font-mono text-sm bg-yellow-500/10 px-2 py-1 rounded">
                                {cred.password || '—'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>

                {/* Mobile Cards for Credentials */}
                <div className="md:hidden space-y-3">
                  {credentials
                    .filter(c => {
                      if (!passwordSearch) return true;
                      const search = passwordSearch.toLowerCase();
                      return c.full_name?.toLowerCase().includes(search) || 
                             c.login?.toLowerCase().includes(search);
                    })
                    .map((cred) => {
                      const roleColors = {
                        super_admin: 'bg-purple-500/20 text-purple-400',
                        admin: 'bg-rose-500/20 text-rose-400',
                        coach: 'bg-blue-500/20 text-blue-400',
                        parent: 'bg-emerald-500/20 text-emerald-400'
                      };
                      const roleEmoji = {
                        super_admin: '👨‍💼',
                        admin: '🛡️',
                        coach: '⚽',
                        parent: '👨‍👩‍👧'
                      };
                      return (
                        <div key={cred.id} className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-4">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-white font-medium">{cred.full_name}</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${roleColors[cred.role] || 'bg-gray-500/20 text-gray-400'}`}>
                              {roleEmoji[cred.role] || '👤'} {cred.role_display || cred.role}
                            </span>
                          </div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Логин:</span>
                              <span className="text-gray-300 font-mono">{cred.login}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Пароль:</span>
                              <span className="text-yellow-400 font-mono bg-yellow-500/10 px-2 rounded">
                                {cred.password || '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Users List or Students Without Parents List */}
        <>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-24 bg-white/5 rounded-3xl border border-white/10 backdrop-blur-sm">
                <div className="text-7xl mb-6">{activeTab === 'parent' ? '👨‍👩‍👧' : activeTab === 'coach' ? '⚽' : '🛡️'}</div>
                <div className="text-gray-400 text-xl mb-6">Нет {activeTab === 'parent' ? 'родителей' : activeTab === 'coach' ? 'тренеров' : 'администраторов'}</div>
                <button
                  onClick={() => openAddModal(activeTab)}
                  className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black px-8 py-3 rounded-xl font-semibold shadow-lg shadow-yellow-500/25 transition-all duration-200 hover:scale-105"
                >
                  + {t('add_user')}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                {filteredUsers.map((user, index) => {
                  const userRole = user.role?.toLowerCase();
                  const linkedStudents = userRole === 'parent'
                    ? students.filter(s => s.guardian_ids?.includes(user.id))
                    : [];
                  const assignedGroups = userRole === 'coach'
                    ? groups.filter(g => g.coach_id === user.id)
                    : [];
                  
                  // Removed unused roleColors
                  
                  return (
                    <div
                      key={user.id}
                      className="group relative bg-white/5 rounded-2xl border border-white/10 p-4 pr-12 md:p-6 md:pr-16 hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300 animate-fade-up w-full overflow-hidden"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      {/* Selection Checkbox */}
                      <div className="absolute top-4 right-4 z-10">
                        <input
                          type="checkbox"
                          checked={selectedUsers.includes(user.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectUser(user.id);
                          }}
                          className="w-5 h-5 rounded border-gray-600 bg-[#2D323B] text-yellow-500 focus:ring-yellow-500/30 focus:ring-2 cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1 w-full md:w-auto min-w-0">
                          {/* Avatar */}
                          <div className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center text-white text-xl md:text-2xl overflow-hidden shrink-0 ${
                            userRole === 'parent' ? 'bg-green-600' : userRole === 'coach' ? 'bg-blue-600' : 'bg-red-600'
                          }`}>
                            {user.avatar_url ? (
                              <img src={`http://localhost:8000${user.avatar_url}`} alt="" className="w-full h-full object-cover" />
                            ) : (
                              userRole === 'parent' ? '👨‍👩‍👧' : userRole === 'coach' ? '⚽' : '🔧'
                            )}
                          </div>
                          
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="text-white font-bold text-lg md:text-xl truncate pr-8 leading-tight">{user.full_name}</div>
                            <div className="flex flex-wrap gap-2 md:gap-3 mt-1 text-sm">
                              <a 
                                href={`tel:${user.phone}`} 
                                className="text-gray-400 hover:text-green-400 transition-colors flex items-center gap-1 truncate"
                                title={t('call') || 'Позвонить'}
                              >
                                <Phone size={14} className="flex-shrink-0" />
                                {user.phone}
                              </a>
                              {user.phone_secondary && (
                                <a 
                                  href={`tel:${user.phone_secondary}`} 
                                  className="text-gray-500 hover:text-green-400 transition-colors flex items-center gap-1 truncate"
                                  title={t('call') || 'Позвонить'}
                                >
                                  <Phone size={14} className="flex-shrink-0" />
                                  {user.phone_secondary}
                                </a>
                              )}
                            </div>
                            
                            {/* Parent: Linked students */}
                            {userRole === 'parent' && (
                              <div className="mt-3">
                                {linkedStudents.length === 0 ? (
                                  <div className="text-orange-400 text-sm flex items-center gap-1">
                                    ⚠️ {t('no_linked_students')}
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">👦 {t('linked_students')} ({linkedStudents.length}):</div>
                                    <div className="flex flex-wrap gap-2">
                                      {linkedStudents.map(s => {
                                        const studentGroup = groups.find(g => g.id === s.group_id);
                                        return (
                                          <div key={s.id} className="px-3 py-1 bg-blue-900 bg-opacity-40 border border-blue-600 rounded-lg text-sm truncate max-w-[150px]">
                                            <span className="text-blue-200">{s.first_name} {s.last_name}</span>
                                            {studentGroup && (
                                              <span className="text-blue-400 ml-2 text-xs">({studentGroup.name})</span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Coach: Assigned groups */}
                            {userRole === 'coach' && (
                              <div className="mt-3">
                                {assignedGroups.length === 0 ? (
                                  <div className="text-orange-400 text-sm flex items-center gap-1">
                                    ⚠️ Нет назначенных групп
                                  </div>
                                ) : (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">📚 {t('assigned_groups')} ({assignedGroups.length}):</div>
                                    <div className="flex flex-wrap gap-2">
                                      {assignedGroups.map(g => {
                                        const studentsInGroup = students.filter(s => s.group_id === g.id).length;
                                        return (
                                          <div key={g.id} className="px-3 py-1 bg-green-900 bg-opacity-40 border border-green-600 rounded-lg text-sm">
                                            <span className="text-green-200">{g.name}</span>
                                            <span className="text-green-400 ml-2 text-xs">({studentsInGroup} уч.)</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* 🔐 Показанный пароль */}
                            {showingPassword[user.id] && (
                              <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-xl">
                                <div className="text-xs text-yellow-400 mb-1">🔐 Логин и пароль:</div>
                                <div className="font-mono text-yellow-200 text-sm">
                                  <span className="text-gray-400">Логин:</span> {user.phone}<br/>
                                  <span className="text-gray-400">Пароль:</span> {showingPassword[user.id]}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Actions */}
                        <div className="flex items-center gap-2 self-end md:self-start mt-4 md:mt-0">
                          {/* 🔐 Кнопка показа пароля */}
                          {userRole !== 'super_admin' && (
                            <button
                              onClick={() => handleShowPassword(user.id)}
                              disabled={loadingPassword === user.id}
                              className={`p-2 rounded-lg transition ${
                                showingPassword[user.id] 
                                  ? 'text-yellow-400 bg-yellow-900/30' 
                                  : 'text-gray-400 hover:text-yellow-500 hover:bg-yellow-900/20'
                              } ${loadingPassword === user.id ? 'opacity-50' : ''}`}
                              title={showingPassword[user.id] ? t('password_hidden') : t('password_shown')}
                            >
                              {loadingPassword === user.id ? (
                                <span className="animate-spin">⏳</span>
                              ) : showingPassword[user.id] ? (
                                '🔒'
                              ) : (
                                '🔐'
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-2 text-yellow-500 hover:bg-yellow-900 hover:bg-opacity-20 rounded-lg transition"
                            title="Редактировать"
                          >
                            ✏️
                          </button>
                          {userRole !== 'super_admin' && (
                            <button
                              onClick={() => handleDelete(user)}
                              disabled={deleting === user.id}
                              className={`p-2 text-red-500 hover:bg-red-900 hover:bg-opacity-20 rounded-lg transition ${deleting === user.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                              title="Удалить"
                            >
                              {deleting === user.id ? <span className="animate-spin">⏳</span> : '🗑️'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
            <div className="bg-[#1C1E24] rounded-3xl shadow-2xl w-full max-w-2xl border border-white/10 animate-scale-in flex flex-col max-h-[90dvh] overflow-hidden" onClick={e => e.stopPropagation()}>
              {/* Modal Body (Scrollable Container) */}
              <div className="overflow-y-auto custom-scrollbar flex-1 min-h-0 bg-[#1C1E24] rounded-3xl">
                {/* Header (Scrollable) */}
                <div className="p-5 md:p-7 border-b border-white/10 pt-16 md:pt-7">
                  <h2 className="text-xl md:text-2xl font-bold text-white flex flex-wrap items-center gap-3 leading-tight">
                    <span className="text-2xl">{editingUser ? '✏️' : '➕'}</span>
                    <span className="flex-1 min-w-0 break-words">
                      {editingUser ? 'Редактировать' : 'Добавить'} {
                        formData.role === 'parent' ? '👨‍👩‍👧 родителя' :
                        formData.role === 'coach' ? '⚽ тренера' : '🛡️ администратора'
                      }
                    </span>
                  </h2>
                </div>

                {/* Content */}
                <div className="p-3 md:p-6 pb-4">
                  {error && (
                    <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-4">
                      {error}
                    </div>
                  )}

                  <form id="userForm" onSubmit={handleSubmit} className="space-y-5">
                  {/* Avatar Upload Section */}
                  <div className="flex flex-col items-center mb-4">
                    <div className="relative">
                      <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold overflow-hidden ${
                        formData.role === 'parent' ? 'bg-emerald-500' : 
                        formData.role === 'coach' ? 'bg-blue-500' : 'bg-rose-500'
                      }`}>
                        {avatarPreview ? (
                          <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                        ) : (
                          formData.full_name?.[0]?.toUpperCase() || '👤'
                        )}
                      </div>
                      <label className="absolute bottom-0 right-0 w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-yellow-400 transition shadow-lg">
                        <span className="text-black text-sm">📷</span>
                        <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                      </label>
                    </div>
                    {avatarFile && (
                      <p className="text-xs text-green-400 mt-2">✓ Новое фото выбрано</p>
                    )}
                  </div>
                  
                  {/* Basic Info Section */}
                  <div className="bg-[#2D323B] rounded-xl p-4 space-y-4">
                    <div className="text-yellow-500 font-bold text-sm uppercase tracking-wider mb-2">Основная информация</div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">ФИО *</label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                        className="w-full px-4 py-3 bg-[#2D323B] text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                        style={{ color: 'white', backgroundColor: '#2D323B' }}
                        placeholder="Введите полное имя"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                          📱 Основной телефон * {formData.role === 'parent' && <span className="text-blue-400">(для входа)</span>}
                        </label>
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({...formData, phone: e.target.value})}
                          className="w-full px-4 py-3 bg-[#2D323B] text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                          style={{ color: 'white', backgroundColor: '#2D323B' }}
                          placeholder="+373XXXXXXXX"
                        />
                      </div>
                      
                      {formData.role === 'parent' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-400 mb-1">
                            📱 Второй телефон <span className="text-gray-500">(опционально)</span>
                          </label>
                          <input
                            type="tel"
                            value={formData.phone_secondary}
                            onChange={(e) => setFormData({...formData, phone_secondary: e.target.value})}
                            className="w-full px-4 py-3 bg-[#2D323B] text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                            style={{ color: 'white', backgroundColor: '#2D323B' }}
                            placeholder="+373XXXXXXXX (мама/папа)"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-1">
                        🔐 Пароль {editingUser ? '(оставьте пустым если не меняете)' : '*'}
                      </label>
                      <PasswordInput
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        placeholder={editingUser ? 'Новый пароль (если меняете)' : 'Введите пароль'}
                        className="w-full px-4 py-3 bg-[#2D323B] text-white border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      />
                    </div>
                  </div>

                  {/* Parent: Create New Child OR Link Existing */}
                  {formData.role === 'parent' && (
                    <div className="bg-[#2D323B] rounded-xl p-4 space-y-4">
                      <div className="text-blue-500 font-bold text-sm uppercase tracking-wider mb-2">👶 Данные ребенка * (обязательно)</div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Имя ребенка</label>
                          <input
                            type="text"
                            value={formData.child_first_name}
                            onChange={(e) => setFormData({...formData, child_first_name: e.target.value})}
                            className="w-full px-3 py-2 bg-[#2D323B] text-white border border-gray-600 rounded-lg text-sm"
                            style={{ color: 'white', backgroundColor: '#2D323B' }}
                            placeholder="Имя"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Фамилия ребенка</label>
                          <input
                            type="text"
                            value={formData.child_last_name}
                            onChange={(e) => setFormData({...formData, child_last_name: e.target.value})}
                            className="w-full px-3 py-2 bg-[#2D323B] text-white border border-gray-600 rounded-lg text-sm"
                            style={{ color: 'white', backgroundColor: '#2D323B' }}
                            placeholder="Фамилия"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Дата рождения</label>
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
                            className="w-full px-3 py-2 bg-[#2D323B] text-white border border-gray-600 rounded-lg text-sm"
                            maxDate={new Date()}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1">Группа</label>
                          <select
                            value={formData.group_id}
                            onChange={(e) => setFormData({...formData, group_id: e.target.value})}
                            className="w-full px-3 py-2 bg-[#2D323B] text-white border border-gray-600 rounded-lg text-sm"
                            style={{ color: 'white', backgroundColor: '#2D323B' }}
                          >
                            <option value="" style={{ backgroundColor: '#2D323B' }}>Выберите группу</option>
                            {groups.map(g => (
                              <option key={g.id} value={g.id} style={{ backgroundColor: '#2D323B' }}>{g.name} ({g.age_group})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Medical Info for Child (Diseases) */}
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Хронические болезни и аллергии (обязательно если есть)
                        </label>
                        <textarea
                          value={formData.child_medical_info}
                          onChange={(e) => setFormData({...formData, child_medical_info: e.target.value})}
                          className="w-full px-3 py-2 bg-[#2D323B] text-white border border-gray-600 rounded-lg text-sm h-20 resize-none focus:outline-none focus:border-yellow-500"
                          style={{ color: 'white', backgroundColor: '#2D323B' }}
                          placeholder="Например: Астма, Аллергия на орехи, Диабет..."
                        />
                      </div>

                      {/* Medical Notes for Child */}
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Дополнительные медицинские заметки
                        </label>
                        <textarea
                          value={formData.child_medical_notes}
                          onChange={(e) => setFormData({...formData, child_medical_notes: e.target.value})}
                          className="w-full px-3 py-2 bg-[#2D323B] text-white border border-gray-600 rounded-lg text-sm h-20 resize-none focus:outline-none focus:border-yellow-500"
                          style={{ color: 'white', backgroundColor: '#2D323B' }}
                          placeholder="Например: Аллергия на пыльцу, астма легкой степени..."
                        />
                      </div>

                      <div className="text-xs text-yellow-500">
                        ⚠️ Все поля обязательны для создания родителя!
                      </div>
                    </div>
                  )}

                  

                  {/* Coach: Assign Groups */}
                  {formData.role === 'coach' && (
                    <div className="bg-[#2D323B] rounded-xl p-4">
                      <div className="text-blue-500 font-bold text-sm uppercase tracking-wider mb-3">📚 Назначить группы</div>
                      
                      {groups.length === 0 ? (
                        <div className="text-gray-500 text-center py-4">
                          Нет групп в системе. Сначала создайте группы.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {groups.map(group => {
                            const isAssigned = formData.assigned_group_ids.includes(group.id);
                            const studentsCount = students.filter(s => s.group_id === group.id).length;
                            const currentCoach = users.find(u => u.id === group.coach_id && u.id !== editingUser?.id);
                            
                            return (
                              <div
                                key={group.id}
                                onClick={() => toggleGroupAssignment(group.id)}
                                className={`p-3 rounded-lg cursor-pointer transition border ${
                                  isAssigned
                                    ? 'bg-blue-900 bg-opacity-40 border-blue-600'
                                    : 'bg-[#1C2127] border-gray-700 hover:border-gray-600'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                    isAssigned ? 'bg-blue-500 border-blue-500' : 'border-gray-500'
                                  }`}>
                                    {isAssigned && <span className="text-white text-xs">✓</span>}
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-white text-sm font-medium">{group.name}</div>
                                    <div className="text-xs text-gray-500">
                                      {studentsCount} учеников
                                      {currentCoach && <span className="text-orange-400 ml-1">(сейчас: {currentCoach.full_name?.split(' ')[0]})</span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {formData.assigned_group_ids.length > 0 && (
                        <div className="mt-3 text-blue-400 text-sm">
                          ✓ Назначено групп: {formData.assigned_group_ids.length}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Admin Permissions - only super_admin can set, only for admins */}
                  {formData.role === 'admin' && ['super_admin', 'owner'].includes(currentUser?.role?.toLowerCase()) && (
                    <div className="bg-[#2D323B] rounded-xl p-4">
                      <div className="text-purple-400 font-bold text-sm uppercase tracking-wider mb-3">🔐 Разрешения администратора</div>
                      
                      <div className="space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition">
                          <input
                            type="checkbox"
                            checked={formData.can_view_history || false}
                            onChange={(e) => setFormData({ ...formData, can_view_history: e.target.checked })}
                            className="w-5 h-5 rounded border-gray-600 bg-[#2D323B] text-yellow-500 focus:ring-yellow-500/30 focus:ring-2"
                          />
                          <div>
                            <div className="text-white font-medium">🕐 Доступ к Истории</div>
                            <div className="text-gray-400 text-xs">Просмотр аудит-лога, корзины и восстановление данных</div>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition">
                          <input
                            type="checkbox"
                            checked={formData.can_view_analytics || false}
                            onChange={(e) => setFormData({ ...formData, can_view_analytics: e.target.checked })}
                            className="w-5 h-5 rounded border-gray-600 bg-[#2D323B] text-yellow-500 focus:ring-yellow-500/30 focus:ring-2"
                          />
                          <div>
                            <div className="text-white font-medium">📊 Доступ к Аналитике</div>
                            <div className="text-gray-400 text-xs">Просмотр финансовых отчетов и статистики</div>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition">
                          <input
                            type="checkbox"
                            checked={formData.can_view_crm || false}
                            onChange={(e) => setFormData({ ...formData, can_view_crm: e.target.checked })}
                            className="w-5 h-5 rounded border-gray-600 bg-[#2D323B] text-yellow-500 focus:ring-yellow-500/30 focus:ring-2"
                          />
                          <div>
                            <div className="text-white font-medium">🧩 Доступ к CRM</div>
                            <div className="text-gray-400 text-xs">Раздел Лиды и воронка продаж</div>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition">
                          <input
                            type="checkbox"
                            checked={formData.can_view_recruitment || false}
                            onChange={(e) => setFormData({ ...formData, can_view_recruitment: e.target.checked })}
                            className="w-5 h-5 rounded border-gray-600 bg-[#2D323B] text-yellow-500 focus:ring-yellow-500/30 focus:ring-2"
                          />
                          <div>
                            <div className="text-white font-medium">🧑‍💼 Доступ к Найму</div>
                            <div className="text-gray-400 text-xs">Кандидаты, HR-воронка и аналитика по найму</div>
                          </div>
                        </label>

                        <label className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded-lg transition">
                          <input
                            type="checkbox"
                            checked={formData.can_view_marketing || false}
                            onChange={(e) => setFormData({ ...formData, can_view_marketing: e.target.checked })}
                            className="w-5 h-5 rounded border-gray-600 bg-[#2D323B] text-yellow-500 focus:ring-yellow-500/30 focus:ring-2"
                          />
                          <div>
                            <div className="text-white font-medium">🎯 Доступ к Маркетингу</div>
                            <div className="text-gray-400 text-xs">Маркетинговая воронка и дашборд кампаний</div>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Info hint */}
                  <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 px-5 py-4 rounded-2xl text-sm backdrop-blur-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-lg mt-0.5">💡</span>
                      <div>
                        {formData.role === 'parent' && 'Основной телефон используется для входа в систему и связи с академией'}
                        {formData.role === 'coach' && 'Тренер будет видеть только свои группы и учеников'}
                        {formData.role === 'admin' && 'Администратор имеет доступ ко всем функциям. Дополнительные права (Аналитика, История) настраиваются выше.'}
                      </div>
                    </div>
                  </div>

                  {/* Buttons (Scrollable) */}
                  <div className="flex flex-col md:flex-row gap-3 pt-6 pb-24 md:pb-0">
                    <button
                      type="button"
                      onClick={() => { setShowModal(false); setError(''); }}
                      className="flex-1 px-5 py-3.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition-all duration-200 font-medium order-2 md:order-1"
                      disabled={saving}
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-5 py-3.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black rounded-xl font-bold shadow-lg shadow-yellow-500/25 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 order-1 md:order-2"
                      disabled={saving}
                    >
                      {saving ? (
                        <>
                          <span className="animate-spin text-lg">⏳</span>
                          {editingUser ? 'Сохранение...' : 'Создание...'}
                        </>
                      ) : (
                        <>
                          <span className="text-lg">{editingUser ? '💾' : '✅'}</span>
                          {editingUser ? 'Сохранить' : 'Создать'}
                        </>
                      )}
                    </button>
                  </div>
                </form>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 🗑️ Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-fade-in" onClick={() => setShowDeleteModal(false)}>
            <div className="bg-[#1C1E24] rounded-3xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto border border-white/10 animate-scale-in" onClick={e => e.stopPropagation()}>
              <div className="p-4 md:p-6 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">⚠️</span>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {t('confirm_delete') || 'Подтверждение удаления'}
                </h3>
                <div className="text-gray-300 whitespace-pre-wrap mb-8">
                  {deleteConfirmationText}
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition font-medium"
                  >
                    {t('cancel') || 'Отмена'}
                  </button>
                  <button
                    onClick={confirmDeleteAction}
                    className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg shadow-red-500/20 transition flex items-center justify-center gap-2"
                  >
                    🗑️ {t('delete') || 'Удалить'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
