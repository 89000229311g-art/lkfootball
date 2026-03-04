import React from 'react';
import { Activity, AlertTriangle, CheckCircle, Server, Cpu, Database } from 'lucide-react';

export default function SystemHealthMonitor({ health }) {
  if (!health) return null;

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getScoreBg = (score) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'healthy': return 'Отлично';
      case 'warning': return 'Внимание';
      case 'critical': return 'Критично';
      default: return status;
    }
  };

  const getRecommendations = () => {
    const recs = [];
    
    if (health.db_latency_ms === -1) {
      recs.push({ title: "Ошибка Базы Данных", action: "Проверьте соединение с PostgreSQL. Возможно, сервис остановлен или перегружен." });
    } else if (health.db_latency_ms > 500) {
      recs.push({ title: "Медленная БД", action: "Проверьте индексы и медленные запросы. База данных отвечает слишком долго." });
    }

    if (health.cpu_percent > 80) {
      recs.push({ title: "Высокая нагрузка CPU", action: "Сервер перегружен вычислениями. Проверьте фоновые задачи или бесконечные циклы." });
    }

    if (health.ram_percent > 85) {
      recs.push({ title: "Нехватка памяти", action: "Потребление RAM критическое. Возможна утечка памяти или нехватка ресурсов." });
    }

    if (typeof health.process_rss_mb === 'number' && health.process_rss_mb > 1024) {
      recs.push({ title: "Процесс занимает >1 ГБ", action: "Запустите очистку памяти (GC) и проверьте тяжелые операции/экспорты." });
    }

    if (health.score < 50 && recs.length === 0) {
      recs.push({ title: "Общая нестабильность", action: "Система работает нестабильно. Проверьте логи сервера для деталей." });
    }

    return recs;
  };

  const recommendations = getRecommendations();

  return (
    <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-6 relative overflow-hidden">
      {/* Background Glow */}
      <div className={`absolute top-0 right-0 w-64 h-64 ${getScoreBg(health.score)} opacity-5 blur-[100px] rounded-full pointer-events-none`}></div>

      <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
        
        {/* Main Gauge */}
        <div className="flex-shrink-0 flex flex-col items-center justify-center w-full md:w-auto">
          <div className="relative w-40 h-40 flex items-center justify-center">
            {/* SVG Circle Gauge */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="80"
                cy="80"
                r="70"
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                className="text-white/10"
              />
              <circle
                cx="80"
                cy="80"
                r="70"
                stroke="currentColor"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={440}
                strokeDashoffset={440 - (440 * health.score) / 100}
                className={`${getScoreColor(health.score)} transition-all duration-1000 ease-out`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className={`text-4xl font-bold ${getScoreColor(health.score)}`}>{health.score}%</span>
              <span className="text-xs text-white/50 uppercase tracking-wider">Состояние</span>
            </div>
          </div>
          <div className={`mt-4 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wide border ${
            health.status === 'healthy' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
            health.status === 'warning' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 
            'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {getStatusLabel(health.status)}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="flex-1 w-full grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {/* CPU */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-white/70">
                  <Cpu className="w-4 h-4" />
                  <span className="text-sm font-medium">Процессор</span>
                </div>
                <span className={`text-xs font-mono ${health.cpu_percent > 80 ? 'text-red-400' : 'text-white/40'}`}>
                  {health.cpu_percent}%
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${health.cpu_percent > 80 ? 'bg-red-500' : 'bg-blue-500'}`} 
                  style={{ width: `${Math.min(100, Math.max(5, health.cpu_percent))}%` }}
                ></div>
              </div>
            </div>

            {/* RAM */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-white/70">
                  <Activity className="w-4 h-4" />
                  <span className="text-sm font-medium">Память</span>
                </div>
                <span className={`text-xs font-mono ${health.ram_percent > 85 ? 'text-red-400' : 'text-white/40'}`}>
                  {health.ram_percent}%
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${health.ram_percent > 85 ? 'bg-red-500' : 'bg-purple-500'}`} 
                  style={{ width: `${Math.min(100, Math.max(5, health.ram_percent))}%` }}
                ></div>
              </div>
            </div>

            {/* Process Memory */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-white/70">
                  <Server className="w-4 h-4" />
                  <span className="text-sm font-medium">Память процесса</span>
                </div>
                <span className={`text-xs font-mono ${health.process_rss_mb > 1024 ? 'text-red-400' : 'text-white/40'}`}>
                  {typeof health.process_rss_mb === 'number' ? `${health.process_rss_mb} MB` : 'N/A'}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${health.process_rss_mb > 1024 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${typeof health.process_rss_mb === 'number' ? Math.min(100, Math.max(5, (health.process_rss_mb / 2048) * 100)) : 5}%` }}
                ></div>
              </div>
            </div>

            {/* Latency */}
            <div className="bg-white/5 rounded-xl p-4 border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-white/70">
                  <Database className="w-4 h-4" />
                  <span className="text-sm font-medium">Задержка БД</span>
                </div>
                <span className={`text-xs font-mono ${health.db_latency_ms === -1 || health.db_latency_ms > 200 ? 'text-red-400' : 'text-white/40'}`}>
                  {health.db_latency_ms === -1 ? 'Ошибка' : `${health.db_latency_ms}ms`}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${health.db_latency_ms === -1 || health.db_latency_ms > 200 ? 'bg-red-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${health.db_latency_ms === -1 ? 100 : Math.min(100, Math.max(5, (health.db_latency_ms / 500) * 100))}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Warnings & Recommendations */}
          <div className="space-y-4 mt-2">
            {/* Warnings from Backend */}
            {health.warnings && health.warnings.length > 0 && (
              <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                <h4 className="text-xs font-bold text-red-400 uppercase mb-3 flex items-center gap-2 tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  Обнаруженные проблемы
                </h4>
                <div className="space-y-2">
                  {health.warnings.map((warning, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-sm text-white/80">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations (Client-side calculated) */}
            {recommendations.length > 0 && (
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
                <h4 className="text-xs font-bold text-blue-400 uppercase mb-3 flex items-center gap-2 tracking-wider">
                  <CheckCircle className="w-4 h-4" />
                  Рекомендации по исправлению
                </h4>
                <div className="space-y-3">
                  {recommendations.map((rec, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className="p-1.5 bg-blue-500/20 rounded-md text-blue-400 mt-0.5">
                         <Server className="w-3 h-3" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white/90">{rec.title}</div>
                        <div className="text-xs text-white/60 mt-0.5">{rec.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
