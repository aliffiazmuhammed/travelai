import { Redirect, Stack, type Href } from 'expo-router';

import { useSession } from '@/auth/SessionProvider';
import { BootScreen } from '@/ui';

export default function AuthGroupLayout() {
  const { status, nextRoute } = useSession();

  if (status === 'loading') return <BootScreen />;
  if (status === 'signedIn') return <Redirect href={(nextRoute ?? '/') as Href} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
