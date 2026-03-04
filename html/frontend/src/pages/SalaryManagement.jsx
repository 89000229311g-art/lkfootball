import { useState, useEffect, useCallback } from 'react';
import { salariesAPI, loggingAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Download, FileText, Loader2, Phone } from 'lucide-react';
import { exportToExcel, getDateString, downloadBlob } from '../utils/exportUtils';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { toast } from 'react-hot-toast';

export default function SalaryManagement() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('report'); // report, contracts, payments
  
  const MONTHS = language === 'ro' ? [
    '', 'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ] : [
    '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const SALARY_TYPES = {
    fixed: t('st_fixed'),
    per_student: t('st_per_student'),
    per_training: t('st_per_training'),
    combined: t('st_combined')
  };

  const PAYMENT_TYPES = {
    advance: t('pt_advance'),
    salary: t('pt_salary'),
    bonus: t('pt_bonus'),
    deduction: t('pt_deduction')
  };
  
  // Export State
  const [isExporting, setIsExporting] = useState(false);
  
  // Report state
  const [report, setReport] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  
  // Staff state
  const [staff, setStaff] = useState([]);
  
  // Payments state (lifted from PaymentsHistory)
  const [payments, setPayments] = useState([]);

  // Modal state
  const [showContractModal, setShowContractModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [contractForm, setContractForm] = useState({
    salary_type: 'fixed',
    base_salary: '',
    per_student_rate: '',
    per_training_rate: '',
    rates: {},
    advance_percent: 40,
    advance_day: 25,
    salary_day: 10,
    effective_from: new Date().toISOString().split('T')[0],
    notes: ''
  });
  const [paymentForm, setPaymentForm] = useState({
    payment_type: 'salary',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    method: 'cash',
    description: ''
  });
  const [bonusForm, setBonusForm] = useState({
    amount: '',
    description: '',
    payment_date: new Date().toISOString().split('T')[0],
    method: 'cash'
  });

  const EVENT_TYPES_LIST = [
    'training',
    'game',
    'tournament',
    'championship',
    'parent_meeting',
    'individual',
    'medical',
    'testing'
  ];

  const loadPayments = useCallback(async (periodFilter = true) => {
    try {
      const params = { limit: periodFilter ? 100 : 10000 };
      if (periodFilter) {
        params.year = selectedYear;
        params.month = selectedMonth;
      }
      const res = await salariesAPI.getPayments(params);
      const data = res.data?.data || res.data || [];
      setPayments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading payments:', error);
      loggingAPI.logFrontendError(
        'Error loading salary payments',
        { page: 'SalaryManagement', translationKey: 'error_loading_payments' },
        error?.response?.data?.detail || error.message || null
      );
      setPayments([]);
    }
  }, [selectedMonth, selectedYear]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const staffRes = await salariesAPI.getStaff();
        const staffData = staffRes.data?.data || staffRes.data || [];
        setStaff(Array.isArray(staffData) ? staffData : []);
      } catch (e) {
        console.error('Error loading staff:', e);
        loggingAPI.logFrontendError(
          'Error loading staff in SalaryManagement',
          { page: 'SalaryManagement', translationKey: 'error_loading_staff' },
          e?.response?.data?.detail || e.message || null
        );
        setStaff([]);
      }

      try {
        const reportRes = await salariesAPI.getReport(selectedYear, selectedMonth);
        setReport(reportRes.data?.data || reportRes.data || null);
      } catch (e) {
        console.error('Error loading report:', e);
        // Only show error if not 404 (404 means no report generated yet, which is fine)
        if (e.response?.status !== 404) {
             loggingAPI.logFrontendError(
               'Error loading salary report',
               { page: 'SalaryManagement', translationKey: 'error_loading_report' },
               e?.response?.data?.detail || e.message || null
             );
        }
        setReport(null);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      loggingAPI.logFrontendError(
        'Error loading salary management data',
        { page: 'SalaryManagement' },
        error?.response?.data?.detail || error.message || null
      );
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    loadData();
    // For payments tab, load all history initially or when tab changes
    if (activeTab === 'payments') {
        loadPayments(false); // No filter = all history
    } else {
        loadPayments(true);
    }
  }, [loadData, loadPayments, activeTab]);

  useEffect(() => {
    if ((activeTab === 'contracts' && staff.length === 0) || 
        (activeTab === 'report' && !report)) {
      loadData();
    }
  }, [activeTab, loadData, report, staff.length]);

  const handleCreateContract = async () => {
    if (!selectedEmployee) return;
    try {
      await salariesAPI.createContract({
        user_id: selectedEmployee.id,
        ...contractForm,
        base_salary: parseFloat(contractForm.base_salary) || 0,
        per_student_rate: parseFloat(contractForm.per_student_rate) || 0,
        per_training_rate: parseFloat(contractForm.per_training_rate) || 0,
        advance_percent: parseFloat(contractForm.advance_percent) || 0,
        advance_day: parseInt(contractForm.advance_day) || 25,
      });
      toast.success('Контракт создан!');
      setShowContractModal(false);
      loadData();
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error creating salary contract',
        { page: 'SalaryManagement' },
        error?.response?.data?.detail || error.message || null
      );
    }
  };

  const handleCreatePayment = async () => {
    if (!selectedEmployee) return;
    try {
      await salariesAPI.createPayment({
        user_id: selectedEmployee.id,
        ...paymentForm,
        amount: parseFloat(paymentForm.amount) || 0,
        status: 'completed'
      });
      toast.success('Выплата добавлена!');
      setShowPaymentModal(false);
      loadData();
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error creating salary payment',
        { page: 'SalaryManagement' },
        error?.response?.data?.detail || error.message || null
      );
    }
  };

  const openContractModal = (employee) => {
    setSelectedEmployee(employee);
    // Загружаем существующие данные контракта если есть
    setContractForm({
      salary_type: employee.salary_type || 'fixed',
      base_salary: employee.base_salary || '',
      per_student_rate: employee.per_student_rate || '',
      per_training_rate: employee.per_training_rate || '',
      rates: employee.rates || {},
      advance_percent: employee.advance_percent || 40,
      advance_day: employee.advance_day || 25,
      salary_day: employee.salary_day || 10,
      effective_from: employee.effective_from || new Date().toISOString().split('T')[0],
      notes: employee.notes || ''
    });
    setShowContractModal(true);
  };

  const openPaymentModal = (employee, type = 'salary') => {
    setSelectedEmployee(employee);
    const calc = report?.employees?.find(e => e.user_id === employee.id);
    const advanceAmount = calc ? calc.calculated_salary * 0.4 : 0;
    const calculatedAmount = type === 'advance' ? Math.round(advanceAmount) : Math.round((calc?.calculated_salary || 0) - advanceAmount);
    
    setPaymentForm({
      payment_type: type,
      amount: calculatedAmount || '',
      payment_date: new Date().toISOString().split('T')[0],
      period_month: selectedMonth,
      period_year: selectedYear,
      method: 'cash',
      description: ''
    });
    setShowPaymentModal(true);
  };

  const openBonusModal = (employee) => {
    setSelectedEmployee(employee);
    setBonusForm({
      amount: '',
      description: '',
      payment_date: new Date().toISOString().split('T')[0],
      method: 'cash'
    });
    setShowBonusModal(true);
  };

  const handleCreateBonus = async () => {
    if (!selectedEmployee || !bonusForm.amount) {
      loggingAPI.logFrontendError(
        'Bonus amount not specified',
        { page: 'SalaryManagement' },
        null
      );
      return;
    }
    try {
      await salariesAPI.createPayment({
        user_id: selectedEmployee.id,
        payment_type: 'bonus',
        amount: parseFloat(bonusForm.amount) || 0,
        payment_date: bonusForm.payment_date,
        period_month: selectedMonth,
        period_year: selectedYear,
        method: bonusForm.method,
        description: bonusForm.description || 'Премия',
        status: 'completed'
      });
      toast.success('Бонус начислен!');
      setShowBonusModal(false);
      loadData();
    } catch (error) {
      loggingAPI.logFrontendError(
        'Error creating bonus payment',
        { page: 'SalaryManagement' },
        error?.response?.data?.detail || error.message || null
      );
    }
  };

  const handleExport = (type) => {
    if (activeTab === 'report') {
        if (type === 'excel') handleExportReport();
        else handleExportPDF();
    } else if (activeTab === 'contracts') {
        // Contracts export logic
        const dataToExport = staff.map(emp => ({
          name: emp.full_name,
          role: emp.role,
          has_contract: emp.has_contract ? t('yes') : t('no'),
          salary_type: emp.salary_type ? (SALARY_TYPES[emp.salary_type] || emp.salary_type) : '-',
          base_salary: emp.base_salary || 0,
        }));
        const columns = {
          name: t('sm_employee'),
          role: t('sm_role'),
          has_contract: t('sm_contract_active'),
          salary_type: t('salary_type'),
          base_salary: t('sm_base_salary'),
        };
        if (type === 'excel') exportToExcel(dataToExport, columns, `contracts_${getDateString()}`);
        else handleExportPDF(); // Use generic PDF export which captures the view? No, Contracts view is list of cards.
        // For PDF of contracts, we might need a hidden table or just capture the visible area.
        // Let's use the generic 'printRef' approach but we need to populate it with Contracts data if activeTab is contracts.
    } else if (activeTab === 'payments') {
        const dataToExport = payments.map(p => ({
          date: new Date(p.payment_date).toLocaleDateString(),
          employee: p.user_name,
          type: PAYMENT_TYPES[p.payment_type] || p.payment_type,
          amount: p.amount,
          method: p.method
        }));
        const columns = {
          date: t('date'),
          employee: t('sm_employee'),
          type: t('sm_payment_type'),
          amount: t('sm_amount'),
          method: t('sm_payment_method')
        };
        if (type === 'excel') exportToExcel(dataToExport, columns, `payments_${selectedYear}_${selectedMonth}_${getDateString()}`);
        else handleExportPDF();
    }
  };

  const handleExportReport = () => {
    if (activeTab === 'payments') {
      if (!report) {
        const dataToExport = payments.map(p => ({
          date: new Date(p.payment_date).toLocaleDateString(t('locale')),
          employee: p.user_name,
          type: PAYMENT_TYPES[p.payment_type] || p.payment_type,
          amount: p.amount,
          method: p.method === 'cash' ? t('sm_cash') : p.method === 'card' ? t('sm_card') : t('sm_bank')
        }));
        const columns = {
          date: t('date'),
          employee: t('sm_employee'),
          type: t('sm_payment_type'),
          amount: t('sm_amount'),
          method: t('sm_payment_method')
        };
        exportToExcel(dataToExport, columns, `payments_${selectedYear}_${selectedMonth}_${getDateString()}`);
      } else {
        // PDF logic for payments
        // Reuse report PDF logic or create new
        handleExportPDF(); // Currently prints the 'printRef' content. We need to switch printRef content based on tab.
      }
      return;
    }

    if (activeTab === 'contracts') {
      if (!report) {
        const dataToExport = staff.map(emp => ({
          name: emp.full_name,
          role: emp.role,
          has_contract: emp.has_contract ? 'Yes' : 'No',
          salary_type: emp.salary_type ? (SALARY_TYPES[emp.salary_type] || emp.salary_type) : '-',
          base_salary: emp.base_salary || 0,
          per_student: emp.per_student_rate || 0,
          per_training: emp.per_training_rate || 0
        }));
        const columns = {
          name: t('sm_employee'),
          role: t('sm_role'),
          has_contract: t('sm_contract_active'),
          salary_type: t('salary_type'),
          base_salary: t('sm_base_salary'),
          per_student: t('sm_per_student'),
          per_training: t('sm_per_training')
        };
        exportToExcel(dataToExport, columns, `contracts_${getDateString()}`);
      } else {
         handleExportPDF();
      }
      return;
    }

    if (!report || !report.employees) return;

    const dataToExport = report.employees.map(emp => ({
      name: emp.user_name,
      role: emp.user_role,
      type: emp.salary_type ? (SALARY_TYPES[emp.salary_type] || emp.salary_type) : '—',
      calculated: emp.calculated_salary,
      advance: emp.advance_paid,
      salary: emp.salary_paid,
      bonus: emp.bonus_paid,
      remaining: emp.remaining,
      currency: 'MDL'
    }));

    const columns = {
      name: t('sm_employee'),
      role: t('sm_role'),
      type: t('sm_contract_type'),
      calculated: t('sm_calculated'),
      advance: t('sm_advance'),
      salary: t('sm_salary'),
      bonus: t('sm_bonus'),
      remaining: t('sm_remaining')
    };

    exportToExcel(dataToExport, columns, `salary_report_${selectedYear}_${selectedMonth}_${getDateString()}`);
  };

  const handleExportPDF = () => {
    setIsExporting(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape' });
      const title = `${t('sm_report_title')} - ${MONTHS[selectedMonth]} ${selectedYear}`;
      
      doc.setFontSize(18);
      doc.text(title, 14, 20);
      doc.setFontSize(10);
      doc.text(`${t('sm_date_generated')}: ${new Date().toLocaleDateString()}`, 14, 28);

      if (activeTab === 'report' && report?.employees) {
        // Report Table
        const headers = [[
          t('sm_employee'), t('sm_role'), t('sm_contract_type'), 
          t('sm_calculated'), t('sm_advance'), t('sm_salary'), 
          t('sm_bonus'), t('sm_remaining')
        ]];
        
        const body = report.employees.map(emp => [
          emp.user_name,
          emp.user_role,
          emp.salary_type ? (SALARY_TYPES[emp.salary_type] || emp.salary_type) : '-',
          `${emp.calculated_salary?.toLocaleString()} MDL`,
          emp.advance_paid ? `${emp.advance_paid?.toLocaleString()} MDL` : '-',
          emp.salary_paid ? `${emp.salary_paid?.toLocaleString()} MDL` : '-',
          emp.bonus_paid ? `${emp.bonus_paid?.toLocaleString()} MDL` : '-',
          `${emp.remaining?.toLocaleString()} MDL`
        ]);

        doc.autoTable({
          head: headers,
          body: body,
          startY: 35,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [22, 163, 74] } // Green
        });
        
        // Add Summary below table if space permits or on new page
        let finalY = doc.lastAutoTable.finalY + 10;
        doc.text(t('sm_summary') || 'Summary:', 14, finalY);
        finalY += 6;
        doc.text(`${t('sm_total_employees')}: ${report.total_employees}`, 14, finalY);
        doc.text(`${t('sm_total_paid')}: ${report.total_paid?.toLocaleString()} MDL`, 60, finalY);
        doc.text(`${t('sm_total_remaining')}: ${report.total_remaining?.toLocaleString()} MDL`, 120, finalY);

      } else if (activeTab === 'contracts') {
        // Contracts Table
        const headers = [[
          t('sm_employee'), t('sm_role'), t('sm_contract_active'),
          t('salary_type'), t('sm_base_salary'), t('sm_per_student'), t('sm_per_training')
        ]];
        
        const body = staff.map(emp => [
          emp.full_name,
          emp.role,
          emp.has_contract ? t('yes') : t('no'),
          emp.salary_type ? (SALARY_TYPES[emp.salary_type] || emp.salary_type) : '-',
          emp.base_salary ? `${emp.base_salary} MDL` : '-',
          emp.per_student_rate ? `${emp.per_student_rate} MDL` : '-',
          emp.per_training_rate ? `${emp.per_training_rate} MDL` : '-'
        ]);

        doc.autoTable({
          head: headers,
          body: body,
          startY: 35,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [234, 179, 8] }, // Yellow
          alternateRowStyles: { fillColor: [255, 251, 235] }
        });

      } else if (activeTab === 'payments') {
        // Payments Table
        const headers = [[
          t('date'), t('sm_employee'), t('sm_payment_type'),
          t('sm_amount'), t('sm_payment_method')
        ]];
        
        const body = payments.map(p => [
          new Date(p.payment_date).toLocaleDateString(),
          p.user_name,
          PAYMENT_TYPES[p.payment_type] || p.payment_type,
          `${p.amount} MDL`,
          p.method === 'cash' ? t('sm_cash') : p.method === 'card' ? t('sm_card') : t('sm_bank')
        ]);

        doc.autoTable({
          head: headers,
          body: body,
          startY: 35,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [59, 130, 246] } // Blue
        });
      }

      const blob = doc.output('blob');
      downloadBlob(blob, `Salary_${activeTab}_${selectedYear}_${selectedMonth}.pdf`);
    } catch (err) {
      console.error("Export failed:", err);
      loggingAPI.logFrontendError(
        'Error exporting salary report PDF',
        { page: 'SalaryManagement', translationKey: 'sm_export_error' },
        err?.message || null
      );
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-yellow-500 text-lg">{t('loading')}</div>
      </div>
    );
  }

  // Generate years: dynamic range (20 past, 30 future)
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({ length: 51 }, (_, i) => (currentYear - 20) + i);

  // Access control
  const canManage = user && ['super_admin', 'accountant', 'owner'].includes(user.role?.toLowerCase());
  if (!canManage) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-2xl font-bold mb-2">{t('access_denied')}</h1>
          <p className="text-gray-400">{t('access_denied_desc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-6 text-white">
      
      <div className="w-full mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold">
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                💰 {t('sm_title')}
              </span>
            </h1>
            <p className="text-gray-500 mt-2">{t('sm_subtitle')}</p>
          </div>
          
          {/* Period Selector */}
          <div className="flex gap-3">
            <button
                onClick={loadData}
                disabled={loading}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition flex items-center gap-2"
                title={t('refresh') || 'Обновить'}
            >
                <Loader2 size={18} className={loading ? "animate-spin" : ""} />
            </button>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white"
            >
              {MONTHS.slice(1).map((m, i) => (
                <option key={i+1} value={i+1} style={{backgroundColor: '#1C1E24'}}>{m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white"
            >
              {YEARS.map(y => (
                <option key={y} value={y} style={{backgroundColor: '#1C1E24'}}>{y}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => handleExport('excel')}
                className="px-3 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl border border-green-500/30 transition flex items-center gap-2"
                title={t('sm_export_excel')}
              >
                <FileText size={18} />
              </button>
              <button
                onClick={() => handleExport('pdf')}
                disabled={isExporting}
                className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 transition flex items-center gap-2"
                title={t('sm_export_pdf')}
              >
                {isExporting ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        {report && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5">
              <div className="text-3xl font-bold text-blue-400">{report.total_employees}</div>
              <div className="text-sm text-gray-400 mt-1">{t('sm_total_employees')}</div>
            </div>
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-2xl p-5">
              <div className="text-3xl font-bold text-purple-400">{report.total_calculated?.toLocaleString()} MDL</div>
              <div className="text-sm text-gray-400 mt-1">{t('sm_total_calculated')}</div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
              <div className="text-3xl font-bold text-emerald-400">{report.total_paid?.toLocaleString()} MDL</div>
              <div className="text-sm text-gray-400 mt-1">{t('sm_total_paid')}</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5">
              <div className="text-3xl font-bold text-red-400">{report.total_remaining?.toLocaleString()} MDL</div>
              <div className="text-sm text-gray-400 mt-1">{t('sm_total_remaining')}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {['report', 'contracts', 'payments'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-xl font-medium transition ${
                activeTab === tab 
                  ? 'bg-yellow-500 text-black' 
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {tab === 'report' ? t('sm_tab_report') : tab === 'contracts' ? t('sm_tab_contracts') : t('sm_tab_payments')}
            </button>
          ))}
        </div>

        {/* Report Tab */}
        {activeTab === 'report' && (
          !report ? (
             <div className="bg-white/5 rounded-2xl border border-white/10 p-12 text-center">
                <div className="text-5xl mb-4 opacity-50">📊</div>
                <p className="text-white/50 text-lg">{t('sm_no_report')}</p>
                <p className="text-white/30 text-sm mt-2">{t('sm_no_report_hint')}</p>
             </div>
          ) : (
          <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
            <div className="p-4 border-b border-white/10">
              <h2 className="text-lg font-semibold">{MONTHS[selectedMonth]} {selectedYear}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm text-gray-400">{t('sm_employee')}</th>
                    <th className="px-4 py-3 text-left text-sm text-gray-400">{t('sm_contract_type')}</th>
                    <th className="px-4 py-3 text-right text-sm text-gray-400">{t('sm_calculated')}</th>
                    <th className="px-4 py-3 text-right text-sm text-gray-400">{t('sm_advance')}</th>
                    <th className="px-4 py-3 text-right text-sm text-gray-400">{t('sm_salary')}</th>
                    <th className="px-4 py-3 text-right text-sm text-gray-400">{t('sm_bonus')}</th>
                    <th className="px-4 py-3 text-right text-sm text-gray-400">{t('sm_remaining')}</th>
                    <th className="px-4 py-3 text-center text-sm text-gray-400">{t('sm_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.employees?.map((emp) => (
                    <tr key={emp.user_id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{emp.user_name}</div>
                        <div className="text-xs text-gray-500">{emp.user_role}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-gray-400">
                          {emp.salary_type ? SALARY_TYPES[emp.salary_type] : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-purple-400">
                        {emp.calculated_salary?.toLocaleString()} MDL
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400">
                        {emp.advance_paid > 0 ? `${emp.advance_paid?.toLocaleString()} MDL` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-emerald-400">
                        {emp.salary_paid > 0 ? `${emp.salary_paid?.toLocaleString()} MDL` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-purple-400">
                        {emp.bonus_paid > 0 ? `${emp.bonus_paid?.toLocaleString()} MDL` : '—'}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${emp.remaining > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {emp.remaining > 0 ? `${emp.remaining?.toLocaleString()} MDL` : '✓'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center flex-wrap">
                          <button
                            onClick={() => openPaymentModal(staff.find(s => s.id === emp.user_id), 'advance')}
                            className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"
                            title={t('sm_pay_advance')}
                          >
                            {t('sm_pay_advance')}
                          </button>
                          <button
                            onClick={() => openPaymentModal(staff.find(s => s.id === emp.user_id), 'salary')}
                            className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30"
                            title={t('sm_pay_salary')}
                          >
                            {t('sm_pay_salary')}
                          </button>
                          <button
                            onClick={() => openBonusModal(staff.find(s => s.id === emp.user_id))}
                            className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-lg text-sm hover:bg-purple-500/30"
                            title={t('sm_pay_bonus')}
                          >
                            {t('sm_pay_bonus')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )
        )}

        {/* Contracts Tab */}
        {activeTab === 'contracts' && (
          <div className="grid gap-4">
            {staff.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-white/5 rounded-2xl border border-white/10">
                <p>{t('sm_no_staff') || 'Нет сотрудников'}</p>
              </div>
            ) : (
              staff.map((emp) => (
              <div key={emp.id} className="bg-white/5 rounded-2xl border border-white/10 p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{emp.full_name}</h3>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span>{emp.role}</span>
                      {emp.phone && (
                        <>
                          <span>•</span>
                          <a 
                            href={`tel:${emp.phone}`}
                            className="flex items-center gap-1 hover:text-green-400 transition-colors"
                            title={t('call') || 'Позвонить'}
                          >
                            <Phone size={12} />
                            {emp.phone}
                          </a>
                        </>
                      )}
                    </div>
                    {emp.has_contract ? (
                      <div className="mt-3 space-y-1">
                        <p className="text-emerald-400">{t('sm_contract_active_check')}</p>
                        <p className="text-sm text-gray-400">
                          {t('salary_type')}: {SALARY_TYPES[emp.salary_type] || emp.salary_type}
                        </p>
                        <p className="text-sm text-gray-400">
                          {t('salary_fixed')}: {emp.base_salary?.toLocaleString()} MDL
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-red-400">{t('sm_no_contract')}</p>
                    )}
                  </div>
                  <button
                    onClick={() => openContractModal(emp)}
                    className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-xl hover:bg-yellow-500/30 transition"
                  >
                    {emp.has_contract ? t('sm_edit') : t('sm_create')}
                  </button>
                </div>
              </div>
            ))
          )}
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === 'payments' && (
          <PaymentsHistory payments={payments} t={t} PAYMENT_TYPES={PAYMENT_TYPES} />
        )}

        {/* Contract Modal */}
        {showContractModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#1C1E24] rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col border border-white/10 shadow-2xl">
              <div className="p-6 border-b border-white/10 shrink-0">
                <h2 className="text-xl font-bold text-white">{t('sm_modal_contract_title')} {selectedEmployee.full_name}</h2>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_calc_type')}</label>
                  <select
                    value={contractForm.salary_type}
                    onChange={(e) => setContractForm({...contractForm, salary_type: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                  >
                    {Object.entries(SALARY_TYPES).map(([k, v]) => (
                      <option key={k} value={k} style={{backgroundColor: '#1C1E24'}}>{v}</option>
                    ))}
                  </select>
                </div>
                
                {(contractForm.salary_type === 'fixed' || contractForm.salary_type === 'combined') && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t('sm_base_salary')}</label>
                    <input
                      type="number"
                      value={contractForm.base_salary}
                      onChange={(e) => setContractForm({...contractForm, base_salary: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    />
                  </div>
                )}
                
                {(contractForm.salary_type === 'per_student' || contractForm.salary_type === 'combined') && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t('sm_per_student')}</label>
                    <input
                      type="number"
                      value={contractForm.per_student_rate}
                      onChange={(e) => setContractForm({...contractForm, per_student_rate: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    />
                  </div>
                )}
                
                {(contractForm.salary_type === 'per_training' || contractForm.salary_type === 'combined') && (
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t('sm_per_training')}</label>
                    <input
                      type="number"
                      value={contractForm.per_training_rate}
                      onChange={(e) => setContractForm({...contractForm, per_training_rate: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    />
                    
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <label className="block text-sm text-gray-400 mb-3">{t('sm_specific_rates') || 'Ставки по типам событий'}</label>
                      <div className="grid grid-cols-2 gap-3">
                        {EVENT_TYPES_LIST.map(type => (
                          <div key={type}>
                            <label className="block text-xs text-gray-500 mb-1">
                              {t(`event_${type}`) || type}
                            </label>
                            <input
                              type="number"
                              placeholder={contractForm.per_training_rate}
                              value={contractForm.rates?.[type] !== undefined ? contractForm.rates[type] : ''}
                              onChange={(e) => {
                                const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                                const newRates = { ...contractForm.rates };
                                if (val === undefined) {
                                  delete newRates[type];
                                } else {
                                  newRates[type] = val;
                                }
                                setContractForm(prev => ({ ...prev, rates: newRates }));
                              }}
                              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-yellow-500/50 outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t('sm_advance_percent')}</label>
                    <input
                      type="number"
                      value={contractForm.advance_percent}
                      onChange={(e) => setContractForm({...contractForm, advance_percent: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t('sm_advance_day')}</label>
                    <input
                      type="number"
                      value={contractForm.advance_day}
                      onChange={(e) => setContractForm({...contractForm, advance_day: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                      min="1" max="31"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_start_date')}</label>
                  <input
                    type="date"
                    value={contractForm.effective_from}
                    onChange={(e) => setContractForm({...contractForm, effective_from: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_notes')}</label>
                  <textarea
                    value={contractForm.notes}
                    onChange={(e) => setContractForm({...contractForm, notes: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    rows={2}
                  />
                </div>
              </div>
              <div className="p-6 border-t border-white/10 flex gap-4 shrink-0">
                <button
                  onClick={() => setShowContractModal(false)}
                  className="flex-1 px-4 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleCreateContract}
                  className="flex-1 px-4 py-3 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400"
                >
                  {t('save')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Modal */}
        {showPaymentModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#1C1E24] rounded-3xl w-full max-w-lg border border-white/10 max-h-[90vh] flex flex-col shadow-2xl">
              <div className="p-6 border-b border-white/10 shrink-0">
                <h2 className="text-xl font-bold text-white">{t('sm_modal_payment_title')} {selectedEmployee.full_name}</h2>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_payment_type')}</label>
                  <select
                    value={paymentForm.payment_type}
                    onChange={(e) => setPaymentForm({...paymentForm, payment_type: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                  >
                    {Object.entries(PAYMENT_TYPES).map(([k, v]) => (
                      <option key={k} value={k} style={{backgroundColor: '#1C1E24'}}>{v}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_amount')}</label>
                  <input
                    type="number"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_payment_date')}</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm({...paymentForm, payment_date: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_payment_method')}</label>
                  <select
                    value={paymentForm.method}
                    onChange={(e) => setPaymentForm({...paymentForm, method: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                  >
                    <option value="cash" style={{backgroundColor: '#1C1E24'}}>{t('sm_cash')}</option>
                    <option value="card" style={{backgroundColor: '#1C1E24'}}>{t('sm_card')}</option>
                    <option value="bank_transfer" style={{backgroundColor: '#1C1E24'}}>{t('sm_bank')}</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_comment')}</label>
                  <input
                    type="text"
                    value={paymentForm.description}
                    onChange={(e) => setPaymentForm({...paymentForm, description: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    placeholder={t('sm_optional')}
                  />
                </div>
              </div>
              <div className="p-6 border-t border-white/10 flex gap-4 shrink-0">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 px-4 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleCreatePayment}
                  className="flex-1 px-4 py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-400"
                >
                  {t('sm_pay_btn')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bonus Modal */}
        {showBonusModal && selectedEmployee && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#1C1E24] rounded-3xl w-full max-w-lg border border-white/10 max-h-[90vh] flex flex-col shadow-2xl">
              <div className="p-6 border-b border-white/10 shrink-0">
                <h2 className="text-xl font-bold text-white">{t('sm_modal_bonus_title')} {selectedEmployee.full_name}</h2>
                <p className="text-sm text-gray-400 mt-1">{t('sm_bonus_desc')}</p>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_bonus_amount')}</label>
                  <input
                    type="number"
                    value={bonusForm.amount}
                    onChange={(e) => setBonusForm({...bonusForm, amount: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-lg"
                    placeholder="0"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-400 mb-2">{t('sm_bonus_reason')}</label>
                  <input
                    type="text"
                    value={bonusForm.description}
                    onChange={(e) => setBonusForm({...bonusForm, description: e.target.value})}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    placeholder={t('sm_bonus_placeholder')}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t('date')}</label>
                    <input
                      type="date"
                      value={bonusForm.payment_date}
                      onChange={(e) => setBonusForm({...bonusForm, payment_date: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">{t('sm_payment_method')}</label>
                    <select
                      value={bonusForm.method}
                      onChange={(e) => setBonusForm({...bonusForm, method: e.target.value})}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white"
                    >
                      <option value="cash" style={{backgroundColor: '#1C1E24'}}>{t('sm_cash')}</option>
                      <option value="card" style={{backgroundColor: '#1C1E24'}}>{t('sm_card')}</option>
                      <option value="bank_transfer" style={{backgroundColor: '#1C1E24'}}>{t('sm_bank')}</option>
                    </select>
                  </div>
                </div>
                
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mt-4">
                  <p className="text-sm text-purple-300">
                    {t('sm_bonus_note')} {MONTHS[selectedMonth]} {selectedYear}
                  </p>
                </div>
              </div>
              <div className="p-6 border-t border-white/10 flex gap-4 shrink-0">
                <button
                  onClick={() => setShowBonusModal(false)}
                  className="flex-1 px-4 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleCreateBonus}
                  disabled={!bonusForm.amount}
                  className="flex-1 px-4 py-3 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('sm_give_bonus')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component for payments history
function PaymentsHistory({ payments, t, PAYMENT_TYPES }) {
  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalCount = payments.length;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5">
          <div className="text-3xl font-bold text-emerald-400">{totalAmount.toLocaleString()} MDL</div>
          <div className="text-sm text-gray-400 mt-1">{t('sm_total_paid_history') || 'Всего выплачено'}</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5">
          <div className="text-3xl font-bold text-blue-400">{totalCount}</div>
          <div className="text-sm text-gray-400 mt-1">{t('sm_total_transactions') || 'Количество выплат'}</div>
        </div>
      </div>

      <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                <th className="px-4 py-3 text-left text-sm text-gray-400">{t('date')}</th>
                <th className="px-4 py-3 text-left text-sm text-gray-400">{t('sm_employee')}</th>
                <th className="px-4 py-3 text-left text-sm text-gray-400">{t('sm_payment_type')}</th>
                <th className="px-4 py-3 text-right text-sm text-gray-400">{t('sm_amount')}</th>
                <th className="px-4 py-3 text-left text-sm text-gray-400">{t('sm_payment_method')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{t('sm_no_payments_period')}</td></tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 text-gray-300">{new Date(p.payment_date).toLocaleDateString(t('locale'))}</td>
                    <td className="px-4 py-3 text-white">{p.user_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs ${
                        p.payment_type === 'advance' ? 'bg-blue-500/20 text-blue-400' :
                        p.payment_type === 'salary' ? 'bg-emerald-500/20 text-emerald-400' :
                        p.payment_type === 'bonus' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {PAYMENT_TYPES[p.payment_type] || p.payment_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-400">
                      {p.amount?.toLocaleString()} MDL
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-sm">
                      {p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : '🏦'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
