import { useEffect, useRef } from 'react';
import { api, TOKEN_KEY } from '@/src/api/client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

type Handler = (msg: any) => void;

async function getToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null;
    }
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Subscribe to order events over WebSocket. Auto-reconnects with backoff.
 * Server broadcasts JSON messages like {type:'order_status',order_id,status,...}.
 */
export function useOrderEvents(handler: Handler, enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const backoffRef = useRef(1000);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    closedRef.current = false;
    let cancelled = false;

    const connect = async () => {
      if (cancelled) return;
      const token = await getToken();
      if (!token) {
        // retry once when token appears
        setTimeout(connect, 2000);
        return;
      }
      const base = (api.defaults.baseURL || '').replace(/^http/, 'ws').replace(/\/api$/, '');
      const url = `${base}/api/ws/orders?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { backoffRef.current = 1000; };
      ws.onmessage = (e: MessageEvent) => {
        try { handlerRef.current(JSON.parse(String(e.data))); } catch {}
      };
      ws.onclose = () => {
        wsRef.current = null;
        if (closedRef.current || cancelled) return;
        const delay = Math.min(backoffRef.current, 15000);
        backoffRef.current = Math.min(delay * 2, 15000);
        setTimeout(connect, delay);
      };
      ws.onerror = () => { try { ws.close(); } catch {} };
    };

    connect();
    return () => {
      cancelled = true;
      closedRef.current = true;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [enabled]);
}
