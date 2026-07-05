import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, saveToken, clearToken } from '../api/client';

export type Role = 'customer' | 'restaurant_owner' | 'courier';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string | null;
  restaurant_id?: string | null;
  created_at: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    email: string; password: string; name: string; role: Role; phone?: string; restaurant_name?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    await saveToken(res.data.access_token);
    setUser(res.data.user);
    return res.data.user;
  };

  const register = async (payload: any) => {
    const res = await api.post('/auth/register', payload);
    await saveToken(res.data.access_token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be inside AuthProvider');
  return c;
}
