import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Copy, ExternalLink, Settings, Users, UserPlus, Layers, CreditCard, MessageCircle, ShieldCheck, PlayCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI, groupsAPI, studentsAPI } from '../api/client';
import { useAcademy } from '../context/AcademyContext';
import { useAuth } from '../context/AuthContext';

function copyText(text) {
  navigator.clipboard?.writeText(text);
  toast.success('Скопировано');
}

function StepCard({ number, title, text, to, icon, done, children }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-black ${done ? 'bg-green-500 text-black' : 'bg-yellow-400 text-black'}`}>
          {done ? <CheckCircle2 size={22} /> : number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-lg font-black text-white">
            <span className="text-yellow-300">{icon}</span>
            {title}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-white/55">{text}</p>
          {children && <div className="mt-4">{children}</div>}
          {to && (
            <Link to={to} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-yellow-400 px-4 py-3 font-black text-black active:scale-[0.99] sm:w-auto">
              Открыть <ExternalLink size={16} />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-1 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

export default function Onboarding() {
  const { academy } = useAcademy();
  const { user } = useAuth();
  const [stats, setStats] = useState({ users: 0, groups: 0, students: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [usersRes, groupsRes, studentsRes] = await Promise.all([
          authAPI.getUsers({ limit: 500 }).catch(() => ({ data: { total: 0, data: [] } })),
          groupsAPI.getAll().catch(() => ({ data: [] })),
          studentsAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        ]);
        if (!alive) return;
        setStats({
          users: usersRes.data?.total ?? usersRes.data?.data?.length ?? 0,
          groups: Array.isArray(groupsRes.data) ? groupsRes.data.length : 0,
          students: Array.isArray(studentsRes.data) ? studentsRes.data.length : studentsRes.data?.data?.length ?? 0,
        });
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  const loginUrl = `${window.location.origin}${window.__ACADEMY_SLUG__ ? `/${window.__ACADEMY_SLUG__}` : ''}/login`;
  const trainerMessage = [
    `Вам открыт доступ тренера в ${academy?.name || 'академию'}.`,
    `Ссылка: ${loginUrl}`,
    'Логин и временный пароль отправит руководитель академии.',
    'После входа вы увидите свои группы, расписание и посещаемость.',
  ].join('\n');
  const parentMessage = [
    `Вам открыт родительский кабинет в ${academy?.name || 'академии'}.`,
    `Ссылка: ${loginUrl}`,
    'Войдите по логину/паролю от администратора академии.',
    'В кабинете доступны платежи, расписание, сообщения и информация по ребёнку.',
  ].join('\n');

  const readyScore = [stats.users > 1, stats.groups > 0, stats.students > 0].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#0F1117] px-3 py-4 pb-28 text-white md:p-6">
      <div className="mx-auto max-w-6xl space-y-4 md:space-y-6">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-yellow-400/15 to-green-500/10 p-4 md:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-bold text-yellow-200">
            <PlayCircle size={14} /> Первый запуск академии
          </div>
          <h1 className="mt-3 text-2xl font-black leading-tight md:text-4xl">Настройте академию для боевой работы</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60 md:text-base">
            Эта страница помогает руководителю быстро подготовить кабинет: проверить страну/язык/валюту, создать команду, группы, учеников и понять какие ссылки отправлять тренерам и родителям.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <MiniStat label="Пользователи" value={loading ? '…' : stats.users} />
            <MiniStat label="Группы" value={loading ? '…' : stats.groups} />
            <MiniStat label="Ученики" value={loading ? '…' : stats.students} />
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
            Готовность к пилоту: <b className="text-white">{readyScore}/3</b>. Минимум для первой академии: руководитель + тренер/администратор, 1 группа, 1 тестовый ученик/родитель.
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StepCard number="1" done={Boolean(academy?.country_code && academy?.currency && academy?.default_language)} icon={<Settings size={20} />} title="Проверить настройки академии" text="Страна, валюта и язык задают поведение всего кабинета. Россия — русский/RUB без лишнего выбора языка. Молдова — русский/румынский." to="/settings" />
          <StepCard number="2" done={stats.users > 1} icon={<Users size={20} />} title="Добавить команду" text="Создайте тренеров и администраторов. Администратору можно включать отдельные права: история, аналитика, CRM, найм, маркетинг." to="/users-management" />
          <StepCard number="3" done={stats.groups > 0} icon={<Layers size={20} />} title="Создать группы" text="Группы нужны для расписания, посещаемости, платежей и привязки тренеров." to="/groups" />
          <StepCard number="4" done={stats.students > 0} icon={<UserPlus size={20} />} title="Добавить учеников и родителей" text="Родитель должен видеть только своего ребёнка, платежи, расписание и сообщения академии." to="/students" />
          <StepCard number="5" icon={<CreditCard size={20} />} title="Настроить платежи" text="Заполните реквизиты, QR и инструкцию оплаты, чтобы родители понимали куда платить." to="/settings" />
          <StepCard number="6" icon={<ShieldCheck size={20} />} title="Проверить доступы" text="Перед отдачей академии проверьте вход руководителя, тренера и родителя. Каждый должен видеть только свои данные." to="/users-management" />
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 md:p-5">
          <div className="flex items-center gap-2 text-lg font-black"><MessageCircle className="text-yellow-300" /> Готовые сообщения для команды</div>
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-bold text-white">Тренеру</div>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-sm text-white/70">{trainerMessage}</pre>
              <button onClick={() => copyText(trainerMessage)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-3 py-3 font-black text-black"><Copy size={16} />Скопировать</button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-bold text-white">Родителю</div>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-sm text-white/70">{parentMessage}</pre>
              <button onClick={() => copyText(parentMessage)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-3 py-3 font-black text-black"><Copy size={16} />Скопировать</button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-green-500/20 bg-green-500/10 p-4 text-sm leading-relaxed text-green-50/90 md:p-5">
          <b>Рекомендация:</b> перед тем как отправлять академии доступ, создайте внутри неё тестовую группу, тестового тренера, одного ученика и родителя, затем войдите под каждым пользователем и проверьте видимость данных.
        </div>
      </div>
    </div>
  );
}
