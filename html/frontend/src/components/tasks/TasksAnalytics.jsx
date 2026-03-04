import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function TasksAnalytics({ data, days, loading }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-white/50">
        Загрузка статистики...
      </div>
    );
  }

  if (!data) return null;

  const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444'];
  
  // Prepare data for PieChart (Status Distribution)
  const pieData = [
    { name: 'Выполнено', value: data.completed_tasks, color: '#10B981' },
    { name: 'В работе', value: data.total_tasks - data.completed_tasks, color: '#3B82F6' }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#1C1E24] p-4 rounded-xl border border-white/10">
          <div className="text-sm text-white/50 mb-1">Всего задач ({days} дн.)</div>
          <div className="text-2xl font-bold text-white">{data.total_tasks}</div>
        </div>
        <div className="bg-[#1C1E24] p-4 rounded-xl border border-white/10">
          <div className="text-sm text-white/50 mb-1">Выполнено</div>
          <div className="text-2xl font-bold text-emerald-400">{data.completed_tasks}</div>
        </div>
        <div className="bg-[#1C1E24] p-4 rounded-xl border border-white/10">
          <div className="text-sm text-white/50 mb-1">Эффективность</div>
          <div className="text-2xl font-bold text-blue-400">{data.completion_rate}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee Performance Chart */}
        <div className="bg-[#1C1E24] p-6 rounded-xl border border-white/10">
          <h3 className="text-lg font-bold text-white mb-6">Эффективность сотрудников</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.assignee_stats}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" horizontal={false} />
                <XAxis type="number" stroke="#ffffff50" />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  stroke="#ffffff80" 
                  width={100}
                  tick={{ fontSize: 12 }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#252830', borderColor: '#ffffff20', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="completed" name="Выполнено" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="total" name="Всего назначено" fill="#3B82F6" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Completion Rate Chart */}
        <div className="bg-[#1C1E24] p-6 rounded-xl border border-white/10">
          <h3 className="text-lg font-bold text-white mb-6">Статус выполнения</h3>
          <div className="h-[300px] w-full flex items-center justify-center">
             <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                   contentStyle={{ backgroundColor: '#252830', borderColor: '#ffffff20', color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-4">
            {pieData.map((entry, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-white/70">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }}></div>
                {entry.name} ({entry.value})
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
