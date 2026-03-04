import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, Calendar, FileText, CreditCard, X, Filter, Search,
  Loader2
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { expensesAPI, marketingAPI } from '../api/client';
import CustomDatePicker from './CustomDatePicker';
import { exportToExcel, exportToPDF, getDateString } from '../utils/exportUtils';

export default function Expenses() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
  
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [marketingCampaigns, setMarketingCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], // First day of current month
    end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0] // Last day of current month
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // Expense Form State
  const [newExpense, setNewExpense] = useState({
    title: '',
    amount: '',
    category: 'other',
    marketing_campaign_id: null,
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  useEffect(() => {
    fetchCategories();
    fetchMarketingCampaigns();
  }, []);

  const fetchMarketingCampaigns = async () => {
    try {
      const res = await marketingAPI.getCampaigns();
      setMarketingCampaigns(res.data);
    } catch (err) {
      console.error("Failed to fetch marketing campaigns", err);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [dateRange]);

  const fetchCategories = async () => {
    try {
      const res = await expensesAPI.getCategories();
      setCategories(res.data);
    } catch (err) {
      console.error("Failed to fetch categories", err);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const res = await expensesAPI.getAll({ 
        start_date: dateRange.start, 
        end_date: dateRange.end,
        limit: 1000 // Increase limit to see all
      });
      setExpenses(res.data);
    } catch (err) {
      console.error("Failed to fetch expenses", err);
    } finally {
      setLoading(false);
    }
  };

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
        marketing_campaign_id: null,
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
      
      fetchExpenses();
      
    } catch (err) {
      console.error("Failed to create expense", err);
      alert(t('error_creating_expense') || "Ошибка при создании расхода");
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm(t('confirm_delete_expense') || "Удалить этот расход?")) return;
    try {
      await expensesAPI.delete(id);
      fetchExpenses();
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

  // Filter expenses locally by search query
  const filteredExpenses = expenses.filter(exp => 
    exp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (exp.description && exp.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const totalAmount = filteredExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

  const handleExport = (type = 'excel') => {
    if (!filteredExpenses.length) return;
    
    const filename = `Expenses_${getDateString()}`;
    
    // Prepare data
    const dataToExport = filteredExpenses.map(exp => ({
      date: new Date(exp.date).toLocaleDateString(),
      title: exp.title,
      category: getCategoryLabel(exp.category),
      amount: `${formatCurrency(exp.amount)}`,
      description: exp.description || ''
    }));
    
    const columns = {
      date: t('date') || "Дата",
      title: t('title') || "Название",
      category: t('category') || "Категория",
      amount: t('amount') || "Сумма",
      description: t('description') || "Описание"
    };
    
    if (type === 'excel') {
      exportToExcel(dataToExport, columns, filename);
    } else {
      setIsExporting(true);
      exportToPDF(
        dataToExport, 
        columns, 
        filename, 
        t('expenses_report') || 'Отчет о расходах',
        (doc, data) => {
             // Footer with total
             if (data.pageNumber === doc.internal.getNumberOfPages()) {
                 doc.setFontSize(10);
                 doc.text(`${t('total') || 'Итого'}: ${formatCurrency(totalAmount)}`, 14, doc.lastAutoTable.finalY + 10);
             }
        }
      ).finally(() => setIsExporting(false));
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between bg-white/5 p-4 rounded-xl border border-white/10">
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            {/* Date Range */}
            <div className="flex items-center gap-2 bg-[#0F1117] rounded-lg px-3 py-2 border border-white/10">
                <Calendar className="w-4 h-4 text-white/50" />
                <div className="w-32">
                    <CustomDatePicker
                        selected={dateRange.start ? new Date(dateRange.start) : null}
                        onChange={(date) => {
                            if (!date) return;
                            const val = date.toISOString().split('T')[0];
                            setDateRange({...dateRange, start: val});
                        }}
                        className="bg-transparent border-none text-white text-sm outline-none w-full p-0"
                        placeholder="Start"
                    />
                </div>
                <span className="text-white/30">-</span>
                <div className="w-32">
                    <CustomDatePicker
                        selected={dateRange.end ? new Date(dateRange.end) : null}
                        onChange={(date) => {
                            if (!date) return;
                            const val = date.toISOString().split('T')[0];
                            setDateRange({...dateRange, end: val});
                        }}
                        className="bg-transparent border-none text-white text-sm outline-none w-full p-0"
                        placeholder="End"
                    />
                </div>
            </div>

            {/* Search */}
            <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
                <input
                    type="text"
                    placeholder={t('search_placeholder') || "Поиск..."}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#0F1117] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:outline-none focus:border-orange-500"
                />
            </div>
        </div>

        {isAdmin && (
            <div className="flex gap-2">
                <button
                    onClick={() => handleExport('excel')}
                    disabled={!filteredExpenses.length}
                    className="p-2 bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded-lg transition-colors disabled:opacity-50"
                    title="Export Excel"
                >
                    <FileText className="w-5 h-5" />
                </button>
                <button
                    onClick={() => handleExport('pdf')}
                    disabled={!filteredExpenses.length || isExporting}
                    className="p-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded-lg transition-colors disabled:opacity-50"
                    title="Export PDF"
                >
                    {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                </button>
                <button
                    onClick={() => setShowExpenseModal(true)}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-lg shadow-orange-500/20 whitespace-nowrap"
                >
                    <Plus className="w-4 h-4" />
                    {t('add_expense') || "Добавить расход"}
                </button>
            </div>
            )}
      </div>

      {/* Summary */}
      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
         <div className="flex items-center gap-3">
             <div className="p-2 bg-orange-500/20 rounded-lg">
                 <CreditCard className="w-6 h-6 text-orange-500" />
             </div>
             <div>
                 <div className="text-sm text-orange-200/60">{t('total_expenses') || "Всего расходов"}</div>
                 <div className="text-xl font-bold text-white">{formatCurrency(totalAmount)}</div>
             </div>
         </div>
         <div className="text-sm text-white/40">
             {filteredExpenses.length} {t('records') || "записей"}
         </div>
      </div>

      {/* Table */}
      <div className="bg-[#0F1117] rounded-xl border border-white/5 overflow-hidden">
        {loading ? (
            <div className="text-center py-12 text-white/50">{t('loading') || "Загрузка..."}</div>
        ) : filteredExpenses.length > 0 ? (
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                <tr className="bg-white/5 border-b border-white/10 text-white/40 text-xs uppercase tracking-wider">
                    <th className="p-3 md:p-4 font-medium">{t('date') || "Дата"}</th>
                    <th className="p-3 md:p-4 font-medium">{t('title') || "Название"}</th>
                    <th className="p-3 md:p-4 font-medium">{t('category') || "Категория"}</th>
                    <th className="p-3 md:p-4 font-medium text-right">{t('amount') || "Сумма"}</th>
                    {isAdmin && <th className="p-3 md:p-4 font-medium text-right">{t('actions') || "Действия"}</th>}
                </tr>
                </thead>
                <tbody className="text-sm">
                {filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="p-3 md:p-4 text-white/60">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="p-3 md:p-4 font-medium text-white">
                        {exp.title}
                        {exp.marketing_campaign && (
                            <div className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                                <span className="opacity-60">Кампания:</span> {exp.marketing_campaign.name}
                            </div>
                        )}
                        {exp.description && <div className="text-xs text-white/40 mt-1">{exp.description}</div>}
                    </td>
                    <td className="p-3 md:p-4">
                        <span className={`px-2 py-1 rounded text-xs border border-white/10 bg-white/5`}>
                        {getCategoryLabel(exp.category)}
                        </span>
                    </td>
                    <td className="p-3 md:p-4 text-right font-bold text-orange-400">
                        -{formatCurrency(exp.amount)}
                    </td>
                    {isAdmin && (
                        <td className="p-3 md:p-4 text-right">
                        <button 
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-2 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-lg transition-colors"
                            title={t('delete') || "Удалить"}
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                        </td>
                    )}
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        ) : (
            <div className="text-center py-12 text-white/30">
            <div className="mb-2">{t('no_expenses') || "Нет записей о расходах"}</div>
            </div>
        )}
      </div>

      {/* Add Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowExpenseModal(false)}>
          <div className="bg-[#1C1E24] border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-white/10 flex justify-between items-center bg-[#1C1E24] shrink-0">
              <h3 className="text-xl font-bold text-white">{t('new_expense') || "Новый расход"}</h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-white/40 hover:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <form id="expenseForm" onSubmit={handleCreateExpense} className="p-6 space-y-4">
                <div>
                  <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('title') || "Название"} *</label>
                  <input
                    type="text"
                    required
                    placeholder={t('expense_title_placeholder') || "Например: Аренда поля"}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    value={newExpense.title}
                    onChange={e => setNewExpense({...newExpense, title: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('amount') || "Сумма"} (MDL) *</label>
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
                    <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('date') || "Дата"} *</label>
                    <div className="relative">
                      <CustomDatePicker
                        selected={newExpense.date ? new Date(newExpense.date) : null}
                        onChange={(date) => {
                            if (!date) return;
                            const val = date.toISOString().split('T')[0];
                            setNewExpense({...newExpense, date: val});
                        }}
                        required
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('category') || "Категория"}</label>
                  <select
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                    value={newExpense.category}
                    onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                {newExpense.category === 'marketing' && (
                  <div className="animate-fade-in">
                    <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('marketing_campaign') || "Маркетинговая кампания"}</label>
                    <select
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors"
                      value={newExpense.marketing_campaign_id || ''}
                      onChange={e => setNewExpense({...newExpense, marketing_campaign_id: e.target.value ? parseInt(e.target.value) : null})}
                    >
                      <option value="">{t('select_campaign') || "Выберите кампанию..."}</option>
                      {marketingCampaigns.map(campaign => (
                        <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-white/40 mb-1 uppercase font-bold tracking-wider">{t('description') || "Описание"}</label>
                  <textarea
                    rows="3"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-orange-500 resize-none transition-colors"
                    value={newExpense.description}
                    onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                  ></textarea>
                </div>
              </form>
            </div>

            <div className="p-4 border-t border-white/10 bg-[#1C1E24] shrink-0 flex gap-3">
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                className="flex-1 py-3 rounded-xl font-bold bg-white/5 text-white hover:bg-white/10 transition-colors"
              >
                {t('cancel') || "Отмена"}
              </button>
              <button
                type="submit"
                form="expenseForm"
                className="flex-1 py-3 rounded-xl font-bold bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20 transition-colors"
              >
                {t('save') || "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}