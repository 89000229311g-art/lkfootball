import { useState, useEffect, useMemo, useCallback } from 'react';
import { salariesAPI, loggingAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function MySalary() {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [contract, setContract] = useState(null);
  const [currentCalc, setCurrentCalc] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const getLabel = (key, ru, ro) => {
    const value = t(key);
    if (value && value !== key) return value;
    if (language === 'ro') return ro;
    return ru;
  };

  const MONTHS = useMemo(() => [
    '', t('january'), t('february'), t('march'), t('april'), t('may'), t('june'),
    t('july'), t('august'), t('september'), t('october'), t('november'), t('december')
  ], [t]);

  const SALARY_TYPES = useMemo(() => ({
    fixed: t('type_fixed'),
    per_student: t('type_per_student'),
    per_training: t('type_per_training'),
    combined: t('type_combined')
  }), [t]);

  const PAYMENT_TYPES = useMemo(() => ({
    advance: t('pay_advance'),
    salary: t('pay_salary'),
    bonus: t('pay_bonus'),
    deduction: t('pay_deduction')
  }), [t]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Get My Payments Summary (which includes all needed data)
      const summaryRes = await salariesAPI.getMyPayments();
      const summaryData = summaryRes.data;
      
      if (summaryData.recent_payments) {
          setPayments(summaryData.recent_payments);
      } else {
          // Fallback handled by state default
      }
      
      // Update state with summary data
      setCurrentCalc({
          total: summaryData.current_month_salary,
          base: summaryData.base_salary,
          students_count: summaryData.students_count || 0,
          trainings_count: summaryData.trainings_count || 0,
          paid_amount: summaryData.paid_amount || 0,
          details: summaryData.details || []
      });
      
      const allPaymentsRes = await salariesAPI.getPayments({ 
          userId: user?.id, 
          year: selectedYear,
          limit: 100 
      });
      setPayments(allPaymentsRes.data.data || []);

      // Contract info is also in summary
      if (summaryData.has_contract) {
          setContract({
              salary_type: summaryData.salary_type,
              base_salary: summaryData.base_salary,
              per_student_rate: summaryData.per_student_rate,
              per_training_rate: summaryData.per_training_rate,
              advance_percent: summaryData.advance_percent,
              advance_day: summaryData.advance_day,
              salary_day: summaryData.salary_day
          });
      }

    } catch (error) {
      console.error('Error loading salary data:', error);
      loggingAPI.logFrontendError(
        'Error loading salary data',
        { page: 'MySalary', translationKey: 'load_error' },
        error?.response?.data?.detail || error.message || null
      );
    } finally {
      setLoading(false);
    }
  }, [selectedYear, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Group payments by year and month
  const groupedPayments = payments.reduce((acc, payment) => {
    const key = `${payment.period_year}-${String(payment.period_month).padStart(2, '0')}`;
    if (!acc[key]) {
      acc[key] = {
        year: payment.period_year,
        month: payment.period_month,
        payments: []
      };
    }
    acc[key].payments.push(payment);
    return acc;
  }, {});

  const sortedPeriods = Object.values(groupedPayments).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

  // Calculate totals for year
  const yearPayments = payments.filter(p => p.period_year === selectedYear);
  const totalAdvance = yearPayments
    .filter(p => p.payment_type === 'advance')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalSalary = yearPayments
    .filter(p => p.payment_type === 'salary')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalBonus = yearPayments
    .filter(p => p.payment_type === 'bonus')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalDeduction = yearPayments
    .filter(p => p.payment_type === 'deduction')
    .reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalYear = totalAdvance + totalSalary + totalBonus - totalDeduction;

  // Next payment info
  const today = new Date();
  const currentDay = today.getDate();
  const advanceDay = contract?.advance_day || 25;
  const salaryDay = contract?.salary_day || 10;
  
  let nextPayment = null;
  if (currentDay < advanceDay) {
    nextPayment = { type: t('pay_advance'), day: advanceDay, month: today.getMonth() + 1 };
  } else if (currentDay < salaryDay || (advanceDay > salaryDay && currentDay >= advanceDay)) {
    // If salary day is in next month
    const nextMonth = today.getMonth() + 2;
    nextPayment = { type: t('pay_salary'), day: salaryDay, month: nextMonth > 12 ? 1 : nextMonth };
  } else {
    nextPayment = { type: t('pay_advance'), day: advanceDay, month: today.getMonth() + 2 > 12 ? 1 : today.getMonth() + 2 };
  }

  const locale = language === 'ro' ? 'ro-RO' : 'ru-RU';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
        <div className="text-brand-yellow text-lg animate-pulse">{t('loading')}</div>
      </div>
    );
  }

  // Generate years: dynamic range
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({ length: 51 }, (_, i) => (currentYear - 20) + i);

  return (
    <div className="min-h-screen bg-[#0F1117] p-4 md:p-8 text-white font-sans selection:bg-brand-yellow selection:text-black relative overflow-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-brand-yellow/5 via-transparent to-transparent" />
      
      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold flex items-center gap-3">
              <span className="text-brand-yellow">💰</span>
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                {getLabel('salary_title', 'Моя зарплата', 'Salariul meu')}
              </span>
            </h1>
            <p className="text-gray-400">
              {getLabel('salary_subtitle', 'Информация о начислениях и выплатах', 'Informații despre calcule și plăți')}
            </p>
          </div>

          <div className="bg-brand-gray/20 p-1 rounded-lg border border-brand-gray/30">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent border-none text-white outline-none px-4 py-2 w-full md:w-auto focus:ring-0"
            >
              {YEARS.map(y => (
                <option key={y} value={y} className="bg-brand-gray">{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Contract Info Card */}
        {contract ? (
          <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-2xl p-6 mb-6 hover:border-brand-yellow/30 transition-all">
            <div className="flex items-start justify-between">
              <div className="w-full">
                <h2 className="text-lg font-semibold text-brand-yellow mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                  {t('contract_active_check')}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-sm text-gray-400">{t('salary_type')}</div>
                    <div className="text-white font-medium">{SALARY_TYPES[contract.salary_type]}</div>
                  </div>
                  {(contract.salary_type === 'fixed' || contract.salary_type === 'combined') && (
                    <div>
                      <div className="text-sm text-gray-400">{t('salary_base')}</div>
                      <div className="text-white font-medium">{contract.base_salary?.toLocaleString()} MDL</div>
                    </div>
                  )}
                  {(contract.salary_type === 'per_student' || contract.salary_type === 'combined') && (
                    <div>
                      <div className="text-sm text-gray-400">{t('salary_per_student')}</div>
                      <div className="text-white font-medium">{contract.per_student_rate?.toLocaleString()} MDL</div>
                    </div>
                  )}
                  {(contract.salary_type === 'per_training' || contract.salary_type === 'combined') && (
                    <div>
                      <div className="text-sm text-gray-400">{t('salary_per_training')}</div>
                      <div className="text-white font-medium">{contract.per_training_rate?.toLocaleString()} MDL</div>
                    </div>
                  )}
                  <div>
                    <div className="text-sm text-gray-400">{t('salary_advance')}</div>
                    <div className="text-white font-medium">{contract.advance_percent}% ({advanceDay})</div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400">{t('pay_salary')}</div>
                    <div className="text-white font-medium">{100 - contract.advance_percent}% ({salaryDay})</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-red-400">
              {getLabel('contract_not_found_warn', '⚠️ Контракт не найден', '⚠️ Contract negăsit')}
            </h2>
            <p className="text-gray-400 mt-2">
              {getLabel('contract_contact_admin', 'Обратитесь к руководителю для оформления контракта', 'Contactați directorul pentru semnarea contractului')}
            </p>
          </div>
        )}

        {/* Current Month Calculation */}
        {currentCalc && (
          <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-2xl p-4 md:p-6 mb-6 hover:border-brand-yellow/30 transition-all">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span className="text-brand-yellow">📊</span>{' '}
              <span>
                {getLabel('current_month_stat', 'Текущий месяц', 'Luna curentă')} ({MONTHS[today.getMonth() + 1]})
              </span>
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-brand-black/30 rounded-xl p-3 md:p-4 border border-brand-gray/20">
                <div className="text-xl md:text-2xl font-bold text-white">
                  {currentCalc.calculated_salary?.toLocaleString()} <span className="text-xs text-gray-500">MDL</span>
                </div>
                <div className="text-xs md:text-sm text-gray-400 mt-1">
                  {getLabel('calculated_salary', 'Расчётная ЗП', 'Salariu calculat')}
                </div>
              </div>
              {currentCalc.students_count > 0 && (
                <div className="bg-brand-black/30 rounded-xl p-3 md:p-4 border border-brand-gray/20">
                  <div className="text-xl md:text-2xl font-bold text-blue-400">{currentCalc.students_count}</div>
                  <div className="text-xs md:text-sm text-gray-400 mt-1">{t('students_count')}</div>
                </div>
              )}
              {currentCalc.trainings_count > 0 && (
                <div className="bg-brand-black/30 rounded-xl p-3 md:p-4 border border-brand-gray/20">
                  <div className="text-xl md:text-2xl font-bold text-cyan-400">{currentCalc.trainings_count}</div>
                  <div className="text-xs md:text-sm text-gray-400 mt-1">{t('trainings_count')}</div>
                </div>
              )}
              <div className="bg-brand-black/30 rounded-xl p-3 md:p-4 border border-brand-gray/20">
                <div className="text-xl md:text-2xl font-bold text-emerald-400">
                  {currentCalc.paid_amount?.toLocaleString()} <span className="text-xs text-gray-500">MDL</span>
                </div>
                <div className="text-xs md:text-sm text-gray-400 mt-1">
                  {getLabel('paid_amount', 'Выплачено', 'Achitat')}
                </div>
              </div>
            </div>

            {/* Salary Details Breakdown */}
            {currentCalc.details && currentCalc.details.length > 0 && (
              <details className="mt-4 bg-brand-black/30 rounded-xl border border-brand-gray/20 overflow-hidden group">
                <summary className="p-3 md:p-4 cursor-pointer hover:bg-white/5 transition flex items-center justify-between list-none">
                  <span className="font-medium text-gray-300 flex items-center gap-2 text-sm md:text-base">
                    <span>📜</span> {t('salary_details')}
                  </span>
                  <span className="text-sm text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-3 md:p-4 pt-0 space-y-2 border-t border-brand-gray/20 mt-2 max-h-[300px] overflow-y-auto">
                  {currentCalc.details.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs md:text-sm py-2 border-b border-brand-gray/20 last:border-0">
                      <div className="flex flex-col">
                        <span className="text-gray-300">{item.description}</span>
                        <span className="text-[10px] md:text-xs text-gray-500">{item.date}</span>
                      </div>
                      <span className="text-emerald-400 font-medium">+{item.amount?.toLocaleString()} MDL</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            
            {/* Next payment indicator */}
            {nextPayment && (
              <div className="mt-4 flex items-center gap-3 p-3 md:p-4 bg-brand-yellow/10 border border-brand-yellow/20 rounded-xl">
                <span className="text-2xl">📅</span>
                <div>
                  <div className="text-brand-yellow font-medium text-sm md:text-base">
                    {getLabel('next_payment', 'Следующая выплата', 'Următoarea plată')}: {nextPayment.type}
                  </div>
                  <div className="text-gray-400 text-xs md:text-sm">{nextPayment.day} {MONTHS[nextPayment.month]}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Year Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
          <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-2xl p-3 md:p-5 hover:border-brand-yellow/30 transition-all">
            <div className="text-lg md:text-2xl font-bold text-blue-400">
              {totalAdvance.toLocaleString()} <span className="text-xs text-gray-500">MDL</span>
            </div>
            <div className="text-xs md:text-sm text-gray-400 mt-1">
              {getLabel('advances', 'Авансы', 'Avansuri')} {selectedYear}
            </div>
          </div>
          <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-2xl p-3 md:p-5 hover:border-brand-yellow/30 transition-all">
            <div className="text-lg md:text-2xl font-bold text-emerald-400">
              {totalSalary.toLocaleString()} <span className="text-xs text-gray-500">MDL</span>
            </div>
            <div className="text-xs md:text-sm text-gray-400 mt-1">
              {getLabel('salaries', 'Зарплаты', 'Salarii')} {selectedYear}
            </div>
          </div>
          <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-2xl p-3 md:p-5 hover:border-brand-yellow/30 transition-all">
            <div className="text-lg md:text-2xl font-bold text-purple-400">
              {totalBonus.toLocaleString()} <span className="text-xs text-gray-500">MDL</span>
            </div>
            <div className="text-xs md:text-sm text-gray-400 mt-1">
              {getLabel('bonuses', 'Премии', 'Premii')} {selectedYear}
            </div>
          </div>
          <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-2xl p-3 md:p-5 hover:border-brand-yellow/30 transition-all">
            <div className="text-lg md:text-2xl font-bold text-red-400">
              {totalDeduction.toLocaleString()} <span className="text-xs text-gray-500">MDL</span>
            </div>
            <div className="text-xs md:text-sm text-gray-400 mt-1">
              {getLabel('deductions', 'Вычеты', 'Rețineri')} {selectedYear}
            </div>
          </div>
          <div className="bg-brand-gray/10 border border-brand-gray/20 rounded-2xl p-3 md:p-5 col-span-2 lg:col-span-1 hover:border-brand-yellow/30 transition-all">
            <div className="text-lg md:text-2xl font-bold text-brand-yellow">
              {totalYear.toLocaleString()} <span className="text-xs text-gray-500">MDL</span>
            </div>
            <div className="text-xs md:text-sm text-gray-400 mt-1">
              {getLabel('total_year', 'Всего', 'Total')} {selectedYear}
            </div>
          </div>
        </div>

        {/* Payment History */}
        <div className="bg-brand-gray/10 rounded-2xl border border-brand-gray/20">
          <div className="p-4 border-b border-brand-gray/20">
            <h2 className="text-lg font-semibold text-white">
              {getLabel('payment_history_title', '📜 История выплат', '📜 Istoric plăți')}
            </h2>
          </div>
          
          {sortedPeriods.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <div className="text-4xl mb-2">💸</div>
              <p>{getLabel('no_payments_emoji', 'Нет выплат', 'Fără plăți')}</p>
            </div>
          ) : (
            <div className="divide-y divide-brand-gray/20">
              {sortedPeriods.map((period) => (
                <div key={`${period.year}-${period.month}`} className="p-3 md:p-4">
                  <div className="flex justify-between items-center mb-2 md:mb-3">
                    <h3 className="text-base md:text-lg font-medium text-white capitalize">
                      {MONTHS[period.month]} {period.year}
                    </h3>
                    <div className="text-emerald-400 font-medium text-sm md:text-base">
                      {period.payments.reduce((sum, p) => 
                        sum + (p.payment_type === 'deduction' ? -p.amount : p.amount), 0
                      ).toLocaleString()} MDL
                    </div>
                  </div>
                  <div className="space-y-2">
                    {period.payments.map((payment) => (
                      <div 
                        key={payment.id}
                        className="flex justify-between items-center p-2.5 md:p-3 bg-brand-black/30 rounded-xl border border-brand-gray/10"
                      >
                        <div className="flex items-center gap-2 md:gap-3">
                          <span className={`px-2 py-0.5 md:px-3 md:py-1 rounded-lg text-[10px] md:text-xs font-medium ${
                            payment.payment_type === 'advance' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                            payment.payment_type === 'salary' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            payment.payment_type === 'bonus' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                            'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {PAYMENT_TYPES[payment.payment_type] || payment.payment_type}
                          </span>
                          <span className="text-gray-400 text-xs md:text-sm">
                            {new Date(payment.payment_date).toLocaleDateString(locale)}
                          </span>
                          {payment.description && (
                            <span className="text-gray-500 text-xs md:text-sm hidden sm:inline">{payment.description}</span>
                          )}
                        </div>
                        <div className={`font-medium text-sm md:text-base ${
                          payment.payment_type === 'deduction' ? 'text-red-400' : 'text-emerald-400'
                        }`}>
                          {payment.payment_type === 'deduction' ? '-' : '+'}
                          {payment.amount?.toLocaleString()} MDL
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
