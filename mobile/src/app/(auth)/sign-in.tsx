import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { useSession } from '@/auth/SessionProvider';
import { AuthFooter, AuthNotice, AuthShell } from '@/components/auth/AuthShell';
import { space } from '@/theme/tokens';
import { AppText, Button, InlineError, TextField } from '@/ui';

const EMAIL = /^\S+@\S+\.\S+$/;

export default function SignInScreen() {
  const { signIn, sessionExpired } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
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
      await signIn(trimmedEmail, password, next);
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

  function openSignUp() {
    router.push({ pathname: '/sign-up', params: next ? { next } : {} });
  }

  return (
    <AuthShell
      title="Welcome back."
      subtitle="Your trips, your crew and the next slow morning are right where you left them."
      notice={
        sessionExpired ? (
          <AuthNotice icon="time-outline" compact>
            Your session timed out, so we signed you out. Sign in and your trips are right where
            you left them.
          </AuthNotice>
        ) : undefined
      }
      footer={
        <AuthFooter prompt="New to waytowalk?" action="Create an account" onPress={openSignUp} />
      }
    >
      <InlineError message={error} />
      <TextField
        label="Email"
        filled
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
        filled
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
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={() => router.push('/forgot-password')}
        style={styles.forgot}
      >
        <AppText variant="label" tone="primary">
          Forgot password?
        </AppText>
      </Pressable>
      <Button
        label="Sign in"
        size="lg"
        variant="accent"
        loading={submitting}
        onPress={submit}
        style={styles.submit}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', marginTop: -4 },
  submit: { marginTop: space.sm },
});
