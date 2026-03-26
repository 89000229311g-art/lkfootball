import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { paymentsAPI, studentsAPI, groupsAPI, parentAPI } from '../api/client';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { Undo2, Search, CreditCard, Users, ChevronDown, Download, FileText, Loader2, Calendar, AlertCircle, Trash2, X, Check, Table, AlertTriangle, Edit, HelpCircle, Landmark } from 'lucide-react';
import { exportToExcel, getDateString, downloadBlob, loadFont } from '../utils/exportUtils';
import { getAcademyYears } from '../utils/dateUtils';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import PaymentMatrix from '../components/PaymentMatrix';
import Expenses from '../components/Expenses';
import CustomDatePicker from '../components/CustomDatePicker';

const FORCE_MANUAL_INVOICE = (import.meta.env.PROD || import.meta.env.VITE_INVOICE_FLOW === 'always') && import.meta.env.VITE_INVOICE_FLOW !== 'fallback';
const getInvoiceFlowMode = () => localStorage.getItem('invoiceFlowMode') || 'auto';
const shouldForceManual = () => {
  const mode = getInvoiceFlowMode();
  if (mode === 'always') return true;
  if (mode === 'fallback') return false;
  return FORCE_MANUAL_INVOICE;
};

export default function Payments() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isParent = user?.role?.toLowerCase() === 'parent';
  const isAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
  const isSuperAdmin = ['super_admin', 'owner'].includes(user?.role?.toLowerCase());

  const [searchParams] = useSearchParams();
  const academyYears = getAcademyYears();
  const [payments, setPayments] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showIndividualModal, setShowIndividualModal] = useState(false);
  const [periodStats, setPeriodStats] = useState(null);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'quick'); // 'quick', 'pending', 'completed', 'all', 'matrix'
  const [deleteModal, setDeleteModal] = useState({ show: false, paymentId: null });
  
  // Edit State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPaymentId, setEditPaymentId] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editPeriod, setEditPeriod] = useState('');

  // Payment Details (for Parents)
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [paymentTab, setPaymentTab] = useState('qr'); // 'qr', 'requisites'
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState('');

  // Fetch Payment Info for Parents
  useEffect(() => {
    if (isParent) {
      const fetchPaymentInfo = async () => {
        try {
          const response = await paymentsAPI.getPaymentInfo();
          setPaymentInfo(response.data);
          if (response.data?.payment_qr_url) {
            setPaymentTab('qr');
          } else {
            setPaymentTab('requisites');
          }
        } catch (error) {
          console.error("Failed to load payment info:", error);
        }
      };
      fetchPaymentInfo();
    }
  }, [isParent]);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
      setUploadError('');
    }
  };

  const handleUploadReceipt = async () => {
    if (!uploadFile) return;
    
    // Auto-select student if only one
    let studentId = selectedStudentForPayment;
    if (!studentId && students.length === 1) {
        studentId = students[0].id;
    }
    
    if (!studentId) {
        setUploadError(t('select_student') || 'Выберите ученика');
        return;
    }
    
    if (!paymentAmount) {
        setUploadError(t('enter_amount') || 'Введите сумму');
        return;
    }
    
    setIsUploading(true);
    setUploadError('');
    
    try {
        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('student_id', studentId);
        formData.append('amount', paymentAmount);
        formData.append('period', new Date().toISOString().slice(0, 7));
        
        await paymentsAPI.uploadReceipt(formData);
        setUploadSuccess(true);
        setUploadFile(null);
        setPaymentAmount('');
        // Close modal after success or show success message
        setTimeout(() => setUploadSuccess(false), 3000);
        
        // Refresh payments list
        fetchPayments();
    } catch (e) {
        console.error(e);
        setUploadError(t('upload_error') || 'Ошибка загрузки');
    } finally {
        setIsUploading(false);
    }
  };

  useEffect(() => {
    if (user?.role?.toLowerCase() === 'parent') {
      const tabParam = searchParams.get('tab');
      if (!tabParam || tabParam === 'all') {
        setActiveTab('pending');
      } else {
        setActiveTab(tabParam);
      }
    }
  }, [user, searchParams]);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Export State
  const [isExporting, setIsExporting] = useState(false);
  
  // ====== UNDO SYSTEM ======
  const [lastAction, setLastAction] = useState(null); // { type: 'payment'|'confirm', paymentId, studentId, amount, timestamp }
  const [undoing, setUndoing] = useState(false);
  
  // ====== QUICK PAYMENT ======
  const [quickSearch, setQuickSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [quickAmount, setQuickAmount] = useState('');
  const [quickMethod, setQuickMethod] = useState('cash');
  const [quickType, setQuickType] = useState('subscription');
  const [quickCustomDesc, setQuickCustomDesc] = useState('');
  const [quickPeriod, setQuickPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [processingQuick, setProcessingQuick] = useState(false);
  const [processingIndividual, setProcessingIndividual] = useState(false); // Add this for individual invoice
  const [quickMode, setQuickMode] = useState('search'); // 'search' | 'group'
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [showQuickConfirmModal, setShowQuickConfirmModal] = useState(false);
  
  // Parent debt status from /payments/status
  const [parentStatus, setParentStatus] = useState(null);
  
  // Invoice form
  const [invoiceForm, setInvoiceForm] = useState({
    groupId: '',
    period: new Date().toISOString().slice(0, 7),
    customAmount: '',
    paymentType: 'subscription',
    customDescription: ''
  });
  const [invoiceError, setInvoiceError] = useState(''); // Local error for group modal
  
  // Individual invoice form
  const [individualForm, setIndividualForm] = useState({
    studentId: '',
    period: new Date().toISOString().slice(0, 7),
    amount: '',
    paymentType: 'subscription',
    customDescription: ''
  });
  const [individualError, setIndividualError] = useState(''); // Local error for individual modal
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [invoiceGroupFilter, setInvoiceGroupFilter] = useState(''); // New: Filter for Individual Invoice
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonthFilter] = useState('');
  
  // Advanced Filters
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedMethod, setSelectedMethod] = useState('');
  const [selectedStatus] = useState('all');

  // Сортированный список учеников по алфавиту (Memoized)
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const nameA = `${a.last_name} ${a.first_name}`.toLowerCase();
      const nameB = `${b.last_name} ${b.first_name}`.toLowerCase();
      return nameA.localeCompare(nameB, 'ru');
    });
  }, [students]);

    // Map for fast lookup (Optimization)
    // Use string keys to ensure robust matching
    const studentsMap = useMemo(() => {
      return new Map(students.map(s => [String(s.id), s]));
    }, [students]);
  
    const filteredPayments = useMemo(() => {
      if (!Array.isArray(payments)) return [];

      // Create a map of completed payments (studentId_period -> Set of amounts) to filter out ghost pending payments
      // We use a Map<string, Set<number>> where key is `${student_id}_${period}`
      const completedPaymentsMap = new Map();
      payments.forEach(p => {
        if (p.status === 'completed' && p.payment_period) {
          const key = `${p.student_id}_${p.payment_period}`;
          if (!completedPaymentsMap.has(key)) {
            completedPaymentsMap.set(key, new Set());
          }
          completedPaymentsMap.get(key).add(Number(p.amount));
        }
      });

      return payments.filter(p => {
        // Ghost Pending Check: If this is pending and we have a completed payment for same student/period AND same amount, hide it
        if (p.status === 'pending' && p.payment_period) {
           const key = `${p.student_id}_${p.payment_period}`;
           const completedAmounts = completedPaymentsMap.get(key);
           // Only hide if we have a completed payment with the SAME amount
           if (completedAmounts && completedAmounts.has(Number(p.amount))) {
             return false;
           }
        }

        // Hide payments from deleted students unless explicitly searching
        const student = studentsMap.get(String(p.student_id));
    
        // If student is not found (deleted) AND we are not in 'all' view or searching, hide it
        // BUT user asked why they remain in "Pending". 
        // If student is deleted, we should probably hide their pending payments from active views.
        // Let's filter out payments where student is not in the `students` list (which usually contains only active/non-deleted).
        // The `students` state comes from `studentsAPI.getAll()`.
        
        if (!student && !p.student_name) return false; // Should not happen often
        
        // Search Query
        if (searchQuery.trim()) {
          const studentName = student ? `${student.first_name} ${student.last_name}` : p.student_name || '';
          const matchesSearch = 
            studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.payment_date?.includes(searchQuery) ||
            String(p.amount)?.includes(searchQuery) ||
            p.payment_period?.includes(searchQuery);
          if (!matchesSearch) return false;
        }

        // Month Filter
        if (selectedMonthFilter && p.payment_period !== selectedMonthFilter) return false;

        // Date Range
        if (dateRange.start && p.payment_date < dateRange.start) return false;
        if (dateRange.end && p.payment_date > dateRange.end) return false;

        // Group Filter
        if (selectedGroup) {
          // Robust comparison (handle string vs number)
          if (!student || String(student.group_id) !== String(selectedGroup)) return false;
        }

        // Method Filter
        if (selectedMethod && p.method !== selectedMethod) return false;

        // Status Filter (if not handled by tabs)
        if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;

        // Tab Filter
        if (activeTab === 'pending' && p.status !== 'pending') return false;
        if (activeTab === 'completed' && p.status !== 'completed') return false;

        return true;
      });
    }, [payments, studentsMap, searchQuery, selectedMonthFilter, dateRange, selectedGroup, selectedMethod, selectedStatus, activeTab]);

  const filteredPendingPayments = useMemo(() => {
    return pendingPayments.filter(p => {
      // Allow parent to see debts even if student object is not fully loaded yet (if backend sends student info in debt object)
      // But we prefer to check if student exists in map to avoid "ghost" records from deleted students
      // However, for parents, we should trust the debts endpoint
      if (isParent) return true;

      // Filter out payments from deleted students
      const student = studentsMap.get(String(p.student_id));
      if (!student) return false;
      
      return selectedMonthFilter ? p.payment_period === selectedMonthFilter : true;
    });
  }, [pendingPayments, studentsMap, selectedMonthFilter, isParent]);

  const filteredReceipts = useMemo(() => {
    if (!Array.isArray(payments)) return [];
    return payments.filter(p => 
      p.status === 'pending' && 
      (p.reference_id?.includes('/uploads/receipts') || p.description?.includes('URL:'))
    );
  }, [payments]);

  // Export
  const handleExport = async (type = 'excel') => {
    if (type === 'excel') {
      const dataToExport = filteredPayments.map(p => {
        const student = studentsMap.get(String(p.student_id));
        const group = groups.find(g => g.id === student?.group_id);
        
        return {
          student_name: student ? `${student.last_name} ${student.first_name}` : p.student_name || t('unknown'),
          group: group?.name || t('no_group'),
          amount: p.amount,
          currency: 'MDL',
          date: p.payment_date,
          period: p.payment_period,
          method: getMethodLabel(p.method),
          status: p.status === 'completed' ? t('status_completed') : p.status === 'pending' ? t('status_pending') : t('status_cancelled'),
          description: p.description || ''
        };
      });

      const columns = {
        student_name: t('student') || 'Student',
        group: t('group') || 'Group',
        amount: t('amount') || 'Amount',
        currency: t('currency') || 'Currency',
        date: t('date') || 'Date',
        period: t('period') || 'Period',
        method: t('payment_method_label') || 'Method',
        status: t('status') || 'Status',
        description: t('description') || 'Description'
      };

      exportToExcel(dataToExport, columns, `payments_export_${getDateString()}`);
    } else {
      // PDF Export using autoTable
      setIsExporting(true);
      
      try {
        const doc = new jsPDF();
        
        // Load Cyrillic font
        const fontBase64 = await loadFont('Arial-Regular.ttf');
        let fontName = 'helvetica';
        
        if (fontBase64) {
            doc.addFileToVFS('Arial-Regular.ttf', fontBase64);
            doc.addFont('Arial-Regular.ttf', 'Arial', 'normal');
            doc.setFont('Arial');
            fontName = 'Arial';
        }
        
        // Title
        doc.setFontSize(18);
        doc.text(t('payments_title'), 14, 20);
        
        // Meta info
        doc.setFontSize(10);
        doc.text(`${t('date')}: ${new Date().toLocaleDateString()}`, 14, 28);
        if (selectedGroup) {
          const groupName = groups.find(g => g.id === selectedGroup)?.name;
          doc.text(`${t('group')}: ${groupName}`, 14, 34);
        }

        // Table
        const tableColumn = [
          t('student_th'), 
          t('group_th'), 
          t('period'), 
          t('sum_th'), 
          t('date_th'), 
          t('method_th'), 
          t('status_th'),
          t('description')
        ];

        const tableRows = filteredPayments.map(p => {
          const student = studentsMap.get(String(p.student_id));
          const group = groups.find(g => g.id === student?.group_id);
          return [
            student ? `${student.last_name} ${student.first_name}` : p.student_name,
            group?.name || '-',
            getMonthName(p.payment_period),
            `${p.amount} MDL`,
            new Date(p.payment_date).toLocaleDateString(),
            getMethodLabel(p.method),
            p.status === 'completed' ? t('status_completed') : p.status === 'pending' ? t('status_pending') : t('status_cancelled'),
            p.description || ''
          ];
        });

        doc.autoTable({
          head: [tableColumn],
          body: tableRows,
          startY: 40,
          styles: { fontSize: 8, font: fontName, fontStyle: 'normal' },
          headStyles: { fillColor: [255, 193, 7] }, // Yellow/Amber
        });

        // Use safe downloadBlob helper
        const blob = doc.output('blob');
        downloadBlob(blob, `Payments_Report_${getDateString()}.pdf`);
      } catch (err) {
        console.error("Export failed:", err);
      } finally {
        setIsExporting(false);
      }
    }
  };

  const fetchAllData = useCallback(async () => {
    try {
      // 1. Start fetching Groups immediately (Critical for filters)
      const groupsPromise = groupsAPI.getAll()
        .then(res => {
          const data = res.data.data || res.data || [];
          console.log('✅ Groups loaded:', data.length);
          if (!isParent) {
            setGroups(data);
          }
          return data;
        })
        .catch(err => {
          console.error("❌ Groups load error:", err);
          return [];
        });

      // 2. Start fetching Students
      const studentsPromise = (isParent ? parentAPI.getChildren() : studentsAPI.getAll())
        .then(res => res.data.data || res.data || [])
        .catch(err => {
          console.error("❌ Students load error:", err);
          return [];
        });

      // 3. Start fetching Archived Students (Admin only)
      const archivedPromise = isAdmin 
        ? studentsAPI.getArchived().then(res => res.data.data || res.data || []).catch(() => [])
        : Promise.resolve([]);

      // 4. Start fetching Payments (Likely slowest)
      const paymentsPromise = paymentsAPI.getAll()
        .then(res => res.data.data || res.data || [])
        .catch(err => {
          console.error("❌ Payments load error:", err);
          return [];
        });

      // Wait for all to complete (independent of each other's failure)
      const [allGroups, activeStudents, archivedStudents, allPayments] = await Promise.all([
        groupsPromise,
        studentsPromise,
        archivedPromise,
        paymentsPromise
      ]);

      const allStudents = [...activeStudents, ...archivedStudents];
      setStudents(allStudents);
      
      if (isParent) {
        // Получаем статус долга от backend (правильная связь через StudentGuardian)
        try {
          const statusRes = await paymentsAPI.getStatus();
          setParentStatus(statusRes.data);
          
          // Получаем pending платежи для родителя
          const debtsRes = await paymentsAPI.getMyDebts();
          const debts = debtsRes.data.data || debtsRes.data || [];
          setPendingPayments(debts);
        } catch (e) {
          console.error('Error fetching parent status:', e);
          setParentStatus({ has_debt: false, total_pending: 0, children: [] });
        }
        
        // Используем все платежи которые вернул backend (уже отфильтрованы для родителя)
        setPayments(allPayments);
      } else {
        setPayments(allPayments);
        // Groups already set in the promise above
        
        // Filter out ghost debts (pending payments where completed payment exists for same period AND same amount)
        const completedMap = new Map(); // key -> Set<amount>
        if (Array.isArray(allPayments)) {
          allPayments.forEach(p => {
            if (p.status === 'completed' && p.payment_period && p.student_id) {
              try {
                const periodStr = String(p.payment_period);
                const periodKey = periodStr.length >= 7 ? periodStr.substring(0, 7) : periodStr;
                const key = `${p.student_id}_${periodKey}`;
                if (!completedMap.has(key)) completedMap.set(key, new Set());
                completedMap.get(key).add(Number(p.amount));
              } catch (error) {
                console.warn('Error processing payment period:', p, error);
              }
            }
          });
          
          const validPending = allPayments.filter(p => {
            if (p.status !== 'pending') return false;
            if (!p.payment_period) return true; // Keep if no period
            
            try {
              const periodStr = String(p.payment_period);
              const periodKey = periodStr.length >= 7 ? periodStr.substring(0, 7) : periodStr;
              const key = `${p.student_id}_${periodKey}`;
              const completedAmounts = completedMap.get(key);
              // Only filter if same amount exists
              if (completedAmounts && completedAmounts.has(Number(p.amount))) return false;
              return true;
            } catch {
              return true; // Keep on error
            }
          });
          
          setPendingPayments(validPending);
        } else {
          setPendingPayments([]);
        }
      }
      
      if (isAdmin) {
        paymentsAPI.getPeriodsSummary()
          .then(res => setPeriodStats(res.data))
          .catch(console.error);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [isParent, isAdmin]);

  // Fetch all data
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const fetchPayments = async () => {
    const response = await paymentsAPI.getAll();
    const allPayments = response.data.data || response.data || [];
    setPayments(allPayments);
    
    // Filter out ghost debts (pending payments where completed payment exists for same period AND same amount)
    const completedMap = new Map();
    if (Array.isArray(allPayments)) {
      allPayments.forEach(p => {
        if (p.status === 'completed' && p.payment_period && p.student_id) {
          try {
            const periodStr = String(p.payment_period);
            const periodKey = periodStr.length >= 7 ? periodStr.substring(0, 7) : periodStr;
            const key = `${p.student_id}_${periodKey}`;
            if (!completedMap.has(key)) completedMap.set(key, new Set());
            completedMap.get(key).add(Number(p.amount));
          } catch (error) {
            console.warn('Error processing payment period:', p, error);
          }
        }
      });
      
      const validPending = allPayments.filter(p => {
        if (p.status !== 'pending') return false;
        if (!p.payment_period) return true; // Keep if no period
        
        try {
          const periodStr = String(p.payment_period);
          const periodKey = periodStr.length >= 7 ? periodStr.substring(0, 7) : periodStr;
          const key = `${p.student_id}_${periodKey}`;
          const completedAmounts = completedMap.get(key);
          if (completedAmounts && completedAmounts.has(Number(p.amount))) return false;
          return true;
        } catch {
          return true; // Keep on error
        }
      });
      
      setPendingPayments(validPending);
    } else {
      setPendingPayments([]);
    }
  };

  // Helper: Get payment description
  const getPaymentDescription = (type, customDesc, periodStr) => {
    if (!periodStr) return '';
    const date = new Date(periodStr + '-01');
    const monthName = date.toLocaleDateString(language === 'ru' ? 'ru-RU' : (language === 'ro' ? 'ro-RO' : 'en-US'), { month: 'long' });
    const year = date.getFullYear();
    
    switch (type) {
        case 'subscription':
            return (t('invoice_subscription_desc') || 'Абонемент за {month} {year}').replace('{month}', monthName).replace('{year}', year);
        case 'group_training':
            return (t('invoice_tournament_desc') || 'Турниры за {month} {year}').replace('{month}', monthName).replace('{year}', year);
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

  // Invoice group (Вариант А - массово)
  const handleInvoiceGroup = async (e) => {
    e.preventDefault();
    console.log('🚀 handleInvoiceGroup called', invoiceForm);
    setInvoiceError('');

    // Проверка прав пользователя
    if (!isAdmin) {
      setInvoiceError('У вас недостаточно прав для создания счетов.');
      return;
    }

    if (!invoiceForm.groupId || !invoiceForm.period) {
      console.warn('❌ Validation failed: missing group or period');
      setInvoiceError(t('select_group_period'));
      return;
    }
    
    try {
      const paymentPeriod = invoiceForm.period + '-01';
      const customAmount = invoiceForm.customAmount ? parseFloat(invoiceForm.customAmount) : null;
      const description = getPaymentDescription(invoiceForm.paymentType, invoiceForm.customDescription, invoiceForm.period);
      
      // Calculate item type
      const itemTypeMap = {
          'subscription': 'membership',
          'group_training': 'group_training',
          'individual': 'individual_training',
          'equipment': 'equipment',
          'other': 'other'
      };
      const itemType = itemTypeMap[invoiceForm.paymentType] || 'membership';

      console.log('📝 Sending invoice group request:', {
        groupId: invoiceForm.groupId,
        period: paymentPeriod,
        customAmount,
        description,
        itemType
      });
      
      const response = await paymentsAPI.invoiceGroup(
        parseInt(invoiceForm.groupId),
        paymentPeriod,
        customAmount,
        description,
        itemType
      );
      
      console.log('✅ Invoice group success:', response.data);

      setShowInvoiceModal(false);
      setInvoiceForm({ 
        groupId: '', 
        period: new Date().toISOString().slice(0, 7), 
        customAmount: '',
        paymentType: 'subscription',
        customDescription: ''
      });
      fetchPayments();
      window.dispatchEvent(new CustomEvent('payments:updated'));
      setSuccessMessage(response.data.message || t('invoices_success'));
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      console.error('❌ Invoice error:', error);
      console.error('Response:', error.response?.data);
      setInvoiceError(getErrorMessage(error, t('invoice_error')));
    }
  };

  // Helper: Parse error message
  const getErrorMessage = (error, fallback = 'Неизвестная ошибка') => {
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;
      if (Array.isArray(detail)) {
        return detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
      } else if (typeof detail === 'string') {
        return detail;
      } else {
        return JSON.stringify(detail);
      }
    }
    return error.message || fallback;
  };

  // Invoice individual (Вариант Б - индивидуально)
  const handleInvoiceStudent = async (e) => {
    e.preventDefault();
    setIndividualError('');
    console.log('🚀 handleInvoiceStudent called with form data:', individualForm);
    
    // Проверка прав пользователя
    if (!isAdmin) {
      setIndividualError('У вас недостаточно прав для создания счетов.');
      return;
    }
    
    // Проверяем все обязательные поля
    if (!individualForm.studentId) {
      setIndividualError(t('select_student'));
      return;
    }
    if (!individualForm.period) {
      setIndividualError(t('select_period'));
      return;
    }
    if (!individualForm.amount || parseFloat(individualForm.amount) <= 0) {
      setIndividualError(t('amount_positive'));
      return;
    }
    // Validate equipment description
    if (individualForm.paymentType === 'equipment' && !individualForm.customDescription.trim()) {
      setIndividualError('Пожалуйста, укажите детали экипировки');
      return;
    }
    
    setProcessingIndividual(true); // Start loading
    
    try {
      const paymentPeriod = individualForm.period + '-01';
      const description = getPaymentDescription(individualForm.paymentType, individualForm.customDescription, individualForm.period);
      
      const itemTypeMap = {
          'subscription': 'membership',
          'group_training': 'group_training',
          'individual': 'individual_training',
          'equipment': 'equipment',
          'other': 'other'
      };

      const payload = {
          student_id: parseInt(individualForm.studentId),
          payment_period: paymentPeriod,
          invoice_items: [
              {
                  item_type: itemTypeMap[individualForm.paymentType] || 'other',
                  description: description,
                  quantity: 1,
                  unit_price: parseFloat(individualForm.amount),
                  total_price: parseFloat(individualForm.amount)
              }
          ],
          notes: description
      };
      
      await paymentsAPI.createManualInvoice(payload);
      
      setShowIndividualModal(false);
      setStudentSearchQuery('');
      setIndividualForm({ 
        studentId: '', 
        period: new Date().toISOString().slice(0, 7), 
        amount: '',
        paymentType: 'subscription',
        customDescription: ''
      });
      fetchPayments();
      window.dispatchEvent(new CustomEvent('payments:updated'));
      setSuccessMessage(t('invoice_individual_success'));
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      console.error('❌ Invoice error:', error);
      
      let errorMsg = t('invoice_individual_error') || 'Ошибка при создании счета';
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMsg = error.response.data.detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ');
        } else if (typeof error.response.data.detail === 'string') {
          errorMsg = error.response.data.detail;
        } else {
          errorMsg = JSON.stringify(error.response.data.detail);
        }
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setIndividualError(errorMsg);
    } finally {
      setProcessingIndividual(false); // End loading
    }
  };

  // Confirm payment
  const handleConfirmPayment = async (paymentId, method = 'cash') => {
    // Show confirm dialog using translations
    if (!window.confirm(t('confirm_payment_message') || 'Вы уверены, что хотите подтвердить этот платеж?')) return;

    try {
      const payment = pendingPayments.find(p => p.id === paymentId);
      await paymentsAPI.confirmPayment(paymentId, method);
      
      // Сохраняем для Undo
      if (payment) {
        setLastAction({
          type: 'confirm',
          paymentId: paymentId,
          studentId: payment.student_id,
          studentName: payment.student_name || t('student'),
          amount: payment.amount,
          timestamp: Date.now()
        });
      }
      
      // Wait for data refresh to ensure UI is in sync
      await fetchPayments();
      window.dispatchEvent(new CustomEvent('payments:updated'));
      // Обновляем статистику после подтверждения
      try {
        const statsRes = await paymentsAPI.getPeriodsSummary();
        setPeriodStats(statsRes.data);
      } catch (err) {
        console.warn('Failed to update stats:', err);
      }

      setSuccessMessage(t('payment_confirmed'));
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Confirm error:', error);
      setErrorMessage(getErrorMessage(error, t('confirm_error')));
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  // ====== EDIT PAYMENT ======
  const handleEditPayment = (paymentId) => {
    const payment = filteredPayments.find(p => p.id === paymentId);
    if (payment) {
      setEditPaymentId(paymentId);
      setEditAmount(payment.amount.toString());
      setEditPeriod(payment.payment_period ? payment.payment_period.slice(0, 7) : '');
      setShowEditModal(true);
    }
  };

  const saveEditedPayment = async (e) => {
    e.preventDefault();
    if (!editPaymentId) return;

    try {
      await paymentsAPI.update(editPaymentId, {
        amount: parseFloat(editAmount),
        payment_period: editPeriod + '-01'
      });

      setShowEditModal(false);
      setSuccessMessage(t('payment_updated') || 'Платеж обновлен');
      fetchPayments();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Update error:', error);
      setErrorMessage(getErrorMessage(error, t('update_error') || 'Ошибка обновления'));
      setTimeout(() => setErrorMessage(''), 5000);
    }
  };

  const handleDelete = async (id) => {
    // Show enhanced warning modal
    setDeleteModal({ show: true, paymentId: id });
  };

  const confirmDelete = async () => {
    const id = deleteModal.paymentId;
    if (!id) return;

    try {
      await paymentsAPI.delete(id);
      fetchPayments();
      window.dispatchEvent(new CustomEvent('payments:updated'));
      setSuccessMessage(t('payment_deleted'));
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrorMessage(error.response?.data?.detail || t('delete_error'));
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setDeleteModal({ show: false, paymentId: null });
    }
  };

  // ====== UNDO FUNCTION ======
  const handleUndo = async () => {
    if (!lastAction || undoing) return;
    
    setUndoing(true);
    try {
      if (lastAction.type === 'payment' || lastAction.type === 'confirm') {
        // Удаляем последний платёж
        await paymentsAPI.delete(lastAction.paymentId);
        setSuccessMessage(t('action_undone'));
        setLastAction(null);
        fetchPayments();
        window.dispatchEvent(new CustomEvent('payments:updated'));
        // Обновляем статистику после отмены
        paymentsAPI.getPeriodsSummary()
          .then(res => setPeriodStats(res.data))
          .catch(console.error);
      }
    } catch (error) {
      setErrorMessage(t('undo_error') + (error.response?.data?.detail || error.message));
    } finally {
      setUndoing(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  // ====== QUICK PAYMENT FUNCTIONS ======
  const filteredQuickStudents = useMemo(() => {
    // 1. Filter by Group (if in group mode or explicit filter if we add one to search mode)
    // Quick Payment Search Mode doesn't have a group filter UI yet, but we should add one as requested.
    // The user said: "add in filter search by groups" for "quick payments".
    
    let filtered = sortedStudents;
    
    // Check if we are in Search Mode and want to filter by group (we need to add a selector)
    // Re-using selectedGroupId if in 'group' mode, but for 'search' mode we might need a separate one or reuse.
    // Let's reuse selectedGroupId for filtering in Search Mode too if set.
    if (selectedGroupId) {
      filtered = filtered.filter(s => String(s.group_id) === String(selectedGroupId));
      // If group is selected, we allow showing list even without search query
      if (!quickSearch.trim()) return filtered.slice(0, 50); 
    }
    
    if (quickSearch.trim().length < 2) return [];

    const query = quickSearch.toLowerCase();
    return filtered.filter(s => {
      const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
      const reverseName = `${s.last_name} ${s.first_name}`.toLowerCase();
      return fullName.includes(query) || reverseName.includes(query);
    }).slice(0, 10);
  }, [sortedStudents, quickSearch, selectedGroupId]);

  // Students for Individual Invoice Modal
  const filteredStudentsForModal = useMemo(() => {
    let filtered = sortedStudents;
    
    // 1. Filter by Group
    if (invoiceGroupFilter) {
      filtered = filtered.filter(s => String(s.group_id) === String(invoiceGroupFilter));
    }
    
    // 2. Search
    if (studentSearchQuery.trim()) {
      const query = studentSearchQuery.toLowerCase();
      filtered = filtered.filter(s => {
        const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
        const reverseName = `${s.last_name} ${s.first_name}`.toLowerCase();
        return fullName.includes(query) || reverseName.includes(query);
      });
    } else if (!invoiceGroupFilter) {
      // If no group selected and no search, don't show list (too long)
      return [];
    }
    
    return filtered.slice(0, 50);
  }, [sortedStudents, invoiceGroupFilter, studentSearchQuery]);

  const handleSelectStudent = (student) => {
    setSelectedStudent(student);
    setQuickSearch(`${student.last_name} ${student.first_name}`);
    
    // Check for pending payments (debts)
    const studentPending = pendingPayments.filter(p => p.student_id === student.id);
    
    if (studentPending.length > 0) {
      // Sort by period (oldest first)
      studentPending.sort((a, b) => new Date(a.payment_period) - new Date(b.payment_period));
      const oldest = studentPending[0];
      
      // Auto-fill from oldest pending payment
      setQuickAmount(oldest.amount.toString());
      // Set period (YYYY-MM)
      setQuickPeriod(oldest.payment_period.slice(0, 7));
      // Try to pre-fill type and custom description from pending invoice items
      if (Array.isArray(oldest.invoice_items) && oldest.invoice_items.length > 0) {
        const item = oldest.invoice_items[0];
        const reverseMap = {
          'membership': 'subscription',
          'group_training': 'group_training',
          'individual_training': 'individual',
          'equipment': 'equipment',
          'other': 'other'
        };
        if (item.item_type && reverseMap[item.item_type]) {
          setQuickType(reverseMap[item.item_type]);
        } else {
          setQuickType('subscription');
        }
        if (item.description) {
          if (item.item_type === 'equipment' || item.item_type === 'other') {
            setQuickCustomDesc(item.description);
          } else {
            setQuickCustomDesc('');
          }
        } else {
          setQuickCustomDesc('');
        }
      } else {
        setQuickType('subscription');
        setQuickCustomDesc('');
      }
    } else {
      // Default logic (Current Month)
      const group = groups.find(g => g.id === student.group_id);
      const suggestedAmount = student.individual_fee || group?.monthly_fee || '';
      setQuickAmount(suggestedAmount.toString());
      setQuickPeriod(new Date().toISOString().slice(0, 7));
      setQuickType('subscription');
      setQuickCustomDesc('');
    }
  };

  const handleQuickPayment = () => {
    if (!selectedStudent || !quickAmount || processingQuick) return;
    setShowQuickConfirmModal(true);
  };

  const confirmQuickPayment = async () => {
    console.log('🚀 confirmQuickPayment called');
    if (!selectedStudent || !quickAmount) {
        console.warn('❌ Missing data:', { selectedStudent, quickAmount });
        return;
    }
    if (processingQuick) {
        console.warn('⏳ Already processing...');
        return;
    }
    
    setProcessingQuick(true);
    try {
      // Check for existing pending payment
      const targetPeriod = quickPeriod + '-01';
      const pendingPayment = pendingPayments.find(p => 
        p.student_id === selectedStudent.id && 
        (p.payment_period === targetPeriod || (p.payment_period && p.payment_period.startsWith(quickPeriod)))
      );

      // If amount matches, we can confirm. If not, create new (backend handles update).
      // Since confirmPayment doesn't take amount, relying on backend logic is safer if amounts differ.
      // But for better UX, if exact match, use confirm.
      
      console.log('💰 Processing Quick Payment:', {
        student: selectedStudent.last_name,
        amount: quickAmount,
        period: targetPeriod,
        existingPending: pendingPayment ? pendingPayment.id : 'None'
      });

      const itemTypeMap = {
        'subscription': 'membership',
        'group_training': 'group_training',
        'individual': 'individual_training',
        'equipment': 'equipment',
        'other': 'other'
      };
      const description = getPaymentDescription(quickType, quickCustomDesc, quickPeriod);
      
      let createdPaymentId = null;
      try {
        // Preferred path: create manual invoice with item_type, then confirm
        const payload = {
          student_id: selectedStudent.id,
          payment_period: targetPeriod,
          invoice_items: [
            {
              item_type: itemTypeMap[quickType] || 'membership',
              description: (quickType === 'equipment' || quickType === 'other') ? quickCustomDesc : description,
              quantity: 1,
              unit_price: parseFloat(quickAmount),
              total_price: parseFloat(quickAmount)
            }
          ],
          notes: description
        };
        const invResp = await paymentsAPI.createManualInvoice(payload);
        createdPaymentId = invResp.data?.id || invResp.data;
        // Confirm via update route (compatible with current client)
        await paymentsAPI.confirmPayment(createdPaymentId, quickMethod);
      } catch (e) {
        if (!shouldForceManual() && e?.response?.status && [401, 404, 405, 501].includes(e.response.status)) {
          const resp = await paymentsAPI.create({
            student_id: selectedStudent.id,
            amount: parseFloat(quickAmount),
            payment_date: new Date().toISOString().split('T')[0],
            payment_period: targetPeriod,
            method: quickMethod,
            description: description
          });
          createdPaymentId = resp.data?.id || resp.data;
        } else {
          throw e;
        }
      }
      
      console.log('✅ Payment created/confirmed:', createdPaymentId);
      
      const paymentId = createdPaymentId;
      
      // Сохраняем для Undo
      setLastAction({
        type: 'payment',
        paymentId: paymentId,
        studentId: selectedStudent.id,
        studentName: `${selectedStudent.last_name} ${selectedStudent.first_name}`,
        amount: parseFloat(quickAmount),
        timestamp: Date.now()
      });
      
      // Сброс формы
      const successMsg = t('payment_processed').replace('{amount}', quickAmount).replace('{name}', `${selectedStudent.last_name} ${selectedStudent.first_name}`);
      
      setSelectedStudent(null);
      setQuickSearch('');
      setQuickAmount('');
      setShowQuickConfirmModal(false);
      setQuickType('subscription');
      setQuickCustomDesc('');
      
      // Wait for data update
      await fetchPayments();
      window.dispatchEvent(new CustomEvent('payments:updated'));
      
      // Обновляем статистику после платежа
      try {
        const statsRes = await paymentsAPI.getPeriodsSummary();
        setPeriodStats(statsRes.data);
      } catch (err) {
        console.warn('Stats update failed:', err);
      }
        
      setSuccessMessage(successMsg);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      console.error('❌ Payment process error:', error);
      setErrorMessage(getErrorMessage(error, t('payment_process_error')));
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setProcessingQuick(false);
    }
  };

  const getStatusBadge = (payment) => {
    const status = payment.status;
    const monthName = getMonthName(payment.payment_period);
    
    const styles = { 
      pending: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30', 
      completed: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30', 
      cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30' 
    };
    
    let label = '';
    if (status === 'pending') {
      label = `${t('status_pending')} ${t('for_month_preposition')} ${monthName}`;
    } else if (status === 'completed') {
      label = `${t('status_completed')} ${t('for_month_preposition')} ${monthName}`;
    } else {
      label = t('status_cancelled');
    }
    
    return <span className={`px-2.5 py-1 rounded-lg text-sm font-medium ${styles[status]}`}>{label}</span>;
  };

  const getMethodLabel = (method) => {
    const labels = {
      cash: t('method_cash'),
      card: t('method_card'),
      bank_transfer: t('method_transfer'),
      pending: t('status_pending')
    };
    return labels[method] || method;
  };

  const getMonthName = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'ro' ? 'ro-RO' : 'ru-RU', { month: 'long', year: 'numeric' });
  };

  const totalAmount = filteredPayments.filter(p => p.status === 'completed' && !p.deleted_at).reduce((sum, p) => sum + (p.amount || 0), 0);
  const pendingAmount = filteredPendingPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

  // Helper for payment period check (25th-31st)
  const isPaymentPeriod = () => {
    const today = new Date();
    const day = today.getDate();
    return day >= 25 && day <= 31;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin"></div>
          <span className="text-white/60 text-lg">{t('loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-3 md:p-6 text-white overflow-x-hidden">
      
      <div className="w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-3">
              <span className="text-3xl md:text-4xl">💰</span>
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                {t('payments_title')}
              </span>
            </h1>
            <p className="text-white/50 text-sm mt-1">{t('financial_overview_subtitle')}</p>
          </div>
          {isAdmin && (
            <div className="flex gap-2 flex-wrap items-center">
              {/* UNDO BUTTON */}
              {lastAction && (
                <button 
                  onClick={handleUndo}
                  disabled={undoing}
                  className="px-4 py-2.5 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-xl hover:bg-orange-500/30 transition-all flex items-center gap-2 disabled:opacity-50"
                  title={`${t('undo_button')}: ${lastAction.studentName} - ${lastAction.amount} MDL`}
                >
                  <Undo2 className="w-4 h-4" />
                  {undoing ? '...' : t('undo_button')}
                </button>
              )}
              <button 
                onClick={() => setShowInvoiceModal(true)} 
                className="px-4 py-2.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl hover:bg-blue-500/30 transition-all flex items-center gap-2"
              >
                {t('invoice_group_btn')}
              </button>
              <button 
                onClick={() => setShowIndividualModal(true)} 
                className="px-4 py-2.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded-xl hover:bg-purple-500/30 transition-all flex items-center gap-2"
              >
                {t('invoice_individual_btn')}
              </button>
            </div>
          )}
        </div>

        {/* PARENT NOTIFICATIONS */}
        {isParent && (
          <div className="mb-8 space-y-4">
            {/* Payment Period Reminder (25-31 of month) */}
            {isPaymentPeriod() && (
              <div className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 border border-blue-500/20 rounded-2xl p-6 backdrop-blur-sm animate-fade-up">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-400 mb-1">
                      {t('payment_period_title') || 'Период оплаты'}
                    </h3>
                    <p className="text-white/70">
                      {t('payment_period_message') || 'Напоминаем, что с 25 по 31 число каждого месяца необходимо оплатить абонемент.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Debt Notification */}
            {(parentStatus?.has_debt || pendingPayments.length > 0) && (
              <div className="bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-500/20 rounded-2xl p-6 backdrop-blur-sm animate-fade-up">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-red-500/20 rounded-xl text-red-400">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="w-full">
                    <h3 className="text-xl font-bold text-red-400 mb-1">
                      {t('debt_notification_title') || 'Имеется задолженность'}
                    </h3>
                    <p className="text-white/70 mb-3">
                      {t('debt_notification_message') || 'У вас есть неоплаченные счета. Пожалуйста, погасите задолженность.'}
                    </p>
                    {pendingPayments.length > 0 && (
                      <div className="flex flex-col gap-2 mt-2">
                         {pendingPayments.map(payment => (
                           <div key={payment.id} className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex justify-between items-center">
                             <div className="flex flex-col">
                               <span className="font-medium text-white/90">{payment.student_name || t('student')}</span>
                               <span className="text-xs text-white/50">{t('for_month_preposition') || 'за'} {getMonthName(payment.payment_period)}</span>
                             </div>
                             <span className="font-bold text-red-300 whitespace-nowrap">{payment.amount} MDL</span>
                           </div>
                         ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Financial Summary Cards */}
        {!isParent && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Card 1: Monthly Revenue */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex justify-between items-start mb-4">
               <div>
                 <p className="text-white/50 text-sm font-medium uppercase tracking-wider">{t('revenue_this_month') || 'Выручка (Месяц)'}</p>
                 <h3 className="text-3xl font-bold text-emerald-400 mt-1">
                   {periodStats ? periodStats.current_month?.total_amount?.toLocaleString() : totalAmount.toLocaleString()} 
                   <span className="text-lg text-emerald-400/50"> MDL</span>
                 </h3>
               </div>
               <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400">
                 <CreditCard size={24} />
               </div>
            </div>
            {periodStats && (
              <div className="flex items-center gap-2 text-sm">
                <span className={periodStats.current_month?.total_amount >= periodStats.last_month?.total_amount ? "text-emerald-400" : "text-red-400"}>
                  {periodStats.current_month?.total_amount >= periodStats.last_month?.total_amount ? '↑' : '↓'} 
                  {Math.abs((periodStats.current_month?.total_amount || 0) - (periodStats.last_month?.total_amount || 0)).toLocaleString()} MDL
                </span>
                <span className="text-white/30">vs {t('last_month') || 'прошлый мес.'}</span>
              </div>
            )}
          </div>

          {/* Card 2: Yearly Revenue */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex justify-between items-start mb-4">
               <div>
                 <p className="text-white/50 text-sm font-medium uppercase tracking-wider">{t('revenue_this_year') || 'Выручка (Год)'}</p>
                 <h3 className="text-3xl font-bold text-blue-400 mt-1">
                   {periodStats ? periodStats.current_year?.total_amount?.toLocaleString() : totalAmount.toLocaleString()}
                   <span className="text-lg text-blue-400/50"> MDL</span>
                 </h3>
               </div>
               <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
                 <Calendar size={24} />
               </div>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5 mt-2">
               <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>

          {/* Card 3: Pending Amount */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex justify-between items-start mb-4">
               <div>
                 <p className="text-white/50 text-sm font-medium uppercase tracking-wider">{t('pending_amount')}</p>
                 <h3 className="text-3xl font-bold text-yellow-400 mt-1">{pendingAmount.toLocaleString()} <span className="text-lg text-yellow-400/50">MDL</span></h3>
               </div>
               <div className="p-3 bg-yellow-500/20 rounded-xl text-yellow-400">
                 <Undo2 size={24} />
               </div>
            </div>
            <div className="w-full bg-white/5 rounded-full h-1.5 mt-2">
               <div className="bg-yellow-500 h-1.5 rounded-full" style={{ width: '30%' }}></div>
            </div>
          </div>

          {/* Card 4: Active Payers / Unique Students */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <p className="text-white/50 text-sm font-medium uppercase tracking-wider">{t('active_payers')}</p>
                 <h3 className="text-3xl font-bold text-purple-400 mt-1">{new Set(filteredPayments.map(p => p.student_id)).size}</h3>
               </div>
               <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400">
                 <Users size={24} />
               </div>
            </div>
            <p className="text-sm text-white/40 mt-2">{t('unique_students_displayed') || 'В текущем списке'}</p>
          </div>
        </div>
        )}

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

        {/* Error Message */}
        {errorMessage && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 mb-6 backdrop-blur-sm animate-fade-up">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
                <span className="text-2xl">❌</span>
              </div>
              <span className="text-red-400 font-semibold text-lg">{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        {isAdmin && (
          <div className="sticky top-0 z-30 flex gap-2 mb-6 bg-[#0F1117]/95 backdrop-blur-sm p-2 rounded-xl w-full overflow-x-auto no-scrollbar touch-pan-x border-b border-white/10">
            <button
              onClick={() => setActiveTab('quick')}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                activeTab === 'quick' 
                  ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              {t('quick_payment_tab')}
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 flex-shrink-0 ${
                activeTab === 'expenses' 
                  ? 'bg-orange-500 text-white' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <FileText className="w-4 h-4" />
              {t('expenses_tab') || 'Расходы'}
            </button>
            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('matrix')}
                className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 flex-shrink-0 ${
                  activeTab === 'matrix' 
                    ? 'bg-blue-500 text-white' 
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`}
              >
                <Table className="w-4 h-4" />
                {t('payment_matrix') || 'Табель'}
              </button>
            )}
            <button
              onClick={() => setActiveTab('receipts')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 flex-shrink-0 ${
                activeTab === 'receipts' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Download className="w-4 h-4" />
              {t('receipts_tab') || 'Файлы (Чеки)'}
              {filteredReceipts.length > 0 && (
                <span className="ml-1 bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
                  {filteredReceipts.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === 'pending' 
                  ? 'bg-yellow-500 text-black' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('pending_tab')} ({pendingPayments.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === 'completed' 
                  ? 'bg-emerald-500 text-black' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('completed_tab')}
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === 'all' 
                  ? 'bg-white/20 text-white' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              {t('all_tab')}
            </button>
          </div>
        )}

        {/* PARENT TABS */}
        {isParent && (
          <div className="sticky top-0 z-30 flex gap-2 mb-6 bg-[#0F1117]/95 backdrop-blur-sm p-2 rounded-xl w-full overflow-x-auto border-b border-white/10 no-scrollbar">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'pending' 
                  ? 'bg-yellow-500 text-black' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <AlertCircle className="w-4 h-4" />
              {t('pending_tab')} ({pendingPayments.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'completed' 
                  ? 'bg-emerald-500 text-black' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Check className="w-4 h-4" />
              {t('history_tab') || 'История'}
            </button>
            <button
              onClick={() => setActiveTab('details')}
              className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === 'details' 
                  ? 'bg-blue-500 text-white' 
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >
              <Landmark className="w-4 h-4" />
              {t('payment_details') || 'Реквизиты и Оплата'}
            </button>
          </div>
        )}
        
        {/* Advanced Filters Bar */}
        {isAdmin && activeTab !== 'quick' && (activeTab !== 'matrix' || !isSuperAdmin) && activeTab !== 'expenses' && (
          <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-2xl flex flex-wrap gap-4 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input 
                type="text" 
                placeholder={t('search_placeholder_payments')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-black/20 border border-white/10 rounded-lg text-white focus:outline-none focus:border-yellow-500/50"
              />
            </div>

            {/* Date Range */}
            <div className="flex gap-2 items-center">
              <div className="w-[150px]">
                <CustomDatePicker 
                  selected={dateRange.start ? new Date(dateRange.start) : null}
                  onChange={(date) => {
                    if (!date) {
                        setDateRange({...dateRange, start: ''});
                        return;
                    }
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    setDateRange({...dateRange, start: `${year}-${month}-${day}`});
                  }}
                  placeholder={t('date_from') || 'C...'}
                />
              </div>
              <span className="text-white/30">-</span>
              <div className="w-[150px]">
                <CustomDatePicker 
                  selected={dateRange.end ? new Date(dateRange.end) : null}
                  onChange={(date) => {
                    if (!date) {
                        setDateRange({...dateRange, end: ''});
                        return;
                    }
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    setDateRange({...dateRange, end: `${year}-${month}-${day}`});
                  }}
                  placeholder={t('date_to') || 'По...'}
                />
              </div>
            </div>

            {/* Group Filter */}
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white/70 text-sm focus:outline-none focus:border-yellow-500/50"
            >
              <option value="">{t('all_groups')}</option>
              {Array.isArray(groups) && groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>

            {/* Method Filter */}
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-white/70 text-sm focus:outline-none focus:border-yellow-500/50"
            >
              <option value="">{t('all_methods')}</option>
              <option value="cash">{t('method_cash')}</option>
              <option value="card">{t('method_card')}</option>
              <option value="bank_transfer">{t('method_transfer')}</option>
            </select>

            {/* Clear Filters */}
            {(searchQuery || dateRange.start || dateRange.end || selectedGroup || selectedMethod) && (
              <button 
                onClick={() => {
                  setSearchQuery('');
                  setDateRange({start: '', end: ''});
                  setSelectedGroup('');
                  setSelectedMethod('');
                }}
                className="text-red-400 hover:text-red-300 text-sm font-medium px-2"
              >
                ✕ {t('clear_filters')}
              </button>
            )}

            <div className="flex-1"></div>
            
            <div className="flex gap-2">
              <button
                onClick={() => handleExport('excel')}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-green-400 hover:text-green-300 transition-all text-sm font-medium border border-white/10"
                title={t('export_excel')}
              >
                <FileText size={16} />
                <span className="hidden sm:inline">Excel</span>
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={isExporting}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-red-400 hover:text-red-300 transition-all text-sm font-medium border border-white/10"
                title={t('download_pdf')}
              >
                {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
                <span className="hidden sm:inline">PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* ====== CONTENT ====== */}
        {activeTab === 'receipts' ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Download className="w-5 h-5 text-blue-400" />
                {t('receipts_title') || 'Загруженные чеки'}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="p-4 text-white/50 font-medium text-sm">{t('student_th')}</th>
                    <th className="p-4 text-white/50 font-medium text-sm">{t('group_th')}</th>
                    <th className="p-4 text-white/50 font-medium text-sm">{t('sum_th')}</th>
                    <th className="p-4 text-white/50 font-medium text-sm">{t('period_th')}</th>
                    <th className="p-4 text-white/50 font-medium text-sm">{t('date_th')}</th>
                    <th className="p-4 text-white/50 font-medium text-sm text-center">{t('file_th') || 'Файл'}</th>
                    <th className="p-4 text-white/50 font-medium text-sm text-right">{t('actions_th')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredReceipts.length > 0 ? (
                    filteredReceipts.map(payment => {
                      const student = studentsMap.get(String(payment.student_id));
                      const group = groups.find(g => g.id === student?.group_id);
                      const fileUrl = payment.reference_id?.includes('/uploads/') 
                        ? `${import.meta.env.VITE_API_URL?.replace('/api/v1', '')}${payment.reference_id}`
                        : '#';

                      return (
                        <tr key={payment.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4">
                            <div className="font-bold text-white">
                              {student ? `${student.last_name} ${student.first_name}` : payment.student_name || t('unknown')}
                            </div>
                            <div className="text-xs text-white/40 mt-0.5">ID: {payment.student_id}</div>
                          </td>
                          <td className="p-4 text-white/70">
                            {group?.name || t('no_group')}
                          </td>
                          <td className="p-4 font-mono text-lg font-bold text-yellow-400">
                            {payment.amount} MDL
                          </td>
                          <td className="p-4 text-white/70">
                            {getMonthName(payment.payment_period)}
                          </td>
                          <td className="p-4 text-white/70">
                            {new Date(payment.payment_date).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-center">
                            <a 
                              href={fileUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors text-sm font-medium border border-blue-500/20"
                            >
                              <Download size={14} />
                              {t('download') || 'Скачать'}
                            </a>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => handleConfirmPayment(payment.id, payment.method || 'bank_transfer')}
                                className="px-4 py-2 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                              >
                                <Check size={16} />
                                {t('confirm') || 'Подтвердить'}
                              </button>
                              <button 
                                onClick={() => handleDelete(payment.id)}
                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20"
                                title={t('delete')}
                              >
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" className="p-12 text-center text-white/40">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                             <FileText size={32} className="opacity-50" />
                          </div>
                          <p>{t('no_receipts_found') || 'Нет загруженных чеков'}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : activeTab === 'expenses' ? (
          <Expenses />
        ) : activeTab === 'matrix' ? (
          <PaymentMatrix t={t} />
        ) : isAdmin && activeTab === 'quick' ? (
          <div className="mb-8">
            <div className="bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border border-yellow-500/20 rounded-2xl p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                <h2 className="text-xl font-bold text-yellow-400 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  {t('quick_payment_tab')}
                  <HelpCircle
                    className="w-4 h-4 text-yellow-300/80"
                    title={(t('quick_payment_hint') || 'Выберите ученика, сумму, период, тип и метод. В проде: счёт → подтверждение.') }
                  />
                </h2>
                {/* Quick Mode Tabs */}
                <div className="flex gap-1 bg-white/5 p-1 rounded-lg self-start sm:self-auto">
                  <button
                    onClick={() => { setQuickMode('search'); setSelectedStudent(null); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      quickMode === 'search' 
                        ? 'bg-yellow-500 text-black' 
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {t('search_mode')}
                  </button>
                  <button
                    onClick={() => { setQuickMode('group'); setSelectedStudent(null); setQuickSearch(''); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      quickMode === 'group' 
                        ? 'bg-yellow-500 text-black' 
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {t('group_mode')}
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Search or Group Filter */}
                <div className="space-y-4">
                  {quickMode === 'search' ? (
                    /* SEARCH MODE */
                    <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      {t('find_student_label')}
                    </label>
                    {/* Added Group Filter for Search Mode */}
                    <div className="mb-3">
                       <select
                        value={selectedGroupId}
                        onChange={(e) => { setSelectedGroupId(e.target.value); setSelectedStudent(null); }}
                        className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white/70 text-sm focus:outline-none focus:border-yellow-500/50"
                      >
                        <option value="">{t('all_groups')}</option>
                        {Array.isArray(groups) && groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        placeholder={t('find_student_placeholder')}
                        value={quickSearch}
                        onChange={(e) => {
                          setQuickSearch(e.target.value);
                          if (selectedStudent && !e.target.value.includes(selectedStudent.last_name)) {
                            setSelectedStudent(null);
                          }
                        }}
                        className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-yellow-500/50 pr-10"
                      />
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                    </div>
                    
                    {/* Student Dropdown */}
                    {filteredQuickStudents.length > 0 && !selectedStudent && (
                      <div className="mt-2 bg-[#1C1E24] border border-white/10 rounded-xl max-h-64 overflow-y-auto">
                        {filteredQuickStudents.map(student => {
                          const group = groups.find(g => g.id === student.group_id);
                          const hasPending = pendingPayments.some(p => p.student_id === student.id);
                          return (
                            <button
                              key={student.id}
                              onClick={() => handleSelectStudent(student)}
                              className="w-full px-4 py-3 text-left hover:bg-yellow-500/10 transition-colors border-b border-white/5 last:border-0 flex items-center justify-between"
                            >
                              <div>
                                <div className="font-medium text-white">
                                  {student.last_name} {student.first_name}
                                </div>
                                <div className="text-sm text-white/50">
                                  {group?.name || t('no_group')} • {student.individual_fee || group?.monthly_fee || '?'} MDL
                                </div>
                              </div>
                              {hasPending && (
                                <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-lg">
                                  {t('debt_label')}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Selected Student */}
                    {selectedStudent && (
                      <div className="mt-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                              <Users className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                              <div className="font-bold text-emerald-400">
                                {selectedStudent.last_name} {selectedStudent.first_name}
                              </div>
                              <div className="text-sm text-white/50">
                                {groups.find(g => g.id === selectedStudent.group_id)?.name || t('no_group')}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedStudent(null);
                              setQuickSearch('');
                              setQuickAmount('');
                            }}
                            className="text-white/50 hover:text-red-400"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  ) : (
                    /* GROUP MODE */
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">
                        {t('select_group_label')}
                      </label>
                      <select
                        value={selectedGroupId}
                        onChange={(e) => { setSelectedGroupId(e.target.value); setSelectedStudent(null); }}
                        className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                      >
                        <option value="">{t('all_groups')}</option>
                        {Array.isArray(groups) && groups.map(g => (
                          <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                      </select>
                      
                      {/* Students List with Debt Status */}
                      <div className="mt-4 bg-[#1C1E24] border border-white/10 rounded-xl max-h-80 overflow-y-auto">
                        {(() => {
                          const groupStudents = students.filter(s => 
                            !selectedGroupId || String(s.group_id) === String(selectedGroupId)
                          ).sort((a, b) => {
                            const nameA = `${a.last_name} ${a.first_name}`.toLowerCase();
                            const nameB = `${b.last_name} ${b.first_name}`.toLowerCase();
                            return nameA.localeCompare(nameB, 'ru');
                          });
                          
                          return groupStudents.map(student => {
                            const group = groups.find(g => g.id === student.group_id);
                            // Find all pending payments for this student
                            const studentPending = pendingPayments.filter(p => p.student_id === student.id);
                            const hasPending = studentPending.length > 0;
                            
                            // Calculate debt amount (sum of all pending payments)
                            const debtAmount = studentPending.reduce((sum, p) => sum + (p.amount || 0), 0);
                            
                            // Standard fee
                            const fee = student.individual_fee || group?.monthly_fee || 0;
                            
                            return (
                              <button
                                key={student.id}
                                onClick={() => {
                                  if (hasPending) {
                                    // Use oldest pending payment logic
                                    studentPending.sort((a, b) => new Date(a.payment_period) - new Date(b.payment_period));
                                    const oldest = studentPending[0];
                                    
                                    setSelectedStudent(student);
                                    setQuickAmount(oldest.amount.toString());
                                    setQuickPeriod(oldest.payment_period.slice(0, 7));
                                  } else {
                                    // Default logic
                                    setSelectedStudent(student);
                                    setQuickAmount(String(fee));
                                    setQuickPeriod(new Date().toISOString().slice(0, 7));
                                  }
                                }}
                                className={`w-full px-4 py-3 text-left hover:bg-yellow-500/10 transition-colors border-b border-white/5 last:border-0 flex items-center justify-between ${
                                  selectedStudent?.id === student.id ? 'bg-yellow-500/20' : ''
                                }`}
                              >
                                <div>
                                  <div className="font-medium text-white">
                                    {student.last_name} {student.first_name}
                                  </div>
                                  <div className="text-sm text-white/50">
                                    {hasPending ? (
                                        <span className="text-yellow-400 font-bold">{debtAmount} MDL (Долг)</span>
                                    ) : (
                                        <span>{fee} MDL</span>
                                    )}
                                  </div>
                                </div>
                                {hasPending && (
                                  <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-lg">
                                    {t('debt_label')}
                                  </span>
                                )}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column - Payment Details */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6">
                  <h3 className="text-lg font-bold text-white mb-4">{t('process_payment_title')}</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                        {t('amount_label')}
                        <HelpCircle className="w-4 h-4 text-white/50" title={t('amount_hint') || 'Сумма к оплате. Подставляется из долга или тарифа.'} />
                      </label>
                      <input
                        type="number"
                        value={quickAmount}
                        onChange={(e) => setQuickAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white font-mono text-lg focus:outline-none focus:border-yellow-500/50"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                        {t('month_label')}
                        <HelpCircle className="w-4 h-4 text-white/50" title={t('month_hint') || 'Период оплаты (YYYY-MM). Будет записан как YYYY-MM-01.'} />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={parseInt(quickPeriod.split('-')[1])}
                          onChange={(e) => {
                             const year = quickPeriod.split('-')[0];
                             const month = String(e.target.value).padStart(2, '0');
                             setQuickPeriod(`${year}-${month}`);
                          }}
                          className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50 appearance-none"
                        >
                          {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                              const date = new Date(2000, m - 1, 1);
                              const monthName = date.toLocaleDateString(language === 'ru' ? 'ru-RU' : (language === 'ro' ? 'ro-RO' : 'en-US'), { month: 'long' });
                              return <option key={m} value={m} className="capitalize">{monthName}</option>;
                          })}
                        </select>
                        <select
                          value={parseInt(quickPeriod.split('-')[0])}
                          onChange={(e) => {
                             const month = quickPeriod.split('-')[1];
                             setQuickPeriod(`${e.target.value}-${month}`);
                          }}
                          className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50 appearance-none"
                        >
                          {academyYears.map(year => (
                              <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                        {t('payment_type') || 'Тип платежа'}
                        <HelpCircle className="w-4 h-4 text-white/50" title={t('type_hint') || 'Определяет позицию счёта (item_type). Для Экипировки/Прочего добавьте описание.'} />
                      </label>
                      <select
                        value={quickType}
                        onChange={(e) => setQuickType(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                      >
                        <option value="subscription">{t('type_subscription') || 'Абонемент'}</option>
                        <option value="group_training">Турниры</option>
                        <option value="individual">{t('type_individual') || 'Индивидуальные тренировки'}</option>
                        <option value="equipment">{t('type_equipment') || 'Покупка экипировки'}</option>
                        <option value="other">{t('type_other') || 'Прочее'}</option>
                      </select>
                      {(quickType === 'equipment' || quickType === 'other') && (
                        <input
                          type="text"
                          value={quickCustomDesc}
                          onChange={(e) => setQuickCustomDesc(e.target.value)}
                          placeholder={quickType === 'equipment' ? (t('equipment_placeholder') || 'Например: Форма, Гетры') : (t('description_placeholder') || 'Введите описание...')}
                          className="mt-2 w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-yellow-500/50"
                        />
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2 flex items-center gap-2">
                        {t('payment_method_label')}
                        <HelpCircle className="w-4 h-4 text-white/50" title={t('method_hint') || 'Способ оплаты. Будет сохранён при подтверждении платежа.'} />
                      </label>
                      <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                        {['cash', 'card', 'bank_transfer'].map(method => (
                          <button
                            key={method}
                            onClick={() => setQuickMethod(method)}
                            className={`px-2 sm:px-3 py-2 sm:py-2 rounded-lg text-xs sm:text-sm font-medium border transition-all flex items-center justify-center ${
                              quickMethod === method 
                                ? 'bg-yellow-500 text-black border-yellow-500' 
                                : 'bg-transparent border-white/10 text-white/60 hover:border-white/30'
                            }`}
                          >
                            {getMethodLabel(method)}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <button
                      onClick={handleQuickPayment}
                      disabled={!selectedStudent || !quickAmount || processingQuick}
                      className="w-full mt-4 py-4 bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-bold rounded-xl hover:from-yellow-400 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {processingQuick ? (
                        <>
                          <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                          {t('processing')}
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-5 h-5" />
                          {t('process_payment_btn')}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ====== PARENT VIEW ====== */}
        {isParent && (
          <div className="space-y-6">
            {activeTab === 'details' ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden p-6 animate-fade-up">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Landmark className="w-6 h-6 text-blue-400" />
                  {t('payment_details') || 'Реквизиты и Оплата'}
                </h2>
                
                {/* Tabs: QR / Requisites */}
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => setPaymentTab('qr')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      paymentTab === 'qr' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    QR Code
                  </button>
                  <button
                    onClick={() => setPaymentTab('requisites')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      paymentTab === 'requisites' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {t('requisites') || 'Реквизиты'}
                  </button>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column: Payment Info */}
                  <div>
                    {paymentTab === 'qr' ? (
                      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl border-4 border-white shadow-lg">
                         {paymentInfo?.payment_qr_url ? (
                           <img 
                             src={`${import.meta.env.VITE_API_URL?.replace('/api/v1', '')}${paymentInfo.payment_qr_url}`} 
                             alt="Payment QR" 
                             className="w-64 h-64 object-contain"
                           />
                         ) : (
                           <div className="w-64 h-64 flex items-center justify-center text-gray-400 bg-gray-100 rounded-xl">
                             No QR Code
                           </div>
                         )}
                         <p className="mt-4 text-gray-500 text-center text-sm font-medium">
                           {t('scan_to_pay') || 'Сканируйте QR-код через приложение банка'}
                         </p>
                      </div>
                    ) : (
                      <div className="bg-black/20 rounded-2xl p-6 space-y-4 font-mono text-sm border border-white/10">
                        <div>
                          <p className="text-white/40 mb-1 text-xs uppercase tracking-wider">{t('bank_name') || 'Банк'}</p>
                          <p className="text-white select-all text-lg">{paymentInfo?.bank_name || 'MAIB'}</p>
                        </div>
                        <div>
                          <p className="text-white/40 mb-1 text-xs uppercase tracking-wider">{t('iban_mdl') || 'IBAN (MDL)'}</p>
                          <p className="text-white select-all break-all text-lg">{paymentInfo?.iban_mdl || '-'}</p>
                        </div>
                        <div>
                          <p className="text-white/40 mb-1 text-xs uppercase tracking-wider">{t('iban_eur') || 'IBAN (EUR)'}</p>
                          <p className="text-white select-all break-all text-lg">{paymentInfo?.iban_eur || '-'}</p>
                        </div>
                        <div>
                          <p className="text-white/40 mb-1 text-xs uppercase tracking-wider">{t('fiscal_code') || 'Фискальный код'}</p>
                          <p className="text-white select-all text-lg">{paymentInfo?.fiscal_code || '-'}</p>
                        </div>
                        <div>
                          <p className="text-white/40 mb-1 text-xs uppercase tracking-wider">{t('company_name') || 'Получатель'}</p>
                          <p className="text-white select-all text-lg">{paymentInfo?.company_name || 'Football Academy'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Right Column: Upload Receipt */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                      <Download className="w-5 h-5 text-emerald-400" />
                      {t('upload_receipt_title') || 'Загрузить чек'}
                    </h3>
                    
                    <div className="space-y-4">
                      {/* Select Student (if multiple) */}
                      {students.length > 1 && (
                        <div>
                          <label className="block text-sm font-medium text-white/70 mb-2">{t('select_student')}</label>
                          <select
                            value={selectedStudentForPayment}
                            onChange={(e) => setSelectedStudentForPayment(e.target.value)}
                            className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                          >
                            <option value="">{t('select_student_placeholder')}</option>
                            {students.map(s => (
                              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      
                      {/* Amount */}
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">{t('amount_paid') || 'Сумма оплаты (MDL)'}</label>
                        <input
                          type="number"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      
                      {/* File Upload */}
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-2">{t('receipt_file') || 'Файл чека (PDF, JPG, PNG)'}</label>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={handleFileChange}
                          className="w-full text-sm text-white/70
                            file:mr-4 file:py-2.5 file:px-4
                            file:rounded-xl file:border-0
                            file:text-sm file:font-semibold
                            file:bg-blue-500/10 file:text-blue-400
                            hover:file:bg-blue-500/20 cursor-pointer"
                        />
                      </div>
                      
                      {uploadError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm animate-fade-in">
                          {uploadError}
                        </div>
                      )}
                      
                      {uploadSuccess && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm animate-fade-in">
                          {t('upload_success') || 'Чек успешно загружен!'}
                        </div>
                      )}
                      
                      <button
                        onClick={handleUploadReceipt}
                        disabled={isUploading || !uploadFile || !paymentAmount}
                        className="w-full py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                      >
                        {isUploading ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-5 h-5" />
                            {t('send_receipt') || 'Отправить чек'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
             /* Payment History List */
             <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
               <div className="p-6 border-b border-white/10">
                 <h2 className="text-xl font-bold text-white flex items-center gap-2">
                   {activeTab === 'pending' ? (
                     <>
                        <AlertCircle className="w-5 h-5 text-yellow-400" />
                        {t('pending_payments_title') || 'Неоплаченные счета'}
                     </>
                   ) : (
                     <>
                        <Check className="w-5 h-5 text-emerald-400" />
                        {t('payment_history') || 'История платежей'}
                     </>
                   )}
                 </h2>
               </div>
               
               {filteredPayments.length > 0 ? (
                 <div className="divide-y divide-white/5">
                   {filteredPayments.map(payment => (
                     <div key={payment.id} className="p-4 hover:bg-white/5 transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                       <div className="flex items-start gap-4">
                         <div className={`p-3 rounded-xl ${
                           payment.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                           payment.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                           'bg-red-500/20 text-red-400'
                         }`}>
                           {payment.status === 'completed' ? <CreditCard className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                         </div>
                         <div>
                           <div className="font-bold text-white text-lg">
                             {payment.amount} MDL
                           </div>
                           <div className="flex flex-col gap-1 mt-1">
                             <div className="text-sm text-white/60 flex items-center gap-2">
                               <Calendar className="w-3 h-3" />
                               {t('paid_for') || 'Оплата за'}: <span className="text-white font-medium">{getMonthName(payment.payment_period)}</span>
                             </div>
                             <div className="text-xs text-white/40">
                               {new Date(payment.payment_date).toLocaleDateString()} • {getMethodLabel(payment.method)}
                             </div>
                           </div>
                         </div>
                       </div>
                       
                       <div className="flex flex-col items-end gap-2">
                         {getStatusBadge(payment)}
                         {payment.description && (
                           <span className="text-xs text-white/40 max-w-[200px] text-right truncate">
                             {payment.description}
                           </span>
                         )}
                       </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <div className="p-8 text-center text-white/40">
                   {t('no_payments_found') || 'История платежей пуста'}
                 </div>
               )}
             </div>
            )}
          </div>
        )}

        {/* ====== ADMIN TABLE VIEW ====== */}
        {isAdmin && activeTab !== 'quick' && activeTab !== 'matrix' && activeTab !== 'expenses' && activeTab !== 'receipts' && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm">{t('student_th')}</th>
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm">{t('group_th')}</th>
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm text-right">{t('sum_th')}</th>
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm text-center">
                      <span className="inline-flex items-center gap-1 justify-center">
                        {t('purpose_th') || 'Назначение'}
                        <HelpCircle className="w-4 h-4 text-white/50" title={t('purpose_hint') || 'Назначение платежа: item_type и описание из счёта.'} />
                      </span>
                    </th>
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm text-center">{t('period_th') || 'Период'}</th>
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm text-center">{t('date_th')}</th>
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm text-center">
                      <span className="inline-flex items-center gap-1 justify-center">
                        {t('method_th')}
                        <HelpCircle className="w-4 h-4 text-white/50" title={t('method_th_hint') || 'Метод оплаты, сохранённый при подтверждении.'} />
                      </span>
                    </th>
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm text-center">
                      <span className="inline-flex items-center gap-1 justify-center">
                        {t('status_th')}
                        <HelpCircle className="w-4 h-4 text-white/50" title={t('status_th_hint') || 'Статус счёта: Ожидает (pending) или Завершён (completed).'} />
                      </span>
                    </th>
                    <th className="p-3 md:p-4 text-white/50 font-medium text-sm text-right">{t('actions_th')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredPayments.length > 0 ? (
                    filteredPayments.map(payment => {
                      const student = students.find(s => s.id === payment.student_id);
                      const group = groups.find(g => g.id === student?.group_id);
                      
                      return (
                        <tr key={payment.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-3 md:p-4">
                            <div className="font-medium text-white">
                              {student ? `${student.last_name} ${student.first_name}` : payment.student_name || t('unknown')}
                            </div>
                          </td>
                          <td className="p-3 md:p-4 text-white/70">
                            {group?.name || t('no_group')}
                          </td>
                          <td className="p-3 md:p-4 text-right font-mono text-white">
                            {payment.amount} MDL
                          </td>
                          <td className="p-3 md:p-4 text-center text-white/70">
                             {payment.invoice_items && payment.invoice_items.length > 0 ? (
                                <div className="flex flex-col gap-1 items-center">
                                    {payment.invoice_items.map(item => (
                                        <span key={item.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/10 text-white/80">
                                            {item.item_type === 'membership' && '💳 '}
                                            {item.item_type === 'equipment' && '👕 '}
                                            {item.item_type === 'group_training' && '🏆 '}
                                            {item.description || item.item_type}
                                        </span>
                                    ))}
                                </div>
                             ) : (
                                <span className="text-xs text-white/50">{payment.description || t('invoice_subscription_desc') || 'Абонемент'}</span>
                             )}
                          </td>
                          <td className="p-3 md:p-4 text-center text-white/70">
                            {getMonthName(payment.payment_period)}
                          </td>
                          <td className="p-3 md:p-4 text-center text-white/70">
                            {new Date(payment.payment_date).toLocaleDateString()}
                          </td>
                          <td className="p-3 md:p-4 text-center text-white/70">
                            {getMethodLabel(payment.method)}
                          </td>
                          <td className="p-3 md:p-4 text-center">
                            {getStatusBadge(payment)}
                          </td>
                          <td className="p-3 md:p-4 text-right">
                            <div className="flex justify-end gap-2">
                              {payment.status === 'pending' && (
                                <>
                                  <button 
                                    onClick={() => handleConfirmPayment(payment.id, 'cash')}
                                    className="p-3 md:p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors flex items-center gap-1"
                                    title={t('confirm_cash') || 'Оплатить наличными'}
                                  >
                                    <span className="text-[10px] font-bold uppercase tracking-wider">CASH</span>
                                    <Check size={16} />
                                  </button>

                                  <button 
                                    onClick={() => handleConfirmPayment(payment.id, 'card')}
                                    className="p-3 md:p-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors flex items-center gap-1"
                                    title={t('confirm_card') || 'Оплатить картой'}
                                  >
                                    <span className="text-[10px] font-bold uppercase tracking-wider">CARD</span>
                                    <CreditCard size={16} />
                                  </button>

                                  <button 
                                    onClick={() => handleConfirmPayment(payment.id, 'bank_transfer')}
                                    className="p-3 md:p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors flex items-center gap-1"
                                    title={t('confirm_transfer') || 'Оплатить переводом'}
                                  >
                                    <span className="text-[10px] font-bold uppercase tracking-wider">BANK</span>
                                    <Landmark size={16} />
                                  </button>
                                </>
                              )}
                              {payment.status === 'pending' && (
                                <button 
                                  onClick={() => handleEditPayment(payment.id)}
                                  className="p-3 md:p-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors"
                                  title={t('edit') || 'Редактировать'}
                                >
                                  <Edit size={16} />
                                </button>
                              )}
                              <button 
                                onClick={() => handleDelete(payment.id)}
                                className="p-3 md:p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                                title={t('delete_payment')}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-white/40">
                        {t('no_payments_found')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setDeleteModal({ show: false, paymentId: null })}>
          <div className="bg-[#1C1E24] border border-red-500/30 rounded-2xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto p-6 animate-fade-up shadow-2xl shadow-red-900/20" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-red-500/20 rounded-xl text-red-400">
                <AlertTriangle size={32} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">
                  {t('delete_warning_balance_title') || 'Удаление платежа'}
                </h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  {t('delete_warning_balance_message') || '⚠️ Удаление оплаченного платежа приведет к уменьшению баланса ученика и может создать "минус" (долг).'}
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
              <h4 className="text-sm font-bold text-white mb-2 uppercase tracking-wide opacity-80">
                {t('delete_warning_instruction') || 'Как исправить ошибку:'}
              </h4>
              <ul className="space-y-3">
                <li className="flex gap-3 text-sm text-white/80">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">1</span>
                  <span>{t('delete_warning_step1') || 'Удалите этот ошибочный платеж.'}</span>
                </li>
                <li className="flex gap-3 text-sm text-white/80">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">2</span>
                  <span className="text-emerald-400 font-medium">{t('delete_warning_step2') || 'Сразу создайте НОВЫЙ правильный платеж.'}</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteModal({ show: false, paymentId: null })}
                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
              >
                {t('cancel_action') || 'Отмена'}
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-bold shadow-lg shadow-red-500/20"
              >
                {t('delete_confirm_action') || 'Я понимаю, удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowEditModal(false)}>
          <div className="bg-[#1C1E24] border border-blue-500/30 rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="p-4 md:p-6 border-b border-white/10 shrink-0 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">{t('edit_payment_title') || 'Редактировать платеж'}</h3>
              <button onClick={() => setShowEditModal(false)} className="text-white/40 hover:text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-4 md:p-6 overflow-y-auto flex-1 min-h-0">
              <form id="edit-payment-form" onSubmit={saveEditedPayment} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('amount_label')}</label>
                  <input
                    type="number"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('period_label')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={parseInt(editPeriod.split('-')[1])}
                      onChange={(e) => {
                         const year = editPeriod.split('-')[0];
                         const month = String(e.target.value).padStart(2, '0');
                         setEditPeriod(`${year}-${month}`);
                      }}
                      className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                    >
                      {Array.from({length: 12}, (_, i) => i + 1).map(m => {
                          const date = new Date(2000, m - 1, 1);
                          const monthName = date.toLocaleDateString(language === 'ru' ? 'ru-RU' : (language === 'ro' ? 'ro-RO' : 'en-US'), { month: 'long' });
                          return <option key={m} value={m} className="capitalize">{monthName}</option>;
                      })}
                    </select>
                    <select
                      value={parseInt(editPeriod.split('-')[0])}
                      onChange={(e) => {
                         const month = editPeriod.split('-')[1];
                         setEditPeriod(`${e.target.value}-${month}`);
                      }}
                      className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                    >
                      {academyYears.map(year => (
                          <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-6 border-t border-white/10 shrink-0 flex gap-3 bg-[#1C1E24]">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                form="edit-payment-form"
                className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-bold"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Group Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowInvoiceModal(false)}>
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden animate-fade-up" onClick={e => e.stopPropagation()}>
            <div className="p-4 md:p-6 border-b border-white/10 shrink-0">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg md:text-xl font-bold text-white leading-tight">{t('invoice_group_title') || 'Выставить счет группе'}</h3>
                <button onClick={() => setShowInvoiceModal(false)} className="text-white/40 hover:text-white shrink-0 ml-2">
                  <X size={24} />
                </button>
              </div>
              <p className="text-white/50 text-sm">{t('invoice_group_hint')}</p>
            </div>
            
            <div className="p-4 md:p-6 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
              {invoiceError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-sm text-red-400">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{invoiceError}</span>
                </div>
              )}
              <form id="invoice-group-form" onSubmit={handleInvoiceGroup} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('group_label')}</label>
                  <select
                    required
                    value={invoiceForm.groupId}
                    onChange={(e) => setInvoiceForm({...invoiceForm, groupId: e.target.value})}
                    className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="">{t('select_group_placeholder')}</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                
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
                      className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50 appearance-none"
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
                      className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50 appearance-none"
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
                    className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="subscription">{t('type_subscription') || 'Абонемент'}</option>
                    <option value="group_training">Турниры</option>
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
                       className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                     />
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">
                    {t('amount_override_label') || 'Сумма (необязательно)'}
                  </label>
                  <input
                    type="number"
                    placeholder={t('default_amount_placeholder') || 'По умолчанию (из настроек)'}
                    value={invoiceForm.customAmount}
                    onChange={(e) => setInvoiceForm({...invoiceForm, customAmount: e.target.value})}
                    className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-blue-500/50"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    {t('amount_override_hint') || 'Оставьте пустым, чтобы использовать стоимость из настроек группы/ученика'}
                  </p>
                </div>
                
              </form>
            </div>
            
            <div className="p-4 md:p-6 border-t border-white/10 bg-[#1C1E24] sticky bottom-0 z-10 shrink-0">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setShowInvoiceModal(false)}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium order-2 sm:order-1"
                >
                  {t('cancel')}
                </button>
                <button
                  form="invoice-group-form"
                  type="submit"
                  className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors font-bold order-1 sm:order-2"
                >
                  {t('create_invoices_btn') || 'Выставить счета'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Individual Modal */}
      {showIndividualModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowIndividualModal(false)}>
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col animate-fade-up shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 md:p-6 border-b border-white/10 shrink-0">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg md:text-xl font-bold text-white leading-tight">{t('invoice_individual_title') || 'Выставить счет ученику'}</h3>
                <button onClick={() => setShowIndividualModal(false)} className="text-white/40 hover:text-white shrink-0 ml-2">
                  <X size={24} />
                </button>
              </div>
              <p className="text-white/50 text-sm">{t('invoice_individual_hint')}</p>
            </div>
            
            <div className="p-4 md:p-6 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
              {individualError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-sm text-red-400">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{individualError}</span>
                </div>
              )}
              <form id="individual-invoice-form" onSubmit={handleInvoiceStudent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">{t('group_label')}</label>
                   <select
                  value={invoiceGroupFilter}
                  onChange={(e) => { 
                    setInvoiceGroupFilter(e.target.value); 
                    setIndividualForm({...individualForm, studentId: ''}); // Reset selected student when group changes
                    setStudentSearchQuery('');
                  }}
                  className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50 mb-4"
                >
                  <option value="">{t('all_groups')}</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>

                <label className="block text-sm font-medium text-white/70 mb-2">{t('student_label')}</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t('search_student_placeholder')}
                    value={studentSearchQuery}
                    onChange={(e) => setStudentSearchQuery(e.target.value)}
                    className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50 pr-10"
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                  
                  {/* Dropdown results */}
                  {(studentSearchQuery || invoiceGroupFilter) && !individualForm.studentId && (
                    <div className="absolute z-20 mt-1 w-full bg-[#2A2D35] border border-white/10 rounded-xl max-h-48 overflow-y-auto shadow-xl left-0 custom-scrollbar">
                      {filteredStudentsForModal.length > 0 ? (
                        filteredStudentsForModal.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setIndividualForm({...individualForm, studentId: s.id});
                            setStudentSearchQuery(`${s.last_name} ${s.first_name}`);
                            // Pre-fill amount
                            const group = groups.find(g => g.id === s.group_id);
                            const amount = s.individual_fee || group?.monthly_fee || '';
                            setIndividualForm(prev => ({...prev, amount, studentId: s.id}));
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-white/5 border-b border-white/5 last:border-0"
                        >
                          <div className="font-medium text-white">{s.last_name} {s.first_name}</div>
                          <div className="text-xs text-white/50">{groups.find(g => g.id === s.group_id)?.name || '-'}</div>
                        </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-white/30 text-sm">{t('no_students_found') || 'Нет учеников'}</div>
                      )}
                    </div>
                  )}
                </div>
                {individualForm.studentId && (
                   <div className="mt-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg flex justify-between items-center">
                     <span className="text-purple-300 font-medium">{studentSearchQuery}</span>
                     <button 
                       type="button"
                       onClick={() => {
                         setIndividualForm({...individualForm, studentId: ''});
                         setStudentSearchQuery('');
                       }}
                       className="text-white/40 hover:text-white"
                     >
                       <X size={16} />
                     </button>
                   </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">{t('period_label')}</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={parseInt(individualForm.period.split('-')[1])}
                    onChange={(e) => {
                       const year = individualForm.period.split('-')[0];
                       const month = String(e.target.value).padStart(2, '0');
                       setIndividualForm({...individualForm, period: `${year}-${month}`});
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
                    value={parseInt(individualForm.period.split('-')[0])}
                    onChange={(e) => {
                       const month = individualForm.period.split('-')[1];
                       setIndividualForm({...individualForm, period: `${e.target.value}-${month}`});
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
                  value={individualForm.paymentType}
                  onChange={(e) => setIndividualForm({...individualForm, paymentType: e.target.value})}
                  className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                >
                  <option value="subscription">{t('type_subscription') || 'Абонемент'}</option>
                  <option value="group_training">Турниры</option>
                  <option value="individual">{t('type_individual') || 'Индивидуальные тренировки'}</option>
                  <option value="equipment">{t('type_equipment') || 'Покупка экипировки'}</option>
                  <option value="other">{t('type_other') || 'Прочее'}</option>
                </select>
              </div>

              {(individualForm.paymentType === 'equipment' || individualForm.paymentType === 'other') && (
                <div>
                   <label className="block text-sm font-medium text-white/70 mb-2">
                     {individualForm.paymentType === 'equipment' ? (t('equipment_details') || 'Детали экипировки') : (t('description') || 'Описание')}
                   </label>
                   <input
                     type="text"
                     value={individualForm.customDescription}
                     onChange={(e) => setIndividualForm({...individualForm, customDescription: e.target.value})}
                     placeholder={individualForm.paymentType === 'equipment' ? (t('equipment_placeholder') || 'Например: Форма, Гетры') : (t('description_placeholder') || 'Введите описание...')}
                     className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                   />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-white/70 mb-2">{t('amount_label')}</label>
                <input
                  type="number"
                  required
                  value={individualForm.amount}
                  onChange={(e) => setIndividualForm({...individualForm, amount: e.target.value})}
                  className="w-full px-4 py-3 bg-[#0F1117] border border-white/10 rounded-xl text-white focus:outline-none focus:border-purple-500/50"
                />
              </div>
                
              </form>
            </div>
            
            <div className="p-4 md:p-6 border-t border-white/10 bg-[#1C1E24] sticky bottom-0 z-10 shrink-0">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setShowIndividualModal(false)}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium order-2 sm:order-1"
                >
                  {t('cancel')}
                </button>
                <button
                  form="individual-invoice-form"
                  type="submit"
                  disabled={processingIndividual}
                  className={`flex-1 px-4 py-3 rounded-xl transition-colors font-bold order-1 sm:order-2 ${
                    processingIndividual 
                      ? 'bg-purple-500/50 text-white/50 cursor-not-allowed' 
                      : 'bg-purple-500 hover:bg-purple-600 text-white'
                  }`}
                >
                  {processingIndividual ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 inline animate-spin" />
                      {t('processing') || 'Обработка...'}
                    </>
                  ) : (
                    t('create_invoice_btn') || 'Выставить счет'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Payment Confirmation Modal */}
      {showQuickConfirmModal && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setShowQuickConfirmModal(false)}>
          <div className="bg-[#1C1E24] border border-yellow-500/30 rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col animate-fade-up shadow-2xl shadow-yellow-900/20" onClick={e => e.stopPropagation()}>
            <div className="p-6 pb-0 shrink-0">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-500/30">
                  <CreditCard className="w-8 h-8 text-yellow-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{t('confirm_payment_title') || 'Подтверждение платежа'}</h3>
                <p className="text-white/60 text-sm">
                  {t('confirm_payment_message') || 'Пожалуйста, проверьте данные платежа перед подтверждением.'}
                </p>
              </div>
            </div>

            <div className="p-6 pt-0 overflow-y-auto">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm">{t('student_label')}</span>
                  <span className="text-white font-medium">{selectedStudent.last_name} {selectedStudent.first_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm inline-flex items-center gap-1">
                    {t('amount_label')}
                    <HelpCircle className="w-4 h-4 text-white/50" title={t('amount_hint') || 'Подтверждаемая сумма платежа.'} />
                  </span>
                  <span className="text-yellow-400 font-bold text-lg">{quickAmount} MDL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm inline-flex items-center gap-1">
                    {t('period_label')}
                    <HelpCircle className="w-4 h-4 text-white/50" title={t('month_hint') || 'Период будет сохранён как YYYY-MM-01.'} />
                  </span>
                  <span className="text-white font-medium">{getMonthName(quickPeriod)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm inline-flex items-center gap-1">
                    {t('purpose_th') || 'Назначение'}
                    <HelpCircle className="w-4 h-4 text-white/50" title={t('purpose_hint') || 'Что именно оплачивается (тип услуги и описание).' } />
                  </span>
                  <span className="text-white font-medium">
                    {getPaymentDescription(quickType, quickCustomDesc, quickPeriod)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/50 text-sm inline-flex items-center gap-1">
                    {t('payment_method_label')}
                    <HelpCircle className="w-4 h-4 text-white/50" title={t('method_hint') || 'Выбранный способ оплаты.'} />
                  </span>
                  <span className="text-white font-medium">{getMethodLabel(quickMethod)}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 pt-0 shrink-0">
              <button
                onClick={() => setShowQuickConfirmModal(false)}
                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
              >
                {t('cancel')}
              </button>
              <button
                onClick={confirmQuickPayment}
                disabled={processingQuick}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black rounded-xl transition-colors font-bold shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2"
              >
                {processingQuick ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check size={20} />
                    {t('confirm')}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
