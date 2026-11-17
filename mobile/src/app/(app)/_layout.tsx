import { Redirect, Stack, usePathname } from 'expo-router';

import { useSession } from '@/auth/SessionProvider';
import { BootScreen } from '@/ui';

export default function AppGroupLayout() {
  const { status } = useSession();
  const pathname = usePathname();

  if (status === 'loading') return <BootScreen />;
  if (status === 'signedOut') {
    return (
      <Redirect href={{ pathname: '/sign-in', params: { next: pathname } }} />
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
