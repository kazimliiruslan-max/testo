import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

export interface DeliveryLocation {
  lat: number;
  lng: number;
  label?: string;
}

interface LocationCtx {
  loc: DeliveryLocation | null;
  setLoc: (l: DeliveryLocation | null) => void;
  requesting: boolean;
  requestGps: () => Promise<DeliveryLocation | null>;
}

const Ctx = createContext<LocationCtx | undefined>(undefined);
const KEY = 'directdine_loc';

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLocState] = useState<DeliveryLocation | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v) {
        try { setLocState(JSON.parse(v)); } catch {}
      }
    });
  }, []);

  const setLoc = useCallback((l: DeliveryLocation | null) => {
    setLocState(l);
    if (l) AsyncStorage.setItem(KEY, JSON.stringify(l));
    else AsyncStorage.removeItem(KEY);
  }, []);

  const requestGps = useCallback(async (): Promise<DeliveryLocation | null> => {
    setRequesting(true);
    try {
      if (Platform.OS === 'web') {
        return await new Promise<DeliveryLocation | null>((resolve) => {
          if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const l = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location' };
              setLoc(l);
              resolve(l);
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000 },
          );
        });
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const l: DeliveryLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location' };
      setLoc(l);
      return l;
    } catch {
      return null;
    } finally {
      setRequesting(false);
    }
  }, [setLoc]);

  return (
    <Ctx.Provider value={{ loc, setLoc, requesting, requestGps }}>{children}</Ctx.Provider>
  );
}

export function useDeliveryLocation() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDeliveryLocation must be inside LocationProvider');
  return c;
}
