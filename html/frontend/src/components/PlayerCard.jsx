 import { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { skillsAPI, groupsAPI, paymentsAPI, studentsAPI, attendanceAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { navigationConfig } from '../config/navigation';
import { transliterate, getLocalizedName } from '../utils/transliteration';
import UserAvatar from './UserAvatar';
import { X, Menu, User, Users, Activity, FileText, CreditCard, Calendar, Edit2, Save, ChevronDown, Camera, Trophy, Medal, MapPin, Ruler, Weight, CheckCircle, Clock, XCircle, Download, ChevronLeft, ChevronRight, Loader2, Trash2, AlertCircle, Phone, History, Settings, TrendingUp, Table, LayoutList, Star, Snowflake } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { getAcademyYears } from '../utils/dateUtils';
import AcademicDiary from './AcademicDiary';
import SkillsVisualTab from './SkillsVisualTab';
import MedicalCertificate from './MedicalCertificate';
import StudentAttendanceReport from './StudentAttendanceReport';
import PhysicalStatsTab from './PhysicalStatsTab';
import FreezeRequestModal from './FreezeRequestModal';
import CustomDatePicker from './CustomDatePicker';

export default function PlayerCard({ studentId, onClose, onGroupChanged, initialTab = 'profile' }) {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [showFullAvatar, setShowFullAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [student, setStudent] = useState(null);
  const [skillsHistory, setSkillsHistory] = useState([]);
  const [groupHistory, setGroupHistory] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [attendanceView, setAttendanceView] = useState('sheet'); // 'sheet' or 'overview'
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileData, setProfileData] = useState({});
  const [changingGroup, setChangingGroup] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showFreezeModal, setShowFreezeModal] = useState(false);
  const [pendingFreezeRequest, setPendingFreezeRequest] = useState(null);
  const [isProcessingFreeze, setIsProcessingFreeze] = useState(false); // New loading state
  const [showMenu, setShowMenu] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState(null); // Detailed invoices
  
  // Invoice State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    period: new Date().toISOString().slice(0, 7),
    amount: '',
    paymentType: 'subscription',
    customDescription: ''
  });

  // Diary State
  const [diaryYear, setDiaryYear] = useState(new Date().getFullYear());
  
  // Stats State
  const [statsYear, setStatsYear] = useState(new Date().getFullYear());
  const [statsQuarter, setStatsQuarter] = useState(0); // 0 = all quarters, 1-4 = specific quarter
  const [statsMonth, setStatsMonth] = useState(0); // 0 = all months, 1-12 = specific month
  const [statsViewMode, setStatsViewMode] = useState('table'); // 'table', 'charts'
  const [isManageMode, setIsManageMode] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(new Date());
  const [attendanceViewMode, setAttendanceViewMode] = useState(window.innerWidth < 768 ? 'list' : 'calendar');
  const cardRef = useRef(null);
  
  const academyYears = getAcademyYears();
  const monthNames = useMemo(() => ([
    t('january') || 'Январь', t('february') || 'Февраль', t('march') || 'Март',
    t('april') || 'Апрель', t('may') || 'Май', t('june') || 'Июнь',
    t('july') || 'Июль', t('august') || 'Август', t('september') || 'Сентябрь',
    t('october') || 'Октябрь', t('november') || 'Ноябрь', t('december') || 'Декабрь'
  ]), [language]);

  const dStatsYear = useDeferredValue(statsYear);
  const dStatsQuarter = useDeferredValue(statsQuarter);
  const dStatsMonth = useDeferredValue(statsMonth);
  const fileInputRef = useRef(null);
  const diaryRef = useRef(null);
  const statsRef = useRef(null);
  const attendanceRef = useRef(null);

  const isCoach = user?.role?.toLowerCase() === 'coach';
  const isAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
  const isParent = user?.role?.toLowerCase() === 'parent';

  const calculateAge = (dob) => {
    if (!dob) return '';
    const birth = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    // Recalculate permissions inside fetchData to ensure latest values are used if called directly
    const currentIsAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
    const currentIsParent = user?.role?.toLowerCase() === 'parent';
    const currentIsCoach = user?.role?.toLowerCase() === 'coach';

    setLoading(true);
    try {
      // Execute all requests in parallel for better performance
      const promises = [
        studentsAPI.getById(studentId),
        attendanceAPI.getStudentStats(studentId).catch(e => {
          console.warn("Error fetching attendance stats:", e);
          return { data: null };
        }),
        (currentIsAdmin || currentIsCoach) ? groupsAPI.getAll() : Promise.resolve({ data: [] }),
        (currentIsAdmin || currentIsParent) ? studentsAPI.getFreezeRequest(studentId).catch(e => {
          // Ignore 404 for freeze request (it means no request exists)
          return { data: null };
        }) : Promise.resolve({ data: null }),
        studentsAPI.getHistory(studentId).catch(e => {
            console.warn("Error fetching history:", e);
            return { data: [] };
        }),
        studentsAPI.getPendingInvoices(studentId).catch(e => {
            console.warn("Error fetching pending invoices:", e);
            return { data: { invoices: [], total_amount: 0 } };
        })
      ];

      const [
        studentRes, 
        attendanceRes, 
        groupsRes, 
        freezeRes,
        historyRes,
        invoicesRes
      ] = await Promise.all(promises);

      // 1. Set Student Data
      setStudent(studentRes.data);
      setGroupHistory(historyRes?.data || []);
      setPendingInvoices(invoicesRes?.data); // Store detailed invoices
      setProfileData({
        position: studentRes.data.position || '',
        dominant_foot: studentRes.data.dominant_foot || '',
        tshirt_size: studentRes.data.tshirt_size || '',
        shoe_size: studentRes.data.shoe_size || '',
        height: studentRes.data.height || '',
        weight: studentRes.data.weight || '',
        notes: studentRes.data.notes || ''
      });

      // 2. Set Attendance (Payments removed)
      setAttendanceStats(attendanceRes.data);

      // 4. Set Groups
      setGroups(groupsRes.data || []);

      // 5. Set Freeze Request
      // Only set if pending, to avoid showing stale approved/rejected requests as actionable
      if (freezeRes.data && freezeRes.data.status === 'pending') {
        setPendingFreezeRequest(freezeRes.data);
      } else {
        setPendingFreezeRequest(null);
      }

    } catch (err) {
      console.error(err);
      setError(t('error_loading_student') || 'Failed to load student data');
    } finally {
      setLoading(false);
    }
  }, [studentId, user?.role, t]);

  const handleOpenInvoiceModal = () => {
    // Determine fee
    const group = groups.find(g => g.id == student?.group_id);
    const fee = student?.individual_fee || group?.monthly_fee || '';
    
    setInvoiceForm({
      period: new Date().toISOString().slice(0, 7), // Reset to current month
      amount: fee,
      paymentType: 'subscription',
      customDescription: ''
    });
    setShowInvoiceModal(true);
  };

  const getPaymentDescription = (type, customDesc, periodStr) => {
    if (!periodStr) return '';
    const date = new Date(periodStr + '-01');
    const monthName = date.toLocaleDateString(language === 'ru' ? 'ru-RU' : (language === 'ro' ? 'ro-RO' : 'en-US'), { month: 'long' });
    const year = date.getFullYear();
    
    switch (type) {
        case 'subscription':
            return (t('invoice_subscription_desc') || 'Абонемент за {month} {year}').replace('{month}', monthName).replace('{year}', year);
        case 'individual':
            return (t('invoice_individual_desc') || 'Индивидуальные тренировки за {month} {year}').replace('{month}', monthName).replace('{year}', year);
        case 'equipment':
            return `${t('invoice_equipment') || 'Покупка экипировки'}${customDesc ? ': ' + customDesc : ''}`;
        case 'other':
            return customDesc || (t('invoice_other') || 'Прочее');
        default:
            return '';
    }
  };

  const handleInvoiceSubmit = async (e) => {
    e.preventDefault();
    if (!invoiceForm.amount || parseFloat(invoiceForm.amount) <= 0) {
      alert(t('amount_positive') || 'Amount must be positive');
      return;
    }
    
    try {
      const paymentPeriod = invoiceForm.period + '-01';
      const description = getPaymentDescription(invoiceForm.paymentType, invoiceForm.customDescription, invoiceForm.period);
      
      await paymentsAPI.invoiceStudent(
        parseInt(studentId),
        paymentPeriod,
        parseFloat(invoiceForm.amount),
        description
      );
      
      setShowInvoiceModal(false);
      alert(t('invoice_individual_success') || 'Invoice created successfully');
      // Refresh payments/debts info
      fetchData();
    } catch (error) {
      console.error('Invoice error:', error);
      alert(error.response?.data?.detail || t('invoice_individual_error') || 'Error creating invoice');
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('payments:updated', handler);
    return () => window.removeEventListener('payments:updated', handler);
  }, [fetchData]);

  const handleSaveProfile = async () => {
    try {
      // Clean data: convert empty strings to null for numeric fields
      const dataToSave = {
        ...profileData,
        height: profileData.height === '' ? null : profileData.height,
        weight: profileData.weight === '' ? null : profileData.weight
      };

      await studentsAPI.update(studentId, dataToSave);
      setStudent(prev => ({ ...prev, ...dataToSave }));
      setProfileData(dataToSave); // Update local state to match
      setIsEditingProfile(false);
    } catch (err) {
      console.error(err);
      alert(t('error_saving_profile') || 'Error saving profile');
    }
  };

  const handleGroupChange = async (groupId) => {
    try {
      await studentsAPI.changeGroup(studentId, groupId);
      setStudent(prev => ({ ...prev, group_id: groupId, group_name: groups.find(g => g.id == groupId)?.name }));
      setChangingGroup(false);
      if (onGroupChanged) onGroupChanged();
    } catch (err) {
      console.error(err);
      alert(t('error_changing_group') || 'Error changing group');
    }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await studentsAPI.uploadAvatar(studentId, formData);
      await fetchData(); // Refresh to get new avatar
    } catch (err) {
      console.error(err);
      alert(t('error_uploading_avatar') || 'Error uploading avatar');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleExport = async (type) => {
    if (!student) return;

    // Delegate to child components based on active tab
    if (activeTab === 'diary' && diaryRef.current) {
      if (type === 'excel') diaryRef.current.exportExcel();
      else if (diaryRef.current.exportPDF) diaryRef.current.exportPDF();
      return;
    }

    if (activeTab === 'physical' && statsRef.current) {
      if (type === 'excel') statsRef.current.exportExcel();
      else if (statsRef.current.exportPDF) statsRef.current.exportPDF();
      return;
    }

    if (activeTab === 'attendance' && attendanceRef.current) {
      if (type === 'excel') attendanceRef.current.exportExcel();
      else if (attendanceRef.current.exportPDF) attendanceRef.current.exportPDF();
      return;
    }

    // Default Profile Export (Profile & Medical)
    const data = [
      { Section: t('profile'), Key: t('name') || 'Name', Value: getLocalizedName(student.first_name, student.last_name, language) },
      { Section: t('profile'), Key: t('dob'), Value: new Date(student.dob).toLocaleDateString() },
      { Section: t('profile'), Key: t('group'), Value: student.group?.name || student.group_name },
      { Section: t('statistics'), Key: t('position'), Value: profileData.position },
      { Section: t('statistics'), Key: t('height'), Value: profileData.height },
      { Section: t('statistics'), Key: t('weight'), Value: profileData.weight },
      { Section: t('statistics'), Key: t('dominant_foot'), Value: profileData.dominant_foot },
    ];
    
    if (activeTab === 'medical') {
        const expiry = student.medical_certificate_expires ? new Date(student.medical_certificate_expires) : null;
        const today = new Date();
        const isValid = expiry && expiry >= today;
        
        data.push(
            { Section: t('medical'), Key: t('expires'), Value: expiry ? expiry.toLocaleDateString() : '-' },
            { Section: t('medical'), Key: t('status'), Value: isValid ? (t('valid') || 'Valid') : (t('expired') || 'Expired') }
        );
    }

    const columns = { Section: t('section') || 'Section', Key: t('item') || 'Item', Value: t('value') || 'Value' };
    const filename = `${student.first_name}_${student.last_name}_${activeTab === 'medical' ? 'Medical' : 'Profile'}`;

    if (type === 'excel') {
      exportToExcel(data, columns, filename);
    } else {
      exportToPDF(data, columns, filename, t('student_card') || 'Student Card');
    }
  };


  const handleUnfreeze = async () => {
    if (!window.confirm(t('confirm_unfreeze') || 'Are you sure you want to unfreeze this student?')) return;
    try {
      await studentsAPI.unfreeze(studentId);
      await fetchData();
      alert(t('unfreeze_success') || 'Student unfrozen successfully');
    } catch (err) {
      console.error(err);
      alert(t('unfreeze_error') || 'Error unfreezing student');
    }
  };

  const handleRejectFreeze = async () => {
    if (!pendingFreezeRequest || isProcessingFreeze) return;
    if (!window.confirm(t('confirm_reject_freeze') || 'Вы уверены, что хотите отклонить заявку?')) return;
    
    setIsProcessingFreeze(true);
    try {
      await studentsAPI.rejectFreeze(studentId, pendingFreezeRequest.id);
      await fetchData();
      setPendingFreezeRequest(null);
      // alert(t('freeze_rejected') || 'Заявка отклонена'); // Removed alert for smoother UX
    } catch (err) {
      console.error(err);
      alert(t('error_rejecting_freeze') || 'Ошибка при отклонении заявки');
    } finally {
      setIsProcessingFreeze(false);
    }
  };

  const handleApproveFreeze = async () => {
    if (!pendingFreezeRequest || isProcessingFreeze) return;
    
    setIsProcessingFreeze(true);
    try {
      await studentsAPI.approveFreeze(studentId, pendingFreezeRequest.id);
      await fetchData();
      setPendingFreezeRequest(null);
      // alert(t('freeze_approved') || 'Freeze request approved'); // Removed alert
    } catch (err) {
      console.error(err);
      alert(t('error_approving_freeze') || 'Error approving freeze request');
    } finally {
      setIsProcessingFreeze(false);
    }
  };

  const handleDeleteFreezeRequest = async () => {
    if (!pendingFreezeRequest || isProcessingFreeze) return;
    if (!window.confirm(t('confirm_delete_freeze') || 'Вы уверены, что хотите удалить эту заявку?')) return;
    
    setIsProcessingFreeze(true);
    try {
      await studentsAPI.deleteFreezeRequest(studentId, pendingFreezeRequest.id);
      await fetchData();
      setPendingFreezeRequest(null);
      alert(t('freeze_deleted') || 'Заявка удалена');
    } catch (err) {
      console.error(err);
      alert(t('error_deleting_freeze') || 'Ошибка при удалении заявки');
    } finally {
      setIsProcessingFreeze(false);
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400"></div>
    </div>
  );

  if (error) return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm text-white">
      <div className="bg-[#1A1D24] border border-red-500/20 p-8 rounded-2xl max-w-md text-center shadow-2xl">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h3 className="text-xl font-bold mb-2">{t('error') || 'Error'}</h3>
        <p className="text-white/60 mb-6">{error}</p>
        <button 
          onClick={onClose}
          className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors font-medium"
        >
          {t('close') || 'Close'}
        </button>
      </div>
    </div>
  );

  // Header visibility logic
  const shouldShowHeader = activeTab === 'profile';
  
  if (!student) return null;

  const isBirthday = student.dob && new Date(student.dob).getMonth() === new Date().getMonth() && new Date(student.dob).getDate() === new Date().getDate();

  const normalizedRole = user?.role?.toLowerCase();
  const menuItems = navigationConfig[normalizedRole] || navigationConfig.parent;

  return createPortal(
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xl"
        onClick={onClose}
      >
        {/* Full Screen Avatar Modal */}
        <AnimatePresence>
          {showFullAvatar && student?.avatar_url && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
              onClick={() => setShowFullAvatar(false)}
            >
              <motion.img
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                src={`${import.meta.env.VITE_API_URL?.replace('/api/v1', '') || ''}${student.avatar_url}`}
                alt={transliterate(student.first_name, language)}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
                onClick={(e) => e.stopPropagation()} 
              />
              <button
                onClick={() => setShowFullAvatar(false)}
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              >
                <X size={24} />
              </button>
              
              {/* Upload Button in Full Screen View */}
              {(isAdmin || isCoach || isParent) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-brand-yellow text-black rounded-xl font-bold flex items-center gap-2 shadow-lg hover:bg-yellow-400 transition-colors"
                >
                  <Camera size={20} />
                  {t('change_photo') || 'Изменить фото'}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full h-full flex items-center justify-center p-0 md:p-4">
          <motion.div 
            ref={cardRef}
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
            className="bg-[#13151A]/95 w-full h-full md:w-[95vw] md:h-[90vh] md:rounded-3xl shadow-2xl border border-white/10 flex flex-col relative overflow-hidden ring-1 ring-white/5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile/Tablet Navigation Bar */}
            <div className={`lg:hidden ${activeTab === 'profile' ? 'absolute top-0 left-0 right-0 p-4 pointer-events-none' : 'relative bg-[#1A1D24] border-b border-white/5 p-4 shrink-0'} flex flex-col gap-4 z-50`}>
              
              {/* Row 1: Back, Title (Landscape), Actions */}
              <div className="flex items-center justify-between pointer-events-auto relative">
                {/* Left Group: Navigation + Moved Attendance Controls */}
                <div className="flex items-center gap-2 z-20">
                  {/* Navigation Controls (Prev/Next) */}
                  <div className="flex items-center gap-1 sm:gap-2 bg-black/40 rounded-full p-1 backdrop-blur-md border border-white/10 shadow-lg">
                    <button
                      onClick={() => {
                        const tabs = ['profile', 'diary', 'physical', 'attendance', 'medical'];
                        const currentIndex = tabs.indexOf(activeTab);
                        const newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
                        setActiveTab(tabs[newIndex]);
                      }}
                      className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full text-white transition-all active:scale-95"
                      title={t('prev_page') || 'Previous'}
                    >
                      <ChevronLeft size={16} className="sm:w-5 sm:h-5" />
                    </button>
                    <div className="w-px h-3 sm:h-4 bg-white/10"></div>
                    <button
                      onClick={() => {
                        const tabs = ['profile', 'diary', 'physical', 'attendance', 'medical'];
                        const currentIndex = tabs.indexOf(activeTab);
                        const newIndex = (currentIndex + 1) % tabs.length;
                        setActiveTab(tabs[newIndex]);
                      }}
                      className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full text-white transition-all active:scale-95"
                      title={t('next_page') || 'Next'}
                    >
                      <ChevronRight size={16} className="sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  {/* Attendance Controls (Moved to Left for Landscape) */}
                  {activeTab === 'attendance' && (
                    <div className="hidden sm:flex items-center gap-2 animate-fade-in">
                       {/* Title Badge */}
                       <span className="text-[10px] font-semibold text-white/90 uppercase tracking-[0.2em] bg-gradient-to-r from-yellow-500/25 via-emerald-500/15 to-sky-500/25 px-3 py-1.5 rounded-xl border border-yellow-400/60 backdrop-blur-xl shadow-[0_0_10px_rgba(250,204,21,0.2)]">
                         {t('attendance') || 'Att.'}
                       </span>

                       {/* Month Navigation */}
                       <div className="flex items-center gap-1 bg-black/40 rounded-xl backdrop-blur-sm border border-white/10 p-1 h-[36px]">
                          <button 
                            onClick={() => setAttendanceDate(new Date(attendanceDate.getFullYear(), attendanceDate.getMonth() - 1, 1))}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-white transition h-full aspect-square flex items-center justify-center"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="text-xs font-bold text-white min-w-[50px] text-center capitalize">
                             {attendanceDate.toLocaleDateString(t('locale') || 'ru-RU', { month: 'short' })}
                          </span>
                          <button 
                            onClick={() => setAttendanceDate(new Date(attendanceDate.getFullYear(), attendanceDate.getMonth() + 1, 1))}
                            className="p-1.5 hover:bg-white/10 rounded-lg text-white transition h-full aspect-square flex items-center justify-center"
                          >
                            <ChevronRight size={14} />
                          </button>
                       </div>

                       {/* Year Selector */}
                       <div className="relative h-[36px]">
                          <select
                            value={attendanceDate.getFullYear()}
                            onChange={(e) => setAttendanceDate(new Date(parseInt(e.target.value), attendanceDate.getMonth(), 1))}
                            className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-2 pr-6 py-1 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-full min-w-[65px]"
                          >
                            {academyYears.map(year => (
                              <option key={year} value={year} className="bg-[#1A1D24] text-white">
                                {year}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                       </div>
                    </div>
                  )}
                </div>

                {/* Center Title (Hidden for Attendance Landscape) */}
                {(activeTab === 'diary' || activeTab === 'physical' || activeTab === 'medical' || activeTab === 'attendance') && (
                  <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none w-full flex justify-center max-w-[120px] sm:max-w-full ${activeTab === 'attendance' ? 'sm:hidden' : ''}`}>
                     <span className="text-[10px] sm:text-xs font-semibold text-white/90 uppercase tracking-[0.2em] sm:tracking-[0.35em] bg-gradient-to-r from-yellow-500/25 via-emerald-500/15 to-sky-500/25 px-2 sm:px-5 py-1 sm:py-2 rounded-xl sm:rounded-2xl border border-yellow-400/60 backdrop-blur-xl shadow-[0_0_18px_rgba(250,204,21,0.35)] truncate">
                       {activeTab === 'diary' && (t('diary') || 'Дневник')}
                       {activeTab === 'physical' && (t('statistics') || 'Stats')}
                       {activeTab === 'attendance' && (t('attendance') || 'Att.')}
                       {activeTab === 'medical' && (t('medical') || 'Med')}
                     </span>
                  </div>
                )}

                {/* Right: Actions */}
                <div className="flex items-center gap-2 z-20">
                   {/* Year Filter for Diary (Landscape Only) */}
                   {activeTab === 'diary' && (
                      <div className="relative pointer-events-auto hidden sm:block">
                         <select
                           value={diaryYear}
                           onChange={(e) => setDiaryYear(parseInt(e.target.value))}
                           className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-7 py-2 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-[42px]"
                         >
                           {academyYears.map(year => (
                             <option key={year} value={year} className="bg-[#1A1D24] text-white">
                               {year}
                             </option>
                           ))}
                         </select>
                         <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                      </div>
                   )}

                   {/* Controls for Statistics (Landscape Only) */}
                   {activeTab === 'physical' && (
                     <div className="hidden sm:flex items-center gap-2 pointer-events-auto">
                       {/* View Toggle */}
                      <div className="flex bg-black/40 rounded-xl backdrop-blur-sm border border-white/10 p-1 h-[42px] items-center gap-1">
                        {(isAdmin || isCoach) && (
                           <button 
                             onClick={() => setIsManageMode(!isManageMode)}
                             className={`p-1.5 rounded-lg transition-all h-[32px] w-[32px] flex items-center justify-center ${isManageMode ? 'bg-brand-yellow text-black' : 'text-white/40 hover:text-white'}`}
                             title={t('manage_tests') || "Manage"}
                           >
                             <Settings size={16} />
                           </button>
                         )}
                        <button 
                          onClick={() => setStatsViewMode(statsViewMode === 'charts' ? 'table' : 'charts')}
                          className={`p-1.5 rounded-lg transition-all h-[32px] w-[32px] flex items-center justify-center ${statsViewMode === 'charts' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white'}`}
                          title={statsViewMode === 'charts' ? (t('show_table') || 'Table') : (t('show_charts') || 'Charts')}
                        >
                          {statsViewMode === 'charts' ? <Table size={16} /> : <TrendingUp size={16} />}
                        </button>
                      </div>
                       
                       {/* Date Filters - Only visible in Table mode */}
                     {statsViewMode === 'table' && (
                       <div className="flex items-center gap-2">
                         {/* Year Selector */}
                         <div className="relative">
                           <select
                             value={statsYear}
                             onChange={(e) => setStatsYear(parseInt(e.target.value))}
                             className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-7 py-2 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-[42px]"
                           >
                             {academyYears.map(year => (
                               <option key={year} value={year} className="bg-[#1A1D24] text-white">
                                 {year}
                               </option>
                             ))}
                           </select>
                           <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                         </div>
                         {/* Quarter Selector */}
                         <div className="relative">
                           <select
                             value={statsQuarter}
                             onChange={(e) => {
                               setStatsQuarter(parseInt(e.target.value));
                               setStatsMonth(0); // Reset month when quarter changes
                             }}
                             className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-7 py-2 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-[42px] min-w-[80px]"
                           >
                             <option value={0} className="bg-[#1A1D24] text-white">{t('all_quarters') || 'Все кварталы'}</option>
                             <option value={1} className="bg-[#1A1D24] text-white">{t('q1') || 'Q1'}</option>
                             <option value={2} className="bg-[#1A1D24] text-white">{t('q2') || 'Q2'}</option>
                             <option value={3} className="bg-[#1A1D24] text-white">{t('q3') || 'Q3'}</option>
                             <option value={4} className="bg-[#1A1D24] text-white">{t('q4') || 'Q4'}</option>
                           </select>
                           <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                         </div>
                         {/* Month Selector - only show when quarter is not selected */}
                         {statsQuarter === 0 && (
                           <div className="relative">
                             <select
                               value={statsMonth}
                               onChange={(e) => setStatsMonth(parseInt(e.target.value))}
                               className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-7 py-2 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-[42px] min-w-[80px]"
                             >
                               <option value={0} className="bg-[#1A1D24] text-white">{t('all_months') || 'Все месяцы'}</option>
                               {monthNames.map((month, index) => (
                                 <option key={index + 1} value={index + 1} className="bg-[#1A1D24] text-white">
                                   {month}
                                 </option>
                               ))}
                             </select>
                             <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                           </div>
                         )}
                       </div>
                     )}
                     </div>
                   )}

                   {/* Mobile Attendance View Toggle */}
                   {activeTab === 'attendance' && (
                      <button
                        onClick={() => setAttendanceViewMode(attendanceViewMode === 'calendar' ? 'list' : 'calendar')}
                        className="p-2 bg-black/40 text-white rounded-full backdrop-blur-sm border border-white/10 h-[42px] w-[42px] flex items-center justify-center mr-2 pointer-events-auto"
                      >
                        {attendanceViewMode === 'calendar' ? <LayoutList size={20} /> : <Calendar size={20} />}
                      </button>
                   )}

                   {/* Burger Menu (Always visible on mobile) */}
                   <div className="flex pointer-events-auto">
                     <button
                       onClick={() => setShowMenu(!showMenu)}
                       className="p-2 bg-black/40 text-white rounded-full backdrop-blur-sm border border-white/10 h-[42px] w-[42px] flex items-center justify-center"
                     >
                       <div className="space-y-1">
                          <div className="w-5 h-0.5 bg-white"></div>
                          <div className="w-5 h-0.5 bg-white"></div>
                          <div className="w-5 h-0.5 bg-white"></div>
                       </div>
                     </button>
                     {showMenu && (
                       <div className="absolute top-16 right-4 bg-[#1A1D24] border border-white/10 rounded-xl p-2 min-w-[200px] shadow-xl flex flex-col gap-1 animate-fade-in z-[60] max-h-[60vh] overflow-y-auto custom-scrollbar">
                          <button onClick={() => { setActiveTab('profile'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'profile' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                            <User size={16} /> {t('profile')}
                          </button>
                          <button onClick={() => { setActiveTab('diary'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'diary' ? 'bg-brand-yellow/10 text-brand-yellow' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                            <FileText size={16} /> {t('diary') || 'Дневник'}
                          </button>
                          <button onClick={() => { setActiveTab('physical'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'physical' ? 'bg-brand-yellow/10 text-brand-yellow' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                            <Activity size={16} /> {t('statistics') || 'Stats'}
                          </button>
                          <button onClick={() => { setActiveTab('attendance'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'attendance' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                            <Calendar size={16} /> {t('attendance') || 'Att.'}
                          </button>
                          <button onClick={() => { setActiveTab('medical'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'medical' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                            <Activity size={16} /> {t('medical') || 'Med'}
                          </button>
                          <div className="h-px bg-white/10 my-1"></div>
                          {isAdmin && (
                            <button 
                              onClick={() => { handleOpenInvoiceModal(); setShowMenu(false); }}
                              className="flex items-center gap-2 px-4 py-3 text-sm text-purple-400 hover:bg-white/5 rounded-lg text-left"
                            >
                              <CreditCard size={16} /> {t('create_invoice_btn') || 'Выставить счет'}
                            </button>
                          )}
                          {(isAdmin || isCoach) && (
                            <button 
                              onClick={() => { setIsEditingProfile(true); setShowMenu(false); }}
                              className="flex items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/5 rounded-lg text-left"
                            >
                              <Edit2 size={16} /> {t('edit_profile') || 'Редактировать профиль'}
                            </button>
                          )}
                          
                          {/* Export Options */}
                          {activeTab !== 'profile' && (
                            <>
                              <button 
                                onClick={() => { handleExport('excel'); setShowMenu(false); }}
                                className="flex items-center gap-2 px-4 py-3 text-sm text-green-400 hover:bg-white/5 rounded-lg text-left"
                              >
                                <FileText size={16} /> Export Excel
                              </button>
                              <button 
                                onClick={() => { handleExport('pdf'); setShowMenu(false); }}
                                className="flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-white/5 rounded-lg text-left"
                              >
                                <FileText size={16} /> Export PDF
                              </button>
                              <div className="h-px bg-white/10 my-1"></div>
                            </>
                          )}

                          <button 
                            onClick={onClose}
                            className="flex items-center gap-2 px-4 py-3 text-sm text-white/60 hover:bg-white/5 rounded-lg text-left"
                          >
                            <X size={16} /> {t('close')}
                          </button>
                       </div>
                     )}
                   </div>
                </div>
              </div>

              {/* Row 2: Secondary Toolbar for Portrait Mode (Controls moved here) */}
              <div className="sm:hidden flex justify-center items-center gap-4 mt-2 pointer-events-auto">
                 {/* Diary Controls */}
                 {activeTab === 'diary' && (
                    <div className="relative w-full max-w-[200px]">
                       <select
                         value={diaryYear}
                         onChange={(e) => setDiaryYear(parseInt(e.target.value))}
                         className="w-full bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 px-4 py-2 text-sm font-bold appearance-none outline-none focus:border-brand-yellow text-center"
                       >
                         {academyYears.map(year => (
                           <option key={year} value={year} className="bg-[#1A1D24] text-white">
                             {year}
                           </option>
                         ))}
                       </select>
                       <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                    </div>
                 )}

                 {/* Statistics Controls */}
                 {activeTab === 'physical' && (
                   <div className="flex items-center gap-3 w-full justify-center">
                     {/* View Toggle */}
                     <div className="flex bg-black/40 rounded-xl backdrop-blur-sm border border-white/10 p-1 items-center gap-1">
                       {(isAdmin || isCoach) && (
                           <button 
                             onClick={() => setIsManageMode(!isManageMode)}
                             className={`p-2 rounded-lg transition-all h-[36px] w-[36px] flex items-center justify-center ${isManageMode ? 'bg-brand-yellow text-black' : 'text-white/40 hover:text-white'}`}
                             title={t('manage_tests') || "Manage"}
                           >
                             <Settings size={18} />
                           </button>
                         )}
                       <button 
                         onClick={() => setStatsViewMode(statsViewMode === 'charts' ? 'table' : 'charts')}
                         className={`p-2 rounded-lg transition-all h-[36px] w-[36px] flex items-center justify-center ${statsViewMode === 'charts' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white'}`}
                         title={statsViewMode === 'charts' ? (t('show_table') || 'Table') : (t('show_charts') || 'Charts')}
                       >
                         {statsViewMode === 'charts' ? <Table size={18} /> : <TrendingUp size={18} />}
                       </button>
                     </div>
                     {/* Date Filters - Only visible in Table mode */}
                     {statsViewMode === 'table' && (
                       <div className="flex items-center gap-2">
                         {/* Year Selector */}
                         <div className="relative flex-1 max-w-[100px]">
                           <select
                             value={statsYear}
                             onChange={(e) => setStatsYear(parseInt(e.target.value))}
                             className="w-full bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-8 py-2 text-sm font-bold appearance-none outline-none focus:border-brand-yellow"
                           >
                             {academyYears.map(year => (
                               <option key={year} value={year} className="bg-[#1A1D24] text-white">
                                 {year}
                               </option>
                             ))}
                           </select>
                           <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                         </div>
                         {/* Quarter Selector */}
                         <div className="relative flex-1 max-w-[100px]">
                           <select
                             value={statsQuarter}
                             onChange={(e) => {
                               setStatsQuarter(parseInt(e.target.value));
                               setStatsMonth(0); // Reset month when quarter changes
                             }}
                             className="w-full bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-8 py-2 text-sm font-bold appearance-none outline-none focus:border-brand-yellow"
                           >
                             <option value={0} className="bg-[#1A1D24] text-white">{t('all') || 'Все'}</option>
                             <option value={1} className="bg-[#1A1D24] text-white">{t('q1') || 'Q1'}</option>
                             <option value={2} className="bg-[#1A1D24] text-white">{t('q2') || 'Q2'}</option>
                             <option value={3} className="bg-[#1A1D24] text-white">{t('q3') || 'Q3'}</option>
                             <option value={4} className="bg-[#1A1D24] text-white">{t('q4') || 'Q4'}</option>
                           </select>
                           <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                         </div>
                         {/* Month Selector - only show when quarter is not selected */}
                         {statsQuarter === 0 && (
                           <div className="relative flex-1 max-w-[100px]">
                             <select
                               value={statsMonth}
                               onChange={(e) => setStatsMonth(parseInt(e.target.value))}
                               className="w-full bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-8 py-2 text-sm font-bold appearance-none outline-none focus:border-brand-yellow"
                             >
                               <option value={0} className="bg-[#1A1D24] text-white">{t('all_months') || 'Все месяцы'}</option>
                               {monthNames.map((month, index) => (
                                 <option key={index + 1} value={index + 1} className="bg-[#1A1D24] text-white">
                                   {month.slice(0, 3)}
                                 </option>
                               ))}
                             </select>
                             <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                           </div>
                         )}
                       </div>
                     )}
                   </div>
                 )}

                 {/* Attendance Controls */}
                 {activeTab === 'attendance' && (
                   <div className="flex items-center gap-3 w-full justify-center">
                      {/* Month Navigation */}
                      <div className="flex items-center gap-2 bg-black/40 rounded-xl backdrop-blur-sm border border-white/10 p-1">
                         <button 
                           onClick={() => setAttendanceDate(new Date(attendanceDate.getFullYear(), attendanceDate.getMonth() - 1, 1))}
                           className="p-2 hover:bg-white/10 rounded-lg text-white transition"
                         >
                           <ChevronLeft size={18} />
                         </button>
                         <span className="text-sm font-bold text-white min-w-[80px] text-center capitalize">
                            {attendanceDate.toLocaleDateString(t('locale') || 'ru-RU', { month: 'long' })}
                         </span>
                         <button 
                           onClick={() => setAttendanceDate(new Date(attendanceDate.getFullYear(), attendanceDate.getMonth() + 1, 1))}
                           className="p-2 hover:bg-white/10 rounded-lg text-white transition"
                         >
                           <ChevronRight size={18} />
                         </button>
                      </div>

                      {/* Year Selector */}
                      <div className="relative max-w-[100px]">
                         <select
                            value={attendanceDate.getFullYear()}
                            onChange={(e) => setAttendanceDate(new Date(parseInt(e.target.value), attendanceDate.getMonth(), 1))}
                            className="w-full bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-8 py-2 text-sm font-bold appearance-none outline-none focus:border-brand-yellow"
                          >
                            {academyYears.map(year => (
                              <option key={year} value={year} className="bg-[#1A1D24] text-white">
                                {year}
                              </option>
                            ))}
                          </select>
                         <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                      </div>
                   </div>
                 )}
              </div>
            </div>

            {/* Desktop Close Button */}
            <div className="hidden lg:flex absolute top-6 right-6 z-50 gap-2 items-center">
              <button 
                onClick={onClose} 
                className="p-2 bg-black/40 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-all backdrop-blur-sm border border-white/5 hover:scale-110 active:scale-95 no-export"
              >
                <X size={24} />
              </button>
            </div>
            
            
            {/* Desktop Export Buttons */}
            <div className="hidden lg:flex absolute top-6 right-24 z-50 gap-2 no-export">

              {/* Desktop Diary Controls */}
              {activeTab === 'diary' && (
                  <div className="relative mr-2">
                     <select
                       value={diaryYear}
                       onChange={(e) => setDiaryYear(parseInt(e.target.value))}
                       className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-7 py-2 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-[42px]"
                     >
                       {academyYears.map(year => (
                         <option key={year} value={year} className="bg-[#1A1D24] text-white">
                           {year}
                         </option>
                       ))}
                     </select>
                     <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                  </div>
              )}

              {/* Desktop Statistics Controls */}
              {activeTab === 'physical' && (
                <div className="flex items-center gap-2 mr-2">
                   {/* View Toggle */}
                   <div className="flex bg-black/40 rounded-xl backdrop-blur-sm border border-white/10 p-1 h-[42px] items-center gap-1">
                     {(isAdmin || isCoach) && (
                        <button 
                          onClick={() => setIsManageMode(!isManageMode)}
                          className={`p-1.5 rounded-lg transition-all h-[32px] w-[32px] flex items-center justify-center ${isManageMode ? 'bg-brand-yellow text-black' : 'text-white/40 hover:text-white'}`}
                          title={t('manage_tests') || "Manage"}
                        >
                          <Settings size={16} />
                        </button>
                      )}
                     <button 
                       onClick={() => setStatsViewMode(statsViewMode === 'charts' ? 'table' : 'charts')}
                       className={`p-1.5 rounded-lg transition-all h-[32px] w-[32px] flex items-center justify-center ${statsViewMode === 'charts' ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white'}`}
                       title={statsViewMode === 'charts' ? (t('show_table') || 'Table') : (t('show_charts') || 'Charts')}
                     >
                       {statsViewMode === 'charts' ? <Table size={16} /> : <TrendingUp size={16} />}
                     </button>
                   </div>
                   
                   {/* Date Filters - Only visible in Table mode */}
                   {statsViewMode === 'table' && (
                     <div className="flex items-center gap-2">
                       {/* Year Selector */}
                       <div className="relative">
                         <select
                           value={statsYear}
                           onChange={(e) => setStatsYear(parseInt(e.target.value))}
                           className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-7 py-2 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-[42px]"
                         >
                           {academyYears.map(year => (
                             <option key={year} value={year} className="bg-[#1A1D24] text-white">
                               {year}
                             </option>
                           ))}
                         </select>
                         <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                       </div>
                       {/* Quarter Selector */}
                        <div className="relative">
                           <select
                             value={statsQuarter}
                             onChange={(e) => setStatsQuarter(parseInt(e.target.value))}
                             className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-7 py-2 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-[42px]"
                           >
                             <option value={0} className="bg-[#1A1D24] text-white">{t('all_quarters') || 'Все кварталы'}</option>
                             <option value={1} className="bg-[#1A1D24] text-white">Q1</option>
                             <option value={2} className="bg-[#1A1D24] text-white">Q2</option>
                             <option value={3} className="bg-[#1A1D24] text-white">Q3</option>
                             <option value={4} className="bg-[#1A1D24] text-white">Q4</option>
                           </select>
                           <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                        </div>
                       
                        {/* Month Selector */}
                        <div className="relative">
                           <select
                             value={statsMonth}
                             onChange={(e) => setStatsMonth(parseInt(e.target.value))}
                             className="bg-black/40 text-white rounded-xl backdrop-blur-sm border border-white/10 pl-3 pr-7 py-2 text-xs font-bold appearance-none outline-none focus:border-brand-yellow h-[42px] max-w-[120px]"
                           >
                             <option value={0} className="bg-[#1A1D24] text-white">{t('all_months') || 'Все месяцы'}</option>
                             {monthNames.map((name, i) => (
                               <option key={i} value={i + 1} className="bg-[#1A1D24] text-white">
                                 {name}
                               </option>
                             ))}
                           </select>
                           <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 pointer-events-none" />
                        </div>
                     </div>
                   )}
                </div>
              )}

              <div className="relative">
                 <button
                   onClick={() => setShowMenu(!showMenu)}
                   className="p-2 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition"
                 >
                   <Menu size={24} />
                 </button>
                 
                 {showMenu && (
                   <div className="absolute top-12 right-0 bg-[#1A1D24] border border-white/10 rounded-xl p-2 min-w-[200px] shadow-xl flex flex-col gap-1 z-50 max-h-[60vh] overflow-y-auto custom-scrollbar">
                      {/* Navigation Links */}
                      <button onClick={() => { setActiveTab('profile'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'profile' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                      <User size={16} /> {t('profile')}
                    </button>
                    {/* Skills tab removed */}
                    <button onClick={() => { setActiveTab('diary'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'diary' ? 'bg-brand-yellow/10 text-brand-yellow' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                      <FileText size={16} /> {t('diary') || 'Дневник'}
                    </button>
                      <button onClick={() => { setActiveTab('physical'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'physical' ? 'bg-brand-yellow/10 text-brand-yellow' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                        <Activity size={16} /> {t('statistics') || 'Stats'}
                      </button>
                      <button onClick={() => { setActiveTab('attendance'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'attendance' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                        <Calendar size={16} /> {t('attendance') || 'Att.'}
                      </button>
                      <button onClick={() => { setActiveTab('medical'); setShowMenu(false); }} className={`flex items-center gap-2 px-4 py-3 text-sm rounded-lg text-left ${activeTab === 'medical' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
                        <Activity size={16} /> {t('medical') || 'Med'}
                      </button>
                      <div className="h-px bg-white/10 my-1"></div>

                      {isAdmin && (
                        <button 
                          onClick={() => { handleOpenInvoiceModal(); setShowMenu(false); }}
                          className="flex items-center gap-2 px-4 py-3 text-sm text-purple-400 hover:bg-white/5 rounded-lg text-left"
                        >
                          <CreditCard size={16} /> {t('create_invoice_btn') || 'Выставить счет'}
                        </button>
                      )}

                      {(isAdmin || isCoach) && (
                        <button 
                          onClick={() => { setIsEditingProfile(true); setShowMenu(false); }}
                          className="flex items-center gap-2 px-4 py-3 text-sm text-white hover:bg-white/5 rounded-lg text-left"
                        >
                          <Edit2 size={16} /> {t('edit_profile') || 'Редактировать профиль'}
                        </button>
                      )}
                      <button 
                        onClick={() => { handleExport('excel'); setShowMenu(false); }}
                        className="flex items-center gap-2 px-4 py-3 text-sm text-green-400 hover:bg-white/5 rounded-lg text-left"
                      >
                        <FileText size={16} /> Export Excel
                      </button>
                      <button 
                        onClick={() => { handleExport('pdf'); setShowMenu(false); }}
                        className="flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-white/5 rounded-lg text-left"
                      >
                        <FileText size={16} /> Export PDF
                      </button>
                   </div>
                 )}
              </div>
            </div>

          {/* Dynamic Header - Optimized for Mobile Landscape */}
          <div className={`relative shrink-0 bg-[#1A1D24] border-b border-white/5 shadow-lg z-10 transition-all duration-300 ${shouldShowHeader ? 'flex flex-col' : 'hidden lg:flex flex-col'} ${!shouldShowHeader ? 'lg:pl-32' : ''}`}>
            
            {/* Upper Header: Avatar + Info */}
            <div className={`flex flex-row items-center gap-4 p-3 lg:p-6 pb-2 lg:pb-6 transition-all duration-300 ${activeTab === 'profile' ? 'pl-24 landscape:pl-56 lg:pl-6' : ''}`}>
              {/* Avatar Section - Hidden in Mobile Portrait when in Profile tab to save space */}
              <div className={`relative group shrink-0 ${activeTab === 'profile' ? 'hidden sm:block' : ''}`}>
                <div className={`w-14 h-14 lg:w-24 lg:h-24 rounded-full p-[2px] shadow-lg cursor-pointer ${
                  isBirthday 
                    ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 animate-pulse shadow-purple-500/50 ring-2 ring-pink-400 ring-offset-2 ring-offset-[#1A1D24]'
                    : (student.past_debts?.length > 0 || student.monthly_balance < 0) 
                      ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/20' 
                      : 'bg-gradient-to-br from-brand-yellow to-yellow-600 shadow-yellow-500/20'
                }`} onClick={() => setShowFullAvatar(true)}>
                   <UserAvatar 
                     user={student} 
                     size="w-full h-full" 
                     className="rounded-full"
                   >
                     {/* Upload Overlay */}
                     {(isAdmin || isCoach || isParent) && (
                        <div 
                          className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Camera className="text-white" size={20} />
                        </div>
                     )}
                   </UserAvatar>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden" 
                  accept="image/*"
                  onChange={handleAvatarUpload}
                />
                {uploadingAvatar && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                )}
                
                {/* Birthday Cake Emoji */}
                {isBirthday && (
                   <div className="absolute -top-2 -right-2 z-30 animate-bounce" title={t('birthday_today') || 'С Днем Рождения!'}>
                      <span className="text-3xl drop-shadow-lg filter">🎂</span>
                   </div>
                )}
                
                {/* Stars Badge - Added for PlayerCard */}
                {(student.stars > 0) && (
                   <div className="absolute -bottom-1 -left-1 z-20" title={`${t('stars') || 'Звезды'}: ${student.stars}`}>
                      {student.stars <= 3 ? (
                         <div className="flex -space-x-1.5 lg:-space-x-2">
                            {[...Array(student.stars)].map((_, i) => (
                               <div key={i} className="w-5 h-5 lg:w-8 lg:h-8 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-[#1A1D24] shadow-sm">
                                  <Star className="w-3 h-3 lg:w-4 lg:h-4 text-black fill-black" />
                               </div>
                            ))}
                         </div>
                      ) : (
                         <div className="w-6 h-6 lg:w-9 lg:h-9 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-full flex items-center justify-center border-2 border-[#1A1D24] shadow-lg shadow-yellow-500/20">
                            <span className="text-[10px] lg:text-sm font-black text-black">{student.stars}</span>
                         </div>
                      )}
                   </div>
                )}
              </div>

              {/* Info Section */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                {/* Mobile Portrait: Centered Name */}
                <h2 className={`text-lg lg:text-3xl font-black text-white uppercase tracking-tight leading-none mb-1.5 lg:mb-2 truncate ${activeTab === 'profile' ? 'text-center pr-12 lg:text-left lg:pr-0' : ''}`}>
                  {transliterate(student.first_name, language)} <span className="text-brand-yellow">{transliterate(student.last_name, language)}</span>
                </h2>
                
                {/* Frozen Status Badge */}
                {(student.is_frozen || student.status === 'frozen') && (
                   <div className={`flex items-center gap-2 mb-2 ${activeTab === 'profile' ? 'justify-center lg:justify-start' : 'justify-start'}`}>
                      <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-lg text-xs font-bold uppercase flex items-center gap-2 animate-pulse">
                         <Snowflake size={14} />
                         {t('student_frozen') || 'Заморожен'}
                         {student.freeze_until && <span className="text-white/60">до {student.freeze_until}</span>}
                      </span>
                   </div>
                )}
                <div className={`flex flex-wrap items-center gap-2 text-xs lg:text-sm font-medium ${activeTab === 'profile' ? 'hidden sm:flex' : ''}`}>
                  {/* Call Button */}
                  {(student.parent_phone || student.guardians?.[0]?.user?.phone) && (
                    <a 
                      href={`tel:${student.parent_phone || student.guardians?.[0]?.user?.phone}`}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors"
                      title={t('call_parent') || 'Позвонить'}
                    >
                      <Phone size={12} />
                      <span className="hidden sm:inline">{student.parent_phone || student.guardians?.[0]?.user?.phone}</span>
                    </a>
                  )}

                  {/* Group Badge */}
                  <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded border border-white/5 text-white/80">
                    <Users size={12} className="text-brand-yellow" />
                    {changingGroup ? (
                      <select 
                        value={student.group_id || ''}
                        onChange={(e) => handleGroupChange(e.target.value)}
                        className="bg-transparent text-white focus:outline-none cursor-pointer text-xs"
                      >
                        {groups.map(g => (
                          <option key={g.id} value={g.id} className="text-black">{g.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-1 cursor-pointer group/edit" onClick={() => (isAdmin || isCoach) && setChangingGroup(true)}>
                        <span className="truncate max-w-[80px] lg:max-w-none">{student.group?.name || student.group_name || t('no_group')}</span>
                        {(isAdmin || isCoach) && <Edit2 size={10} className="opacity-0 group-hover/edit:opacity-100 transition-opacity text-white/50" />}
                      </div>
                    )}
                  </div>
                  
                  {/* Age Badge */}
                  <div className="hidden sm:flex items-center gap-1 bg-white/5 px-2 py-1 rounded border border-white/5 text-white/80">
                    <Calendar size={12} className="text-blue-400" />
                    <span>{calculateAge(student.dob) || student.age} {t('years')}</span>
                  </div>

                  {/* Status Badge */}
                  <div className={`flex items-center gap-1 px-2 py-1 rounded border ${student.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${student.status === 'active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="capitalize">{t(student.status) || student.status}</span>
                  </div>

                  {/* Pending Invoices (New System) */}
                  {!isCoach && (
                    <>
                      {pendingInvoices?.invoices?.length > 0 ? (
                        pendingInvoices.invoices.map((inv) => (
                            <div key={`inv-${inv.id}`} className="flex items-center gap-1 px-2 py-1 rounded border bg-red-500/10 border-red-500/20 text-red-400 animate-pulse cursor-help" title={`${inv.description} (${new Date(inv.payment_period).toLocaleDateString()})`}>
                              <AlertCircle size={12} />
                              <span className="whitespace-nowrap">{inv.amount} MDL</span>
                            </div>
                        ))
                      ) : (
                        /* Fallback to old system */
                        student.past_debts && student.past_debts.length > 0 && student.past_debts.map((debt, idx) => (
                            <div key={`debt-header-${idx}`} className="flex items-center gap-1 px-2 py-1 rounded border bg-red-500/10 border-red-500/20 text-red-400 animate-pulse" title={`Долг за ${debt.name} ${debt.year}`}>
                              <AlertCircle size={12} />
                              <span>{debt.name}</span>
                            </div>
                        ))
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Lower Header: Tabs (Mobile Only, Portrait Only) - HIDDEN as requested */}
            {/* <div className="w-full px-3 lg:px-6 pb-3 lg:pb-6 overflow-x-auto custom-scrollbar sm:hidden">
              <div className="flex bg-black/20 p-1 rounded-xl min-w-max">
                 <button 
                   onClick={() => setActiveTab('profile')}
                   className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'profile' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
                 >
                   {t('profile')}
                 </button>
                 <button 
                   onClick={() => setActiveTab('diary')}
                   className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'diary' ? 'bg-brand-yellow text-black shadow-lg shadow-yellow-500/20' : 'text-white/40 hover:text-white'}`}
                 >
                   {t('diary') || 'Дневник'}
                 </button>
                 <button 
                   onClick={() => setActiveTab('physical')}
                   className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'physical' ? 'bg-brand-yellow text-black shadow-lg shadow-yellow-500/20' : 'text-white/40 hover:text-white'}`}
                 >
                   {t('statistics') || 'Stats'}
                 </button>
                 <button 
                   onClick={() => setActiveTab('attendance')}
                   className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'attendance' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
                 >
                   {t('attendance') || 'Att.'}
                 </button>
                 <button 
                   onClick={() => setActiveTab('medical')}
                   className={`px-3 lg:px-4 py-1.5 lg:py-2 rounded-lg text-xs lg:text-sm font-bold transition-all whitespace-nowrap shrink-0 ${activeTab === 'medical' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white'}`}
                 >
                   {t('medical') || 'Med'}
                 </button>
              </div>
            </div> */}
          </div>


          {/* Content Area */}
          <div className="flex flex-col flex-1 min-h-0 pb-20 lg:pb-0">
            {/* Tab Panels */}
            <div className={`flex-1 custom-scrollbar p-4 lg:p-8 flex flex-col overflow-y-auto ${
              (activeTab === 'diary' || activeTab === 'physical' || activeTab === 'attendance') ? 'pt-2 sm:pt-4 lg:pt-8' : 'pt-4 lg:pt-8'
            }`}>
              <AnimatePresence mode='wait'>
                {activeTab === 'profile' && (
                  <motion.div 
                    key="profile"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="grid grid-cols-1 md:grid-cols-12 gap-8"
                  >
                    {/* Left Column: Stats */}
                    <div className="md:col-span-8 space-y-8">
                      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div className="flex items-center gap-4 w-full md:w-auto">
                          {/* Avatar for Mobile Portrait */}
                          <div className="sm:hidden shrink-0 relative">
                             <UserAvatar 
                               user={student} 
                               size="w-16 h-16" 
                               className={`rounded-full shadow-lg ${
                                isBirthday
                                  ? 'border-2 border-pink-500 ring-2 ring-purple-500 animate-pulse'
                                  : (student.past_debts?.length > 0 || student.monthly_balance < 0)
                                    ? 'border-2 border-red-500' 
                                    : 'border-2 border-white/10'
                              }`}
                               onClick={() => {
                                 if (student.avatar_url) {
                                   setShowFullAvatar(true);
                                 } else {
                                   if (isAdmin || isCoach || isParent) {
                                     fileInputRef.current?.click();
                                   }
                                 }
                               }}
                             >
                               {(isAdmin || isCoach || isParent) && (
                                  <div 
                                    className="absolute bottom-0 right-0 p-1.5 bg-brand-yellow text-black rounded-full border-2 border-[#1A1D24] shadow-sm z-10"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fileInputRef.current?.click();
                                    }}
                                  >
                                    <Camera size={12} />
                                  </div>
                                )}
                             </UserAvatar>
                          </div>
                          
                          <h3 className="text-2xl font-bold text-brand-yellow flex-1 text-center md:text-left md:flex-none">
                            {t('football_profile')}
                          </h3>
                        </div>

                        <div className="flex flex-col md:flex-row flex-wrap gap-2 w-full md:w-auto">
                            {/* Approve Freeze Button */}
                            {isAdmin && pendingFreezeRequest && (
                                <>
                                    {isProcessingFreeze ? (
                                      <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                        <Loader2 size={16} className="animate-spin" />
                                        {t('processing') || 'Обработка...'}
                                      </div>
                                    ) : (
                                      <>
                                        <button
                                            onClick={handleApproveFreeze}
                                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-all animate-pulse w-full md:w-auto"
                                        >
                                            <CheckCircle size={16} />
                                            {t('approve_freeze') || 'Подтвердить'}
                                        </button>
                                        <button
                                            onClick={handleRejectFreeze}
                                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all w-full md:w-auto"
                                        >
                                            <XCircle size={16} />
                                            {t('reject') || 'Отклонить'}
                                        </button>
                                        <button
                                            onClick={handleDeleteFreezeRequest}
                                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20 hover:bg-gray-500/20 transition-all w-full md:w-auto"
                                            title={t('delete_request') || 'Удалить заявку'}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                      </>
                                    )}
                                </>
                            )}

                            {/* Parent Cancel Freeze Button */}
                            {isParent && pendingFreezeRequest && (
                                <div className="flex items-center justify-between gap-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-2 w-full md:w-auto">
                                    <div className="flex flex-col">
                                        <span className="text-yellow-400 text-xs font-bold uppercase">{t('freeze_requested') || 'Заявка на заморозку'}</span>
                                        <span className="text-white/60 text-xs">{t('until') || 'до'}: {pendingFreezeRequest.end_date}</span>
                                    </div>
                                    <button
                                        onClick={handleDeleteFreezeRequest}
                                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                                        title={t('cancel_request') || 'Отменить заявку'}
                                        disabled={isProcessingFreeze}
                                    >
                                        {isProcessingFreeze ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                                    </button>
                                </div>
                            )}

                            {/* Freeze Button */}
                            {(isAdmin || isParent) && student.status !== 'frozen' && !pendingFreezeRequest && (
                                <button
                                    onClick={() => setShowFreezeModal(true)}
                                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-all w-full md:w-auto"
                                >
                                    <Clock size={16} />
                                    {isAdmin ? t('freeze') : t('request_freeze')}
                                </button>
                            )}
                            
                            {/* Pending Request Indicator for Parent */}
                            {isParent && pendingFreezeRequest && (
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                                    <Clock size={16} />
                                    {t('freeze_pending')}
                                </div>
                            )}

                            {isAdmin && student.status === 'frozen' && (
                                <button
                                    onClick={handleUnfreeze}
                                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-all w-full md:w-auto"
                                >
                                    <CheckCircle size={16} />
                                    {t('unfreeze') || 'Разморозить'}
                                </button>
                            )}

                            {(isAdmin || isCoach || isParent) && (
                              <button 
                                onClick={() => isEditingProfile ? handleSaveProfile() : setIsEditingProfile(true)}
                                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all w-full md:w-auto ${
                                  isEditingProfile 
                                    ? 'bg-brand-yellow text-black shadow-lg shadow-yellow-500/20' 
                                    : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'
                                }`}
                              >
                                {isEditingProfile ? <Save size={16} /> : <Edit2 size={16} />}
                                {isEditingProfile ? t('save') : t('edit')}
                              </button>
                            )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <StatCard 
                          icon={MapPin} 
                          label={t('position')} 
                          value={profileData.position} 
                          isEditing={isEditingProfile} 
                          onChange={(v) => setProfileData({...profileData, position: v})}
                          type="select"
                          options={[
                            t('goalkeeper') || 'Goalkeeper',
                            t('defender') || 'Defender',
                            t('midfielder') || 'Midfielder',
                            t('forward') || 'Forward'
                          ]}
                        />
                        <StatCard 
                          icon={Activity} 
                          label={t('dominant_foot')} 
                          value={profileData.dominant_foot} 
                          isEditing={isEditingProfile} 
                          onChange={(v) => setProfileData({...profileData, dominant_foot: v})}
                          type="select"
                          options={[
                            t('right') || 'Right', 
                            t('left') || 'Left', 
                            t('both') || 'Both'
                          ]}
                        />
                        <StatCard 
                          icon={Ruler} 
                          label={t('height')} 
                          value={profileData.height} 
                          suffix="cm"
                          isEditing={isEditingProfile} 
                          onChange={(v) => setProfileData({...profileData, height: v})}
                          type="number"
                        />
                        <StatCard 
                          icon={Weight} 
                          label={t('weight')} 
                          value={profileData.weight} 
                          suffix="kg"
                          isEditing={isEditingProfile} 
                          onChange={(v) => setProfileData({...profileData, weight: v})}
                          type="number"
                        />
                        {/* <StatCard 
                          icon={User} 
                          label={t('tshirt_size')} 
                          value={profileData.tshirt_size} 
                          isEditing={isEditingProfile} 
                          onChange={(v) => setProfileData({...profileData, tshirt_size: v})}
                        />
                        <StatCard 
                          icon={Ruler} 
                          label={t('shoe_size') || 'Shoe Size'} 
                          value={profileData.shoe_size} 
                          isEditing={isEditingProfile} 
                          onChange={(v) => setProfileData({...profileData, shoe_size: v})}
                        /> */}
                      </div>
                    </div>

                    {/* Right Column: Notes & History */}
                <div className="md:col-span-4 space-y-6">
                   {/* Notes */}
                   <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                      <h3 className="text-xl font-bold text-brand-yellow mb-4 flex items-center gap-2">
                        <FileText className="text-brand-yellow" />
                        {t('notes')}
                      </h3>
                      <textarea 
                        value={profileData.notes}
                        onChange={(e) => setProfileData({...profileData, notes: e.target.value})}
                        disabled={!isEditingProfile}
                        className="w-full h-64 bg-black/20 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-brand-yellow/50 disabled:opacity-70 resize-none transition-all"
                        placeholder={t('add_notes')}
                      />
                   </div>

                   {/* Group History */}
                   {groupHistory.length > 0 && (
                     <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                        <h3 className="text-xl font-bold text-brand-yellow mb-4 flex items-center gap-2">
                          <History size={20} className="text-brand-yellow" />
                          {t('transfer_history') || 'История перемещений'}
                        </h3>
                        <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                          {groupHistory.map((h, idx) => (
                            <div key={idx} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                              <div>
                                <div className="text-white font-medium">{h.group_name}</div>
                                <div className="text-xs text-gray-400">
                                  {new Date(h.joined_at).toLocaleDateString()} - {h.left_at ? new Date(h.left_at).toLocaleDateString() : (t('present') || 'по н.в.')}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                     </div>
                   )}
                </div>
              </motion.div>
            )}

            {/* Skills tab removed */}

            {activeTab === 'diary' && (
              <motion.div 
                key="diary"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="min-h-full flex flex-col"
              >
                <AcademicDiary 
                  ref={diaryRef}
                  studentId={studentId}
                  isCoach={isCoach}
                  isAdmin={isAdmin}
                  isParent={isParent}
                  t={t}
                  hideEvaluation={false}
                  selectedYear={diaryYear}
                  onYearChange={setDiaryYear}
                  hideHeaderOnMobile={true}
                  className="flex-1"
                />
              </motion.div>
            )}

            {activeTab === 'physical' && (
                <motion.div 
                  key="physical"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="min-h-full flex flex-col"
                >
                  <PhysicalStatsTab 
                    ref={statsRef}
                    studentId={studentId}
                    studentAdmissionYear={student?.created_at}
                    studentDOB={student?.dob || student?.birth_date}
                    t={t}
                    onUpdate={fetchData}
                    selectedYear={dStatsYear}
                    selectedQuarter={dStatsQuarter}
                    selectedMonth={dStatsMonth}
                  onYearChange={setStatsYear}
                  hideHeaderOnMobile={true}
                  isManageMode={isManageMode}
                  onManageModeChange={setIsManageMode}
                  showCharts={statsViewMode === 'charts'}
                />
              </motion.div>
            )}

                {activeTab === 'attendance' && (
                  <motion.div 
                    key="attendance"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="min-h-full flex flex-col"
                  >
                     {/* View Toggle REMOVED */}

                     {attendanceView === 'sheet' ? (
                       <div className="flex-1 min-h-0">
                         <StudentAttendanceReport 
                           ref={attendanceRef}
                           studentId={studentId} 
                           studentName={`${student.first_name} ${student.last_name}`}
                           groupName={student.group?.name || student.group_name}
                           t={t} 
                           currentDate={attendanceDate}
                           onDateChange={setAttendanceDate}
                           viewMode={attendanceViewMode}
                           onViewModeChange={setAttendanceViewMode}
                           hideHeaderOnMobile={true}
                         />
                       </div>
                     ) : (
                       attendanceStats ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full overflow-y-auto custom-scrollbar">
                           {/* Stats Cards */}
                           <div className="space-y-6">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl flex flex-col items-center justify-center">
                                  <div className="text-4xl font-bold text-emerald-400 mb-2">{attendanceStats.attendance_percentage}%</div>
                                  <div className="text-sm text-gray-400 uppercase tracking-wider font-bold">{t('attendance_rate') || 'Attendance Rate'}</div>
                                </div>
                                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl flex flex-col items-center justify-center">
                                  <div className="text-4xl font-bold text-white mb-2">{attendanceStats.total_attended}/{attendanceStats.total_trainings}</div>
                                  <div className="text-sm text-gray-400 uppercase tracking-wider font-bold">{t('visited')}</div>
                                </div>
                              </div>
                              
                              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                                <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                                  <Clock size={18} className="text-blue-400" />
                                  {t('recent_activity')}
                                </h4>
                                <div className="space-y-3">
                                  {attendanceStats.recent_history?.map((record, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-black/20 rounded-xl border border-white/5">
                                      <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${record.status === 'present' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                        <span className="text-gray-300">{new Date(record.date).toLocaleDateString()}</span>
                                      </div>
                                      <span className={`text-sm font-bold ${record.status === 'present' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {record.status === 'present' ? (t('present') || 'Present') : (t('absent') || 'Absent')}
                                      </span>
                                    </div>
                                  ))}
                                  {(!attendanceStats.recent_history || attendanceStats.recent_history.length === 0) && (
                                    <div className="text-center text-gray-500 py-4">{t('no_data') || 'No data'}</div>
                                  )}
                                </div>
                              </div>
                           </div>

                           {/* Chart */}
                           <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col">
                              <h4 className="text-white font-bold mb-6">{t('monthly_attendance')}</h4>
                              <div className="flex-1 w-full min-h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={attendanceStats.monthly_breakdown || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                    <XAxis dataKey="month" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip 
                                      contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid #ffffff20', borderRadius: '8px' }}
                                      cursor={{ fill: '#ffffff05' }}
                                    />
                                    <Bar dataKey="attended" fill="#10B981" radius={[4, 4, 0, 0]} name={t('attended')} />
                                    <Bar dataKey="missed" fill="#EF4444" radius={[4, 4, 0, 0]} name={t('missed')} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                           </div>
                         </div>
                       ) : (
                         <div className="flex items-center justify-center h-full text-white/30">
                           <div className="animate-pulse">{t('loading_stats')}</div>
                         </div>
                       )
                     )}
                  </motion.div>
                )}

                {activeTab === 'medical' && (
                  <motion.div key="medical" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <MedicalCertificate student={student} onUpdate={fetchData} t={t} hideHeaderOnMobile={true} />
                  </motion.div>
                )}
                
                {/* Payments tab completely removed */}
              </AnimatePresence>
            </div>
          </div>

          {/* Mobile Bottom Navigation (Parent Only) */}
          {isParent && (
            <nav className="absolute bottom-4 left-4 right-4 bg-[#15171B]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.5)] z-[10000] lg:hidden landscape-hidden overflow-hidden ring-1 ring-white/5">
              <div className="flex items-center h-[72px] px-2 overflow-x-auto gap-2 no-scrollbar scroll-smooth justify-around">
                {menuItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      `flex flex-col items-center justify-center gap-0.5 min-w-[68px] h-[60px] rounded-xl transition-all duration-300 active:scale-95 flex-shrink-0 relative ${
                        isActive
                          ? 'text-yellow-400'
                          : 'text-gray-500 hover:text-gray-300'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <div className="absolute inset-0 bg-yellow-500/10 rounded-xl border border-yellow-500/20 shadow-[inset_0_0_12px_rgba(234,179,8,0.1)]" />
                        )}
                        
                        <div className={`relative z-10 p-1 transition-all duration-300 ${
                          isActive 
                            ? 'text-yellow-400 transform -translate-y-0.5 scale-110 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]' 
                            : ''
                        }`}>
                          <span className="text-2xl block h-7 w-7 flex items-center justify-center">{item.icon}</span>
                        </div>
                        
                        <span className={`text-[10px] font-bold truncate max-w-[64px] relative z-10 transition-all duration-300 ${
                          isActive 
                            ? 'text-yellow-400 opacity-100' 
                            : 'opacity-70'
                        }`}>
                          {t(item.labelKey)}
                        </span>
                        
                        {isActive && (
                          <div className="absolute bottom-1 w-1 h-1 bg-yellow-400 rounded-full shadow-[0_0_6px_rgba(250,204,21,1)]" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </nav>
          )}

        </motion.div>
      </div>
    </motion.div>
      
      {showFreezeModal && (
        <FreezeRequestModal
            studentId={studentId}
            onClose={() => setShowFreezeModal(false)}
            onSuccess={() => {
                fetchData();
                // Optional: Show success message via state or just refresh
            }}
            isAdmin={isAdmin}
        />
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowInvoiceModal(false)}>
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">{t('invoice_individual_title') || 'Выставить счет ученику'}</h3>
              <button onClick={() => setShowInvoiceModal(false)} className="text-white/40 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleInvoiceSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">{t('period_label')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={parseInt(invoiceForm.period.split('-')[1])}
                    onChange={(e) => {
                       const year = invoiceForm.period.split('-')[0];
                       const month = String(e.target.value).padStart(2, '0');
                       setInvoiceForm({...invoiceForm, period: `${year}-${month}`});
                    }}
                    className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50 appearance-none"
                  >
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                        const date = new Date(2000, m - 1, 1);
                        const monthName = date.toLocaleDateString(language === 'ru' ? 'ru-RU' : (language === 'ro' ? 'ro-RO' : 'en-US'), { month: 'long' });
                        return <option key={m} value={m} className="capitalize">{monthName}</option>;
                    })}
                  </select>
                  <select
                    value={parseInt(invoiceForm.period.split('-')[0])}
                    onChange={(e) => {
                       const month = invoiceForm.period.split('-')[1];
                       setInvoiceForm({...invoiceForm, period: `${e.target.value}-${month}`});
                    }}
                    className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50 appearance-none"
                  >
                    {academyYears.map(year => (
                        <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">{t('payment_type') || 'Тип платежа'}</label>
                <select
                  value={invoiceForm.paymentType}
                  onChange={(e) => setInvoiceForm({...invoiceForm, paymentType: e.target.value})}
                  className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                >
                  <option value="subscription">{t('type_subscription') || 'Абонемент'}</option>
                  <option value="individual">{t('type_individual') || 'Индивидуальные тренировки'}</option>
                  <option value="equipment">{t('type_equipment') || 'Покупка экипировки'}</option>
                  <option value="other">{t('type_other') || 'Прочее'}</option>
                </select>
              </div>

              {(invoiceForm.paymentType === 'equipment' || invoiceForm.paymentType === 'other') && (
                <div>
                   <label className="block text-sm font-medium text-white/70 mb-2">
                     {invoiceForm.paymentType === 'equipment' ? (t('equipment_details') || 'Детали экипировки') : (t('description') || 'Описание')}
                   </label>
                   <input
                     type="text"
                     value={invoiceForm.customDescription}
                     onChange={(e) => setInvoiceForm({...invoiceForm, customDescription: e.target.value})}
                     placeholder={invoiceForm.paymentType === 'equipment' ? (t('equipment_placeholder') || 'Например: Форма, Гетры') : (t('description_placeholder') || 'Введите описание...')}
                     className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                   />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">{t('amount_label')}</label>
                <input
                  type="number"
                  required
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm({...invoiceForm, amount: e.target.value})}
                  className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                />
              </div>
              
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-colors font-bold"
                >
                  {t('create_invoice_btn') || 'Выставить счет'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

// Subcomponents
const TabButton = ({ id, icon: Icon, label, active, onClick }) => (
  <button
    onClick={() => onClick(id)}
    className={`
      flex items-center gap-2 px-6 py-4 relative transition-all duration-300
      ${active === id ? 'text-brand-yellow' : 'text-white/40 hover:text-white'}
    `}
  >
    <Icon size={18} />
    <span className="font-bold tracking-wide">{label}</span>
    {active === id && (
      <motion.div 
        layoutId="activeTab"
        className="absolute bottom-0 left-0 right-0 h-1 bg-brand-yellow rounded-t-full shadow-[0_0_10px_rgba(234,179,8,0.5)]"
      />
    )}
  </button>
);

const StatCard = ({ icon: Icon, label, value, suffix, isEditing, onChange, type = 'text', options }) => (
  <div className={`bg-white/5 border border-white/5 rounded-2xl p-5 flex items-start gap-4 transition-colors group ${isEditing ? 'hover:bg-white/10 ring-1 ring-white/5' : 'hover:bg-white/10'}`}>
    <div className="p-3 bg-black/30 rounded-xl text-white/60 group-hover:text-brand-yellow transition-colors">
      <Icon size={24} />
    </div>
    <div className="flex-1 min-w-0 relative">
      <p className="text-white/40 text-xs uppercase font-bold tracking-wider mb-1">{label}</p>
      {isEditing ? (
        type === 'select' ? (
          <div className="relative z-10">
            <select 
              value={value || ''} 
              onChange={(e) => onChange(e.target.value)}
              className="w-full bg-[#1A1D24] border border-white/20 rounded-lg px-3 py-2 text-white focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow outline-none appearance-none cursor-pointer font-medium"
            >
              <option value="" className="text-gray-500">Select...</option>
              {options && options.map((opt, idx) => (
                <option key={idx} value={opt}>{opt}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={16} />
          </div>
        ) : (
          <input 
            type={type} 
            value={value || ''} 
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-[#1A1D24] border border-white/20 rounded-lg px-3 py-2 text-white focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow outline-none font-bold relative z-10"
            placeholder={type === 'number' ? '0' : ''}
          />
        )
      ) : (
        <p className="text-xl font-bold text-white truncate">
          {value || <span className="text-white/20">-</span>} 
          {value && suffix && <span className="text-sm text-white/40 ml-1">{suffix}</span>}
        </p>
      )}
    </div>
  </div>
);

const ProfileField = ({ label, name, value, isEditing, onChange, type = "text", options }) => (
  <div className="flex flex-col gap-1">
    <span className="text-white/40 text-xs uppercase font-bold tracking-wider">{label}</span>
    {isEditing ? (
      type === 'select' ? (
        <select 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className="bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
        >
          <option value="">Select...</option>
          {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      ) : (
        <input 
          type={type} 
          value={value} 
          onChange={(e) => onChange(e.target.value)}
          className="bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-yellow-500"
        />
      )
    ) : (
      <span className="text-white font-medium text-lg border-b border-white/5 pb-1">{value || '-'}</span>
    )}
  </div>
);
