import { Cabin_400Regular } from '@expo-google-fonts/cabin/400Regular';
import { Cabin_500Medium } from '@expo-google-fonts/cabin/500Medium';
import { Cabin_600SemiBold } from '@expo-google-fonts/cabin/600SemiBold';
import { Cabin_700Bold } from '@expo-google-fonts/cabin/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '@/auth/SessionProvider';
import { ChatRecoveryPrompt } from '@/components/ChatRecovery';
import { queryClient } from '@/query/client';
import { ThemeProvider, useThemePreference } from '@/theme/ThemeProvider';

function RootStack() {
  const { isDark } = useThemePreference();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
      <ChatRecoveryPrompt />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Cabin_400Regular,
    Cabin_500Medium,
    Cabin_600SemiBold,
    Cabin_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <RootStack />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
