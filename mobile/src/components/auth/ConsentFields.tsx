import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { legalUrl, type LegalConfig } from '@/lib/legal';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui';

interface ConsentFieldsProps {
  legal: LegalConfig;
  accepted: boolean;
  marketingOptIn: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onMarketingChange: (optIn: boolean) => void;
  error?: string | null;
}

/**
 * Sign-up legal acknowledgement (Phase 1B).
 *
 * Two deliberately separate controls: accepting the Terms and Privacy Policy is
 * required to create an account, while marketing is optional and unchecked by
 * default. The links open the public web pages; the native app does not
 * duplicate the policy copy.
 */
export function ConsentFields({
  legal,
  accepted,
  marketingOptIn,
  onAcceptedChange,
  onMarketingChange,
  error,
}: ConsentFieldsProps) {
  const { palette } = useTheme();

  const openPolicy = (path: string) => {
    void Linking.openURL(legalUrl(path)).catch(() => undefined);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel="I agree to the Terms of Service and Privacy Policy"
          accessibilityState={{ checked: accepted }}
          hitSlop={4}
          onPress={() => onAcceptedChange(!accepted)}
          style={styles.checkHit}
        >
          <View
            style={[
              styles.box,
              {
                borderColor: accepted ? palette.primary : palette.border,
                backgroundColor: accepted ? palette.primary : 'transparent',
              },
            ]}
          >
            {accepted ? (
              <Ionicons name="checkmark" size={15} color={palette.primaryForeground} />
            ) : null}
          </View>
        </Pressable>

        <View style={styles.copy}>
          <AppText variant="caption" style={styles.legalCopy}>
            I agree to the{' '}
            <AppText
              variant="caption"
              tone="primary"
              accessibilityRole="link"
              onPress={() => openPolicy(legal.termsPath)}
              style={styles.link}
            >
              Terms of Service
            </AppText>{' '}
            and{' '}
            <AppText
              variant="caption"
              tone="primary"
              accessibilityRole="link"
              onPress={() => openPolicy(legal.privacyPath)}
              style={styles.link}
            >
              Privacy Policy
            </AppText>
            .
          </AppText>
          {error ? (
            <AppText
              variant="caption"
              tone="danger"
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.error}
            >
              {error}
            </AppText>
          ) : null}
        </View>
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Send me occasional trip ideas and product updates"
        accessibilityState={{ checked: marketingOptIn }}
        onPress={() => onMarketingChange(!marketingOptIn)}
        style={styles.marketingRow}
      >
        <View
          style={[
            styles.boxSmall,
            {
              borderColor: marketingOptIn ? palette.primary : palette.border,
              backgroundColor: marketingOptIn ? palette.primary : 'transparent',
            },
          ]}
        >
          {marketingOptIn ? (
            <Ionicons name="checkmark" size={12} color={palette.primaryForeground} />
          ) : null}
        </View>
        <AppText variant="caption" tone="muted" style={styles.marketingCopy}>
          Send me occasional trip ideas and product updates. (optional)
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  checkHit: {
    width: 44,
    height: 44,
    marginLeft: -10,
    marginTop: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: space.xs, paddingTop: 2 },
  legalCopy: { lineHeight: 20 },
  link: { textDecorationLine: 'underline' },
  error: { lineHeight: 18 },
  marketingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    minHeight: 44,
  },
  boxSmall: {
    width: 18,
    height: 18,
    marginTop: 2,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketingCopy: { flex: 1, lineHeight: 18 },
});
