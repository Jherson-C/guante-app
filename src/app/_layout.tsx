import { Stack } from 'expo-router';

import { GuanteProvider } from '@/hooks/use-guante';

export default function RootLayout() {
  return (
    <GuanteProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000' },
        }}
      />
    </GuanteProvider>
  );
}
