import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ComposedChart 
} from 'recharts';
import { 
  DollarSign, TrendingUp, TrendingDown, Plus, Trash2, Calendar, FileText, 
  CreditCard, PieChart, Activity, AlertCircle, X, Check, Filter, Users, Wallet
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { expensesAPI, analyticsAPI } from '../../api/client';
import { PieChart as RechartsPieChart, Pie, Cell } from 'recharts';

export default function FinancialAnalytics({ data, isLoading, startDate, endDate, onRefresh }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [activeView, setActiveView] = useState('chart'); // chart, expenses, services, expense_structure
  const [serviceData, setServiceData] = useState(null);
  const [loadingServices, setLoadingServices] = useState(false);
  const [incomeMethodData, setIncomeMethodData] = useState(null);
  const [loadingIncomeMethods, setLoadingIncomeMethods] = useState(false);

  // Expense Form State
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    category: 'other',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const fetchCategories = useCallback(async () => {
    try {
      const res = await expensesAPI.getCategories();
      setCategories(res.data);
    } catch (err) {
      console.error("Failed to fetch categories", err);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    try {
      const res = await expensesAPI.getAll({ 
        start_date: startDate, 
        end_date: endDate,
        limit: 1000 
      });
      setExpenses(res.data);
    } catch (err) {
      console.error("Failed to fetch expenses", err);
    } finally {
      setLoadingExpenses(false);
    }
  }, [startDate, endDate]);

  const fetchServiceAnalytics = useCallback(async () => {
    setLoadingServices(true);
    try {
      const res = await analyticsAPI.getRevenueByServiceType(startDate, endDate, 'completed');
      setServiceData(res.data);
    } catch (err) {
      console.error("Failed to fetch service analytics", err);
    } finally {
      setLoadingServices(false);
    }
  }, [startDate, endDate]);

  const fetchIncomeMethods = useCallback(async () => {
    setLoadingIncomeMethods(true);
    try {
      const res = await analyticsAPI.getRevenueByMethod(startDate, endDate, 'completed', 'none');
      setIncomeMethodData(res.data);
    } catch (err) {
      console.error("Failed to fetch income methods", err);
    } finally {
      setLoadingIncomeMethods(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchCategories();
    if (activeView === 'expenses' || activeView === 'expense_structure') {
      fetchExpenses();
    } else if (activeView === 'services') {
      fetchServiceAnalytics();
      fetchIncomeMethods();
    }
  }, [activeView, fetchCategories, fetchExpenses, fetchServiceAnalytics, fetchIncomeMethods]);

  useEffect(() => {
    if (isAdmin && activeView === 'chart') {
      setActiveView('expenses');
    }
  }, [isAdmin, activeView]);

  const handleCreateExpense = async (e) => {
    e.preventDefault();
    try {
      await expensesAPI.create({
        ...newExpense,
        amount: parseFloat(newExpense.amount)
      });
      setShowExpenseModal(false);
      setNewExpense({
        title: '',
        amount: '',
        category: 'other',
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
      
      // Refresh both lists and charts
      if (activeView === 'expenses') fetchExpenses();
      if (onRefresh) onRefresh();
      
    } catch (err) {
      console.error("Failed to create expense", err);
      alert("Ошибка при создании расхода");
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm("Удалить этот расход?")) return;
    try {
      await expensesAPI.delete(id);
      fetchExpenses();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error("Failed to delete expense", err);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'MDL',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  const getCategoryLabel = (catId) => {
    const cat = categories.find(c => c.id === catId);
    return cat ? cat.label : catId;
  };

  const chartData = data?.data || [];
  const totalRevenue = data?.total_revenue || 0;
  const totalSalary = data?.total_salary || 0;
  const totalExpense = data?.total_expense || 0;
  const netProfit = data?.net_profit || 0;

  const expenseStructureData = React.useMemo(() => {
    // Group expenses by category
    const grouped = {};
    if (expenses && expenses.length > 0) {
      expenses.forEach(exp => {
        const catId = exp.category;
        if (!grouped[catId]) grouped[catId] = 0;
        grouped[catId] += Number(exp.amount);
      });
    }

    const items = Object.keys(grouped).map(catId => ({
      name: getCategoryLabel(catId),
      value: grouped[catId],
      color: '#f97316' // Default orange
    }));

    // Add Salary
    if (totalSalary > 0) {
      items.push({
        name: 'Зарплатный фонд',
        value: totalSalary,
        color: '#3b82f6' // Blue
      });
    }

    // Sort by value desc
    items.sort((a, b) => b.value - a.value);

    // Assign colors
    const colors = ['#3b82f6', '#f97316', '#ef4444', '#10b981', '#8b5cf6', '#eab308', '#ec4899', '#6366f1'];
    items.forEach((item, idx) => {
        item.color = colors[idx % colors.length];
    });

    const total = items.reduce((sum, item) => sum + item.value, 0);

    return { items, total };
  }, [expenses, totalSalary, categories]);

  if (isLoading) {
    return <div className="p-12 text-center text-white/50">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${!isAdmin ? 'lg:grid-cols-4' : ''} gap-4 md:gap-6`}>
        {/* Revenue */}
        {!isAdmin && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <DollarSign className="w-16 h-16 text-emerald-500" />
          </div>
          <div className="text-emerald-400 text-sm font-medium mb-1">
            {t('revenue_cash_flow') || 'Доходы (Поступления)'}
            <span className="ml-2 text-emerald-400/50 cursor-help" title="Сумма всех денег, полученных в выбранном периоде (по дате платежа), независимо от того, за какой месяц они внесены.">ℹ️</span>
          </div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalRevenue)}</div>
          <div className="text-emerald-400/50 text-xs mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            Кассовый метод (Cash Flow)
          </div>
        </div>
        )}

        {/* Salaries */}
        {!isAdmin && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Users className="w-16 h-16 text-blue-500" />
          </div>
          <div className="text-blue-400 text-sm font-medium mb-1">Зарплатный фонд</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalSalary)}</div>
          <div className="text-blue-400/50 text-xs mt-2 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Выплаты сотрудникам
          </div>
        </div>
        )}

        {/* Expenses */}
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <CreditCard className="w-16 h-16 text-orange-500" />
          </div>
          <div className="text-orange-400 text-sm font-medium mb-1">Прочие расходы</div>
          <div className="text-2xl font-bold text-white">{formatCurrency(totalExpense)}</div>
          <div className="text-orange-400/50 text-xs mt-2 flex items-center gap-1">
            <PieChart className="w-3 h-3" />
            Аренда, инвентарь, маркетинг
          </div>
        </div>

        {/* Net Profit */}
        {!isAdmin && (
        <div className={`bg-white/5 border rounded-2xl p-5 relative overflow-hidden ${netProfit >= 0 ? 'border-yellow-500/30' : 'border-red-500/30'}`}>
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Activity className={`w-16 h-16 ${netProfit >= 0 ? 'text-yellow-500' : 'text-red-500'}`} />
          </div>
          <div className="text-white/60 text-sm font-medium mb-1">Чистая прибыль</div>
          <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
            {formatCurrency(netProfit)}
          </div>
          <div className="text-white/30 text-xs mt-2 flex items-center gap-1">
            {netProfit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            Доходы - (ЗП + Расходы)
          </div>
        </div>
        )}
      </div>

      {/* Navigation & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="w-full md:w-auto overflow-x-auto pb-2 md:pb-0 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex bg-white/5 p-1 rounded-lg border border-white/10 w-max">
            {!isAdmin && (
            <button
              onClick={() => setActiveView('chart')}
              className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeView === 'chart' 
                  ? 'bg-yellow-500 text-black shadow-lg' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Activity className="w-4 h-4 inline mr-2" />
              График P&L
            </button>
            )}
            <button
              onClick={() => setActiveView('services')}
              className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeView === 'services' 
                  ? 'bg-yellow-500 text-black shadow-lg' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <PieChart className="w-4 h-4 inline mr-2" />
              Структура доходов
            </button>
            <button
              onClick={() => setActiveView('expense_structure')}
              className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeView === 'expense_structure' 
                  ? 'bg-yellow-500 text-black shadow-lg' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <PieChart className="w-4 h-4 inline mr-2" />
              Структура расходов
            </button>
            <button
              onClick={() => setActiveView('expenses')}
              className={`px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                activeView === 'expenses' 
                  ? 'bg-yellow-500 text-black shadow-lg' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <CreditCard className="w-4 h-4 inline mr-2" />
              Журнал расходов
            </button>
          </div>
        </div>

        <button
          onClick={() => setShowExpenseModal(true)}
          className="w-full md:w-auto bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-lg shadow-orange-500/20 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Добавить расход
        </button>
      </div>

      {/* Main Content Area */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-h-[400px]">
        
        {/* SERVICES VIEW */}
        {activeView === 'services' && (
          <div className="w-full">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-yellow-400" />
              Структура доходов по услугам
            </h3>

            {loadingServices ? (
              <div className="p-12 text-center text-white/50">Загрузка данных...</div>
            ) : serviceData && serviceData.service_types && serviceData.service_types.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Chart */}
                <div className="h-[250px] sm:h-[300px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={serviceData.service_types.filter(i => i.total_amount > 0)}
                        dataKey="total_amount"
                        nameKey="service_type"
                        cx="50%"
                        cy="50%"
                        outerRadius="80%"
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {serviceData.service_types.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{backgroundColor: '#1C1E24', borderColor: '#ffffff20', color: '#fff', borderRadius: '12px'}}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value) => formatCurrency(value)} 
                      />
                      <Legend formatter={(value) => {
                         const labels = {
                           'group_training': 'Турниры',
                           'individual_training': 'Индивидуальные тренировки',
                           'membership': 'Абонементы',
                           'equipment': 'Экипировка',
                           'other': 'Прочее'
                         };
                         return labels[value] || value;
                      }} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-white/50 text-sm">
                        <th className="py-3 font-medium">Категория</th>
                        <th className="py-3 font-medium text-right pr-8">Кол-во</th>
                        <th className="py-3 font-medium text-right">Сумма</th>
                        <th className="py-3 font-medium text-right">%</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {serviceData.service_types.sort((a,b) => b.total_amount - a.total_amount).map((item, idx) => {
                         const labels = {
                           'group_training': 'Турниры',
                           'individual_training': 'Индивидуальные тренировки',
                           'membership': 'Абонементы',
                           'equipment': 'Экипировка',
                           'other': 'Прочее'
                         };
                        return (
                          <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-3 text-white flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 5]}}></div>
                              {labels[item.service_type] || item.service_type}
                            </td>
                            <td className="py-3 text-right text-white/70 pr-8">{item.transaction_count}</td>
                            <td className="py-3 text-right text-emerald-400 font-medium">{formatCurrency(item.total_amount)}</td>
                            <td className="py-3 text-right text-white/50">{item.percentage.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-white/20 font-bold">
                        <td className="py-3 text-white">ИТОГО</td>
                        <td className="py-3 text-right text-white pr-8">{serviceData.summary.total_transactions}</td>
                        <td className="py-3 text-right text-emerald-400">{formatCurrency(serviceData.total_amount)}</td>
                        <td className="py-3 text-right text-white">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/30 py-12">
                <PieChart className="w-16 h-16 mb-4 opacity-50" />
                <p>Нет данных о доходах по категориям за этот период</p>
              </div>
            )}

            {/* Income Methods Section */}
            <div className="mt-12 pt-12 border-t border-white/10">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-400" />
                Структура приходов (по методам)
              </h3>

              {loadingIncomeMethods ? (
                <div className="p-12 text-center text-white/50">Загрузка данных...</div>
              ) : incomeMethodData && incomeMethodData.methods ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Chart */}
                  <div className="h-[250px] sm:h-[300px] flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPieChart>
                        <Pie
                          data={[
                            { name: 'Наличные', value: incomeMethodData.methods.cash || 0, color: '#10b981' },
                            { name: 'Карта', value: incomeMethodData.methods.card || 0, color: '#8b5cf6' },
                            { name: 'Перевод', value: incomeMethodData.methods.bank_transfer || 0, color: '#3b82f6' },
                            { name: 'Прочее', value: incomeMethodData.methods.other || 0, color: '#9ca3af' }
                          ].filter(i => i.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius="80%"
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {[
                            { name: 'Наличные', value: incomeMethodData.methods.cash || 0, color: '#10b981' },
                            { name: 'Карта', value: incomeMethodData.methods.card || 0, color: '#8b5cf6' },
                            { name: 'Перевод', value: incomeMethodData.methods.bank_transfer || 0, color: '#3b82f6' },
                            { name: 'Прочее', value: incomeMethodData.methods.other || 0, color: '#9ca3af' }
                          ].filter(i => i.value > 0).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip 
                          contentStyle={{backgroundColor: '#1C1E24', borderColor: '#ffffff20', color: '#fff', borderRadius: '12px'}}
                          itemStyle={{ color: '#fff' }}
                          formatter={(value) => formatCurrency(value)} 
                        />
                        <Legend />
                      </RechartsPieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-white/50 text-sm">
                          <th className="py-3 font-medium">Метод</th>
                          <th className="py-3 font-medium text-right">Кол-во</th>
                          <th className="py-3 font-medium text-right">Сумма</th>
                          <th className="py-3 font-medium text-right">%</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {[
                            { name: 'Наличные', value: incomeMethodData.methods.cash || 0, count: incomeMethodData.counts.cash || 0, color: '#10b981' },
                            { name: 'Карта', value: incomeMethodData.methods.card || 0, count: incomeMethodData.counts.card || 0, color: '#8b5cf6' },
                            { name: 'Перевод', value: incomeMethodData.methods.bank_transfer || 0, count: incomeMethodData.counts.bank_transfer || 0, color: '#3b82f6' },
                            { name: 'Прочее', value: incomeMethodData.methods.other || 0, count: incomeMethodData.counts.other || 0, color: '#9ca3af' }
                        ].sort((a,b) => b.value - a.value).map((item, idx) => (
                          <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-3 text-white flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full" style={{backgroundColor: item.color}}></div>
                              {item.name}
                            </td>
                            <td className="py-3 text-right text-white/70">{item.count}</td>
                            <td className="py-3 text-right text-emerald-400 font-medium">{formatCurrency(item.value)}</td>
                            <td className="py-3 text-right text-white/50">{incomeMethodData.total_amount > 0 ? ((item.value / incomeMethodData.total_amount) * 100).toFixed(1) : 0}%</td>
                          </tr>
                        ))}
                        <tr className="border-t border-white/20 font-bold">
                          <td className="py-3 text-white">ИТОГО</td>
                          <td className="py-3 text-right text-white">{incomeMethodData.counts.cash + incomeMethodData.counts.card + incomeMethodData.counts.bank_transfer + incomeMethodData.counts.other}</td>
                          <td className="py-3 text-right text-emerald-400">{formatCurrency(incomeMethodData.total_amount)}</td>
                          <td className="py-3 text-right text-white">100%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex flex-col items-center justify-center text-white/30">
                  <PieChart className="w-16 h-16 mb-4 opacity-50" />
                  <p>Нет данных о приходах за этот период</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CHART VIEW */}
        {activeView === 'chart' && (
          <div className="h-[300px] sm:h-[400px] w-full">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-yellow-400" />
              Финансовая динамика
            </h3>
            
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis 
                    dataKey="period" 
                    stroke="#ffffff50" 
                    tick={{fill: '#ffffff50', fontSize: 12}}
                    tickFormatter={(val) => {
                      if (val && val.length > 4) {
                        const [y, m] = val.split('-');
                        return `${m}/${y.slice(2)}`;
                      }
                      return val;
                    }}
                  />
                  <YAxis 
                    stroke="#ffffff50" 
                    tick={{fill: '#ffffff50', fontSize: 12}}
                    tickFormatter={(val) => `${val / 1000}k`}
                  />
                  <RechartsTooltip 
                    contentStyle={{backgroundColor: '#1C1E24', borderColor: '#ffffff20', color: '#fff', borderRadius: '12px'}}
                    formatter={(value, name) => [formatCurrency(value), name]}
                    labelFormatter={(label) => `Период: ${label}`}
                  />
                  <Legend />
                  
                  <Bar dataKey="revenue" name="Доходы" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} stackId="a" />
                  
                  {/* Expenses Stack */}
                  <Bar dataKey="salary" name="Зарплаты" fill="#3b82f6" radius={[0, 0, 0, 0]} maxBarSize={40} stackId="b" />
                  <Bar dataKey="expense" name="Расходы" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={40} stackId="b" />
                  
                  {/* Net Profit Line */}
                  <Line 
                    type="monotone" 
                    dataKey="net_profit" 
                    name="Прибыль" 
                    stroke="#eab308" 
                    strokeWidth={3}
                    dot={{r: 4, fill: '#eab308', strokeWidth: 2, stroke: '#000'}} 
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/30">
                <PieChart className="w-16 h-16 mb-4 opacity-50" />
                <p>Нет данных за выбранный период</p>
              </div>
            )}
          </div>
        )}

        {/* EXPENSE STRUCTURE VIEW */}
        {activeView === 'expense_structure' && (
          <div className="w-full">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <PieChart className="w-5 h-5 text-orange-400" />
              Структура расходов
            </h3>

            {loadingExpenses ? (
              <div className="p-12 text-center text-white/50">Загрузка данных...</div>
            ) : expenseStructureData.items.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Chart */}
                <div className="h-[250px] sm:h-[300px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={expenseStructureData.items}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius="80%"
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {expenseStructureData.items.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip 
                        contentStyle={{backgroundColor: '#1C1E24', borderColor: '#ffffff20', color: '#fff', borderRadius: '12px'}}
                        itemStyle={{ color: '#fff' }}
                        formatter={(value) => formatCurrency(value)} 
                      />
                      <Legend />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-white/50 text-sm">
                        <th className="py-3 font-medium">Категория</th>
                        <th className="py-3 font-medium text-right">Сумма</th>
                        <th className="py-3 font-medium text-right">%</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {expenseStructureData.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-3 text-white flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{backgroundColor: item.color}}></div>
                            {item.name}
                          </td>
                          <td className="py-3 text-right text-orange-400 font-medium">{formatCurrency(item.value)}</td>
                          <td className="py-3 text-right text-white/50">{((item.value / expenseStructureData.total) * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t border-white/20 font-bold">
                        <td className="py-3 text-white">ИТОГО</td>
                        <td className="py-3 text-right text-orange-400">{formatCurrency(expenseStructureData.total)}</td>
                        <td className="py-3 text-right text-white">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-white/30 py-12">
                <PieChart className="w-16 h-16 mb-4 opacity-50" />
                <p>Нет данных о расходах за этот период</p>
              </div>
            )}
          </div>
        )}

        {/* EXPENSES LIST VIEW */}
        {activeView === 'expenses' && (
          <div>
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-400" />
              Журнал расходов
            </h3>

            {loadingExpenses ? (
              <div className="text-center py-12 text-white/50">Загрузка...</div>
            ) : expenses.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                      <th className="p-4 font-medium">Дата</th>
                      <th className="p-4 font-medium">Название</th>
                      <th className="p-4 font-medium">Категория</th>
                      <th className="p-4 font-medium text-right">Сумма</th>
                      <th className="p-4 font-medium text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-4 text-white/60">{new Date(exp.date).toLocaleDateString()}</td>
                        <td className="p-4 font-medium text-white">
                          {exp.title}
                          {exp.description && <div className="text-xs text-white/40 mt-1">{exp.description}</div>}
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded text-xs border border-white/10 bg-white/5`}>
                            {getCategoryLabel(exp.category)}
                          </span>
                        </td>
                        <td className="p-4 text-right font-bold text-orange-400">
                          -{formatCurrency(exp.amount)}
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-2 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-white/30 border border-dashed border-white/10 rounded-xl">
                <div className="mb-2">Нет записей о расходах</div>
                <button onClick={() => setShowExpenseModal(true)} className="text-orange-400 hover:underline">
                  Добавить первый расход
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowExpenseModal(false)}>
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-scale-in" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#1C1E24] shrink-0">
              <h3 className="text-xl font-bold text-white">Новый расход</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <form id="financialExpenseForm" onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">Название *</label>
                <input
                  type="text"
                  required
                  placeholder="Например: Аренда поля"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                  value={newExpense.title}
                  onChange={e => setNewExpense({...newExpense, title: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">Сумма (MDL) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    value={newExpense.amount}
                    onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">Дата *</label>
                  <input
                    type="date"
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    value={newExpense.date}
                    onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">Категория</label>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setNewExpense({...newExpense, category: cat.id})}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                        newExpense.category === cat.id
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">Примечание</label>
                <textarea
                  placeholder="Дополнительные детали..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 min-h-[80px] resize-none transition-colors"
                  value={newExpense.description}
                  onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                />
              </div>
              </form>
            </div>

            <div className="p-4 border-t border-white/10 bg-[#1C1E24] shrink-0">
              <button
                type="submit"
                form="financialExpenseForm"
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex justify-center items-center gap-2"
              >
                <Check className="w-5 h-5" />
                Сохранить расход
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
