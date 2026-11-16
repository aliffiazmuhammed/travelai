import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/auth/SessionProvider';
import { BootScreen } from '@/ui';

export default function AppGroupLayout() {
  const { status } = useSession();

  if (status === 'loading') return <BootScreen />;
  if (status === 'signedOut') return <Redirect href="/sign-in" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
