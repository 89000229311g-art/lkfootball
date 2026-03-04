import React, { useState, useEffect } from 'react';
import { paymentsAPI, groupsAPI, analyticsAPI, loggingAPI } from '../api/client';
import { Loader2, Calendar, Users, AlertCircle, CheckCircle2, Download, FileText, Info } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadBlob, loadFont } from '../utils/exportUtils';

export default function PaymentMatrix() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [matrixData, setMatrixData] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedGroup, setSelectedGroup] = useState('');
  const [groups, setGroups] = useState([]);
  const [cashFlowTotal, setCashFlowTotal] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  
  // Получаем список групп
  useEffect(() => {
    groupsAPI.getAll().then(res => {
        setGroups(res.data.data || res.data || []);
    }).catch(console.error);
  }, []);
  
  // Загружаем матрицу при изменении фильтров
  useEffect(() => {
    fetchMatrix();
    fetchCashFlow();
  }, [selectedYear, selectedGroup]);
  
  const fetchCashFlow = async () => {
    try {
        // Fetch revenue for the selected year (Cash Flow)
        // Using getRevenue with period='year' defaults to current year in backend if no dates provided?
        // Actually backend logic for 'year' defaults to today.year.
        // If selectedYear != current year, we must provide start_date/end_date.
        
        const start = `${selectedYear}-01-01`;
        const end = `${selectedYear}-12-31`;
        
        const res = await analyticsAPI.getRevenue('year', start, end);
        setCashFlowTotal(res.data?.total || 0);
    } catch (e) {
        console.error("Error fetching cash flow:", e);
    }
  };

  const fetchMatrix = async () => {
    setLoading(true);
    try {
      console.log('Fetching matrix for year:', selectedYear);
      const res = await paymentsAPI.getMatrix(selectedYear, selectedGroup || null);
      console.log('Matrix API Response:', res.data);
      setMatrixData(res.data);
    } catch (error) {
      console.error("Error loading matrix:", error);
    } finally {
      setLoading(false);
    }
  };
  
  const months = [
    { id: 1, name: t('jan_short') || 'Янв' }, { id: 2, name: t('feb_short') || 'Фев' }, { id: 3, name: t('mar_short') || 'Мар' },
    { id: 4, name: t('apr_short') || 'Апр' }, { id: 5, name: t('may_short') || 'Май' }, { id: 6, name: t('jun_short') || 'Июн' },
    { id: 7, name: t('jul_short') || 'Июл' }, { id: 8, name: t('aug_short') || 'Авг' }, { id: 9, name: t('sep_short') || 'Сен' },
    { id: 10, name: t('oct_short') || 'Окт' }, { id: 11, name: t('nov_short') || 'Ноя' }, { id: 12, name: t('dec_short') || 'Дек' }
  ];

  // Подсчет итогов по месяцам
  const totals = React.useMemo(() => {
    if (!matrixData?.students) return { monthly: {}, total: 0 };
    
    const monthly = {};
    let total = 0;
    
    matrixData.students.forEach(student => {
        // Суммируем общую оплату
        total += student.total_paid || 0;
        
        // Суммируем по месяцам (только completed)
        months.forEach(m => {
            const payment = student.payments[m.id];
            if (payment && payment.status === 'completed') {
                 monthly[m.id] = (monthly[m.id] || 0) + payment.amount;
            }
        });
    });
    
    return { monthly, total };
  }, [matrixData, months]);

  const handleExportExcel = () => {
    if (!matrixData?.students?.length) return;

    // Headers
    const headers = [
      t('matrix_student') || "Ученик",
      t('matrix_group') || "Группа",
      ...months.map(m => m.name),
      t('matrix_total') || "Всего",
      t('debt_label') || "Долг"
    ];

    // Summary Row Data
    const totalDebt = matrixData.students.reduce((sum, s) => sum + (s.total_debt || 0), 0);
    const summaryData = [
      t('total') || "ИТОГО",
      "", // Group column empty
      ...months.map(m => totals.monthly[m.id] || 0),
      totals.total,
      totalDebt
    ];

    // Student Rows
    const rows = matrixData.students.map(student => {
      const row = [
        student.name,
        student.group_name,
        ...months.map(m => {
          const payment = student.payments[m.id];
          if (!payment) return "";
          if (payment.status === 'pending') return `${payment.amount} (Долг)`;
          return payment.amount;
        }),
        student.total_paid,
        student.total_debt
      ];
      return row;
    });

    // Combine all data: Headers -> Summary -> Rows
    const data = [headers, summaryData, ...rows];

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    
    // Adjust column widths
    const wscols = [
        { wch: 30 }, // Name
        { wch: 15 }, // Group
        ...months.map(() => ({ wch: 10 })), // Months
        { wch: 15 }, // Total
        { wch: 10 }  // Debt
    ];
    worksheet['!cols'] = wscols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Payments Matrix");
    
    // Use downloadBlob for better mobile support
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, `Payment_Matrix_${selectedYear}.xlsx`);
  };

  const handleExportPDF = async () => {
    if (!matrixData?.students?.length) return;
    setIsExporting(true);

    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      
      // Load Cyrillic font
      const fontBase64 = await loadFont('Arial-Regular.ttf');
      let fontName = 'helvetica';
      
      if (fontBase64) {
          doc.addFileToVFS('Arial-Regular.ttf', fontBase64);
          doc.addFont('Arial-Regular.ttf', 'Arial', 'normal');
          doc.setFont('Arial');
          fontName = 'Arial';
      }
      
      doc.setFontSize(18);
      doc.text(`${t('payment_matrix') || 'Табель оплат'} - ${selectedYear}`, 14, 15);
      
      const groupName = selectedGroup ? groups.find(g => g.id === parseInt(selectedGroup))?.name : (t('all_groups') || 'Все группы');
      doc.setFontSize(12);
      doc.text(`${t('group')}: ${groupName}`, 14, 22);

      // Headers
      const headers = [
        [
          t('matrix_student') || "Ученик",
          t('matrix_group') || "Группа",
          ...months.map(m => m.name),
          t('matrix_total') || "Всего",
          t('debt_label') || "Долг"
        ]
      ];

      // Calculate totals
      const totalDebt = matrixData.students.reduce((sum, s) => sum + (s.total_debt || 0), 0);
      
      // Summary Row (as first row of body)
      const summaryRow = [
        t('total') || "ИТОГО",
        "",
        ...months.map(m => totals.monthly[m.id] || 0),
        totals.total,
        totalDebt
      ];

      // Data Rows
      const body = matrixData.students.map(student => [
        student.name,
        student.group_name,
        ...months.map(m => {
          const payment = student.payments[m.id];
          if (!payment) return "";
          return payment.status === 'pending' ? `(${payment.amount})` : payment.amount;
        }),
        student.total_paid,
        student.total_debt
      ]);

      // Add summary row at the top
      body.unshift(summaryRow);

      autoTable(doc, {
        head: headers,
        body: body,
        startY: 30,
        styles: { fontSize: 8, cellPadding: 1, font: fontName, fontStyle: 'normal' },
        headStyles: { fillColor: [22, 163, 74] }, // Green header
        alternateRowStyles: { fillColor: [240, 240, 240] },
        // Highlight summary row
        didParseCell: function(data) {
          if (data.section === 'body' && data.row.index === 0) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [220, 252, 231]; // Light green
          }
          // Highlight debt cells (containing parenthesis)
          if (data.section === 'body' && typeof data.cell.raw === 'string' && data.cell.raw.includes('(')) {
             data.cell.styles.textColor = [220, 38, 38]; // Red
          }
        }
      });

      // Use safe downloadBlob helper
      const blob = doc.output('blob');
      downloadBlob(blob, `Payment_Matrix_${selectedYear}.pdf`);
    } catch (error) {
      console.error("PDF Export failed:", error);
      loggingAPI.logFrontendError(
        'Payment matrix PDF export failed',
        { component: 'PaymentMatrix', translationKey: 'export_error' },
        error?.message || null
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters & Actions */}
      <div className="flex flex-col md:flex-row justify-between gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
        <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-white/60" />
                <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500"
                >
                    {Array.from({ length: 51 }, (_, i) => new Date().getFullYear() - 20 + i).map(year => (
                        <option key={year} value={year}>{year}</option>
                    ))}
                </select>
            </div>
            
            <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-white/60" />
                <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="bg-[#1C1E24] border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-yellow-500 min-w-[200px]"
                >
                    <option value="">{t('all_groups')}</option>
                    {groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                </select>
            </div>
        </div>

        <div className="flex gap-2">
            <button
                onClick={handleExportExcel}
                disabled={!matrixData?.students?.length}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <FileText className="w-4 h-4" />
                <span>Excel</span>
            </button>
            <button
                onClick={handleExportPDF}
                disabled={!matrixData?.students?.length || isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                <span>PDF</span>
            </button>
        </div>
      </div>
      
      {/* Financial Discrepancy Explanation */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400 mt-1 md:mt-0">
                <Info className="w-5 h-5" />
            </div>
            <div>
                <h3 className="text-blue-400 font-bold text-sm uppercase tracking-wider mb-1">
                    {t('financial_reconciliation') || 'Финансовая Сверка'} ({selectedYear})
                </h3>
                <div className="flex flex-col md:flex-row gap-2 md:gap-6 text-sm text-white/80">
                    <div>
                        <span className="text-white/50 block text-xs">{t('total_received') || 'Всего получено в'} {selectedYear} (Cash Flow):</span>
                        <span className="font-mono font-bold text-emerald-400 text-lg">
                            {new Intl.NumberFormat('ru-RU').format(cashFlowTotal)} MDL
                        </span>
                        <div className="text-[10px] text-white/40 max-w-[200px] leading-tight mt-1">
                            {t('cash_flow_desc') || `Деньги, фактически поступившие на счет в ${selectedYear} году (включая оплату долгов или авансы).`}
                        </div>
                    </div>
                    <div className="hidden md:block w-px bg-white/10 self-stretch"></div>
                    <div>
                        <span className="text-white/50 block text-xs">{t('distributed_by_months') || 'Распределено по месяцам'} {selectedYear} (Accrual):</span>
                        <span className="font-mono font-bold text-yellow-400 text-lg">
                            {new Intl.NumberFormat('ru-RU').format(totals.total)} MDL
                        </span>
                        <div className="text-[10px] text-white/40 max-w-[200px] leading-tight mt-1">
                            {t('accrual_desc') || `Оплаты, привязанные к месяцам ${selectedYear} года (независимо от даты платежа).`}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        {Math.abs(cashFlowTotal - totals.total) > 100 && (
            <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/10 text-right">
                <div className="text-xs text-white/50">{t('difference') || 'Разница'}</div>
                <div className={`font-mono font-bold ${cashFlowTotal > totals.total ? 'text-green-400' : 'text-red-400'}`}>
                    {cashFlowTotal > totals.total ? '+' : ''}
                    {new Intl.NumberFormat('ru-RU').format(cashFlowTotal - totals.total)} MDL
                </div>
            </div>
        )}
      </div>
      
      {/* Matrix Table */}
      {loading ? (
        <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-yellow-500" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-white/60 uppercase text-xs">
                    {/* Totals Row */}
                    <tr className="bg-white/10 font-bold text-white border-b border-white/10">
                        <th className="px-4 py-3 sticky left-0 bg-[#15171C] z-20 border-r border-white/10 min-w-[200px] text-right text-yellow-500">
                            {t('total') || "ИТОГО"}:
                        </th>
                        <th className="px-4 py-3 border-r border-white/10 min-w-[100px] bg-[#15171C]">
                            {/* Empty for Group column */}
                        </th>
                        {months.map(m => (
                            <th key={`total-${m.id}`} className="px-2 py-3 text-center border-r border-white/10 text-emerald-400 min-w-[80px] bg-[#15171C]">
                                {totals.monthly[m.id] > 0 ? totals.monthly[m.id] : <span className="text-white/10">-</span>}
                            </th>
                        ))}
                        <th className="px-4 py-3 text-right text-emerald-400 bg-[#15171C]">
                             {totals.total > 0 ? totals.total : ''}
                        </th>
                    </tr>
                    {/* Headers Row */}
                    <tr>
                        <th className="px-4 py-3 sticky left-0 bg-[#15171C] z-10 border-r border-white/10 min-w-[200px]">
                            {t('matrix_student')}
                        </th>
                        <th className="px-4 py-3 border-r border-white/10 min-w-[100px]">
                            {t('matrix_group')}
                        </th>
                        {months.map(m => (
                            <th key={m.id} className="px-2 py-3 text-center border-r border-white/10 min-w-[80px]">
                                {m.name}
                            </th>
                        ))}
                        <th className="px-4 py-3 text-right">
                            {t('matrix_total')}
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {matrixData?.students?.length > 0 ? (
                        matrixData.students.map(student => (
                            <tr key={student.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-3 font-medium text-white sticky left-0 bg-[#0F1117] border-r border-white/10">
                                    {student.name}
                                </td>
                                <td className="px-4 py-3 text-white/60 border-r border-white/10">
                                    {student.group_name}
                                </td>
                                {months.map(m => {
                                    const data = student.payments[m.id];
                                    
                                    if (!data) {
                                        return (
                                            <td key={m.id} className="px-2 py-3 text-center border-r border-white/5">
                                                <span className="text-white/10">—</span>
                                            </td>
                                        );
                                    }

                                    // Calculate breakdown
                                    let membership = 0;
                                    let other = 0;
                                    if (data.items && data.items.length > 0) {
                                        data.items.forEach(item => {
                                            if (item.type === 'membership') membership += item.price;
                                            else other += item.price;
                                        });
                                    } else {
                                        membership = data.amount; // Fallback
                                    }

                                    return (
                                        <td key={m.id} className="px-2 py-3 text-center border-r border-white/5 relative group">
                                            <div className={`flex flex-col items-center justify-center p-1 rounded transition-colors ${
                                                data.status === 'completed' 
                                                    ? (membership > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400')
                                                    : (data.status === 'partial' 
                                                        ? 'bg-yellow-500/10 text-yellow-500' 
                                                        : 'bg-red-500/10 text-red-400')
                                            }`}>
                                                <span className="font-bold text-xs">{membership > 0 ? membership : other}</span>
                                                {other > 0 && membership > 0 && (
                                                    <span className="text-[10px] opacity-70">+{other}</span>
                                                )}
                                                {data.status === 'completed' && <CheckCircle2 className="w-3 h-3 mt-0.5" />}
                                                {data.status === 'partial' && <AlertCircle className="w-3 h-3 mt-0.5" />}
                                            </div>
                                            
                                            {/* Tooltip */}
                                            {data.items && data.items.length > 0 && (
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-[#1C1E24] border border-white/20 rounded-lg p-3 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                                    <div className="text-xs font-bold text-white mb-2 border-b border-white/10 pb-1">Детали платежей:</div>
                                                    <div className="space-y-1">
                                                        {data.items.map((item, idx) => (
                                                            <div key={idx} className="flex justify-between text-[10px] text-white/80">
                                                                <span className="truncate max-w-[100px]" title={item.desc}>{item.type === 'membership' ? 'Абонемент' : (item.desc || item.type)}</span>
                                                                <span className="font-mono">{item.price}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                                <td className="px-4 py-3 text-right font-medium">
                                    <div className="text-emerald-400">{student.total_paid}</div>
                                    {student.total_debt > 0 && (
                                        <div className="text-red-400 text-xs">-{student.total_debt}</div>
                                    )}
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={15} className="px-4 py-12 text-center text-white/30">
                                {t('no_data_period')}
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
      )}
    </div>
  );
}
