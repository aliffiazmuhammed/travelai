import { useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useSession } from '@/auth/SessionProvider';
import { space } from '@/theme/tokens';
import { AppText, Button, InlineError, Screen, TextField } from '@/ui';

const EMAIL = /^\S+@\S+\.\S+$/;

export default function SignUpScreen() {
  const { signUp } = useSession();
  const router = useRouter();
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length > 40) return setError('Keep your name under 40 characters.');
    if (!trimmedEmail) return setError('Enter your email address.');
    if (!EMAIL.test(trimmedEmail)) return setError('That email address looks incomplete.');
    if (password.length < 6) return setError('Use at least 6 characters for your password.');

    Keyboard.dismiss();
    setError(null);
    setSubmitting(true);
    try {
      await signUp({
        email: trimmedEmail,
        password,
        ...(trimmedName ? { name: trimmedName } : {}),
      });
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
          <AppText variant="display">Make yourself at home.</AppText>
          <AppText tone="muted">
            One account for the trips you join, the trips you plan and the people you meet along
            the way.
          </AppText>
        </View>

        <View style={styles.form}>
          <InlineError message={error} />
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Mira Chen"
            hint="Optional — people see this on your trips."
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
          />
          <TextField
            ref={emailRef}
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
            placeholder="At least 6 characters"
            hint="At least 6 characters."
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button
            label="Create account"
            size="lg"
            loading={submitting}
            onPress={submit}
            style={styles.submit}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <AppText tone="muted">Already have an account?</AppText>
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => router.replace('/sign-in')}
        >
          <AppText variant="bodyStrong" tone="primary">
            Sign in
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
  submit: { marginTop: space.sm },
  footer: {
    marginTop: 'auto',
    paddingTop: space.xxl,
    alignItems: 'center',
    gap: space.xs,
  },
});
