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
