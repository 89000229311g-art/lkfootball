import React, { useState } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Save, Star, TrendingUp, Shield, Activity, Zap, Target, Brain, Dumbbell, User } from 'lucide-react';
import { motion as Motion } from 'framer-motion';

const SkillEvaluator = ({ onSave, t = () => null, readOnly = false, initialData = null, isLoading = false }) => {
  const [skills, setSkills] = useState(() => {
    if (!initialData) {
      return {
        technique: 5,
        physical: 5,
        discipline: 5,
        tactics: 5,
        speed: 5
      };
    }

    const normalize = (val) => {
      const v = Number(val) || 5;
      return v > 10 ? v / 10 : v;
    };

    return {
      technique: normalize(initialData.technique),
      physical: normalize(initialData.physical),
      discipline: normalize(initialData.discipline),
      tactics: normalize(initialData.tactics),
      speed: normalize(initialData.speed),
      coach_comment: initialData.coach_comment || ""
    };
  });

  const [tags, setTags] = useState(() => {
    if (initialData && Array.isArray(initialData.talent_tags)) {
      return initialData.talent_tags;
    }
    return [];
  });

  const handleSliderChange = (skill, value) => {
    if (readOnly) return;
    setSkills(prev => ({
      ...prev,
      [skill]: Number(value)
    }));
  };

  const toggleTag = (tag) => {
    if (readOnly) return;
    setTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const calculateOverall = () => {
    const sum = Object.values(skills).reduce((a, b) => a + b, 0);
    return (sum / 5).toFixed(1);
  };

  const overall = calculateOverall();
  
  const getRatingColor = (val) => {
    if (val >= 8) return 'text-emerald-400';
    if (val >= 6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const data = [
    { subject: t('skill_technique') || 'Техника', A: skills.technique, fullMark: 10 },
    { subject: t('skill_tactics') || 'Тактика', A: skills.tactics, fullMark: 10 },
    { subject: t('skill_physical') || 'Физика', A: skills.physical, fullMark: 10 },
    { subject: t('skill_speed') || 'Скорость', A: skills.speed, fullMark: 10 },
    { subject: t('skill_discipline') || 'Дисциплина', A: skills.discipline, fullMark: 10 },
  ];

  const skillConfig = {
    technique: { icon: Target, color: 'text-blue-400', label: t('skill_technique') || 'Техника' },
    tactics: { icon: Brain, color: 'text-purple-400', label: t('skill_tactics') || 'Тактика' },
    physical: { icon: Dumbbell, color: 'text-red-400', label: t('skill_physical') || 'Физика' },
    speed: { icon: Zap, color: 'text-yellow-400', label: t('skill_speed') || 'Скорость' },
    discipline: { icon: Shield, color: 'text-emerald-400', label: t('skill_discipline') || 'Дисциплина' },
  };

  const availableTags = [
    { id: 'high_potential', label: 'tag_high_potential', color: 'bg-purple-500/20 text-purple-400 border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.2)]' },
    { id: 'captain', label: 'tag_captain', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.2)]' },
    { id: 'needs_work', label: 'tag_needs_work', color: 'bg-red-500/20 text-red-400 border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' },
    { id: 'consistent', label: 'tag_consistent', color: 'bg-blue-500/20 text-blue-400 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.2)]' },
  ];

  const TAG_TRANSLATIONS = {
    tag_high_potential: "Высокий потенциал",
    tag_captain: "Капитан",
    tag_needs_work: "Требует работы",
    tag_consistent: "Стабильный"
  };

  const SKILL_TRANSLATIONS = {
    technique: "Техника",
    tactics: "Тактика",
    physical: "Физика",
    speed: "Скорость",
    discipline: "Дисциплина"
  };

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [showChart, setShowChart] = useState(!isMobile);

  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setShowChart(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="bg-gradient-to-br from-[#1A1D24] to-[#13151A] rounded-3xl p-4 border border-white/10 h-full flex flex-col shadow-2xl relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-brand-yellow/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-[80px] pointer-events-none" />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 relative z-10 shrink-0 gap-4 sticky top-0 bg-[#13151A]/95 backdrop-blur-md p-2 rounded-xl border border-white/5 shadow-md">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Activity className="text-brand-yellow" size={24} />
            {t('skill_evaluator') || "Оценка навыков"}
          </h3>
          <p className="text-white/40 text-xs mt-0.5">
            {readOnly ? (t('viewing_mode') || 'Режим просмотра') : (t('editing_mode') || 'Режим редактирования')}
          </p>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex flex-col items-end">
            <span className="text-white/40 text-[10px] uppercase tracking-wider font-bold">{t('overall_rating') || 'Общий рейтинг'}</span>
            <div className={`text-3xl font-black ${getRatingColor(overall)} drop-shadow-lg leading-none`}>
              {overall}
            </div>
          </div>
          
          {!readOnly && (
            <Motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSave({ skills, tags })}
              disabled={isLoading}
              className={`flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-yellow to-yellow-500 text-black font-bold rounded-lg shadow-lg shadow-yellow-500/20 hover:shadow-yellow-500/40 transition-all text-sm whitespace-nowrap ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              ) : (
                <Save size={18} />
              )}
              <span>{isLoading ? (t('saving') || "Сохранение...") : (t('save') || "Сохранить")}</span>
            </Motion.button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 relative z-10 overflow-y-auto lg:overflow-hidden">
        {/* Radar Chart Section - Toggleable on mobile */}
        {isMobile && (
            <button 
                onClick={() => setShowChart(!showChart)}
                className="w-full py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white/60 uppercase tracking-wider flex items-center justify-center gap-2 mb-2"
            >
                {showChart ? (t('hide_chart') || 'Скрыть график') : (t('show_chart') || 'Показать график')}
                <Activity size={14} />
            </button>
        )}

        {(showChart || !isMobile) && (
            <div className="relative flex items-center justify-center min-h-[250px] lg:h-full shrink-0">
            <div className="absolute inset-0 bg-white/[0.02] rounded-full blur-3xl" />
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                <defs>
                    <linearGradient id="radarFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E6FF00" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#E6FF00" stopOpacity={0.1}/>
                    </linearGradient>
                </defs>
                <PolarGrid stroke="#ffffff20" />
                <PolarAngleAxis 
                    dataKey="subject" 
                    tick={{ fill: '#ffffff80', fontSize: 11, fontWeight: 600 }} 
                />
                <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                <Radar
                    name="Skills"
                    dataKey="A"
                    stroke="#E6FF00"
                    strokeWidth={2}
                    fill="url(#radarFill)"
                    fillOpacity={1}
                />
                <Tooltip 
                    contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid #ffffff20', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    itemStyle={{ color: '#E6FF00' }}
                />
                </RadarChart>
            </ResponsiveContainer>
            
            {/* Central Score */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
                <span className="text-white/20 font-bold text-[10px]">SKILLS</span>
                </div>
            </div>
            </div>
        )}

        {/* Sliders & Controls */}
        <div className={`flex flex-col h-full overflow-hidden ${isMobile ? 'min-h-[400px]' : ''}`}>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4 pb-20 lg:pb-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.keys(skills).map(skill => {
                if (skill === 'coach_comment') return null;
                const config = skillConfig[skill] || { icon: Star, color: 'text-white', label: skill };
                const Icon = config.icon;
                const label = t(config.label) || SKILL_TRANSLATIONS[skill] || config.label;
                
                return (
                  <div key={skill} className="bg-white/5 rounded-xl p-3 border border-white/5 hover:border-white/10 transition-all group">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg bg-black/40 ${config.color} shadow-sm`}>
                          <Icon size={14} />
                        </div>
                        <span className="text-gray-300 font-semibold text-xs tracking-wide">{label}</span>
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-lg font-black ${config.color}`}>{skills[skill]}</span>
                        <span className="text-white/20 text-[10px] font-medium">/10</span>
                      </div>
                    </div>
                    
                    <div className="relative h-2 w-full bg-black/40 rounded-full overflow-hidden ring-1 ring-white/5">
                      <Motion.div 
                        className={`absolute top-0 left-0 h-full rounded-full ${
                          skill === 'technique' ? 'bg-gradient-to-r from-blue-600 to-blue-400' :
                          skill === 'tactics' ? 'bg-gradient-to-r from-purple-600 to-purple-400' :
                          skill === 'physical' ? 'bg-gradient-to-r from-red-600 to-red-400' :
                          skill === 'speed' ? 'bg-gradient-to-r from-yellow-600 to-yellow-400' : 'bg-gradient-to-r from-emerald-600 to-emerald-400'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${(skills[skill] / 10) * 100}%` }}
                        transition={{ type: "spring", stiffness: 100, damping: 20 }}
                      />
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="0.5"
                        value={skills[skill]}
                        onChange={(e) => handleSliderChange(skill, e.target.value)}
                        disabled={readOnly}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-white/10">
              <h4 className="text-[10px] text-white/40 uppercase tracking-widest font-bold mb-3 flex items-center gap-2">
                <Star size={12} />
                {t('talent_tags') || "Теги таланта"}
              </h4>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => (
                  <Motion.button
                    key={tag.id}
                    whileHover={!readOnly ? { scale: 1.05, y: -1 } : {}}
                    whileTap={!readOnly ? { scale: 0.95 } : {}}
                    onClick={() => toggleTag(tag.id)}
                    disabled={readOnly}
                    className={`
                      px-3 py-1.5 rounded-lg text-[10px] uppercase font-bold border transition-all duration-300 flex items-center gap-1.5
                      ${tags.includes(tag.id) ? tag.color : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white hover:border-white/20'}
                      ${readOnly ? 'cursor-default' : 'cursor-pointer'}
                    `}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${tags.includes(tag.id) ? 'bg-current' : 'bg-white/20'}`} />
                    {t(tag.label) || TAG_TRANSLATIONS[tag.label] || tag.label}
                  </Motion.button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkillEvaluator;
