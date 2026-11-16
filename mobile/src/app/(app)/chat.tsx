import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useSession } from '@/auth/SessionProvider';
import { goToCreate, goToTab } from '@/navigation/tabs';
import { fontFamily, radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  Avatar,
  Button,
  Card,
  NAV_BOTTOM_SPACE,
  NavShell,
  Screen,
} from '@/ui';

export default function ChatScreen() {
  const { palette } = useTheme();
  const { user } = useSession();
  const router = useRouter();

  return (
    <View style={styles.root}>
      <Screen
        scroll
        contentContainerStyle={{ paddingTop: space.sm, paddingBottom: NAV_BOTTOM_SPACE + space.xl }}
      >
        <View style={styles.page}>
          <View style={styles.topRow}>
            <AppText variant="title" tone="primary" style={styles.wordmark}>
              waytowalk
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
              onPress={() => goToTab('profile')}
              style={({ pressed }) => [styles.avatarButton, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Avatar name={user?.name || user?.email || 'You'} size={36} />
            </Pressable>
          </View>

          <View style={styles.hero}>
            <AppText variant="caption" tone="muted" style={styles.eyebrow}>
              CONVERSATIONS
            </AppText>
            <AppText variant="display">Talk it over where the plan lives.</AppText>
            <AppText tone="muted">
              Trip chat belongs with the itinerary, not in a separate inbox. Open a trip and the
              conversation is right there with the days and the people.
            </AppText>
          </View>

          <Card style={styles.card}>
            <View style={[styles.icon, { backgroundColor: palette.muted }]}>
              <Ionicons name="chatbubbles-outline" size={22} color={palette.primary} />
            </View>
            <AppText variant="heading">The in-trip chat view is next</AppText>
            <AppText tone="muted">
              For now, conversations with your travel companions live on the web. The app will
              open them from inside each trip, so nothing gets separated from the plan.
            </AppText>
            <Button
              label="See your trips"
              variant="secondary"
              size="sm"
              onPress={() => router.navigate('/trips')}
            />
          </Card>

          <View style={styles.footer}>
            <AppText variant="caption" tone="muted">
              Looking for a trip to talk about?
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.navigate('/')}
              style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
            >
              <AppText variant="label" tone="primary">
                Browse shared trips
              </AppText>
              <Ionicons name="arrow-forward" size={14} color={palette.primary} />
            </Pressable>
          </View>
        </View>
      </Screen>

      <NavShell
        active="chat"
        onSelect={(next) => {
          if (next === 'chat') return;
          goToTab(next);
        }}
        onCreatePress={goToCreate}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { letterSpacing: -0.4 },
  avatarButton: { borderRadius: radius.pill },
  hero: { gap: space.sm },
  eyebrow: { fontFamily: fontFamily.semibold, letterSpacing: 1.2 },
  card: { alignItems: 'flex-start', gap: space.sm },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  footer: { alignItems: 'flex-start', gap: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
