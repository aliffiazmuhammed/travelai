import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { type ComponentProps, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authCoverUrl } from '@/lib/authCover';
import { radius, shadows, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Screen } from '@/ui';
import { BrandMark } from './BrandMark';

type IconName = ComponentProps<typeof Ionicons>['name'];

const CREAM = '#f7f3ea';

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  notice?: ReactNode;
  footer?: ReactNode;
  /** Renders a glassy chevron in the hero for the recovery screens. */
  onBack?: () => void;
}

/** Postcard hero + form sheet shared by every auth screen. */
export function AuthShell({ title, subtitle, children, notice, footer, onBack }: AuthShellProps) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  // The photo band grows into the space a fixed hero used to leave blank at the
  // base of tall screens, so the sheet hugs its content instead of holding a
  // dead band. It never shrinks below its copy (the hero hugs content on short
  // screens), and the copy sits at the base of the photo like a postcard.
  const compact = width < 380 || height < 700;

  return (
    <Screen
      scroll
      avoidKeyboard
      padded={false}
      edges={['bottom']}
      contentContainerStyle={styles.content}
    >
      <StatusBar style="light" />
      <View style={styles.column}>
        <View
          style={[
            styles.hero,
            {
              paddingTop: insets.top + space.md,
              paddingBottom: compact ? space.huge : space.giant,
              paddingHorizontal: compact ? space.lg : space.xl,
            },
          ]}
        >
          <Image
            source={{ uri: authCoverUrl() }}
            style={styles.cover}
            contentFit="cover"
            transition={250}
            accessible={false}
          />
          <LinearGradient
            colors={['rgba(12,26,21,0.58)', 'rgba(12,26,21,0.44)', 'rgba(12,26,21,0.74)']}
            locations={[0, 0.45, 1]}
            style={styles.scrim}
          />

          <View style={[styles.heroTop, { marginBottom: compact ? space.lg : space.xxl }]}>
            {onBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
                hitSlop={8}
                onPress={onBack}
                style={({ pressed }) => [styles.back, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Ionicons name="chevron-back" size={18} color={CREAM} />
              </Pressable>
            ) : null}
            <View style={styles.heroMark}>
              <BrandMark />
            </View>
          </View>

          <View style={styles.heroText}>
            <AppText
              variant="display"
              style={[styles.heroTitle, compact ? styles.heroTitleCompact : null]}
            >
              {title}
            </AppText>
            <AppText
              style={[styles.heroSubtitle, compact ? styles.heroSubtitleCompact : null]}
            >
              {subtitle}
            </AppText>
          </View>
        </View>

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: palette.card,
              borderTopColor: palette.border,
              ...shadows.soft,
            },
          ]}
        >
          {notice ? <View style={styles.noticeSlot}>{notice}</View> : null}
          <View style={styles.body}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
          <View style={[styles.trust, { borderTopColor: palette.border }]}>
            <AppText variant="caption" tone="muted">
              Free to start — no card needed.
            </AppText>
            <AppText variant="caption" tone="muted">
              Your trips stay private until you choose to share them.
            </AppText>
          </View>
        </View>
      </View>
    </Screen>
  );
}

interface AuthFooterProps {
  prompt: string;
  action: string;
  onPress: () => void;
}

/** "New to waytowalk? Create an account" link row at the base of the sheet. */
export function AuthFooter({ prompt, action, onPress }: AuthFooterProps) {
  return (
    <View style={styles.footerRow}>
      <AppText tone="muted">{prompt}</AppText>
      <Pressable accessibilityRole="link" hitSlop={8} onPress={onPress}>
        <AppText variant="bodyStrong" tone="primary">
          {action}
        </AppText>
      </Pressable>
    </View>
  );
}

interface AuthNoticeProps {
  icon: IconName;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  /** Single-line inline banner, used for the expired-session message. */
  compact?: boolean;
}

/** Soft message block for expired sessions and recovery states. */
export function AuthNotice({ icon, title, children, action, compact = false }: AuthNoticeProps) {
  const { palette } = useTheme();

  if (compact) {
    return (
      <View style={[styles.compactNotice, { backgroundColor: palette.muted }]}>
        <Ionicons name={icon} size={16} color={palette.primary} />
        <AppText variant="caption" tone="muted" style={styles.compactText}>
          {children}
        </AppText>
      </View>
    );
  }

  return (
    <View style={[styles.notice, { backgroundColor: palette.muted }]}>
      <View style={[styles.noticeIcon, { backgroundColor: palette.card }]}>
        <Ionicons name={icon} size={20} color={palette.primary} />
      </View>
      {title ? <AppText variant="bodyStrong">{title}</AppText> : null}
      <AppText tone="muted">{children}</AppText>
      {action ? <View style={styles.noticeAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  column: { width: '100%', maxWidth: 560, alignSelf: 'center', flexGrow: 1 },
  // Flex-grow lets the photo absorb the height the sheet does not need; the
  // space-between leaves the logo at the top edge and the headline against the
  // sheet, which is also the order they appear at short heights.
  hero: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#173f35',
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  heroMark: { marginLeft: 'auto' },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(17,32,27,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { gap: space.sm, maxWidth: 420 },
  heroTitle: { color: CREAM },
  heroTitleCompact: { fontSize: 30, lineHeight: 36, letterSpacing: -0.4 },
  heroSubtitle: { color: 'rgba(247,243,234,0.82)', fontSize: 15, lineHeight: 22 },
  heroSubtitleCompact: { fontSize: 14, lineHeight: 20 },
  sheet: {
    // Hug the fields: any leftover height belongs to the photo above, so the
    // form never floats in the middle of a tall sheet.
    flexGrow: 0,
    flexShrink: 0,
    marginTop: -space.xxl,
    borderTopWidth: 1,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: space.xxl,
    paddingTop: space.xxl,
    paddingBottom: space.xxxl,
  },
  noticeSlot: { marginBottom: space.lg },
  // The form hugs its content so the mode-switch footer follows the last field.
  body: { gap: 14 },
  footer: { paddingTop: space.xxxl },
  // Trust copy closes the sheet, under a hairline, right below the mode switch.
  trust: {
    marginTop: space.lg,
    borderTopWidth: 1,
    paddingTop: space.xl,
    alignItems: 'center',
    gap: 2,
  },
  footerRow: { alignItems: 'center', gap: space.xs },
  compactNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
  },
  compactText: { flex: 1, lineHeight: 18 },
  notice: { gap: space.sm, padding: space.lg, borderRadius: radius.xl },
  noticeIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  noticeAction: { marginTop: space.sm },
});
