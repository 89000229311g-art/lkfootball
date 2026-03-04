import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { billingAPI } from '../api/client';
import { X, Calendar, Download, FileText, CheckCircle, AlertCircle, Banknote, User, Star } from 'lucide-react';

const StudentInvoiceHistoryModal = ({ student, onClose }) => {
  const { t, language } = useLanguage();
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!student?.id) return;

    setLoading(true);
    billingAPI.getStudentHistory(student.id)
      .then(res => {
        setHistory(res.data);
      })
      .catch(err => {
        console.error("Error fetching billing history:", err);
        setError(t('error_loading_history') || 'Не удалось загрузить историю платежей');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [student?.id, t]);

  const getServiceIcon = (type) => {
    switch(type) {
      case 'Групповые тренировки': return <Banknote className="w-4 h-4 text-emerald-400" />;
      case 'Индивидуальные тренировки': return <User className="w-4 h-4 text-blue-400" />;
      case 'Экипировка': return <Star className="w-4 h-4 text-yellow-400" />;
      default: return <FileText className="w-4 h-4 text-white/50" />;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'ro-RO');
  };

  if (!student) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#1A1D24] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#1A1D24]">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Banknote className="w-6 h-6 text-yellow-400" />
              {t('billing_history') || 'История платежей и начислений'}
            </h2>
            <p className="text-sm text-white/40 mt-1">
              {student.first_name} {student.last_name}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/40 hover:text-white"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-white/40">{t('loading') || 'Загрузка...'}</p>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
              <p className="text-red-400">{error}</p>
              <button 
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
              >
                {t('close') || 'Закрыть'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <div className="text-sm text-white/40 mb-1">{t('total_invoiced') || 'Всего начислено'}</div>
                  <div className="text-2xl font-bold text-white">
                    {history?.summary?.total_invoiced || 0} <span className="text-sm font-normal text-white/40">MDL</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <div className="text-sm text-white/40 mb-1">{t('total_paid') || 'Всего оплачено'}</div>
                  <div className="text-2xl font-bold text-emerald-400">
                    {history?.summary?.total_paid || 0} <span className="text-sm font-normal text-white/40">MDL</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <div className="text-sm text-white/40 mb-1">{t('current_balance') || 'Текущий баланс'}</div>
                  <div className={`text-2xl font-bold ${
                    (history?.summary?.balance || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {history?.summary?.balance > 0 ? '+' : ''}{history?.summary?.balance || 0} <span className="text-sm font-normal text-white/40">MDL</span>
                  </div>
                </div>
              </div>

              {/* Invoices List */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white mb-2">{t('invoices') || 'Счета'}</h3>
                
                {history?.invoices?.length === 0 ? (
                  <div className="text-center py-8 text-white/30 bg-white/5 rounded-xl border border-white/5 border-dashed">
                    {t('no_invoices') || 'Нет выставленных счетов'}
                  </div>
                ) : (
                  history?.invoices?.map((invoice) => (
                    <div key={invoice.id} className="bg-white/5 rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition-colors">
                      {/* Invoice Header */}
                      <div className="p-4 bg-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            invoice.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 
                            invoice.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 
                            'bg-red-500/20 text-red-400'
                          }`}>
                            <FileText className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-medium text-white">
                              {t('invoice') || 'Счет'} #{invoice.id}
                            </div>
                            <div className="text-xs text-white/40">
                              {formatDate(invoice.created_at)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-white">
                            {invoice.amount} MDL
                          </div>
                          <div className={`text-xs px-2 py-0.5 rounded-full inline-block mt-1 ${
                            invoice.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 
                            invoice.status === 'partial' ? 'bg-yellow-500/20 text-yellow-400' : 
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {t(invoice.status) || invoice.status}
                          </div>
                        </div>
                      </div>

                      {/* Invoice Items */}
                      {invoice.items && invoice.items.length > 0 && (
                        <div className="p-4 border-t border-white/5 bg-[#1A1D24]/50">
                          <div className="text-xs font-medium text-white/40 mb-2 uppercase tracking-wider">
                            {t('details') || 'Детализация'}
                          </div>
                          <div className="space-y-2">
                            {invoice.items.map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm group">
                                <div className="flex items-center gap-2">
                                  {getServiceIcon(item.item_type)}
                                  <span className="text-white/80">{item.description}</span>
                                </div>
                                <div className="text-white/60 font-mono">
                                  {item.quantity} x {item.unit_price} = <span className="text-white">{item.total_price} MDL</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudentInvoiceHistoryModal;