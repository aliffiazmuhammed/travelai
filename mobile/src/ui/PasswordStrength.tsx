import { StyleSheet, View } from 'react-native';

import {
  DEFAULT_PASSWORD_POLICY,
  passwordStrength,
  type PasswordPolicy,
} from '@/lib/passwordPolicy';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

interface PasswordStrengthProps {
  value: string;
  policy?: PasswordPolicy;
  email?: string;
  name?: string;
}

/**
 * Requirements-before-submit and a text strength label (Phase 2, AUTH-033).
 *
 * The meter is decorative and hidden from assistive tech; the label and hint
 * carry the meaning, so nobody has to distinguish green from amber. The
 * wrapper is a polite live region so Android announces the label as it changes.
 */
export function PasswordStrength({
  value,
  policy = DEFAULT_PASSWORD_POLICY,
  email,
  name,
}: PasswordStrengthProps) {
  const { palette } = useTheme();
  const result = passwordStrength(value, policy, { email, name });

  return (
    <View style={styles.wrap} accessibilityLiveRegion="polite">
      <AppText variant="caption" tone="muted" style={styles.copy}>
        {policy.requirements}
      </AppText>
      {result ? (
        <>
          <View style={styles.feedback}>
            <View
              style={styles.meter}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {[1, 2, 3, 4].map((step) => (
                <View
                  key={step}
                  style={[
                    styles.segment,
                    {
                      backgroundColor:
                        step <= result.score
                          ? result.weak
                            ? palette.destructive
                            : palette.primary
                          : palette.border,
                    },
                  ]}
                />
              ))}
            </View>
            <AppText
              variant="caption"
              tone={result.weak ? 'danger' : 'primary'}
              style={styles.label}
            >
              {result.label}
            </AppText>
          </View>
          <AppText variant="caption" tone="muted" style={styles.copy}>
            {result.hint}
          </AppText>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  feedback: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meter: { flex: 1, flexDirection: 'row', gap: 4, height: 6 },
  segment: { flex: 1, borderRadius: 999 },
  label: { fontWeight: '600' },
  copy: { lineHeight: 18 },
});
