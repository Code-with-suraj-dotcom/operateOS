import axios from 'axios';

export const TOKEN_KEY = 'operateos_token';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errorMessage = (err) => {
  const e = err?.response?.data?.error;
  if (e?.details?.[0]?.message) return `${e.message}: ${e.details[0].path} ${e.details[0].message}`;
  return e?.message || err.message || 'Something went wrong';
};

export default api;
