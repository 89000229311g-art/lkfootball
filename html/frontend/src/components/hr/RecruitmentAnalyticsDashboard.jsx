export default function RecruitmentAnalyticsDashboard({ candidates, stages, staff, studentStats }) {
  const totalCandidates = candidates.length;

  const countsByStage = stages.map((stage) => ({
    key: stage.key,
    title: stage.title,
    count: candidates.filter((c) => c.stage === stage.key).length,
  }));

  const hiredStages = ['onboarding'];
  const hiredCount = candidates.filter((c) => hiredStages.includes(c.stage)).length;
  const conversion = totalCandidates > 0 ? Math.round((hiredCount / totalCandidates) * 100) : 0;

  const totalStudents = studentStats && studentStats.total_active ? studentStats.total_active : 0;

  const coachCapacityPerEmployee = 50;
  const adminCapacityPerEmployee = 300;

  const coachStaff = staff.filter((s) => s.role === 'coach');
  const adminStaff = staff.filter((s) => s.role === 'admin');

  const coachCapacity = coachStaff.length * coachCapacityPerEmployee;
  const adminCapacity = adminStaff.length * adminCapacityPerEmployee;

  const coachOverload =
    coachStaff.length === 0 ? totalStudents > 0 : totalStudents > coachCapacity;

  const adminOverload =
    adminStaff.length === 0 ? totalStudents > 0 : totalStudents > adminCapacity;

  const coachRecommendedHires =
    totalStudents > coachCapacity
      ? Math.max(0, Math.ceil(totalStudents / coachCapacityPerEmployee) - coachStaff.length)
      : 0;

  const adminRecommendedHires =
    totalStudents > adminCapacity
      ? Math.max(0, Math.ceil(totalStudents / adminCapacityPerEmployee) - adminStaff.length)
      : 0;

  return (
    <div className="space-y-4 p-1 md:p-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-4">
          <div className="text-xs uppercase text-gray-500 mb-1">Кандидаты</div>
          <div className="text-2xl font-bold text-white mb-1">{totalCandidates}</div>
          <div className="text-xs text-gray-400">
            Всего кандидатов в воронке найма
          </div>
        </div>
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-4">
          <div className="text-xs uppercase text-gray-500 mb-1">Конверсия</div>
          <div className="text-2xl font-bold text-emerald-400 mb-1">
            {conversion}
            <span className="text-base text-gray-500 ml-1">%</span>
          </div>
          <div className="text-xs text-gray-400">
            Из отклика в выход на работу
          </div>
        </div>
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-4">
          <div className="text-xs uppercase text-gray-500 mb-1">Ученики</div>
          <div className="text-2xl font-bold text-white mb-1">{totalStudents}</div>
          <div className="text-xs text-gray-400">
            Активные ученики по данным академии
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs uppercase text-gray-500">Воронка найма</div>
              <div className="text-sm text-gray-300">
                Распределение кандидатов по этапам
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {countsByStage.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2"
              >
                <div className="text-sm text-gray-200">{item.title}</div>
                <div className="text-sm font-mono text-gray-100">{item.count}</div>
              </div>
            ))}
            {countsByStage.length === 0 && (
              <div className="text-xs text-gray-500">
                Этапы воронки еще не настроены.
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#1C1E24] border border-white/10 rounded-2xl p-4 space-y-3">
          <div>
            <div className="text-xs uppercase text-gray-500 mb-1">Кого не хватает</div>
            <div className="text-sm text-gray-300">
              Рекомендации по найму на основе текущей нагрузки
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
              <div>
                <div className="text-sm text-gray-200">Тренеры</div>
                <div className="text-[11px] text-gray-500">
                  1 тренер на {coachCapacityPerEmployee} учеников
                </div>
              </div>
              <div className="text-right">
                <div
                  className={
                    coachOverload
                      ? 'text-xs text-red-400'
                      : 'text-xs text-emerald-400'
                  }
                >
                  {coachOverload
                    ? `Перегруз, нужно нанять примерно ${coachRecommendedHires}`
                    : 'Нагрузка в норме'}
                </div>
                <div className="text-[11px] text-gray-500">
                  Сейчас тренеров: {coachStaff.length}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between bg-white/5 rounded-xl px-3 py-2">
              <div>
                <div className="text-sm text-gray-200">Администраторы</div>
                <div className="text-[11px] text-gray-500">
                  1 администратор на {adminCapacityPerEmployee} учеников
                </div>
              </div>
              <div className="text-right">
                <div
                  className={
                    adminOverload
                      ? 'text-xs text-red-400'
                      : 'text-xs text-emerald-400'
                  }
                >
                  {adminOverload
                    ? `Перегруз, нужно нанять примерно ${adminRecommendedHires}`
                    : 'Нагрузка в норме'}
                </div>
                <div className="text-[11px] text-gray-500">
                  Сейчас администраторов: {adminStaff.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

