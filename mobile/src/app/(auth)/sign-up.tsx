import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { useSession } from '@/auth/SessionProvider';
import { AuthFooter, AuthShell } from '@/components/auth/AuthShell';
import { space } from '@/theme/tokens';
import { Button, InlineError, TextField } from '@/ui';

const EMAIL = /^\S+@\S+\.\S+$/;

export default function SignUpScreen() {
  const { signUp } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
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
      await signUp(
        {
          email: trimmedEmail,
          password,
          ...(trimmedName ? { name: trimmedName } : {}),
        },
        next
      );
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

  function openSignIn() {
    router.replace({ pathname: '/sign-in', params: next ? { next } : {} });
  }

  return (
    <AuthShell
      title="Make yourself at home."
      subtitle="One account for the trips you join, the trips you plan and the people you meet along the way."
      footer={
        <AuthFooter prompt="Already have an account?" action="Sign in" onPress={openSignIn} />
      }
    >
      <InlineError message={error} />
      <TextField
        label="Name"
        filled
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
        variant="accent"
        loading={submitting}
        onPress={submit}
        style={styles.submit}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: space.sm },
});
