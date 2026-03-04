import { memo } from 'react';
import { TrendingUp, Users, DollarSign, Wallet, Trash2 } from 'lucide-react';

const MarketingCard = memo(({ campaign, onDelete, onClick }) => {
  // Safe access to numeric values
  const budget = typeof campaign.budget === 'number' ? campaign.budget : 0;
  const spend = typeof campaign.spend === 'number' ? campaign.spend : 0;
  const leadsCount = typeof campaign.leads === 'number' ? campaign.leads : (Array.isArray(campaign.leads) ? campaign.leads.length : 0);
  const revenue = typeof campaign.revenue === 'number' ? campaign.revenue : 0;

  return (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick && onClick(campaign);
      }}
      className="bg-[#252830] hover:bg-[#2E323A] p-3 rounded-xl border border-white/5 shadow-sm cursor-grab active:cursor-grabbing group transition-all relative hover:shadow-md hover:border-white/10"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="font-medium text-white truncate pr-6" title={campaign.name}>
          {campaign.name}
        </div>
        {onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(campaign.id);
            }}
            className="absolute top-3 right-3 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="space-y-2">
        {/* Source Badge */}
        {campaign.source && (
          <div className="inline-block bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider mb-1">
            {campaign.source}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-[10px] text-gray-400">
          <div className="flex items-center gap-1" title="Бюджет">
            <Wallet size={12} className="text-purple-400 shrink-0" />
            <span className="truncate">{budget.toLocaleString()} MDL</span>
          </div>
          <div className="flex items-center gap-1" title="Потрачено">
            <DollarSign size={12} className="text-red-400 shrink-0" />
            <span className="truncate">{spend.toLocaleString()} MDL</span>
          </div>
          <div className="flex items-center gap-1" title="Лиды">
            <Users size={12} className="text-blue-400 shrink-0" />
            <span className="truncate">{leadsCount} лидов</span>
          </div>
          <div className="flex items-center gap-1" title="Доход">
            <TrendingUp size={12} className="text-emerald-400 shrink-0" />
            <span className="truncate">{revenue.toLocaleString()} MDL</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default MarketingCard;
