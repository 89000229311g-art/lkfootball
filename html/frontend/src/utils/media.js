const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

export const getApiOrigin = () => {
  const apiUrl = new URL(API_BASE_URL, window.location.origin);
  const apiPath = apiUrl.pathname.replace(/\/api\/v1\/?$/, '');
  return `${apiUrl.origin}${apiPath}`.replace(/\/$/, '');
};

export const getMediaUrl = (path) => {
  if (!path) return '';

  try {
    return new URL(path).toString();
  } catch {
    return `${getApiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
  }
};
