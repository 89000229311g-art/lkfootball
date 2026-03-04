import React, { useState, useEffect, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
  Trophy, Calendar, Plus, Trash2, Edit2, 
  Save, X, ChevronDown, Activity, Check, FileText
} from 'lucide-react';
import { physicalTestsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, downloadBlob } from '../utils/exportUtils';
import { transliterate } from '../utils/transliteration';
import { getAcademyYears } from '../utils/dateUtils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Editable Cell Component
const EditableCell = ({ value, onSave, isSaving, type = 'number', suffix = '', isEditable = true, id, onKeyDownCustom }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setEditValue(value || '');
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
    }
  }, [isEditing]);

  const handleSave = () => {
    if (editValue !== value) {
      onSave(editValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSave();
      // Optional: Move down on Enter
      if (onKeyDownCustom) onKeyDownCustom({ ...e, key: 'ArrowDown' });
    }
    if (e.key === 'Escape') {
      setEditValue(value || '');
      setIsEditing(false);
    }
    if (onKeyDownCustom) onKeyDownCustom(e);
  };

  if (isEditing) {
    return (
      <div id={id} className="flex items-center justify-center min-w-[80px] h-[38px]">
        <input
          ref={inputRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="w-full bg-black/40 border border-brand-yellow rounded px-2 py-1 text-white font-mono text-center outline-none focus:ring-1 focus:ring-brand-yellow text-sm"
          placeholder="-"
        />
      </div>
    );
  }

  return (
    <div 
      id={id}
      tabIndex={isEditable ? 0 : -1}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && isEditable) setIsEditing(true);
        if (onKeyDownCustom) onKeyDownCustom(e);
      }}
      onClick={() => !isSaving && isEditable && setIsEditing(true)}
      className={`p-2 rounded transition-colors text-center min-w-[80px] h-[38px] flex items-center justify-center group outline-none focus:ring-1 focus:ring-brand-yellow/50 ${isEditable ? 'cursor-pointer hover:bg-white/10' : 'cursor-default'}`}
    >
      {value || value === 0 ? (
        <span className="font-mono font-bold text-white">
          {value}
          {suffix && <span className="text-xs text-white/40 ml-1">{suffix}</span>}
        </span>
      ) : (
        <span className={`text-white/10 transition-colors ${isEditable ? 'group-hover:text-white/40' : ''}`}>-</span>
      )}
    </div>
  );
};

const PhysicalStatsTab = forwardRef(({ 
  studentId, 
  t, 
  onUpdate, 
  selectedYear, 
  selectedQuarter = 0,
  selectedMonth = 0,
  onYearChange, 
  studentAdmissionYear,
  studentDOB,
  hideHeaderOnMobile = false,
  isManageMode = false,
  onManageModeChange,
  showCharts = false
}, ref) => {
  const { user } = useAuth();
  const isCoach = user?.role?.toLowerCase() === 'coach';
  const isAdminOrOwner = ['super_admin', 'admin', 'owner'].includes(user?.role?.toLowerCase());
  const canEdit = isAdminOrOwner || isCoach;

  // State
  const [loading, setLoading] = useState(true);
  const [tests, setTests] = useState([]);
  const [results, setResults] = useState([]);
  // Internal state if props not provided
  const [internalSelectedYear, setInternalSelectedYear] = useState(new Date().getFullYear());

  const currentYear = selectedYear || internalSelectedYear;

  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const yearsList = useMemo(() => getAcademyYears(studentAdmissionYear), [studentAdmissionYear]);

  // Test Management State
  const [newTest, setNewTest] = useState({ name: '', unit: '', category: '', description: '' });
  const [isAddingTest, setIsAddingTest] = useState(false);
  const [editingTestId, setEditingTestId] = useState(null);

  useImperativeHandle(ref, () => ({
    exportExcel,
    exportPDF
  }));

  useEffect(() => {
    fetchData();
  }, [studentId, currentYear]);

  // Reset manage mode if permission changes
  useEffect(() => {
    if (!canEdit && isManageMode) {
        onManageModeChange(false);
    }
  }, [canEdit]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [testsRes, resultsRes] = await Promise.all([
        physicalTestsAPI.getAll(),
        physicalTestsAPI.getStudentResults(studentId)
      ]);
      
      setTests(testsRes.data);
      setResults(resultsRes.data);
    } catch (error) {
      console.error("Error fetching physical stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const CATEGORY_LABELS = {
    technique: t('cat_technique') || "Техника",
    physical: t('cat_physical') || "Физика",
    discipline: t('cat_discipline') || "Дисциплина",
    tactics: t('cat_tactics') || "Тактика",
    speed: t('cat_speed') || "Скорость"
  };

  const isMobile = window.innerWidth < 768;

  // Filter results based on selected year, quarter, and month
  const filteredResults = useMemo(() => {
    return results.filter(result => {
      // If showing charts, do not filter by year/quarter to show full history
      if (showCharts) return true;

      if (result.year !== currentYear) return false;
      if (selectedQuarter > 0 && result.quarter !== selectedQuarter) return false;
      
      // For month filtering, we need to map months to quarters
      if (selectedMonth > 0) {
        const monthQuarter = Math.ceil(selectedMonth / 3);
        if (result.quarter !== monthQuarter) return false;
      }
      
      return true;
    });
  }, [results, currentYear, selectedQuarter, selectedMonth, showCharts]);

  const testsByCategory = useMemo(() => {
    // Initialize with specific order
    const grouped = {
      technique: [],
      physical: [],
      discipline: [],
      tactics: [],
      speed: [],
      other: []
    };
    
    tests.forEach(test => {
      let catKey = (test.category || 'other').toLowerCase();
      
      // Map legacy/default categories to new structure if needed
      if (['strength', 'power', 'endurance', 'flexibility', 'agility', 'coordination', 'anthropometry'].includes(catKey)) {
        catKey = 'physical';
      }
      
      if (!grouped[catKey]) grouped[catKey] = [];
      grouped[catKey].push(test);
    });
    
    // Remove empty 'other' if not needed, or keep it
    if (grouped.other.length === 0) delete grouped.other;
    
    return grouped;
  }, [tests]);

  const [expandedCategories, setExpandedCategories] = useState({
    technique: true,
    physical: true,
    discipline: true,
    tactics: true,
    speed: true
  });

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  const handleKeyDownNavigation = (e, testId, quarter) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    
    e.preventDefault(); // Prevent scrolling
    
    const currentInput = e.target;
    
    // Find all tests in current view to determine vertical neighbors
    // Flatten tests list based on display order
    const visibleTests = Object.entries(testsByCategory)
      .filter(([cat]) => expandedCategories[cat])
      .flatMap(([_, tests]) => tests);
      
    const currentIndex = visibleTests.findIndex(t => t.id === testId);
    
    let nextTestId = testId;
    let nextQuarter = quarter;
    
    if (e.key === 'ArrowRight') {
      if (quarter < 4) nextQuarter++;
    } else if (e.key === 'ArrowLeft') {
      if (quarter > 1) nextQuarter--;
    } else if (e.key === 'ArrowDown') {
      if (currentIndex < visibleTests.length - 1) {
        nextTestId = visibleTests[currentIndex + 1].id;
      }
    } else if (e.key === 'ArrowUp') {
      if (currentIndex > 0) {
        nextTestId = visibleTests[currentIndex - 1].id;
      }
    }
    
    // Focus new element
    const nextId = `cell-${nextTestId}-${nextQuarter}`;
    const nextElement = document.getElementById(nextId);
    
    if (nextElement) {
      // If it's a div (read mode), click it to enter edit mode
      nextElement.click();
      // Wait a tick for input to appear then focus
      setTimeout(() => {
        const input = document.querySelector(`#${nextId} input`);
        if (input) input.focus();
      }, 0);
    }
  };

  const TEST_NAME_TRANSLATIONS = {
    "30m Sprint": "Спринт 30м",
    "Sprint 30m": "Спринт 30м",
    "10m Sprint": "Спринт 10м",
    "Sprint 10m": "Спринт 10м",
    "Long Jump": "Прыжок в длину",
    "Standing Long Jump": "Прыжок в длину с места",
    "High Jump": "Прыжок в высоту",
    "Push-ups": "Отжимания",
    "Pull-ups": "Подтягивания",
    "Sit-ups": "Пресс",
    "Plank": "Планка",
    "Agility Test": "Тест на ловкость",
    "Cooper Test": "Тест Купера",
    "Beep Test": "Beep-тест",
    "Shuttle Run": "Челночный бег",
    "Juggling": "Жонглирование",
    "Dribbling": "Дриблинг",
    "Shooting": "Удары",
    "Passing": "Пас",
    "Height": "Рост",
    "Weight": "Вес",
    "BMI": "ИМТ",
    "Fat %": "% Жира"
  };

  const getTestName = (name) => {
      return t(name) || TEST_NAME_TRANSLATIONS[name] || name;
  };

  const handleSaveResult = async (testId, quarter, value) => {
    // If value is cleared (empty string), we treat it as a delete request
    if (value === '' || value === null) {
      // Find the result to get its ID
      const resultToDelete = results.find(r => 
        r.test_id === testId && r.year === currentYear && r.quarter === quarter
      );

      if (resultToDelete) {
        setIsSaving(true);
        // Optimistic update
        setResults(prev => prev.filter(r => r.id !== resultToDelete.id));
        
        try {
          await physicalTestsAPI.deleteResult(resultToDelete.id);
          if (onUpdate) onUpdate();
        } catch (error) {
          console.error("Error deleting result:", error);
          // Revert optimistic update
          setResults(prev => [...prev, resultToDelete]);
          alert(t('delete_error') || "Failed to delete result");
        } finally {
          setIsSaving(false);
        }
      }
      return;
    }

    if (value !== 0 && !value) return; // Skip if invalid value but not empty (handled above)

    setIsSaving(true);
    // Optimistic update
    const tempId = `temp-${Date.now()}`;
    const optimisticResult = {
      id: tempId,
      test_id: testId,
      value: parseFloat(value),
      quarter: quarter,
      year: currentYear,
      date: new Date().toISOString()
    };

    setResults(prev => {
      const filtered = prev.filter(r => 
        !(r.test_id === testId && r.year === currentYear && r.quarter === quarter)
      );
      return [...filtered, optimisticResult];
    });

    try {
      const data = {
        test_id: testId,
        value: parseFloat(value),
        quarter: quarter,
        year: currentYear,
        date: new Date().toISOString()
      };
      
      const savedResult = await physicalTestsAPI.addResult(studentId, data);
      
      // Replace optimistic result with real one
      setResults(prev => {
        const filtered = prev.filter(r => r.id !== tempId && 
          !(r.test_id === testId && r.year === currentYear && r.quarter === quarter)
        );
        return [...filtered, savedResult.data || savedResult];
      });
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Error saving result:", error);
      // Revert optimistic update
      setResults(prev => prev.filter(r => r.id !== tempId));
      fetchData(); // Reload to be safe
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTest = async () => {
    try {
      if (editingTestId) {
        const updated = await physicalTestsAPI.update(editingTestId, newTest);
        setTests(tests.map(t => t.id === editingTestId ? updated.data : t));
        setEditingTestId(null);
      } else {
        const created = await physicalTestsAPI.create(newTest);
        setTests([...tests, created.data]);
      }
      setIsAddingTest(false);
      setNewTest({ name: '', unit: '', category: '', description: '' });
    } catch (error) {
      console.error("Error saving test:", error);
      alert(t('save_error') || "Error saving test");
    }
  };

  const startEditTest = (test) => {
    setNewTest({
      name: test.name,
      unit: test.unit,
      category: test.category,
      description: test.description
    });
    setEditingTestId(test.id);
    setIsAddingTest(true);
  };

  const handleDeleteTest = async (id) => {
    if (!confirm(t('confirm_delete') || "Are you sure?")) return;
    try {
      await physicalTestsAPI.delete(id);
      setTests(tests.filter(t => t.id !== id));
    } catch (error) {
      console.error("Error deleting test:", error);
      alert(t('delete_error') || "Error deleting test");
    }
  };

  const exportExcel = () => {
    // Use filtered results based on current filters
    const filteredYears = [...new Set(filteredResults.map(r => r.year))].sort((a, b) => a - b);
    
    // If no data, use current year with current filters
    if (filteredYears.length === 0) {
      filteredYears.push(currentYear);
    }

    // Generate periods based on current filters
    const periods = [];
    filteredYears.forEach(year => {
      if (selectedQuarter > 0) {
        periods.push(`${year}-Q${selectedQuarter}`);
      } else {
        [1, 2, 3, 4].forEach(q => {
          // Only include quarters that have data in filteredResults
          if (filteredResults.some(r => r.year === year && r.quarter === q)) {
            periods.push(`${year}-Q${q}`);
          }
        });
      }
    });

    const data = [];
    Object.keys(testsByCategory).forEach(category => {
      testsByCategory[category].forEach(test => {
        const row = {
          category: t(category) || category,
          test: test.name,
          unit: t(test.unit) || test.unit
        };
        
        periods.forEach(period => {
          const [year, qStr] = period.split('-');
          const q = parseInt(qStr.replace('Q', ''));
          const res = filteredResults.find(r => r.test_id === test.id && r.year == year && r.quarter == q);
          row[period] = res ? res.value : '-';
        });
        
        data.push(row);
      });
    });

    const columns = {
      category: t('category') || 'Category',
      test: t('test_name') || 'Test',
      unit: t('unit') || 'Unit'
    };
    periods.forEach(p => columns[p] = p);

    // Generate filename based on filters
    let filename = `PhysicalStats_${studentId}`;
    if (selectedQuarter > 0) filename += `_Q${selectedQuarter}`;
    if (selectedMonth > 0) filename += `_Month${selectedMonth}`;
    filename += `_${currentYear}`;

    exportToExcel(data, columns, filename);
  };

  const exportPDF = async () => {
    setIsExporting(true);
    await new Promise(resolve => setTimeout(resolve, 10));
    
    try {
      const doc = new jsPDF();
      
      // Title with filter info
      let title = transliterate(t('physical_stats_history') || 'Physical Statistics History', 'ro');
      if (selectedQuarter > 0) title += ` - Q${selectedQuarter}`;
      if (selectedMonth > 0) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        title += ` - ${monthNames[selectedMonth - 1]}`;
      }
      
      doc.setFontSize(16);
      doc.text(title, 14, 20);
      
      // Group filtered results by Year (Newest First)
      const years = [...new Set(filteredResults.map(r => r.year))].sort((a, b) => b - a);
      
      let startY = 30;

      for (const year of years) {
        // Check space for title
        if (startY > 270) {
          doc.addPage();
          startY = 20;
        }

        doc.setFontSize(14);
        doc.text(`${year}`, 14, startY);
        startY += 10;

        const tableData = [];
        Object.keys(testsByCategory).forEach(category => {
          // Category Header Row
          tableData.push([{ 
            content: transliterate(t(category) || category, 'ro').toUpperCase(), 
            colSpan: 5, 
            styles: { fillColor: [220, 220, 220], fontStyle: 'bold', textColor: [0, 0, 0] } 
          }]);
          
          testsByCategory[category].forEach(test => {
            const getQResult = (q) => filteredResults.find(r => r.test_id === test.id && r.year === year && r.quarter === q);
            
            tableData.push([
              transliterate(test.name, 'ro'),
              getQResult(1)?.value ? `${getQResult(1).value} ${transliterate(t(test.unit) || test.unit, 'ro')}` : '-',
              getQResult(2)?.value ? `${getQResult(2).value} ${transliterate(t(test.unit) || test.unit, 'ro')}` : '-',
              getQResult(3)?.value ? `${getQResult(3).value} ${transliterate(t(test.unit) || test.unit, 'ro')}` : '-',
              getQResult(4)?.value ? `${getQResult(4).value} ${transliterate(t(test.unit) || test.unit, 'ro')}` : '-'
            ]);
          });
        });

        autoTable(doc, {
          head: [['Test', 'Q1', 'Q2', 'Q3', 'Q4']],
          body: tableData,
          startY: startY,
          theme: 'grid',
          styles: { fontSize: 10, font: 'helvetica' },
          headStyles: { fillColor: [26, 29, 36], textColor: [255, 255, 255] },
          margin: { top: 20 },
          pageBreak: 'auto',
          didDrawPage: (data) => {
             // Optional: Header on new pages
          }
        });
        
        startY = doc.lastAutoTable.finalY + 15;
      }
      
      const blob = doc.output('blob');
      
      // Generate filename based on filters
      let filename = `PhysicalStats_${studentId}`;
      if (selectedQuarter > 0) filename += `_Q${selectedQuarter}`;
      if (selectedMonth > 0) filename += `_Month${selectedMonth}`;
      filename += `_${currentYear}`;
      
      downloadBlob(blob, `${filename}.pdf`);
    } catch (error) {
      console.error("Export failed:", error);
      alert(t('export_error') || "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleInitDefaults = async () => {
    try {
      setLoading(true);
      await physicalTestsAPI.initDefaults();
      fetchData();
    } catch (error) {
      console.error("Init defaults error:", error);
      alert(t('init_error') || "Failed to initialize defaults");
    } finally {
      setLoading(false);
    }
  };

  if (loading && tests.length === 0) return <div className="p-8 text-center text-white/50">{t('loading_stats') || 'Загрузка...'}</div>;

  if (tests.length === 0 && canEdit) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-6 p-8 text-center bg-white/5 rounded-2xl border border-white/10">
        <div className="bg-brand-yellow/10 p-4 rounded-full">
            <Activity size={48} className="text-brand-yellow" />
        </div>
        <div>
            <h3 className="text-xl font-bold text-brand-yellow mb-2">{t('no_tests_defined') || 'Тесты не определены'}</h3>
            <p className="text-white/60 max-w-md">{t('no_tests_desc') || 'Начните с инициализации стандартного набора тестов или создайте свои.'}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
            <button
                onClick={handleInitDefaults}
                className="bg-brand-yellow text-black px-6 py-3 rounded-xl font-bold hover:bg-yellow-400 transition-colors flex items-center gap-2"
            >
                <FileText size={20} />
                {t('init_defaults') || 'Инициализировать стандартные'}
            </button>
            <button
                onClick={() => {
                    setIsAddingTest(true);
                    onManageModeChange(true);
                }}
                className="bg-white/10 text-white px-6 py-3 rounded-xl font-bold hover:bg-white/20 transition-colors flex items-center gap-2"
            >
                <Plus size={20} />
                {t('create_custom') || 'Создать вручную'}
            </button>
        </div>

        {/* Add Test Modal (Reusable) */}
        {isAddingTest && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                <div className="bg-[#1a1d24] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                    <h3 className="text-xl font-bold text-white mb-4">
                        {editingTestId ? (t('edit_test') || 'Редактировать тест') : (t('add_new_test') || 'Добавить новый тест')}
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-white/60 mb-1">{t('test_name') || 'Название теста'}</label>
                            <input
                                value={newTest.name}
                                onChange={e => setNewTest({ ...newTest, name: e.target.value })}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-brand-yellow"
                                placeholder="Например: Бег 30м"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-white/60 mb-1">{t('unit') || 'Ед. изм.'}</label>
                                <input
                                    value={newTest.unit}
                                    onChange={e => setNewTest({ ...newTest, unit: e.target.value })}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-brand-yellow"
                                    placeholder="сек, см, раз"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-white/60 mb-1">{t('category') || 'Категория'}</label>
                                <select
                                    value={newTest.category}
                                    onChange={e => setNewTest({ ...newTest, category: e.target.value })}
                                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-brand-yellow appearance-none"
                                >
                                    <option value="">{t('select_category') || "Выберите категорию..."}</option>
                                    <option value="technique">{t('cat_technique') || "Техника"}</option>
                                    <option value="physical">{t('cat_physical') || "Физика"}</option>
                                    <option value="discipline">{t('cat_discipline') || "Дисциплина"}</option>
                                    <option value="tactics">{t('cat_tactics') || "Тактика"}</option>
                                    <option value="speed">{t('cat_speed') || "Скорость"}</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm text-white/60 mb-1">{t('description') || 'Описание'}</label>
                            <textarea
                                value={newTest.description}
                                onChange={e => setNewTest({ ...newTest, description: e.target.value })}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-brand-yellow min-h-[80px]"
                                placeholder="Дополнительное описание..."
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button
                            onClick={() => { setIsAddingTest(false); setEditingTestId(null); setNewTest({ name: '', unit: '', category: '', description: '' }); }}
                            className="px-4 py-2 text-white/60 hover:text-white"
                        >
                            {t('cancel') || 'Отмена'}
                        </button>
                        <button
                            onClick={handleAddTest}
                            className="bg-brand-yellow text-black px-4 py-2 rounded-lg font-bold hover:bg-yellow-400"
                        >
                            {t('save') || 'Сохранить'}
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 relative pb-20">


      {/* Test Management Mode */}
      {isManageMode && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 animate-in slide-in-from-top-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">{t('manage_tests') || 'Управление тестами'}</h3>
            <button 
              onClick={() => {
                setIsAddingTest(!isAddingTest);
                setEditingTestId(null);
                setNewTest({ name: '', unit: '', category: '', description: '' });
              }}
              className="flex items-center gap-2 px-3 py-1.5 bg-brand-yellow text-black rounded-lg font-bold text-sm"
            >
              <Plus size={16} /> {t('add_test') || 'Добавить тест'}
            </button>
          </div>

          {isAddingTest && (
            <div id="test-management-form" className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 bg-black/20 p-4 rounded-xl">
              <input 
                placeholder={t('test_name') || "Название теста"} 
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                value={newTest.name}
                onChange={e => setNewTest({...newTest, name: e.target.value})}
              />
              <select
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                value={newTest.category}
                onChange={e => setNewTest({...newTest, category: e.target.value})}
              >
                <option value="">{t('select_category') || "Категория..."}</option>
                <option value="technique">{t('cat_technique') || "Техника"}</option>
                <option value="physical">{t('cat_physical') || "Физика"}</option>
                <option value="discipline">{t('cat_discipline') || "Дисциплина"}</option>
                <option value="tactics">{t('cat_tactics') || "Тактика"}</option>
                <option value="speed">{t('cat_speed') || "Скорость"}</option>
              </select>
              <input 
                placeholder={t('unit') || "Ед. изм."}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white"
                value={newTest.unit}
                onChange={e => setNewTest({...newTest, unit: e.target.value})}
              />
              <input 
                placeholder={t('description') || "Описание"}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white md:col-span-2"
                value={newTest.description}
                onChange={e => setNewTest({...newTest, description: e.target.value})}
              />
              <div className="md:col-span-5 flex justify-end gap-2">
                <button 
                  onClick={() => {
                    setIsAddingTest(false);
                    setEditingTestId(null);
                    setNewTest({ name: '', unit: '', category: '', description: '' });
                  }}
                  className="px-3 py-1.5 text-white/60 hover:text-white"
                >
                  {t('cancel') || "Отмена"}
                </button>
                <button 
                  onClick={handleAddTest}
                  className="px-3 py-1.5 bg-green-500 text-white rounded-lg font-bold"
                  disabled={!newTest.name}
                >
                  {editingTestId ? (t('update') || "Обновить") : (t('save_result') || "Сохранить")}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tests.map(test => (
              <div key={test.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                <div>
                  <div className="font-bold text-white">{test.name || <span className="text-red-400 text-xs italic">{t('no_name') || 'Без названия'}</span>}</div>
                  <div className="text-xs text-white/60">{CATEGORY_LABELS[test.category] || t(test.category) || test.category || t('uncategorized')} • {t(test.unit) || test.unit || '-'}</div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => startEditTest(test)}
                    className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-lg"
                    title={t('edit') || "Редактировать"}
                  >
                    <Edit2 size={16} />
                  </button>
                  <button 
                    onClick={() => handleDeleteTest(test.id)}
                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                    title={t('delete') || "Удалить"}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content (Table or Charts) */}
      <div className={`flex-1 ${isManageMode ? 'hidden' : 'block'}`}>
        {tests.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-full text-white/50 p-8">
              <Trophy size={48} className="mb-4 opacity-20" />
              <p className="mb-4 text-lg font-medium">{t('no_tests_defined') || 'Тесты не определены'}</p>
           </div>
        ) : showCharts ? (
          <div className="grid grid-cols-1 gap-6">
            {Object.entries(testsByCategory).map(([category, categoryTests]) => {
              // Prepare data for this category
              const relevantResults = filteredResults.filter(r => categoryTests.some(t => t.id === r.test_id));
              if (relevantResults.length === 0) return null;

              // Determine timeline range
              let startYear = new Date().getFullYear();
              if (studentAdmissionYear) {
                const admissionDate = new Date(studentAdmissionYear);
                if (!isNaN(admissionDate.getTime())) {
                  startYear = admissionDate.getFullYear();
                }
              }
              // Also consider existing results for start year
              if (relevantResults.length > 0) {
                 const minResultYear = Math.min(...relevantResults.map(r => r.year));
                 startYear = Math.min(startYear, minResultYear);
              }

              let endYear = new Date().getFullYear() + 5; // Default to 5 years ahead
              if (studentDOB) {
                const birthDate = new Date(studentDOB);
                if (!isNaN(birthDate.getTime())) {
                  const birthYear = birthDate.getFullYear();
                  // Extend until age 18
                  endYear = Math.max(endYear, birthYear + 18);
                }
              }

              // Generate all quarters for the range
              const allPeriods = [];
              for (let y = startYear; y <= endYear; y++) {
                for (let q = 1; q <= 4; q++) {
                  allPeriods.push(`${y}-Q${q}`);
                }
              }
              
              const data = allPeriods.map(period => {
                const [year, qStr] = period.split('-');
                const q = parseInt(qStr.replace('Q', ''));
                const item = { period: `${year} Q${q}` };
                
                categoryTests.forEach(test => {
                  const res = results.find(r => r.test_id === test.id && r.year == year && r.quarter == q);
                  if (res) {
                    item[getTestName(test.name)] = res.value;
                  }
                });
                return item;
              });

              if (data.length === 0) return null;

              const colors = ['#EAB308', '#3B82F6', '#22C55E', '#EF4444', '#A855F7', '#EC4899', '#F97316', '#06B6D4'];
              
              // Calculate width based on data points to allow scrolling
              const minWidthPerPoint = 80;
              const chartWidth = Math.max(1000, data.length * minWidthPerPoint);

              return (
                <div key={category} className="bg-white/5 border border-white/10 rounded-2xl p-6">
                  <h4 className="text-white font-bold mb-4 flex items-center gap-2">
                    <Trophy size={18} className="text-brand-yellow" />
                    {CATEGORY_LABELS[category] || t(category) || category}
                  </h4>
                  <div className="h-80 w-full overflow-x-auto custom-scrollbar pb-2">
                    <div style={{ width: `${chartWidth}px`, height: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                          <XAxis 
                            dataKey="period" 
                            stroke="#ffffff40" 
                            fontSize={12} 
                            interval={0}
                            tick={{ fill: '#9CA3AF' }}
                          />
                          <YAxis stroke="#ffffff40" fontSize={12} domain={['auto', 'auto']} />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid #ffffff20', borderRadius: '8px' }}
                            labelStyle={{ color: '#ffffff', fontWeight: 'bold', marginBottom: '8px' }}
                            itemStyle={{ padding: '2px 0' }}
                          />
                          <Legend wrapperStyle={{ paddingTop: '20px' }} />
                          {categoryTests.map((test, index) => (
                            <Line 
                              key={test.id}
                              type="monotone" 
                              dataKey={getTestName(test.name)} 
                              name={getTestName(test.name)}
                              stroke={colors[index % colors.length]} 
                              strokeWidth={3}
                              dot={{ fill: colors[index % colors.length], r: 4 }}
                              activeDot={{ r: 6 }}
                              connectNulls
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
            <div className="grid grid-cols-1 gap-8">
            {Object.entries(testsByCategory).map(([category, categoryTests]) => (
              <div key={category} className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div 
                  className="bg-white/5 p-4 border-b border-white/5 flex items-center justify-between cursor-pointer hover:bg-white/10 transition-colors"
                  onClick={() => toggleCategory(category)}
                >
                  <div className="flex items-center gap-3">
                    <Trophy className="text-brand-yellow" size={20} />
                    <h3 className="text-lg font-bold text-white uppercase tracking-wider">
                      {CATEGORY_LABELS[category] || t(category) || category}
                    </h3>
                  </div>
                  <ChevronDown 
                    className={`text-white/40 transition-transform duration-300 ${expandedCategories[category] ? 'rotate-180' : ''}`}
                    size={20}
                  />
                </div>
                
                {expandedCategories[category] && (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 bg-white/5">
                            <th className="p-4 text-xs font-bold text-white/40 uppercase w-1/3 min-w-[200px] sticky left-0 bg-[#1e2128] z-10 shadow-r">{t('test_name') || 'Тест'}</th>
                            {[1, 2, 3, 4].map(q => (
                              <th key={q} className="p-4 text-xs font-bold text-white/40 uppercase text-center w-[100px]">
                                {q} {t('quarter_short') || 'Кв.'}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {categoryTests.map(test => {
                            return (
                              <tr key={test.id} className="hover:bg-white/5 transition-colors group">
                                <td className="p-4 sticky left-0 bg-[#1a1d24] group-hover:bg-[#252830] transition-colors z-10 border-r border-white/5">
                                  <div className="font-bold text-white text-base">{getTestName(test.name)}</div>
                                  <div className="text-xs text-white/60">{t(test.unit) || test.unit}</div>
                                </td>
                                {[1, 2, 3, 4].map(q => {
                                  const result = filteredResults.find(r => 
                                    r.test_id === test.id && 
                                    r.year === currentYear && 
                                    r.quarter === q
                                  );
                                  
                                  return (
                                    <td key={q} className="p-2 text-center border-l border-white/5">
                                      <div className="flex justify-center">
                                        <EditableCell 
                                          id={`cell-${test.id}-${q}`}
                                          value={result?.value}
                                          onSave={(val) => handleSaveResult(test.id, q, val)}
                                          isSaving={isSaving}
                                          suffix={t(test.unit) || test.unit}
                                          isEditable={canEdit && !isManageMode}
                                          onKeyDownCustom={(e) => handleKeyDownNavigation(e, test.id, q)}
                                        />
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden p-4 space-y-4">
                      {categoryTests.map(test => (
                        <div key={test.id} className="bg-white/5 rounded-xl p-4 border border-white/10">
                          <div className="mb-3 flex justify-between items-start">
                            <div>
                              <div className="font-bold text-white text-base">{getTestName(test.name)}</div>
                              <div className="text-xs text-white/60">{t(test.unit) || test.unit}</div>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            {[1, 2, 3, 4].map(q => {
                              const result = filteredResults.find(r => 
                                r.test_id === test.id && 
                                r.year === currentYear && 
                                r.quarter === q
                              );
                              
                              return (
                                <div key={q} className="bg-black/20 rounded-lg p-2 flex flex-col items-center">
                                  <div className="text-[10px] text-white/40 uppercase font-bold mb-1">
                                    {q} {t('quarter_short') || 'Кв.'}
                                  </div>
                                  <div className="w-full">
                                    <EditableCell 
                                      id={`cell-mobile-${test.id}-${q}`}
                                      value={result?.value}
                                      onSave={(val) => handleSaveResult(test.id, q, val)}
                                      isSaving={isSaving}
                                      suffix={t(test.unit) || test.unit}
                                      isEditable={canEdit && !isManageMode}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default PhysicalStatsTab;
