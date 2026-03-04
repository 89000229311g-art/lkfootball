import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage, LANGUAGES } from '../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import { authAPI, studentsAPI, usersAPI, settingsAPI, uploadAPI as fileUploadAPI } from '../api/client';
import PasswordInput from '../components/PasswordInput';
import AvatarUpload from '../components/AvatarUpload';
import BirthdayTemplateModal from '../components/BirthdayTemplateModal';
import { Upload, X, Image as ImageIcon, Loader2, HelpCircle, Gift } from 'lucide-react';

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const { language, changeLanguage, t } = useLanguage();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(true);
  const [showBirthdayTemplates, setShowBirthdayTemplates] = useState(false);
  
  // Payment Settings (Admin only)
  const [paymentInfo, setPaymentInfo] = useState({
    payment_bank_details: '',
    payment_qr_url: '',
    payment_instructions: ''
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState('');
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrFileInputRef = useRef(null);
  const [invoiceFlowMode, setInvoiceFlowMode] = useState(localStorage.getItem('invoiceFlowMode') || 'auto');
  
  // Feature Settings
  const [features, setFeatures] = useState({
    block_attendance_without_medical_certificate: false
  });

  const isParent = user?.role?.toLowerCase() === 'parent';
  const isOwner = ['super_admin', 'owner'].includes(user?.role?.toLowerCase());
  const isAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());

  useEffect(() => {
    if (isAdmin) {
      loadPaymentSettings();
      loadFeatureSettings();
    }
  }, [isAdmin]);

  const loadFeatureSettings = async () => {
    try {
      const response = await settingsAPI.getAll(); // Fetch all to find our key
      const data = response.data || [];
      const feats = {};
      data.forEach(s => {
        if (s.key === 'features_block_no_medical_certificate') {
          feats.block_attendance_without_medical_certificate = s.value === 'true';
        }
      });
      setFeatures(prev => ({...prev, ...feats}));
    } catch (error) {
      console.error('Error loading features:', error);
    }
  };

  const handleToggleFeature = async (key, value) => {
    const stateKey = key === 'features_block_no_medical_certificate' ? 'block_attendance_without_medical_certificate' : key;
    setFeatures(prev => ({...prev, [stateKey]: value}));
    try {
      await settingsAPI.update(key, { value: value.toString(), description: 'Security Feature' });
    } catch (error) {
      console.error('Error saving feature:', error);
      setFeatures(prev => ({...prev, [stateKey]: !value}));
    }
  };

  const loadPaymentSettings = async () => {
    try {
      const response = await settingsAPI.getAll('payment');
      const data = response.data || [];
      const info = {
        payment_bank_details: '',
        payment_qr_url: '',
        payment_instructions: ''
      };
      data.forEach(s => {
        if (s.key in info) info[s.key] = s.value;
      });
      setPaymentInfo(info);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSavePaymentInfo = async (e) => {
    e.preventDefault();
    setPaymentSaving(true);
    setPaymentSuccess('');
    
    try {
      // Use allSettled to ensure partial success is handled, or at least we know what failed
      const results = await Promise.allSettled([
        settingsAPI.update('payment_bank_details', { value: paymentInfo.payment_bank_details, description: 'Bank Details' }),
        settingsAPI.update('payment_qr_url', { value: paymentInfo.payment_qr_url, description: 'QR Code URL' }),
        settingsAPI.update('payment_instructions', { value: paymentInfo.payment_instructions, description: 'Payment Instructions' })
      ]);
      
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.error('Some settings failed to save:', failed);
        // Still show success if some worked, but maybe warn? 
        // For simplicity, if any worked, we say updated.
      }
      
      setPaymentSuccess('✅ ' + (t('payment_info_saved') || 'Настройки оплаты сохранены!'));
      setTimeout(() => setPaymentSuccess(''), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Error saving settings');
    } finally {
      setPaymentSaving(false);
    }
  };

  const fillTestData = () => {
    setPaymentInfo({
      payment_bank_details: 'Bank: MAIB\nIBAN: MD24AG2200000000000000\nBIC: MDAG2200\nRecipient: Football Academy SRL',
      payment_instructions: '1. Отсканируйте QR-код или используйте IBAN\n2. Укажите Имя Фамилию ученика в комментариях\n3. Отправьте квитанцию администратору',
      payment_qr_url: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=ExamplePayment'
    });
  };

  const handleUploadQr = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingQr(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fileUploadAPI.uploadMedia(formData);
      // response is the data object from the API { url: "...", type: "..." }
      setPaymentInfo(prev => ({ ...prev, payment_qr_url: response.url }));
    } catch (error) {
      console.error('Error uploading QR code:', error);
      alert('Error uploading QR code');
    } finally {
      setUploadingQr(false);
      // Reset input
      if (qrFileInputRef.current) qrFileInputRef.current.value = '';
    }
  };

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showViewPasswordModal, setShowViewPasswordModal] = useState(false);
  const [myPassword, setMyPassword] = useState(null);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [children, setChildren] = useState([]);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  
  // Profile editing state
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({
    full_name: '',
    phone: '',
    phone_secondary: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  const handleLogout = () => {
    // Direct logout without annoying confirmation
    logout();
    navigate('/login');
  };

  // Open edit profile modal
  const openEditProfileModal = () => {
    setProfileForm({
      full_name: user?.full_name || '',
      phone: user?.phone || '',
      phone_secondary: user?.phone_secondary || '',
    });
    setProfileError('');
    setProfileSuccess('');
    setShowEditProfileModal(true);
  };

  // Handle profile update
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileSaving(true);
    
    try {
      await usersAPI.update(user.id, {
        full_name: profileForm.full_name,
        phone: profileForm.phone,
        phone_secondary: profileForm.phone_secondary || null,
      });
      
      // Update user context
      const updatedUser = await authAPI.getMe();
      updateUser(updatedUser.data);
      
      setProfileSuccess('✅ Профиль успешно обновлён!');
      setTimeout(() => {
        setShowEditProfileModal(false);
        setProfileSuccess('');
      }, 1500);
    } catch (error) {
      console.error('Error updating profile:', error);
      setProfileError(error.response?.data?.detail || 'Ошибка при обновлении профиля');
    } finally {
      setProfileSaving(false);
    }
  };

  const fetchChildren = useCallback(async () => {
    try {
      const response = await studentsAPI.getAll();
      const allStudents = response.data || [];
      const linkedChildren = allStudents.filter(s => s.guardian_ids && s.guardian_ids.includes(user.id));
      setChildren(linkedChildren);
    } catch (error) {
      console.error('Error fetching children:', error);
    }
  }, [user?.id]);

  const fetchMyPassword = async () => {
    setLoadingPassword(true);
    try {
      const response = await authAPI.getMyPassword();
      setMyPassword(response.data);
      setShowViewPasswordModal(true);
    } catch (error) {
      console.error('Error fetching password:', error);
      const message =
        error.response?.data?.detail ||
        t('password_view_error') ||
        'Не удалось получить пароль. Обратитесь к администратору.';
      alert(message);
    } finally {
      setLoadingPassword(false);
    }
  };

  useEffect(() => {
    if (isParent) {
      fetchChildren();
    }
  }, [isParent, fetchChildren]);

  const handleUploadAvatar = async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      await authAPI.uploadAvatar(formData);
      
      // Update user context with new avatar
      const updatedUser = await authAPI.getMe();
      updateUser(updatedUser.data);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      throw error;
    }
  };

  const handleUploadChildAvatar = async (childId, file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      await studentsAPI.uploadAvatar(childId, formData);
      fetchChildren();
    } catch (error) {
      console.error('Error uploading child avatar:', error);
      throw error;
    }
  };

  const handleDeleteChildAvatar = async (childId) => {
    try {
      await studentsAPI.deleteAvatar(childId);
      fetchChildren();
    } catch (error) {
      console.error('Error deleting child avatar:', error);
      throw error;
    }
  };

  const handleDeleteAvatar = async () => {
    await authAPI.deleteAvatar();
    const updatedUser = await authAPI.getMe();
    updateUser(updatedUser.data);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t('passwords_not_match'));
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError(t('password_too_short'));
      return;
    }

    try {
      await authAPI.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordSuccess(true);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (error) {
      setPasswordError(error.response?.data?.detail || t('error_changing_password'));
    }
  };

  const roleKeys = {
    super_admin: 'role_owner',
    admin: 'role_admin',
    coach: 'role_coach',
    parent: 'role_parent',
  };

  return (
    <div className="min-h-screen bg-[#0F1117] p-2 md:p-6 pb-24 md:pb-6 text-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl md:text-4xl font-bold mb-6">
          <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
            {isParent ? '⚙️ ' + t('nav_settings') : '🔧 ' + t('nav_settings')}
          </span>
        </h1>

      {/* Profile Section */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <span className="text-yellow-400">👤</span> {t('profile')}
        </h2>
        
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="flex-shrink-0">
            <AvatarUpload
              currentAvatar={user?.avatar_url ? `${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || ''}${user.avatar_url}?t=${new Date().getTime()}` : null}
              onUpload={handleUploadAvatar}
              onDelete={handleDeleteAvatar}
              size="large"
            />
          </div>
          
          <div className="flex-1 text-center md:text-left space-y-2">
            <div className="text-3xl font-bold text-white">{user?.full_name || 'User'}</div>
            <div className="text-white/60 flex items-center justify-center md:justify-start gap-2">
              <span className="text-yellow-400">📱</span> {user?.phone}
            </div>
            <div className="inline-block px-4 py-1.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full text-sm font-medium">
              {t(roleKeys[user?.role?.toLowerCase()]) || user?.role}
            </div>
            
            <div className="pt-4 flex gap-3 flex-wrap">
              {/* View password button - for all users */}
              <button
                onClick={fetchMyPassword}
                disabled={loadingPassword}
                className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white/80 rounded-lg transition-all flex items-center gap-2 border border-white/20 disabled:opacity-50"
              >
                <span>👁️</span> {loadingPassword ? '...' : (t('view_password') || 'Посмотреть пароль')}
              </button>
              
              {/* Change password button - only for owners */}
              {isOwner && (
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="px-6 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg transition-all flex items-center gap-2 border border-amber-500/30"
                >
                  <span>🔒</span> {t('change_password')}
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={openEditProfileModal}
                  className="px-6 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg transition-all flex items-center gap-2 border border-yellow-500/30"
                >
                  <span>✏️</span> {t('edit_profile') || 'Редактировать'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payment Settings (Admin Only) */}
      {isAdmin && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <span className="text-yellow-400">💳</span> {t('payment_settings') || 'Настройки оплаты'}
          </h2>
          <form onSubmit={handleSavePaymentInfo} className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('bank_details') || 'Реквизиты банка'}</label>
              <textarea
                value={paymentInfo.payment_bank_details}
                onChange={(e) => setPaymentInfo({...paymentInfo, payment_bank_details: e.target.value})}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:border-yellow-500/50 min-h-[100px]"
                placeholder="IBAN, Bank Name, etc."
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('payment_instructions') || 'Инструкции по оплате'}</label>
              <textarea
                value={paymentInfo.payment_instructions}
                onChange={(e) => setPaymentInfo({...paymentInfo, payment_instructions: e.target.value})}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:border-yellow-500/50 min-h-[100px]"
                placeholder="How to pay..."
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2 flex items-center gap-2">
                {t('payment_flow_mode')}
                <HelpCircle
                  className="w-4 h-4 text-white/50"
                  title={t('payment_flow_mode_hint') + ' · ' + t('always_invoice_confirm') + ' | ' + t('allow_direct_payment') + ' | ' + t('auto_from_env')}
                />
              </label>
              <select
                value={invoiceFlowMode}
                onChange={(e) => {
                  const val = e.target.value;
                  setInvoiceFlowMode(val);
                  localStorage.setItem('invoiceFlowMode', val);
                  setPaymentSuccess('✅ ' + t('saved') + ' · ' + t('payment_flow_mode'));
                  setTimeout(() => setPaymentSuccess(''), 2000);
                }}
                className="w-full px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:border-yellow-500/50"
              >
                <option value="auto">{t('auto_from_env')}</option>
                <option value="always">{t('always_invoice_confirm')}</option>
                <option value="fallback">{t('allow_direct_payment')}</option>
              </select>
              <p className="text-xs text-white/50 mt-1">
                {t('payment_flow_mode_hint')}
              </p>
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-2">{t('qr_code_url') || 'QR код для оплаты'}</label>
              
              <div className="flex flex-col gap-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={paymentInfo.payment_qr_url}
                    onChange={(e) => setPaymentInfo({...paymentInfo, payment_qr_url: e.target.value})}
                    className="flex-1 px-4 py-2.5 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:border-yellow-500/50"
                    placeholder="https://..."
                  />
                  <input
                    type="file"
                    ref={qrFileInputRef}
                    onChange={handleUploadQr}
                    className="hidden"
                    accept="image/*"
                  />
                  <button
                    type="button"
                    title={t('upload_qr_hint') || 'Загрузить файл QR-кода'}
                    onClick={() => qrFileInputRef.current?.click()}
                    disabled={uploadingQr}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl border border-white/10 transition flex items-center gap-2"
                  >
                    {uploadingQr ? <Loader2 className="animate-spin" size={20} /> : <Upload size={20} />}
                    {t('upload')}
                  </button>
                </div>

                {paymentInfo.payment_qr_url && (
                  <div className="relative w-48 h-48 bg-white/5 rounded-xl border border-white/10 overflow-hidden group">
                    <img 
                      src={paymentInfo.payment_qr_url.startsWith('http') 
                        ? paymentInfo.payment_qr_url 
                        : `${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || ''}${paymentInfo.payment_qr_url}`}
                      alt="QR Code" 
                      className="w-full h-full object-contain p-2"
                      onError={(e) => {
                        e.target.onerror = null; 
                        e.target.src = 'https://placehold.co/200x200?text=Invalid+Image';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setPaymentInfo(prev => ({ ...prev, payment_qr_url: '' }))}
                      className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
                
                {/* Bank Instructions */}
                <div className="mt-2 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <h3 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
                        ℹ️ {t('qr_bank_instructions_title') || 'Инструкция для банка'}
                    </h3>
                    <div className="text-sm text-blue-300/80 whitespace-pre-wrap">
                        {t('qr_bank_instructions') || 'Для генерации QR-кода запросите у банка...'}
                    </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={paymentSaving}
                className="flex-1 px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-bold rounded-xl hover:shadow-lg hover:shadow-yellow-500/20 transition-all disabled:opacity-50"
              >
                {paymentSaving ? ('⏳ ' + (t('saving') || 'Сохранение...')) : ('💾 ' + (t('save_payment_info') || 'Сохранить настройки'))}
              </button>
              <button
                type="button"
                onClick={fillTestData}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl border border-white/10 transition"
                title="Заполнить тестовыми данными"
              >
                📝 {t('test_data')}
              </button>
            </div>
            {paymentSuccess && <span className="block mt-2 text-emerald-400 font-medium text-center">{paymentSuccess}</span>}
          </form>
        </div>
      )}

      {/* Feature Settings (Admin Only) */}
      {isAdmin && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <span className="text-yellow-400">🛡️</span> {t('security_settings') || 'Настройки безопасности'}
          </h2>
          <div className="space-y-4">
             <label className="flex items-center justify-between p-4 rounded-xl border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                  🏥
                </div>
                <div>
                  <div className="font-medium text-white">{t('block_no_med_cert_title') || 'Блокировка без мед. справки'}</div>
                  <div className="text-sm text-white/50">{t('block_no_med_cert_desc') || 'Запретить отмечать посещение, если справка отсутствует или истекла'}</div>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full p-1 transition-colors ${features.block_attendance_without_medical_certificate ? 'bg-yellow-500' : 'bg-white/20'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${features.block_attendance_without_medical_certificate ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
              <input
                type="checkbox"
                checked={features.block_attendance_without_medical_certificate}
                onChange={(e) => handleToggleFeature('features_block_no_medical_certificate', e.target.checked)}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* Children Avatars Section (for Parents) */}
      {isParent && children.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <span className="text-yellow-400">👶</span> {t('my_children_photos') || 'Фотографии детей'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {children.map(child => (
              <div key={child.id} className="flex items-center gap-4 p-4 border border-white/10 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
                <AvatarUpload
                  currentAvatar={child.avatar_url ? `${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || ''}${child.avatar_url}?t=${new Date().getTime()}` : null}
                  onUpload={(file) => handleUploadChildAvatar(child.id, file)}
                  onDelete={() => handleDeleteChildAvatar(child.id)}
                  size="medium"
                />
                <div>
                  <div className="font-bold text-white text-lg">{child.first_name} {child.last_name}</div>
                  <div className="text-sm text-white/50">🎂 {child.dob}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Language Section */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <span className="text-yellow-400">🌐</span> {t('language')}
          </h2>
          <div className="space-y-3">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  language === lang.code
                    ? 'border-yellow-500/50 bg-yellow-500/10'
                    : 'border-white/10 hover:border-yellow-500/30 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{lang.flag}</span>
                  <span className={`font-medium ${language === lang.code ? 'text-yellow-400' : 'text-white'}`}>
                    {lang.name}
                  </span>
                </div>
                {language === lang.code && (
                  <span className="text-yellow-400 text-xl">✓</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Birthday Templates Settings (Admins Only) */}
        {isAdmin && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <span className="text-yellow-400">🎂</span> {t('birthdays') || 'Поздравления'}
            </h2>
            <button
              onClick={() => setShowBirthdayTemplates(true)}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 hover:border-yellow-500/30 hover:bg-white/5 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-400 group-hover:scale-110 transition-transform">
                  <Gift size={20} />
                </div>
                <div className="text-left">
                  <div className="font-medium text-white">{t('birthday_templates') || 'Шаблоны поздравлений'}</div>
                  <div className="text-sm text-white/50">{t('edit_birthday_text') || 'Настроить текст автоматических поздравлений'}</div>
                </div>
              </div>
              <div className="text-white/30 group-hover:text-yellow-400 transition-colors">
                →
              </div>
            </button>
          </div>
        )}

        {/* Notifications & Other Settings */}
        <div className="space-y-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <span className="text-yellow-400">🔔</span> {t('notifications')}
            </h2>
            <label className="flex items-center justify-between p-4 rounded-xl border border-white/10 cursor-pointer hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400">
                  📬
                </div>
                <div>
                  <div className="font-medium text-white">{t('push_notifications')}</div>
                  <div className="text-sm text-white/50">{t('receive_notifications')}</div>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full p-1 transition-colors ${notifications ? 'bg-yellow-500' : 'bg-white/20'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${notifications ? 'translate-x-6' : 'translate-x-0'}`} />
              </div>
              <input
                type="checkbox"
                checked={notifications}
                onChange={(e) => setNotifications(e.target.checked)}
                className="hidden"
              />
            </label>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <span className="text-yellow-400">ℹ️</span> {t('about')}
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/10">
                <span className="text-white/60">{t('version')}</span>
                <span className="font-mono text-yellow-400 font-bold bg-yellow-500/20 px-2 py-0.5 rounded">1.0.0</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/10">
                <span className="text-white/60">{t('app_name')}</span>
                <span className="font-medium text-white">Sunny Football Academy</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Logout Button */}
      <button
        onClick={handleLogout}
        className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 hover:border-red-500/50 py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3"
      >
        <span className="text-xl">🚪</span>
        {t('logout_button')}
      </button>

      {/* Birthday Templates Modal */}
      {showBirthdayTemplates && (
        <BirthdayTemplateModal
          onClose={() => setShowBirthdayTemplates(false)}
          t={t}
        />
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="text-yellow-400">🔒</span> {t('change_password')}
            </h2>
            
            {passwordError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
                ⚠️ {passwordError}
              </div>
            )}

            {passwordSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
                ✅ {t('password_changed')}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">{t('current_password')}</label>
                <PasswordInput
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                  required
                  className="bg-white/5 border-white/10 focus:border-yellow-500/50 text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">{t('new_password')}</label>
                <PasswordInput
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                  required
                  className="bg-white/5 border-white/10 focus:border-yellow-500/50 text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">{t('confirm_password')}</label>
                <PasswordInput
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                  required
                  className="bg-white/5 border-white/10 focus:border-yellow-500/50 text-white"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordError('');
                    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                  className="flex-1 px-4 py-3 border border-white/10 rounded-xl hover:bg-white/5 transition text-white/70 font-medium"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-black rounded-xl hover:shadow-lg hover:shadow-yellow-500/25 transition font-bold"
                >
                  {t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Password Modal (Read-only for non-owners) */}
      {showViewPasswordModal && myPassword && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="text-yellow-400">🔐</span> {t('your_password') || 'Ваш пароль'}
            </h2>
            
            <div className="space-y-4">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-sm text-white/50 mb-1">{t('login') || 'Логин'}</div>
                <div className="text-lg font-mono text-white">{myPassword.login}</div>
              </div>
              
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="text-sm text-white/50 mb-1">{t('password') || 'Пароль'}</div>
                <div className="text-lg font-mono text-white">{myPassword.password}</div>
              </div>
              
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm flex items-start gap-2">
                <span>⚠️</span>
                <span>{t('password_view_only_hint') || 'Для изменения пароля обратитесь к руководителю'}</span>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  setShowViewPasswordModal(false);
                  setMyPassword(null);
                }}
                className="w-full px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-black rounded-xl hover:shadow-lg hover:shadow-yellow-500/25 transition font-bold"
              >
                {t('close') || 'Закрыть'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {showEditProfileModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span className="text-yellow-400">✏️</span> {t('edit_profile') || 'Редактировать профиль'}
            </h2>
            
            {profileError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
                ⚠️ {profileError}
              </div>
            )}

            {profileSuccess && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg mb-6 flex items-center gap-2">
                ✅ {profileSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateProfile} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  {t('full_name') || 'ФИО'} *
                </label>
                <input
                  type="text"
                  value={profileForm.full_name}
                  onChange={(e) => setProfileForm({...profileForm, full_name: e.target.value})}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  📱 {t('phone') || 'Телефон'} *
                </label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none transition"
                  placeholder="+373XXXXXXXX"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  📱 {t('phone_secondary') || 'Доп. телефон'}
                </label>
                <input
                  type="tel"
                  value={profileForm.phone_secondary}
                  onChange={(e) => setProfileForm({...profileForm, phone_secondary: e.target.value})}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-yellow-500/50 focus:outline-none transition"
                  placeholder="+373XXXXXXXX"
                />
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditProfileModal(false);
                    setProfileError('');
                    setProfileSuccess('');
                  }}
                  className="flex-1 px-4 py-3 border border-white/10 rounded-xl hover:bg-white/5 transition text-white/70 font-medium"
                  disabled={profileSaving}
                >
                  {t('cancel') || 'Отмена'}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-black rounded-xl hover:shadow-lg hover:shadow-yellow-500/25 transition font-bold disabled:opacity-50"
                  disabled={profileSaving}
                >
                  {profileSaving ? '⚙️ Сохранение...' : ('💾 ' + (t('save') || 'Сохранить'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
