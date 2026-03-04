import React from 'react';
import { 
  Trophy, Medal, Star, Activity, User, TrendingUp, Zap
} from 'lucide-react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

export default function TopPlayersAnalytics({ data, isLoading }) {
  if (isLoading) {
    return <div className="p-12 text-center text-white/50">Загрузка...</div>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-white/30 border border-white/10 rounded-2xl bg-white/5">
        <Trophy className="w-16 h-16 mb-4 opacity-20" />
        <p>Нет данных за выбранный период</p>
        <p className="text-sm mt-2 opacity-50">Попробуйте выбрать другой месяц или добавить оценки игрокам</p>
      </div>
    );
  }

  const topThree = data.slice(0, 3);
  const rest = data.slice(3);

  const getRadarData = (player) => {
    return {
      labels: ['Техника', 'Тактика', 'Физика', 'Скорость', 'Дисциплина'],
      datasets: [
        {
          label: 'Навыки',
          data: [
            player.details.technique || 0,
            player.details.tactics || 0,
            player.details.physical || 0,
            player.details.speed || 0,
            player.metrics.discipline_rating || 0
          ],
          backgroundColor: 'rgba(234, 179, 8, 0.2)',
          borderColor: 'rgba(234, 179, 8, 1)',
          borderWidth: 2,
        },
      ],
    };
  };

  const radarOptions = {
    scales: {
      r: {
        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        pointLabels: { color: 'rgba(255, 255, 255, 0.7)', font: { size: 10 } },
        ticks: { display: false, max: 10, min: 0, stepSize: 2 },
        suggestedMin: 0,
        suggestedMax: 10,
      },
    },
    plugins: {
      legend: { display: false },
    },
    maintainAspectRatio: false,
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-yellow-500/20 rounded-xl">
           <Star className="w-6 h-6 text-yellow-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Топ Игроков</h2>
          <p className="text-white/50 text-sm">Рейтинг на основе навыков, посещаемости и дисциплины</p>
        </div>
      </div>

      {/* Podium (Top 3) */}
      <div className="grid grid-cols-3 gap-2 md:gap-6 items-end">
        {/* 2nd Place */}
        {topThree[1] && (
          <div className="order-1 bg-gradient-to-b from-[#1C1E24] to-[#14151a] border border-white/10 rounded-2xl p-2 md:p-6 flex flex-col items-center gap-1 md:gap-0 relative overflow-hidden transform hover:scale-[1.02] transition-all w-full">
             <div className="absolute top-0 left-0 h-1 w-full bg-gray-400/50" />
             <div className="relative shrink-0 mt-2">
               {topThree[1].avatar_url ? (
                 <img src={topThree[1].avatar_url} className="w-12 h-12 md:w-20 md:h-20 rounded-full border-2 md:border-4 border-gray-400 object-cover" />
               ) : (
                 <div className="w-12 h-12 md:w-20 md:h-20 rounded-full border-2 md:border-4 border-gray-400 bg-gray-800 flex items-center justify-center">
                    <User className="w-6 h-6 md:w-10 md:h-10 text-gray-400" />
                 </div>
               )}
               <div className="absolute -bottom-2 -right-2 bg-gray-800 rounded-full p-1 border border-gray-600">
                  <Medal className="w-3 h-3 md:w-6 md:h-6 text-gray-300" />
               </div>
             </div>
             <div className="flex-1 text-center min-w-0 w-full mt-2">
               <div className="text-xs md:text-xl font-bold text-white truncate px-1">{topThree[1].name}</div>
               <div className="text-[10px] md:text-sm text-gray-400 mb-1 md:mb-2 truncate px-1">{topThree[1].group_name}</div>
               <div className="flex flex-col md:flex-row items-center justify-center gap-0 md:gap-2">
                 <span className="text-sm md:text-2xl font-bold text-gray-300">{topThree[1].total_score}</span>
                 <span className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider hidden md:inline">Очков</span>
               </div>
             </div>
          </div>
        )}

        {/* 1st Place */}
        {topThree[0] && (
          <div className="order-2 bg-gradient-to-b from-[#2A2D35] to-[#1C1E24] border border-yellow-500/30 rounded-2xl p-2 md:p-8 flex flex-col items-center relative overflow-hidden md:transform md:scale-105 shadow-2xl shadow-yellow-500/10 z-10 w-full">
             <div className="absolute top-0 w-full h-1 bg-yellow-500" />
             <div className="absolute top-0 right-0 p-4 opacity-10 hidden md:block">
                <Trophy className="w-24 h-24 text-yellow-500" />
             </div>
             <div className="mb-2 md:mb-6 relative mt-2">
               {topThree[0].avatar_url ? (
                 <img src={topThree[0].avatar_url} className="w-16 h-16 md:w-28 md:h-28 rounded-full border-2 md:border-4 border-yellow-500 object-cover shadow-lg shadow-yellow-500/20" />
               ) : (
                 <div className="w-16 h-16 md:w-28 md:h-28 rounded-full border-2 md:border-4 border-yellow-500 bg-gray-800 flex items-center justify-center">
                    <User className="w-8 h-8 md:w-12 md:h-12 text-yellow-500" />
                 </div>
               )}
               <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 bg-yellow-500 text-black font-bold px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-sm border-2 border-[#1C1E24] whitespace-nowrap">
                  TOP 1
               </div>
             </div>
             <div className="text-sm md:text-2xl font-bold text-white text-center mt-2 truncate w-full px-1">{topThree[0].name}</div>
             <div className="text-[10px] md:text-sm text-yellow-500/80 mb-2 md:mb-4 truncate w-full text-center px-1">{topThree[0].group_name}</div>
             
             <div className="hidden md:grid grid-cols-3 gap-2 md:gap-4 w-full mb-4">
                <div className="text-center bg-white/5 rounded-lg p-2">
                   <div className="text-[10px] md:text-xs text-gray-400">Навыки</div>
                   <div className="font-bold text-sm md:text-base text-yellow-400">{topThree[0].metrics.skill_rating}</div>
                </div>
                <div className="text-center bg-white/5 rounded-lg p-2">
                   <div className="text-[10px] md:text-xs text-gray-400">Посещ.</div>
                   <div className="font-bold text-sm md:text-base text-blue-400">{topThree[0].metrics.attendance_pct}%</div>
                </div>
                <div className="text-center bg-white/5 rounded-lg p-2">
                   <div className="text-[10px] md:text-xs text-gray-400">Дисц.</div>
                   <div className="font-bold text-sm md:text-base text-green-400">{topThree[0].metrics.discipline_rating}</div>
                </div>
             </div>

             <div className="text-xl md:text-4xl font-bold text-yellow-400">{topThree[0].total_score}</div>
             <div className="text-[10px] md:text-xs text-yellow-500/50 uppercase tracking-wider hidden md:block">Общий рейтинг</div>
          </div>
        )}

        {/* 3rd Place */}
        {topThree[2] && (
          <div className="order-3 bg-gradient-to-b from-[#1C1E24] to-[#14151a] border border-white/10 rounded-2xl p-2 md:p-6 flex flex-col items-center gap-1 md:gap-0 relative overflow-hidden transform hover:scale-[1.02] transition-all w-full">
             <div className="absolute top-0 left-0 h-1 w-full bg-orange-500/50" />
             <div className="relative shrink-0 mt-2">
               {topThree[2].avatar_url ? (
                 <img src={topThree[2].avatar_url} className="w-12 h-12 md:w-20 md:h-20 rounded-full border-2 md:border-4 border-orange-500/50 object-cover" />
               ) : (
                 <div className="w-12 h-12 md:w-20 md:h-20 rounded-full border-2 md:border-4 border-orange-500/50 bg-gray-800 flex items-center justify-center">
                    <User className="w-6 h-6 md:w-10 md:h-10 text-orange-400" />
                 </div>
               )}
               <div className="absolute -bottom-2 -right-2 bg-gray-800 rounded-full p-1 border border-gray-600">
                  <Medal className="w-3 h-3 md:w-6 md:h-6 text-orange-400" />
               </div>
             </div>
             <div className="flex-1 text-center min-w-0 w-full mt-2">
               <div className="text-xs md:text-xl font-bold text-white truncate px-1">{topThree[2].name}</div>
               <div className="text-[10px] md:text-sm text-gray-400 mb-1 md:mb-2 truncate px-1">{topThree[2].group_name}</div>
               <div className="flex flex-col md:flex-row items-center justify-center gap-0 md:gap-2">
                 <span className="text-sm md:text-2xl font-bold text-orange-400">{topThree[2].total_score}</span>
                 <span className="text-[10px] md:text-xs text-gray-500 uppercase tracking-wider hidden md:inline">Очков</span>
               </div>
             </div>
          </div>
        )}
      </div>

      {/* Rest of the List */}
      {rest.length > 0 && (
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl overflow-hidden">
           <div className="p-4 bg-white/5 border-b border-white/10 font-bold text-white flex justify-between items-center">
              <span>Остальные лидеры</span>
              <span className="text-xs text-white/40 font-normal">Прокрутите, чтобы увидеть всех</span>
           </div>
           <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
              {rest.map((player, idx) => (
                <div key={player.id} className="relative p-3 md:p-4 hover:bg-white/5 transition-colors group">
                   <div className="flex items-center gap-3 md:gap-4">
                     <div className="w-6 md:w-8 font-bold text-white/30 group-hover:text-white transition-colors text-sm md:text-base">#{idx + 4}</div>
                     
                     <div className="relative shrink-0">
                        {player.avatar_url ? (
                          <img src={player.avatar_url} className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 flex items-center justify-center">
                             <User className="w-4 h-4 md:w-5 md:h-5 text-white/50" />
                          </div>
                        )}
                     </div>

                     <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm md:text-base truncate">{player.name}</div>
                        <div className="text-xs text-white/40 truncate">{player.group_name}</div>
                     </div>

                     {/* Desktop Metrics */}
                     <div className="hidden md:flex gap-6 text-sm text-right shrink-0">
                        <div>
                          <div className="text-white/30 text-xs">Навыки</div>
                          <div className="text-white">{player.metrics.skill_rating}</div>
                        </div>
                        <div>
                          <div className="text-white/30 text-xs">Посещ.</div>
                          <div className="text-blue-400">{player.metrics.attendance_pct}%</div>
                        </div>
                        <div>
                          <div className="text-white/30 text-xs">Дисц.</div>
                          <div className="text-green-400">{player.metrics.discipline_rating}</div>
                        </div>
                     </div>

                     <div className="text-lg md:text-xl font-bold text-yellow-500 min-w-[3rem] text-right">
                        {player.total_score}
                     </div>
                   </div>

                   {/* Mobile Metrics Row */}
                   <div className="grid grid-cols-3 gap-2 mt-3 md:hidden text-xs bg-white/5 rounded-lg p-2">
                      <div className="text-center">
                         <div className="text-white/30 mb-0.5">Навыки</div>
                         <div className="text-white font-medium">{player.metrics.skill_rating}</div>
                      </div>
                      <div className="text-center border-l border-white/10">
                         <div className="text-white/30 mb-0.5">Посещ.</div>
                         <div className="text-blue-400 font-medium">{player.metrics.attendance_pct}%</div>
                      </div>
                      <div className="text-center border-l border-white/10">
                         <div className="text-white/30 mb-0.5">Дисц.</div>
                         <div className="text-green-400 font-medium">{player.metrics.discipline_rating}</div>
                      </div>
                   </div>
                   
                   {/* Radar Chart Tooltip on Hover (Desktop Only) */}
                   <div className="hidden md:group-hover:block absolute right-20 top-1/2 -translate-y-1/2 bg-[#0F1117] p-2 rounded-xl border border-white/20 z-50 w-48 h-48 pointer-events-none shadow-2xl">
                      <Radar data={getRadarData(player)} options={radarOptions} />
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
}
