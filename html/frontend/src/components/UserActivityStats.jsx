import React, { useState, useEffect } from 'react';
import { adminAPI } from '../api/client';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { Loader2, Users, Smartphone, Monitor, Globe } from 'lucide-react';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function UserActivityStats() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchStats();
  }, [days]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getActivityStats(days);
      setData(response);
      setError(null);
    } catch (err) {
      console.error('Error fetching activity stats:', err);
      setError('Не удалось загрузить статистику активности');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-brand-yellow" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { daily_stats, device_stats, platform_stats, user_stats } = data;

  // Calculate totals
  const totalLogins = daily_stats.reduce((acc, curr) => acc + curr.count, 0);
  const uniqueUsersTotal = user_stats.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Активность пользователей</h2>
          <p className="text-gray-400 text-sm">Статистика посещений за последние {days} дней</p>
        </div>
        <div className="flex bg-[#1C2127] p-1 rounded-lg border border-gray-800">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                days === d 
                  ? 'bg-brand-yellow text-black font-medium' 
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {d} дней
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#1C2127] p-4 rounded-xl border border-gray-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm">Всего входов</p>
              <h3 className="text-2xl font-bold text-white mt-1">{totalLogins}</h3>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
          </div>
        </div>
        
        <div className="bg-[#1C2127] p-4 rounded-xl border border-gray-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm">Уникальных пользователей</p>
              <h3 className="text-2xl font-bold text-white mt-1">{uniqueUsersTotal}</h3>
            </div>
            <div className="p-2 bg-emerald-500/10 rounded-lg">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#1C2127] p-4 rounded-xl border border-gray-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm">С мобильных</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {device_stats.find(d => d.device_type === 'mobile')?.count || 0}
              </h3>
            </div>
            <div className="p-2 bg-purple-500/10 rounded-lg">
              <Smartphone className="w-5 h-5 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-[#1C2127] p-4 rounded-xl border border-gray-800">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-gray-400 text-sm">С компьютеров</p>
              <h3 className="text-2xl font-bold text-white mt-1">
                {device_stats.find(d => d.device_type === 'desktop')?.count || 0}
              </h3>
            </div>
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Monitor className="w-5 h-5 text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily Activity Chart */}
        <div className="lg:col-span-2 bg-[#1C2127] p-6 rounded-xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-6">Динамика посещений</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily_stats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#9CA3AF" 
                  tick={{ fill: '#9CA3AF' }}
                  tickFormatter={(value) => new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                />
                <YAxis stroke="#9CA3AF" tick={{ fill: '#9CA3AF' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                  labelStyle={{ color: '#9CA3AF' }}
                  formatter={(value) => [value, 'Входов']}
                  labelFormatter={(value) => new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                />
                <Bar dataKey="count" name="Всего входов" fill="#FBBF24" radius={[4, 4, 0, 0]} />
                <Bar dataKey="unique_users" name="Уникальных" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Platform Distribution */}
        <div className="bg-[#1C2127] p-6 rounded-xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-6">Платформы</h3>
          <div className="h-[300px] w-full flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={platform_stats}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="platform"
                >
                  {platform_stats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                  formatter={(value) => [value, 'Входов']}
                />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Users Table */}
      <div className="bg-[#1C2127] rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-lg font-semibold text-white">Топ активных пользователей</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-800/50 text-gray-400 uppercase font-medium">
              <tr>
                <th className="px-6 py-4">Пользователь</th>
                <th className="px-6 py-4">Роль</th>
                <th className="px-6 py-4 text-center">Количество входов</th>
                <th className="px-6 py-4 text-right">Последний вход</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {user_stats.slice(0, 10).map((user) => (
                <tr key={user.user_id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{user.name}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-300">
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-white">{user.login_count}</td>
                  <td className="px-6 py-4 text-right text-gray-400">
                    {new Date(user.last_login).toLocaleString('ru-RU', { hour12: false })}
                  </td>
                </tr>
              ))}
              {user_stats.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500">
                    Нет данных за выбранный период
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
