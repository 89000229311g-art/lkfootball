import { useState, useEffect, useMemo } from 'react';
import { analyticsAPI } from '../../api/client';
import { Loader2, Trophy, Users, UserCheck, Activity, Star, Medal } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export default function CoachAnalytics({ startDate, endDate }) {
  const { t } = useLanguage();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await analyticsAPI.getCoachPerformance(startDate, endDate);
        setData(res.data);
      } catch (error) {
        console.error("Failed to fetch coach analytics", error);
        setError(t('load_error') || "Не удалось загрузить данные. Пожалуйста, попробуйте позже.");
      } finally {
        setLoading(false);
      }
    };

    if (startDate) {
      fetchData();
    }
  }, [startDate, endDate]);

  const rankedData = useMemo(() => {
    if (!data.length) return [];
    
    // Calculate Score: 
    // Win Rate (30%) + Attendance (30%) + Retention (20%) + Development (20%)
    return data.map(coach => {
      const score = (
        (coach.win_rate * 0.3) + 
        (coach.attendance_rate * 0.3) + 
        (coach.retention_rate * 0.2) + 
        (coach.avg_skill_score_pct * 0.2)
      );
      return { ...coach, score: Math.round(score * 10) / 10 };
    }).sort((a, b) => b.score - a.score);
  }, [data]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-400 py-12 bg-red-500/10 rounded-xl border border-red-500/20">
        {error}
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="text-center text-white/50 py-12">
        {t('no_coach_data') || 'Нет данных по тренерам за этот период'}
      </div>
    );
  }

  const top3 = rankedData.slice(0, 3);
  const rest = rankedData.slice(3);

  return (
    <div className="space-y-8">
      {/* Podium Section */}
      <div className="grid grid-cols-3 gap-2 md:gap-6 items-end min-h-[200px] md:min-h-[300px] py-4 md:py-8">
        {/* Silver - 2nd Place */}
        {top3[1] && (
          <div className="order-1 flex flex-col items-center animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="relative mb-2 md:mb-4">
              <div className="w-12 h-12 md:w-24 md:h-24 rounded-full border-2 md:border-4 border-gray-300 overflow-hidden shadow-lg shadow-gray-500/20">
                {top3[1].avatar_url ? (
                  <img src={top3[1].avatar_url} alt={top3[1].name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center text-lg md:text-2xl font-bold text-gray-300">
                    {top3[1].name[0]}
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 md:-bottom-3 left-1/2 -translate-x-1/2 bg-gray-300 text-gray-900 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-sm font-bold shadow-lg flex items-center gap-1">
                <Medal size={10} className="md:w-[14px] md:h-[14px]" /> 2
              </div>
            </div>
            <div className="text-center w-full px-1">
              <div className="font-bold text-white text-xs md:text-lg truncate">{top3[1].name}</div>
              <div className="text-gray-400 text-[10px] md:text-sm font-bold">{top3[1].score} pts</div>
            </div>
            <div className="w-full md:w-32 h-16 md:h-32 bg-gradient-to-t from-gray-700/50 to-gray-600/50 rounded-t-lg mt-2 md:mt-4 border-t border-gray-500/30"></div>
          </div>
        )}

        {/* Gold - 1st Place */}
        {top3[0] && (
          <div className="order-2 flex flex-col items-center animate-slide-up z-10 mb-0">
            <div className="relative mb-3 md:mb-6">
              <div className="w-16 h-16 md:w-32 md:h-32 rounded-full border-2 md:border-4 border-yellow-400 overflow-hidden shadow-xl shadow-yellow-500/30 ring-2 md:ring-4 ring-yellow-500/20">
                {top3[0].avatar_url ? (
                  <img src={top3[0].avatar_url} alt={top3[0].name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-yellow-900/50 flex items-center justify-center text-2xl md:text-4xl font-bold text-yellow-400">
                    {top3[0].name[0]}
                  </div>
                )}
              </div>
              <div className="absolute -top-4 md:-top-6 left-1/2 -translate-x-1/2 text-2xl md:text-4xl animate-bounce">🏆</div>
              <div className="absolute -bottom-3 md:-bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-yellow-400 to-amber-500 text-black px-3 py-1 md:px-4 md:py-1.5 rounded-full text-xs md:text-base font-bold shadow-lg flex items-center gap-1 min-w-[40px] md:min-w-[60px] justify-center">
                <Medal size={12} className="md:w-[16px] md:h-[16px]" /> 1
              </div>
            </div>
            <div className="text-center mb-1 md:mb-2 w-full px-1">
              <div className="font-bold text-white text-sm md:text-2xl truncate">{top3[0].name}</div>
              <div className="text-yellow-400 text-xs md:text-lg font-bold">{top3[0].score} pts</div>
            </div>
            <div className="flex w-full md:w-40 h-24 md:h-48 bg-gradient-to-t from-yellow-500/20 to-amber-500/20 rounded-t-lg mt-1 md:mt-2 border-t border-yellow-500/30 items-end justify-center pb-2 md:pb-4">
               <div className="text-yellow-500/20 text-3xl md:text-6xl font-black">1</div>
            </div>
          </div>
        )}

        {/* Bronze - 3rd Place */}
        {top3[2] && (
          <div className="order-3 flex flex-col items-center animate-slide-up" style={{ animationDelay: '0.4s' }}>
            <div className="relative mb-2 md:mb-4">
              <div className="w-12 h-12 md:w-24 md:h-24 rounded-full border-2 md:border-4 border-amber-700 overflow-hidden shadow-lg shadow-amber-900/40">
                {top3[2].avatar_url ? (
                  <img src={top3[2].avatar_url} alt={top3[2].name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-amber-900/30 flex items-center justify-center text-lg md:text-2xl font-bold text-amber-700">
                    {top3[2].name[0]}
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 md:-bottom-3 left-1/2 -translate-x-1/2 bg-amber-700 text-amber-100 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-sm font-bold shadow-lg flex items-center gap-1">
                <Medal size={10} className="md:w-[14px] md:h-[14px]" /> 3
              </div>
            </div>
            <div className="text-center w-full px-1">
              <div className="font-bold text-white text-xs md:text-lg truncate">{top3[2].name}</div>
              <div className="text-amber-600 text-[10px] md:text-sm font-bold">{top3[2].score} pts</div>
            </div>
            <div className="w-full md:w-32 h-12 md:h-24 bg-gradient-to-t from-amber-900/30 to-amber-800/30 rounded-t-lg mt-2 md:mt-4 border-t border-amber-700/30"></div>
          </div>
        )}
      </div>

      {/* Grid List */}
      <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
        {rankedData.map((coach, index) => (
          <div key={coach.id} className={`bg-[#1C1E24] border rounded-xl p-6 transition-all relative overflow-hidden ${
            index < 3 ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-white/10 hover:border-white/20'
          }`}>
            {/* Rank Badge */}
            <div className={`absolute top-0 right-0 px-4 py-2 rounded-bl-xl font-bold text-lg ${
               index === 0 ? 'bg-yellow-500 text-black' :
               index === 1 ? 'bg-gray-300 text-black' :
               index === 2 ? 'bg-amber-700 text-white' :
               'bg-white/10 text-white/50'
            }`}>
              #{index + 1}
            </div>

            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center overflow-hidden border-2 border-white/10">
                {coach.avatar_url ? (
                   <img src={coach.avatar_url} alt={coach.name} className="w-full h-full object-cover" />
                ) : (
                   <span className="text-2xl font-bold text-yellow-500">{coach.name ? coach.name[0] : '?'}</span>
                )}
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  {coach.name}
                  {index < 3 && <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                   <div className="px-2 py-0.5 rounded bg-white/10 text-xs text-white/70 font-mono">
                     SCORE: {coach.score}
                   </div>
                   <div className="text-sm text-white/50">{t('coach') || 'Тренер'}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Win Rate */}
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-white/70">{t('win_rate') || 'Победы'}</span>
                </div>
                <div className="text-2xl font-bold text-white">{coach.win_rate}%</div>
                <div className="text-xs text-white/40 mt-1">
                  {coach.wins} {t('wins_of') || 'из'} {coach.total_games} {t('games') || 'игр'}
                </div>
              </div>

              {/* Attendance */}
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <UserCheck className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-white/70">{t('attendance') || 'Посещаемость'}</span>
                </div>
                <div className="text-2xl font-bold text-white">{coach.attendance_rate}%</div>
                <div className="text-xs text-white/40 mt-1">
                  {t('in_sessions') || 'на тренировках'}
                </div>
              </div>

              {/* Retention */}
              <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-blue-500" />
                  <span className="text-sm text-white/70">{t('retention') || 'Активные'}</span>
                </div>
                <div className="text-2xl font-bold text-white">{coach.retention_rate}%</div>
                <div className="text-xs text-white/40 mt-1">
                  {coach.active_students} / {coach.total_students} {t('students') || 'учеников'}
                </div>
              </div>

               {/* Skills & Discipline */}
               <div className="bg-white/5 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-purple-500" />
                  <span className="text-sm text-white/70">{t('development') || 'Развитие'}</span>
                </div>
                 <div className="flex justify-between items-end">
                    <div>
                        <div className="text-xl font-bold text-white">{coach.avg_skill_score_pct}%</div>
                        <div className="text-xs text-white/40">{t('skills') || 'Навыки'}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-xl font-bold text-white">{coach.avg_discipline}</div>
                        <div className="text-xs text-white/40">{t('discipline') || 'Дисциплина'}</div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
