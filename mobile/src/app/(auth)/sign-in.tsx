import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useSession } from '@/auth/SessionProvider';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, InlineError, Screen, TextField } from '@/ui';

const EMAIL = /^\S+@\S+\.\S+$/;

export default function SignInScreen() {
  const { signIn, sessionExpired } = useSession();
  const { palette } = useTheme();
  const router = useRouter();
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) return setError('Enter your email address.');
    if (!EMAIL.test(trimmedEmail)) return setError('That email address looks incomplete.');
    if (!password) return setError('Enter your password.');

    Keyboard.dismiss();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(trimmedEmail, password);
    } catch (nextError) {
      setError(
        nextError instanceof ApiError
          ? nextError.message
          : 'Something went wrong. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll avoidKeyboard contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <View style={styles.head}>
          <AppText variant="title" tone="primary" style={styles.wordmark}>
            waytowalk
          </AppText>
          <AppText variant="display">Welcome back.</AppText>
          <AppText tone="muted">
            Your trips, your crew and the next slow morning are right where you left them.
          </AppText>
        </View>

        <View style={styles.form}>
          {sessionExpired ? (
            <View style={[styles.expired, { backgroundColor: palette.muted }]}>
              <Ionicons name="time-outline" size={16} color={palette.primary} />
              <AppText variant="caption" tone="muted" style={styles.expiredText}>
                Your session timed out, so we signed you out. Sign in and your trips are right
                where you left them.
              </AppText>
            </View>
          ) : null}
          <InlineError message={error} />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button label="Sign in" size="lg" loading={submitting} onPress={submit} style={styles.submit} />
        </View>
      </View>

      <View style={styles.footer}>
        <AppText tone="muted">New to waytowalk?</AppText>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.push('/sign-up')}
        >
          <AppText variant="bodyStrong" tone="primary">
            Create an account
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingTop: space.xl,
    paddingBottom: space.xl,
  },
  top: { gap: space.xxxl },
  head: { gap: space.sm },
  wordmark: { letterSpacing: -0.4, marginBottom: space.md },
  form: { gap: 14 },
  expired: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
  },
  expiredText: { flex: 1, lineHeight: 18 },
  submit: { marginTop: space.sm },
  footer: {
    marginTop: 'auto',
    paddingTop: space.xxl,
    alignItems: 'center',
    gap: space.xs,
  },
});
