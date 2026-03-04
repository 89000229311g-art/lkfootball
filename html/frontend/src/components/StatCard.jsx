
import React from 'react';

export default function StatCard({ title, value, subtitle, icon, color }) {
  const colorMap = {
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', iconBg: 'bg-blue-500/20' },
    green: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', iconBg: 'bg-emerald-500/20' },
    yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400', iconBg: 'bg-yellow-500/20' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', iconBg: 'bg-purple-500/20' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', iconBg: 'bg-red-500/20' },
  };

  const colors = colorMap[color] || colorMap.blue;

  return (
    <div className={`${colors.bg} rounded-3xl p-4 md:p-6 border ${colors.border} hover:scale-[1.02] transition-all duration-300`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-400 text-xs md:text-sm font-medium">{title}</p>
          <p className={`text-xl md:text-2xl font-bold mt-1 ${colors.text}`}>{value}</p>
          {subtitle && <p className="text-[10px] md:text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`${colors.iconBg} ${colors.text} p-2 md:p-3 rounded-2xl text-lg md:text-xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
}
