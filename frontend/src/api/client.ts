import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const BASE_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export const TOKEN_KEY = 'directdine_token';

async function getStoredToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken() {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const token = await getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Normalizes API errors into a human-readable string.
 * Handles FastAPI 422 (detail is an array of {loc,msg,...}) as well as plain string detail.
 */
export function formatApiError(e: any, fallback = 'Something went wrong'): string {
  const d = e?.response?.data?.detail;
  if (!d) {
    if (typeof e?.message === 'string' && e.message) return e.message;
    return fallback;
  }
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) {
    // Pydantic error list — pick the first user-friendly message
    const first = d[0];
    if (first && typeof first === 'object') {
      const loc = Array.isArray(first.loc) ? first.loc.filter((x: any) => x !== 'body').join('.') : '';
      const msg = String(first.msg || '').replace(/^value is not a valid /i, 'invalid ');
      return loc ? `${loc}: ${msg}` : msg || fallback;
    }
    return fallback;
  }
  if (typeof d === 'object') {
    // Occasionally detail is a single dict
    return String(d.msg || d.message || fallback);
  }
  return fallback;
}
