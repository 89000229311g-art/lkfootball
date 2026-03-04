import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { Users, TrendingUp, DollarSign, Activity } from 'lucide-react';

const COLORS = ['#3B82F6', '#EAB308', '#A855F7', '#6366F1', '#22C55E', '#10B981', '#EF4444', '#F97316', '#06B6D4'];

export default function AnalyticsDashboard({ leads, stages = [], users = [] }) {
  const [period, setPeriod] = useState('all');

  const stats = useMemo(() => {
    const now = new Date();
    let cutoff = null;
    if (period === '30') {
      cutoff = new Date(now);
      cutoff.setDate(now.getDate() - 30);
    } else if (period === '90') {
      cutoff = new Date(now);
      cutoff.setDate(now.getDate() - 90);
    } else if (period === '365') {
      cutoff = new Date(now);
      cutoff.setDate(now.getDate() - 365);
    }

    const leadsForStats = cutoff
      ? leads.filter((l) => {
          const date = l.updated_at ? new Date(l.updated_at) : l.created_at ? new Date(l.created_at) : null;
          if (!date) return false;
          return date >= cutoff;
        })
      : leads;

    const total = leadsForStats.length;
    // Assuming 'success' and 'reject' are the final states. 
    // If we have dynamic stages, we might need a way to identify "won/lost" stages.
    // For now, we stick to the convention that 'success' and 'reject' keys are special if they exist,
    // otherwise we just count everything else as active.
    
    const successStage = stages.find(s => s.key === 'success');
    const rejectStage = stages.find(s => s.key === 'reject');
    
    const success = leadsForStats.filter(l => l.status === 'success').length;
    const reject = leadsForStats.filter(l => l.status === 'reject').length;
    
    // Active is everything that is NOT success or reject
    const active = total - success - reject;
    
    const conversion = total > 0 ? Math.round((success / total) * 100) : 0;
    
    // Group by status for chart - Dynamic based on stages
    let statusData = [];
    if (stages.length > 0) {
            statusData = stages.map(stage => ({
            name: stage.title,
            value: leadsForStats.filter(l => l.status === stage.key).length
        }));
    } else {
        // Fallback
        statusData = [
            { name: 'Новые', value: leadsForStats.filter(l => l.status === 'new').length },
            { name: 'В работе', value: active },
            { name: 'Успех', value: success },
            { name: 'Отказ', value: reject },
        ];
    }

    // Group by source
    const sourceGroups = leadsForStats.reduce((acc, lead) => {
      const src = lead.source || 'Не указан';
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {});
    
    const sourceData = Object.keys(sourceGroups).map(key => ({
      name: key,
      value: sourceGroups[key]
    }));

    const rejectionLabels = {
      expensive: 'Дорого',
      schedule: 'Расписание не подходит',
      other_academy: 'Выбрали другую академию',
      relocation: 'Переезд',
      other: 'Другое',
    };

    const rejectionGroups = leadsForStats
      .filter((lead) => lead.status === 'reject' && lead.rejection_reason)
      .reduce((acc, lead) => {
        const reason = lead.rejection_reason;
        acc[reason] = (acc[reason] || 0) + 1;
        return acc;
      }, {});

    const reasonsData = Object.keys(rejectionGroups).map((key) => ({
      name: rejectionLabels[key] || key,
      value: rejectionGroups[key],
    }));

    const userMap = new Map();
    users.forEach((u) => {
      userMap.set(u.id, u);
    });

    const managerStatsMap = new Map();
    const slaByManager = new Map();

    leadsForStats.forEach((lead) => {
      if (!lead.responsible_id) return;
      const user = userMap.get(lead.responsible_id);
      if (!user) return;
      const key = lead.responsible_id;

      if (!managerStatsMap.has(key)) {
        managerStatsMap.set(key, {
          user,
          total: 0,
          success: 0,
        });
      }
      const statsEntry = managerStatsMap.get(key);
      statsEntry.total += 1;
      if (lead.status === 'success') {
        statsEntry.success += 1;
      }

      const createdAt = lead.created_at ? new Date(lead.created_at) : null;
      const firstCallAt = lead.first_call_at ? new Date(lead.first_call_at) : null;
      const firstTrialAt = lead.first_trial_at ? new Date(lead.first_trial_at) : null;

      if (!createdAt) {
        return;
      }

      if (!slaByManager.has(key)) {
        slaByManager.set(key, {
          firstCallTotalMs: 0,
          firstCallCount: 0,
          trialFromCallTotalMs: 0,
          trialFromCallCount: 0,
        });
      }

      const slaEntry = slaByManager.get(key);

      if (firstCallAt) {
        const diffMs = firstCallAt.getTime() - createdAt.getTime();
        if (diffMs >= 0) {
          slaEntry.firstCallTotalMs += diffMs;
          slaEntry.firstCallCount += 1;
        }
      }

      if (firstCallAt && firstTrialAt) {
        const diffMs = firstTrialAt.getTime() - firstCallAt.getTime();
        if (diffMs >= 0) {
          slaEntry.trialFromCallTotalMs += diffMs;
          slaEntry.trialFromCallCount += 1;
        }
      }
    });

    const managerStats = Array.from(managerStatsMap.values()).map((entry) => {
      const slaEntry = slaByManager.get(entry.user.id);
      const avgFirstCallHours =
        slaEntry && slaEntry.firstCallCount > 0
          ? Math.round((slaEntry.firstCallTotalMs / slaEntry.firstCallCount / 36e5) * 10) / 10
          : null;
      const avgTrialFromCallHours =
        slaEntry && slaEntry.trialFromCallCount > 0
          ? Math.round((slaEntry.trialFromCallTotalMs / slaEntry.trialFromCallCount / 36e5) * 10) / 10
          : null;

      return {
        id: entry.user.id,
        name: entry.user.full_name,
        role: entry.user.role,
        total: entry.total,
        success: entry.success,
        conversion: entry.total > 0 ? Math.round((entry.success / entry.total) * 100) : 0,
        avgFirstCallHours,
        avgTrialFromCallHours,
      };
    });

    const managers = managerStats.filter((m) =>
      ['super_admin', 'owner', 'admin', 'accountant'].includes((m.role || '').toLowerCase())
    );
    const coaches = managerStats.filter((m) =>
      ['coach'].includes((m.role || '').toLowerCase())
    );

    const slowLeads = leadsForStats
      .filter((lead) => {
        if (!lead.created_at) return false;
        if (lead.first_call_at) return false;
        const createdAt = new Date(lead.created_at);
        const diffHours = (now.getTime() - createdAt.getTime()) / 36e5;
        return diffHours >= 24;
      })
      .map((lead) => {
        const createdAt = new Date(lead.created_at);
        const diffHours = (now.getTime() - createdAt.getTime()) / 36e5;
        const responsible = lead.responsible_id ? userMap.get(lead.responsible_id) : null;
        return {
          id: lead.id,
          name: lead.name || 'Без имени',
          phone: lead.phone,
          created_at: lead.created_at,
          responsibleName: responsible ? responsible.full_name : 'Не назначен',
          hoursWithoutCall: Math.floor(diffHours),
        };
      });

    return { total, active, success, conversion, statusData, sourceData, managers, coaches, reasonsData, slowLeads };
  }, [leads, stages, users, period]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <div className="text-sm text-gray-400">Всего лидов</div>
            <div className="text-2xl font-bold text-white">{stats.total}</div>
          </div>
        </div>
        
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center">
            <Activity size={24} />
          </div>
          <div>
            <div className="text-sm text-gray-400">Активные</div>
            <div className="text-2xl font-bold text-white">{stats.active}</div>
          </div>
        </div>

        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center">
            <DollarSign size={24} />
          </div>
          <div>
            <div className="text-sm text-gray-400">Сделки</div>
            <div className="text-2xl font-bold text-white">{stats.success}</div>
          </div>
        </div>

        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
          <div>
            <div className="text-sm text-gray-400">Конверсия</div>
            <div className="text-2xl font-bold text-white">{stats.conversion}%</div>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-2">
        <div className="inline-flex rounded-xl border border-white/10 bg-white/5 overflow-hidden text-xs">
          <button
            onClick={() => setPeriod('all')}
            className={`px-3 py-1.5 ${
              period === 'all' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            Все время
          </button>
          <button
            onClick={() => setPeriod('365')}
            className={`px-3 py-1.5 border-l border-white/10 ${
              period === '365' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            12 мес
          </button>
          <button
            onClick={() => setPeriod('90')}
            className={`px-3 py-1.5 border-l border-white/10 ${
              period === '90' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            90 дней
          </button>
          <button
            onClick={() => setPeriod('30')}
            className={`px-3 py-1.5 border-l border-white/10 ${
              period === '30' ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            30 дней
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel Chart */}
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-6">Воронка по этапам</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.statusData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                <XAxis type="number" stroke="#666" />
                <YAxis dataKey="name" type="category" stroke="#999" width={100} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1C1E24', borderColor: '#333', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={30}>
                  {stats.statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sources Chart */}
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-6">Источники лидов</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.sourceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1C1E24', borderColor: '#333', color: '#fff' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Manager / Coach performance */}
      {(stats.managers.length > 0 || stats.coaches.length > 0 || stats.reasonsData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {stats.managers.length > 0 && (
            <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">Конверсия по менеджерам</h3>
              <div className="space-y-2">
                {stats.managers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-sm bg-white/5 rounded-xl px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-white">{m.name}</span>
                      <span className="text-[11px] text-gray-500 uppercase">
                        {m.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="text-xs text-gray-400 space-y-0.5">
                        <div>
                          Лидов: <span className="text-gray-200">{m.total}</span>
                        </div>
                        <div>
                          Сделок: <span className="text-gray-200">{m.success}</span>
                        </div>
                        {typeof m.avgFirstCallHours === 'number' && (
                          <div>
                            До первого звонка:{' '}
                            <span className="text-gray-200">{m.avgFirstCallHours} ч</span>
                          </div>
                        )}
                        {typeof m.avgTrialFromCallHours === 'number' && (
                          <div>
                            Звонок → пробная:{' '}
                            <span className="text-gray-200">{m.avgTrialFromCallHours} ч</span>
                          </div>
                        )}
                      </div>
                      <div className="text-lg font-bold text-emerald-400">
                        {m.conversion}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.coaches.length > 0 && (
            <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">Конверсия по тренерам</h3>
              <div className="space-y-2">
                {stats.coaches.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between text-sm bg-white/5 rounded-xl px-3 py-2"
                  >
                    <div className="flex flex-col">
                      <span className="text-white">{m.name}</span>
                      <span className="text-[11px] text-gray-500 uppercase">
                        {m.role}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div className="text-xs text-gray-400">
                        <div>Лидов: <span className="text-gray-200">{m.total}</span></div>
                        <div>Сделок: <span className="text-gray-200">{m.success}</span></div>
                      </div>
                      <div className="text-lg font-bold text-emerald-400">
                        {m.conversion}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.reasonsData.length > 0 && (
            <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4">Причины отказа</h3>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.reasonsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      fill="#EF4444"
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {stats.reasonsData.map((entry, index) => (
                        <Cell key={`cell-reason-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1C1E24', borderColor: '#333', color: '#fff' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {stats.slowLeads.length > 0 && (
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">
            Лиды без первого звонка более 24 часов
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            Включает лиды, по которым еще не зафиксирован первый звонок.
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
            {stats.slowLeads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between text-sm bg-white/5 rounded-xl px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-white">{lead.name}</span>
                  <span className="text-[11px] text-gray-500">
                    Телефон: {lead.phone || '—'}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    Создан: {new Date(lead.created_at).toLocaleString([], { hour12: false })}
                  </span>
                </div>
                <div className="text-right text-xs text-gray-400">
                  <div className="text-gray-300 mb-1">
                    {lead.responsibleName}
                  </div>
                  <div>
                    Без звонка: <span className="text-red-400 font-semibold">{lead.hoursWithoutCall} ч</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
