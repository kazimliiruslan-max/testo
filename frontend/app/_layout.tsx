import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider } from "@/src/context/AuthContext";
import { I18nProvider } from "@/src/context/I18nContext";
import { CartProvider } from "@/src/context/CartContext";

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <I18nProvider>
          <AuthProvider>
            <CartProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </CartProvider>
          </AuthProvider>
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
