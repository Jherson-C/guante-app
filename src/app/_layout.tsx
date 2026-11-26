import {
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_700Bold,
  SchibstedGrotesk_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/schibsted-grotesk';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { COLOR } from '@/constants/tema';
import { GuanteProvider } from '@/hooks/use-guante';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fuentesListas, errorFuentes] = useFonts({
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_700Bold,
    SchibstedGrotesk_800ExtraBold,
  });

  // Si la fuente falla, la app sigue con la del sistema en vez de quedarse en blanco.
  const lista = fuentesListas || errorFuentes !== null;

  useEffect(() => {
    if (lista) void SplashScreen.hideAsync();
  }, [lista]);

  if (!lista) return null;

  return (
    <GuanteProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: COLOR.abismo },
        }}
      />
    </GuanteProvider>
  );
}
