import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { academiesAPI } from '../api/client';
import { getAcademyLanguageCodes } from '../utils/academyLocale';

const DEFAULT_ACADEMY = {
  slug: 'sunny',
  name: 'Football CRM',
  short_name: 'Football CRM',
  logo_url: null,
  primary_color: '#16A34A',
  country_code: 'RU',
  currency: 'RUB',
  default_language: 'ru',
  locale: 'ru-RU',
  timezone: 'Europe/Moscow',
};

const AcademyContext = createContext({
  academy: DEFAULT_ACADEMY,
  loading: false,
  setAcademySlug: () => {},
  currency: DEFAULT_ACADEMY.currency,
  locale: DEFAULT_ACADEMY.locale,
  formatMoney: (amount) => `${amount || 0} ${DEFAULT_ACADEMY.currency}`,
});

export function getStoredAcademySlug() {
  if (window.__ACADEMY_SLUG__) return window.__ACADEMY_SLUG__;
  if (window.__PLATFORM_LOGIN__) return '';
  return localStorage.getItem('academySlug') || 'sunny';
}

function hexToHsl(hex) {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.substring(0, 2), 16) / 255;
  const g = parseInt(normalized.substring(2, 4), 16) / 255;
  const b = parseInt(normalized.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    if (max === g) h = (b - r) / d + 2;
    if (max === b) h = (r - g) / d + 4;
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyAcademyBrand(academy) {
  const color = academy?.primary_color || DEFAULT_ACADEMY.primary_color;
  const name = academy?.name || DEFAULT_ACADEMY.name;
  const shortName = academy?.short_name || name;
  const slug = academy?.slug || getStoredAcademySlug();

  document.documentElement.style.setProperty('--primary', hexToHsl(color));
  document.documentElement.style.setProperty('--accent', hexToHsl(color));
  document.documentElement.style.setProperty('--ring', hexToHsl(color));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', shortName);
  document.title = name;

  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) {
    manifest.setAttribute('href', `/api/v1/academies/${slug}/manifest.json`);
  }

  const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (appleIcon) {
    appleIcon.setAttribute('href', academy?.logo_url || '/icons/icon-192.png');
  }
}

function replaceLegacyCurrencyText(currency) {
  if (!currency || currency === 'MDL' || !document.body) return;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue?.includes('MDL')) nodes.push(node);
  }

  nodes.forEach((node) => {
    node.nodeValue = node.nodeValue.replace(/\bMDL\b/g, currency);
  });
}

export function AcademyProvider({ children }) {
  const [academySlug, setAcademySlugState] = useState(getStoredAcademySlug);
  const [academy, setAcademy] = useState(DEFAULT_ACADEMY);
  const [loading, setLoading] = useState(true);

  const setAcademySlug = (slug) => {
    const nextSlug = slug || 'sunny';
    localStorage.setItem('academySlug', nextSlug);
    setAcademySlugState(nextSlug);
  };

  useEffect(() => {
    const handleAcademySlugChange = (event) => {
      if (event.detail) setAcademySlug(event.detail);
    };
    window.addEventListener('academySlugChange', handleAcademySlugChange);
    return () => window.removeEventListener('academySlugChange', handleAcademySlugChange);
  }, []);

  useEffect(() => {
    if (!academySlug) {
      setAcademy(DEFAULT_ACADEMY);
      applyAcademyBrand(DEFAULT_ACADEMY);
      setLoading(false);
      return;
    }

    setLoading(true);
    academiesAPI
      .getPublic(academySlug)
      .then((response) => {
        setAcademy(response.data);
        localStorage.setItem('academySlug', response.data.slug);
        const languageCodes = getAcademyLanguageCodes(response.data);
        if (languageCodes.length === 1) {
          localStorage.setItem('language', languageCodes[0]);
          window.dispatchEvent(new Event('languageChange'));
        }
        applyAcademyBrand(response.data);
      })
      .catch(() => {
        setAcademy(DEFAULT_ACADEMY);
        applyAcademyBrand(DEFAULT_ACADEMY);
      })
      .finally(() => setLoading(false));
  }, [academySlug]);

  useEffect(() => {
    const currency = academy?.currency || DEFAULT_ACADEMY.currency;
    replaceLegacyCurrencyText(currency);

    if (!currency || currency === 'MDL' || !document.body) return undefined;

    const observer = new MutationObserver(() => replaceLegacyCurrencyText(currency));
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [academy?.currency]);

  const value = useMemo(() => {
    const currency = academy?.currency || DEFAULT_ACADEMY.currency;
    const locale = academy?.locale || DEFAULT_ACADEMY.locale;
    return {
      academy,
      loading,
      setAcademySlug,
      currency,
      locale,
      formatMoney: (amount) => `${Number(amount || 0).toLocaleString(locale)} ${currency}`,
    };
  }, [academy, loading]);

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export const useAcademy = () => useContext(AcademyContext);
