import { memo, useMemo } from 'react';

const MarketingDashboard = memo(function MarketingDashboard({ campaigns = [] }) {
  const { kpi, sources } = useMemo(() => {
    let totalSpend = 0;
    let totalLeads = 0;
    let totalPaying = 0;
    let totalRevenue = 0;
    const map = new Map();

    (campaigns || []).forEach((c) => {
      // Calculate KPI metrics
      const spend = c.total_spend || c.spend || 0;
      const leads = c.leads || 0;
      const paying = c.paying_students || c.payingStudents || 0;
      const revenue = c.revenue || 0;
      const sourceKey = c.source || 'Другое';

      totalSpend += spend;
      totalLeads += leads;
      totalPaying += paying;
      totalRevenue += revenue;

      // Group by source
      if (!map.has(sourceKey)) {
        map.set(sourceKey, { leads: 0, spend: 0 });
      }
      const current = map.get(sourceKey);
      current.leads += leads;
      current.spend += spend;
    });

    const cac = totalPaying > 0 ? totalSpend / totalPaying : 0;
    const roi = totalSpend > 0 ? (totalRevenue - totalSpend) / totalSpend : 0;

    return {
      kpi: {
        totalSpend,
        totalLeads,
        totalPaying,
        totalRevenue,
        cac,
        roi,
      },
      sources: Array.from(map.entries()).map(([source, data]) => ({
        source,
        ...data,
      })),
    };
  }, [campaigns]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-[#1C1E24] rounded-xl p-4 border border-white/10 flex flex-col gap-3">
        <div className="text-sm text-gray-400">KPI маркетинга</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-gray-500">Затраты</div>
            <div className="text-lg font-semibold text-white">
              {kpi.totalSpend.toLocaleString('ru-RU')} ₽
            </div>
          </div>
          <div>
            <div className="text-gray-500">Доход</div>
            <div className="text-lg font-semibold text-emerald-400">
              {kpi.totalRevenue.toLocaleString('ru-RU')} ₽
            </div>
          </div>
          <div>
            <div className="text-gray-500">Новые заявки</div>
            <div className="text-lg font-semibold text-white">{kpi.totalLeads}</div>
          </div>
          <div>
            <div className="text-gray-500">Новые ученики</div>
            <div className="text-lg font-semibold text-white">{kpi.totalPaying}</div>
          </div>
        </div>
        <div className="flex gap-4 mt-2 text-sm">
          <div>
            <div className="text-gray-500">CAC</div>
            <div className="text-lg font-semibold text-white">
              {Math.round(kpi.cac).toLocaleString('ru-RU')} ₽
            </div>
          </div>
          <div>
            <div className="text-gray-500">ROI</div>
            <div
              className={`text-lg font-semibold ${
                kpi.roi >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {(kpi.roi * 100).toFixed(1)} %
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#1C1E24] rounded-xl p-4 border border-white/10 flex flex-col gap-3">
        <div className="text-sm text-gray-400">Источники трафика</div>
        <div className="space-y-2 text-sm">
          {sources.map((s) => (
            <div key={s.source} className="flex justify-between items-center">
              <div className="text-gray-200">{s.source}</div>
              <div className="text-gray-400">
                {s.leads} лидов · {s.spend.toLocaleString('ru-RU')} ₽
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#1C1E24] rounded-xl p-4 border border-white/10 flex flex-col gap-3">
        <div className="text-sm text-gray-400">Промокоды</div>
        <div className="text-xs text-gray-500 mb-1">
          Моковые данные, дальше можно связать с платежами.
        </div>
        <table className="w-full text-xs text-gray-300">
          <thead>
            <tr className="text-gray-500">
              <th className="text-left pb-1">Код</th>
              <th className="text-right pb-1">Активаций</th>
              <th className="text-right pb-1">Доход</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>SEPT25</td>
              <td className="text-right">18</td>
              <td className="text-right">180 000 ₽</td>
            </tr>
            <tr>
              <td>FRIEND10</td>
              <td className="text-right">32</td>
              <td className="text-right">320 000 ₽</td>
            </tr>
            <tr>
              <td>VKNEW</td>
              <td className="text-right">9</td>
              <td className="text-right">90 000 ₽</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default MarketingDashboard;

