export const ACADEMY_LANGUAGE_PRESETS = {
  RU: ['ru'],
  RO: ['ro'],
  MD: ['ru', 'ro'],
};

export function getAcademyLanguageCodes(academy) {
  const country = (academy?.country_code || 'RU').toUpperCase();
  const defaultLanguage = academy?.default_language || 'ru';
  const preset = ACADEMY_LANGUAGE_PRESETS[country];
  if (preset?.length) {
    return preset.includes(defaultLanguage) ? [defaultLanguage, ...preset.filter((code) => code !== defaultLanguage)] : preset;
  }
  return [defaultLanguage];
}

export function isAcademyMultilingual(academy) {
  return getAcademyLanguageCodes(academy).length > 1;
}
