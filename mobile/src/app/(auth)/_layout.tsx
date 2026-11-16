import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/auth/SessionProvider';
import { BootScreen } from '@/ui';

export default function AuthGroupLayout() {
  const { status } = useSession();

  if (status === 'loading') return <BootScreen />;
  if (status === 'signedIn') return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
