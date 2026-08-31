import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  Clipboard,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Link as LinkIcon,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { academiesAPI, usersAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';

const COUNTRY_PRESETS = {
  RU: {
    label: 'Россия',
    currency: 'RUB',
    default_language: 'ru',
    locale: 'ru-RU',
    timezone: 'Europe/Moscow',
    languages: [{ code: 'ru', label: 'Русский' }],
    phoneExample: '+79991234567',
  },
  MD: {
    label: 'Молдова',
    currency: 'MDL',
    default_language: 'ru',
    locale: 'ru-MD',
    timezone: 'Europe/Chisinau',
    languages: [
      { code: 'ru', label: 'Русский' },
      { code: 'ro', label: 'Română' },
    ],
    phoneExample: '+37360123456',
  },
  RO: {
    label: 'Румыния',
    currency: 'RON',
    default_language: 'ro',
    locale: 'ro-RO',
    timezone: 'Europe/Bucharest',
    languages: [{ code: 'ro', label: 'Română' }],
    phoneExample: '+40700123456',
  },
};

const emptyAcademyForm = {
  name: '',
  short_name: '',
  slug: '',
  primary_color: '#16A34A',
  country_code: 'RU',
  currency: 'RUB',
  default_language: 'ru',
  locale: 'ru-RU',
  timezone: 'Europe/Moscow',
  city: '',
  contact_phone: '',
  contact_email: '',
  description: '',
  subscription_status: 'trial',
  subscription_plan: 'starter',
  max_users: '',
  max_students: '',
  is_active: true,
};

const emptyAdminForm = {
  full_name: '',
  phone: '',
  password: '',
  role: 'owner',
};

function makeSlug(value) {
  return (value || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^lk2\.sunnyfootball\.com\/?/, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function academyUrls(slug) {
  const origin = window.location.origin;
  const safeSlug = slug || 'academy';
  return {
    cabinet: `${origin}/${safeSlug}`,
    login: `${origin}/${safeSlug}/login`,
  };
}

function normalizeAcademyForForm(academy) {
  return {
    name: academy.name || '',
    short_name: academy.short_name || '',
    slug: academy.slug || '',
    primary_color: academy.primary_color || '#16A34A',
    country_code: academy.country_code || 'RU',
    currency: academy.currency || 'RUB',
    default_language: academy.default_language || 'ru',
    locale: academy.locale || 'ru-RU',
    timezone: academy.timezone || 'Europe/Moscow',
    city: academy.city || '',
    contact_phone: academy.contact_phone || '',
    contact_email: academy.contact_email || '',
    description: academy.description || '',
    subscription_status: academy.subscription_status || 'trial',
    subscription_plan: academy.subscription_plan || 'starter',
    max_users: academy.max_users || '',
    max_students: academy.max_students || '',
    is_active: Boolean(academy.is_active),
  };
}

function apiPayloadFromForm(form, allowSlug = false) {
  const payload = {
    ...form,
    short_name: form.short_name || form.name,
    max_users: form.max_users ? Number(form.max_users) : null,
    max_students: form.max_students ? Number(form.max_students) : null,
  };
  if (allowSlug) payload.slug = makeSlug(form.slug);
  else delete payload.slug;
  return payload;
}

function copy(text, label = 'Скопировано') {
  navigator.clipboard?.writeText(text);
  toast.success(label);
}

function getErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message).filter(Boolean).join('. ') || fallback;
  }
  if (detail && typeof detail === 'object') return detail.msg || detail.message || fallback;
  return fallback;
}

function buildInvitationText(academy, credential) {
  const urls = academyUrls(academy.slug);
  return [
    'Здравствуйте! Для вашей академии создан кабинет в Football CRM.',
    '',
    `Академия: ${academy.name}`,
    `Ссылка для входа: ${credential.login_url || urls.login}`,
    `Логин: ${credential.phone || credential.login}`,
    `Пароль: ${credential.initial_password || credential.password || ''}`,
    '',
    'После входа руководитель сможет добавить тренеров, родителей, администраторов и настроить доступы команды.',
  ].join('\n');
}

function StatCard({ icon, label, value, hint, tone = 'yellow' }) {
  const toneClass = tone === 'green' ? 'text-green-300 bg-green-500/10 border-green-500/20' : tone === 'blue' ? 'text-blue-300 bg-blue-500/10 border-blue-500/20' : 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${toneClass}`}>{icon}<span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
      <div className="mt-3 text-2xl font-black text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-white/45">{hint}</div>}
    </div>
  );
}

function Section({ title, icon, open, onToggle, children, badge }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:scale-[0.99]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-yellow-300">{icon}</span>
          <span className="truncate font-bold text-white">{title}</span>
          {badge !== undefined && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">{badge}</span>}
        </div>
        <ChevronDown size={18} className={`shrink-0 text-white/50 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-white/10 p-4">{children}</div>}
    </div>
  );
}

export default function PlatformAdmin() {
  const [academies, setAcademies] = useState([]);
  const [savedCredentials, setSavedCredentials] = useState([]);
  const [academyForm, setAcademyForm] = useState(emptyAcademyForm);
  const [adminForms, setAdminForms] = useState({});
  const [createdAdmins, setCreatedAdmins] = useState({});
  const [editForms, setEditForms] = useState({});
  const [expanded, setExpanded] = useState({ create: true });
  const [showPasswords, setShowPasswords] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingAcademy, setSavingAcademy] = useState(false);
  const [savingAdminId, setSavingAdminId] = useState(null);
  const [savingEditId, setSavingEditId] = useState(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const sortedAcademies = useMemo(() => [...academies].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)), [academies]);
  const stats = useMemo(() => {
    const active = academies.filter((a) => a.is_active).length;
    const trial = academies.filter((a) => a.subscription_status === 'trial').length;
    const credentials = savedCredentials.filter((c) => ['owner', 'super_admin', 'admin'].includes((c.role || '').toLowerCase())).length;
    return { total: academies.length, active, trial, credentials };
  }, [academies, savedCredentials]);

  const previewUrls = academyUrls(makeSlug(academyForm.slug) || 'academy');

  const loadAcademies = async () => {
    setLoading(true);
    try {
      const [academiesResponse, credentialsResponse] = await Promise.all([
        academiesAPI.getAll(),
        usersAPI.getCredentials().catch(() => ({ data: { credentials: [] } })),
      ]);
      const loadedAcademies = academiesResponse.data || [];
      setAcademies(loadedAcademies);
      setSavedCredentials(credentialsResponse.data?.credentials || []);
      setEditForms(Object.fromEntries(loadedAcademies.map((a) => [a.id, normalizeAcademyForForm(a)])));
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось загрузить академии'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAcademies(); }, []);

  const applyCountryPreset = (form, countryCode) => {
    const preset = COUNTRY_PRESETS[countryCode] || COUNTRY_PRESETS.RU;
    return {
      ...form,
      country_code: countryCode,
      currency: preset.currency,
      default_language: preset.default_language,
      locale: preset.locale,
      timezone: preset.timezone,
    };
  };

  const updateAcademyForm = (key, value) => {
    setAcademyForm((prev) => {
      let next = { ...prev, [key]: key === 'slug' ? makeSlug(value) : value };
      if (key === 'name' && !prev.slug) next.slug = makeSlug(value);
      if (key === 'country_code') next = applyCountryPreset(next, value);
      return next;
    });
  };

  const updateEditForm = (academyId, key, value) => {
    setEditForms((prev) => {
      let nextForm = { ...(prev[academyId] || emptyAcademyForm), [key]: value };
      if (key === 'country_code') nextForm = applyCountryPreset(nextForm, value);
      return { ...prev, [academyId]: nextForm };
    });
  };

  const updateAdminForm = (academyId, key, value) => {
    setAdminForms((prev) => ({ ...prev, [academyId]: { ...(prev[academyId] || emptyAdminForm), [key]: value } }));
  };

  const toggleSection = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const createAcademy = async (event) => {
    event.preventDefault();
    setSavingAcademy(true);
    try {
      await academiesAPI.create(apiPayloadFromForm(academyForm, true));
      toast.success('Академия создана');
      setAcademyForm(emptyAcademyForm);
      await loadAcademies();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось создать академию'));
    } finally {
      setSavingAcademy(false);
    }
  };

  const saveAcademy = async (academy) => {
    const form = editForms[academy.id] || normalizeAcademyForForm(academy);
    setSavingEditId(academy.id);
    try {
      await academiesAPI.update(academy.id, apiPayloadFromForm(form, false));
      toast.success('Настройки академии сохранены');
      await loadAcademies();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить академию'));
    } finally {
      setSavingEditId(null);
    }
  };

  const createAdmin = async (academy) => {
    const form = adminForms[academy.id] || emptyAdminForm;
    if (!form.full_name || !form.phone || !form.password) {
      toast.error('Заполни имя, телефон и пароль руководителя');
      return;
    }
    setSavingAdminId(academy.id);
    try {
      const response = await academiesAPI.createAdmin(academy.id, { ...form, phone: form.phone.replace(/\s+/g, '') });
      setCreatedAdmins((prev) => ({ ...prev, [academy.id]: { ...response.data, initial_password: form.password } }));
      setAdminForms((prev) => ({ ...prev, [academy.id]: emptyAdminForm }));
      setExpanded((prev) => ({ ...prev, [`access-${academy.id}`]: true }));
      toast.success('Руководитель академии создан');
      await loadAcademies();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось создать руководителя'));
    } finally {
      setSavingAdminId(null);
    }
  };

  const handleLogout = () => {
    logout?.();
    navigate('/login');
  };

  const renderAcademyFields = (form, onChange, mode = 'create') => {
    const preset = COUNTRY_PRESETS[form.country_code] || COUNTRY_PRESETS.RU;
    const languageOptions = preset.languages || COUNTRY_PRESETS.RU.languages;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-white/60">Название академии</span>
            <input value={form.name} onChange={(e) => onChange('name', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" required />
          </label>
          <label className="block">
            <span className="text-sm text-white/60">Короткое название</span>
            <input value={form.short_name} onChange={(e) => onChange('short_name', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" placeholder="Например Sunny" />
          </label>
        </div>

        {mode === 'create' && (
          <label className="block">
            <span className="text-sm text-white/60">Ссылка кабинета</span>
            <div className="mt-1 flex overflow-hidden rounded-xl border border-white/10 bg-black/30 focus-within:border-yellow-400">
              <span className="border-r border-white/10 px-3 py-3 text-sm text-white/40">lk2.sunnyfootball.com/</span>
              <input value={form.slug} onChange={(e) => onChange('slug', e.target.value)} className="min-w-0 flex-1 bg-transparent px-3 py-3 outline-none" placeholder="academy" required />
            </div>
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm text-white/60">Страна</span>
            <select value={form.country_code} onChange={(e) => onChange('country_code', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#151821] px-4 py-3 outline-none focus:border-yellow-400">
              {Object.entries(COUNTRY_PRESETS).map(([code, item]) => <option key={code} value={code}>{item.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-white/60">Валюта</span>
            <input value={form.currency} onChange={(e) => onChange('currency', e.target.value.toUpperCase())} maxLength={3} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" />
          </label>
          <label className="block">
            <span className="text-sm text-white/60">Язык</span>
            <select value={form.default_language} onChange={(e) => onChange('default_language', e.target.value)} disabled={languageOptions.length === 1} className="mt-1 w-full rounded-xl border border-white/10 bg-[#151821] px-4 py-3 outline-none focus:border-yellow-400 disabled:opacity-70">
              {languageOptions.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-50/90">
          {languageOptions.length === 1
            ? 'Для этой страны язык фиксируется автоматически — руководителю не будет показан лишний выбор языка.'
            : 'Для этой страны доступно несколько языков — руководитель сможет менять язык в настройках академии.'}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm text-white/60">Часовой пояс</span>
            <input value={form.timezone} onChange={(e) => onChange('timezone', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" />
          </label>
          <label className="block">
            <span className="text-sm text-white/60">Город</span>
            <input value={form.city} onChange={(e) => onChange('city', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" />
          </label>
          <label className="block">
            <span className="text-sm text-white/60">Цвет бренда</span>
            <input type="color" value={form.primary_color} onChange={(e) => onChange('primary_color', e.target.value)} className="mt-1 h-[50px] w-full rounded-xl border border-white/10 bg-black/30" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-white/60">Телефон академии</span>
            <input value={form.contact_phone} onChange={(e) => onChange('contact_phone', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" placeholder={preset.phoneExample} />
          </label>
          <label className="block">
            <span className="text-sm text-white/60">Email</span>
            <input value={form.contact_email} onChange={(e) => onChange('contact_email', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" placeholder="info@academy.com" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-white/60">Лимит пользователей</span>
            <input type="number" min="1" value={form.max_users} onChange={(e) => onChange('max_users', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" />
          </label>
          <label className="block">
            <span className="text-sm text-white/60">Лимит учеников</span>
            <input type="number" min="1" value={form.max_students} onChange={(e) => onChange('max_students', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm text-white/60">Тариф</span>
            <select value={form.subscription_plan} onChange={(e) => onChange('subscription_plan', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#151821] px-4 py-3 outline-none focus:border-yellow-400">
              <option value="starter">starter</option>
              <option value="pro">pro</option>
              <option value="business">business</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-white/60">Статус</span>
            <select value={form.subscription_status} onChange={(e) => onChange('subscription_status', e.target.value)} className="mt-1 w-full rounded-xl border border-white/10 bg-[#151821] px-4 py-3 outline-none focus:border-yellow-400">
              <option value="trial">trial</option>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="cancelled">cancelled</option>
            </select>
          </label>
          <label className="flex items-end gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <input type="checkbox" checked={form.is_active} onChange={(e) => onChange('is_active', e.target.checked)} className="h-5 w-5 accent-yellow-400" />
            <span className="text-sm text-white/80">Академия активна</span>
          </label>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full bg-[#0F1117] text-white px-3 py-4 pb-28 sm:p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-4 md:space-y-6">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-4 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 text-xs font-bold text-green-300">Football CRM Platform</div>
              <h1 className="mt-3 text-2xl font-black leading-tight md:text-4xl">Управление академиями</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/55 md:text-base">Здесь создаются кабинеты, хранятся ссылки входа, логины/пароли руководителей и редактируются страна, язык, валюта и тариф академии.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button onClick={loadAcademies} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 hover:bg-white/15"><RefreshCw size={18} />Обновить</button>
              <button onClick={handleLogout} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-200 hover:bg-red-500/15"><LogOut size={18} />Выйти</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={<Building2 size={16} />} label="Академии" value={stats.total} hint="всего кабинетов" />
          <StatCard icon={<Check size={16} />} label="Активные" value={stats.active} hint="доступны клиентам" tone="green" />
          <StatCard icon={<BarChart3 size={16} />} label="Trial" value={stats.trial} hint="пробный период" tone="blue" />
          <StatCard icon={<KeyRound size={16} />} label="Доступы" value={stats.credentials} hint="логины/пароли" />
        </div>

        <Section title="Создать новую академию" icon={<Plus size={20} />} open={expanded.create} onToggle={() => toggleSection('create')}>
          <form onSubmit={createAcademy} className="space-y-4">
            {renderAcademyFields(academyForm, updateAcademyForm, 'create')}
            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-3 text-sm">
              <div className="font-bold text-green-200">Предпросмотр ссылок</div>
              <div className="mt-2 break-all text-white/70">Кабинет: {previewUrls.cabinet}</div>
              <div className="break-all text-white/70">Вход: {previewUrls.login}</div>
            </div>
            <button disabled={savingAcademy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-4 font-black text-black disabled:opacity-60"><Check size={18} />{savingAcademy ? 'Создание...' : 'Создать кабинет академии'}</button>
          </form>
        </Section>

        <div className="rounded-3xl border border-white/10 bg-white/[0.04]">
          <div className="flex items-center justify-between border-b border-white/10 p-4 md:p-5">
            <div className="flex items-center gap-3 font-black"><Building2 className="text-yellow-300" size={22} />Академии</div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-sm text-white/60">{academies.length}</span>
          </div>

          {loading ? <div className="p-8 text-white/50">Загрузка...</div> : (
            <div className="space-y-4 p-3 md:p-5">
              {sortedAcademies.map((academy) => {
                const urls = academyUrls(academy.slug);
                const form = editForms[academy.id] || normalizeAcademyForForm(academy);
                const adminForm = adminForms[academy.id] || emptyAdminForm;
                const createdAdmin = createdAdmins[academy.id];
                const academyCredentials = savedCredentials.filter((cred) => Number(cred.academy_id) === Number(academy.id) && ['owner', 'super_admin', 'admin'].includes((cred.role || '').toLowerCase()));
                const languageCount = (COUNTRY_PRESETS[academy.country_code]?.languages || []).length || 1;
                const accessOpen = expanded[`access-${academy.id}`] ?? true;

                return (
                  <div key={academy.id} className="rounded-3xl border border-white/10 bg-[#151821] p-4 shadow-2xl shadow-black/20 md:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-black text-white md:text-2xl">{academy.name}</h2>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${academy.is_active ? 'bg-green-500/15 text-green-300' : 'bg-red-500/15 text-red-300'}`}>{academy.is_active ? 'Активна' : 'Отключена'}</span>
                        </div>
                        <div className="mt-2 grid gap-1 text-sm text-white/50">
                          <div className="flex items-start gap-2"><LinkIcon size={15} className="mt-0.5 shrink-0" /><span className="break-all">{urls.login}</span></div>
                          <div>{academy.country_code || 'RU'} · {academy.currency || 'RUB'} · {academy.default_language || 'ru'} · {academy.timezone || ''}</div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-lg bg-white/10 px-2 py-1">{academy.subscription_plan}</span>
                          <span className="rounded-lg bg-white/10 px-2 py-1">{academy.subscription_status}</span>
                          <span className="rounded-lg bg-white/10 px-2 py-1">{languageCount > 1 ? 'мультиязык' : '1 язык'}</span>
                          <span className="rounded-lg bg-white/10 px-2 py-1">доступов: {academyCredentials.length}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 min-[430px]:grid-cols-3 lg:min-w-[520px]">
                        <a href={urls.cabinet} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm hover:bg-white/15"><ExternalLink size={16} />Кабинет</a>
                        <a href={urls.login} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm hover:bg-white/15"><ExternalLink size={16} />Вход</a>
                        <button onClick={() => copy(urls.login, 'Ссылка входа скопирована')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm hover:bg-white/15"><Clipboard size={16} />Скопировать</button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <Section title="Ссылки, логины и пароли" icon={<KeyRound size={18} />} badge={academyCredentials.length} open={accessOpen} onToggle={() => toggleSection(`access-${academy.id}`)}>
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-50/90">
                            Это главный блок для передачи академии: копируешь сообщение и отправляешь руководителю в Telegram/WhatsApp. Пароль хранится зашифрованно, здесь показывается только владельцу платформы.
                          </div>
                          {academyCredentials.length === 0 ? (
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/50">Пока нет сохранённых доступов. Создай первого руководителя ниже.</div>
                          ) : (
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                              {academyCredentials.map((cred) => {
                                const message = buildInvitationText(academy, { ...cred, phone: cred.login, login_url: urls.login });
                                const passKey = `${academy.id}-${cred.user_id}`;
                                return (
                                  <div key={cred.user_id} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="font-bold text-white">{cred.full_name}</div>
                                        <div className="mt-1 text-xs text-white/45">{cred.role === 'owner' ? 'Руководитель академии' : cred.role_display || cred.role}</div>
                                      </div>
                                      <button onClick={() => setShowPasswords((prev) => ({ ...prev, [passKey]: !prev[passKey] }))} className="rounded-lg bg-white/10 p-2 text-white/70">
                                        {showPasswords[passKey] ? <EyeOff size={16} /> : <Eye size={16} />}
                                      </button>
                                    </div>
                                    <div className="mt-3 space-y-2 rounded-xl bg-white/[0.04] p-3 font-mono text-sm">
                                      <div className="break-all"><span className="text-white/40">Логин:</span> {cred.login}</div>
                                      <div className="break-all"><span className="text-white/40">Пароль:</span> {showPasswords[passKey] ? cred.password : '••••••••'}</div>
                                      <div className="break-all"><span className="text-white/40">Вход:</span> {urls.login}</div>
                                    </div>
                                    <button onClick={() => copy(message, 'Данные доступа скопированы')} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-3 py-3 font-black text-black"><Clipboard size={16} />Скопировать сообщение</button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </Section>

                      <Section title="Редактировать академию: страна, язык, валюта" icon={<Settings2 size={18} />} open={Boolean(expanded[`edit-${academy.id}`])} onToggle={() => toggleSection(`edit-${academy.id}`)}>
                        <div className="space-y-4">
                          {renderAcademyFields(form, (key, value) => updateEditForm(academy.id, key, value), 'edit')}
                          <button onClick={() => saveAcademy(academy)} disabled={savingEditId === academy.id} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-4 font-black text-black disabled:opacity-60"><Save size={18} />{savingEditId === academy.id ? 'Сохраняю...' : 'Сохранить настройки академии'}</button>
                        </div>
                      </Section>

                      <Section title="Создать / обновить руководителя академии" icon={<UserPlus size={18} />} open={Boolean(expanded[`leader-${academy.id}`])} onToggle={() => toggleSection(`leader-${academy.id}`)}>
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
                            <input value={adminForm.full_name} onChange={(e) => updateAdminForm(academy.id, 'full_name', e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" placeholder="Имя руководителя" />
                            <input value={adminForm.phone} onChange={(e) => updateAdminForm(academy.id, 'phone', e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" placeholder={COUNTRY_PRESETS[academy.country_code]?.phoneExample || '+79991234567'} inputMode="tel" />
                            <input value={adminForm.password} onChange={(e) => updateAdminForm(academy.id, 'password', e.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 outline-none focus:border-yellow-400" placeholder="Временный пароль" />
                            <button onClick={() => createAdmin(academy)} disabled={savingAdminId === academy.id} className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-3 font-black text-black disabled:opacity-60"><ShieldCheck size={16} />{savingAdminId === academy.id ? 'Сохраняю...' : 'Создать'}</button>
                          </div>
                          <div className="text-xs text-white/45">Первый руководитель получает роль “Руководитель академии” и полный доступ. Потом он сам добавляет тренеров, родителей и администраторов в своём кабинете.</div>
                          {createdAdmin && (
                            <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-3">
                              <div className="font-bold text-green-100">Готово сообщение для клиента:</div>
                              <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-sm text-white">{buildInvitationText(academy, createdAdmin)}</pre>
                              <button onClick={() => copy(buildInvitationText(academy, createdAdmin), 'Ссылка, логин и пароль скопированы')} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-3 py-3 font-black text-black"><Clipboard size={16} />Скопировать данные</button>
                            </div>
                          )}
                        </div>
                      </Section>

                      <Section title="Статистика и состояние" icon={<BarChart3 size={18} />} open={Boolean(expanded[`stats-${academy.id}`])} onToggle={() => toggleSection(`stats-${academy.id}`)}>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <StatCard icon={<Users size={16} />} label="Доступы" value={academyCredentials.length} hint="админы/руководители" />
                          <StatCard icon={<Building2 size={16} />} label="Страна" value={academy.country_code || 'RU'} hint={COUNTRY_PRESETS[academy.country_code]?.label} tone="blue" />
                          <StatCard icon={<Settings2 size={16} />} label="Валюта" value={academy.currency || 'RUB'} hint="для финансов" />
                          <StatCard icon={<Edit3 size={16} />} label="Язык" value={academy.default_language || 'ru'} hint={languageCount > 1 ? 'можно менять' : 'фиксирован'} tone="green" />
                        </div>
                      </Section>
                    </div>
                  </div>
                );
              })}
              {!academies.length && <div className="p-8 text-white/50">Пока нет академий</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
