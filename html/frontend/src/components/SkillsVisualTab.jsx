import React, { useState, useEffect, useCallback } from 'react';
import { skillsAPI } from '../api/client';
import SkillEvaluator from './dashboard/coach/SkillEvaluator';
import { Loader2, AlertCircle, Plus, Trash2, Calendar, ChevronRight, X, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SkillsVisualTab = ({ studentId, isCoach, isAdmin, t }) => {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Selection State: We now select a QUARTER (1-4) instead of a month
  const [selectedQuarter, setSelectedQuarter] = useState(null); // 1, 2, 3, 4
  const [selectedRating, setSelectedRating] = useState(null); // The actual rating object or null
  
  // Generate years dynamically (20 past, 5 future)
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear - 20; y <= currentYear + 5; y++) {
    years.push(y);
  }

  const quarters = [1, 2, 3, 4];

  const fetchRatings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await skillsAPI.getStudentSkills(studentId);
      setRatings(res.data || []);
    } catch (err) {
      console.error("Error fetching skills:", err);
      setError('Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchRatings();
  }, [fetchRatings]);

  // Helper to get the representative month for a quarter (3, 6, 9, 12)
  const getMonthForQuarter = (q) => q * 3;

  const getRatingForQuarter = (q, year) => {
    const targetMonth = getMonthForQuarter(q);
    // Find rating for month 3, 6, 9, or 12
    return ratings.find(r => r.rating_month === targetMonth && r.rating_year === year);
  };

  const handleQuarterSelect = (q) => {
    setSelectedQuarter(q);
    const rating = getRatingForQuarter(q, selectedYear);
    setSelectedRating(rating || null);
  };

  const handleSave = async ({ skills, tags }) => {
    try {
      const targetMonth = getMonthForQuarter(selectedQuarter);
      
      const payload = {
        student_id: studentId,
        rating_month: targetMonth,
        rating_year: selectedYear,
        technique: parseInt(skills.technique || 0),
        tactics: parseInt(skills.tactics || 0),
        physical: parseInt(skills.physical || 0),
        discipline: parseInt(skills.discipline || 0),
        speed: parseInt(skills.speed || 0),
        talent_tags: tags || [],
        coach_comment: skills.coach_comment || ""
      };

      await skillsAPI.rateStudent(payload);
      await fetchRatings();
      
      alert(t('skills_saved') || 'Skills saved successfully');
      setSelectedQuarter(null); // Close editor
    } catch (error) {
      console.error("Error saving skills:", error);
      alert(t('skills_error') || 'Error saving skills');
    }
  };
  
  const handleDelete = async () => {
    if (!selectedRating) return;
    
    if (!window.confirm(t('confirm_delete_rating') || 'Are you sure you want to delete this rating?')) {
      return;
    }

    try {
      await skillsAPI.deleteRating(selectedRating.id);
      await fetchRatings();
      setSelectedQuarter(null);
      setSelectedRating(null);
    } catch (error) {
      console.error("Error deleting rating:", error);
      alert(t('delete_error') || 'Error deleting rating');
    }
  };

  const calculateAverage = (r) => {
    if (!r) return 0;
    const sum = (r.technique || 0) + (r.tactics || 0) + (r.physical || 0) + (r.discipline || 0) + (r.speed || 0);
    return (sum / 5).toFixed(1);
  };

  if (loading && ratings.length === 0) return (
    <div className="h-full flex items-center justify-center text-white/50">
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(parseInt(e.target.value));
                setSelectedQuarter(null);
              }}
              className="appearance-none bg-black/20 text-white font-bold py-2 pl-4 pr-10 rounded-xl border border-white/10 outline-none focus:border-brand-yellow cursor-pointer hover:bg-black/30 transition-colors"
            >
              {Array.from({ length: 51 }, (_, i) => new Date().getFullYear() - 20 + i).map(year => (
                <option key={year} value={year} className="bg-[#1a1d24] text-white">
                  {year}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none group-hover:text-white transition-colors" />
          </div>
        </div>
        
        <div className="text-white/40 text-sm font-medium">
          {t('quarterly_assessment_only') || 'Quarterly Assessment Only'}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        {/* Quarters List (Left Side) */}
        <div className="lg:w-1/3 flex flex-col gap-4">
          <h3 className="text-white/60 text-sm font-bold uppercase tracking-wider px-2">
            {t('select_quarter') || 'Select Quarter'}
          </h3>
          
          <div className="grid gap-3">
            {quarters.map(q => {
              const rating = getRatingForQuarter(q, selectedYear);
              const isSelected = selectedQuarter === q;
              const avg = calculateAverage(rating);
              const quarterName = `Q${q}`; // Simple name Q1, Q2, etc.

              return (
                <motion.button
                  key={q}
                  onClick={() => handleQuarterSelect(q)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    relative p-4 rounded-xl border text-left transition-all group
                    ${isSelected 
                      ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-blue-500/50 shadow-lg shadow-blue-500/10' 
                      : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'}
                  `}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <div className={`text-lg font-bold ${isSelected ? 'text-white' : 'text-white/80'}`}>
                        {quarterName}
                      </div>
                      <div className="text-xs text-white/40 mt-1">
                        {rating 
                          ? (t('rated_on') || 'Rated on') + ` ${new Date(rating.created_at).toLocaleDateString()}`
                          : (t('no_rating') || 'No rating')
                        }
                      </div>
                    </div>
                    
                    {rating ? (
                      <div className="flex flex-col items-end">
                        <span className={`text-2xl font-black ${
                          avg >= 8 ? 'text-emerald-400' : avg >= 6 ? 'text-brand-yellow' : 'text-red-400'
                        }`}>
                          {avg}
                        </span>
                        <span className="text-[10px] text-white/30 uppercase font-bold">AVG</span>
                      </div>
                    ) : (
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center border-2 border-dashed
                        ${isSelected ? 'border-blue-400 text-blue-400' : 'border-white/20 text-white/20 group-hover:border-white/40 group-hover:text-white/40'}
                      `}>
                        <Plus size={20} />
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Editor Area (Right Side) */}
        <div className="flex-1 bg-black/20 rounded-3xl border border-white/5 p-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {selectedQuarter ? (
              <motion.div
                key="editor"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col"
              >
                <div className="flex justify-between items-center p-4 pb-0">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-white/40">{selectedYear}</span>
                    <ChevronRight size={16} className="text-white/20" />
                    <span>Q{selectedQuarter}</span>
                  </h2>
                  
                  <div className="flex gap-2">
                     {selectedRating && (isCoach || isAdmin) && (
                      <button
                        onClick={handleDelete}
                        className="p-2 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors"
                        title={t('delete_rating') || 'Delete Rating'}
                      >
                        <Trash2 size={20} />
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedQuarter(null)}
                      className="p-2 hover:bg-white/10 text-white/60 rounded-lg transition-colors"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 p-4 min-h-0">
                  <SkillEvaluator
                    key={selectedRating ? selectedRating.id : `new-q${selectedQuarter}-${selectedYear}`}
                    initialData={selectedRating}
                    readOnly={!isCoach && !isAdmin}
                    onSave={handleSave}
                    t={t}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col items-center justify-center text-white/20 gap-4"
              >
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                  <Calendar size={40} />
                </div>
                <div className="text-center">
                  <p className="text-lg font-medium">{t('select_quarter_to_rate') || 'Select a quarter to view or rate'}</p>
                  <p className="text-sm mt-2 max-w-xs mx-auto text-white/10">
                    {t('quarterly_rating_desc') || 'Choose a quarter from the left panel to add or edit skill ratings.'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default SkillsVisualTab;
