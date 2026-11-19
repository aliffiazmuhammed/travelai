import { useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { requestPasswordReset } from '@/api/passwordReset';
import { AuthNotice, AuthShell } from '@/components/auth/AuthShell';
import { space } from '@/theme/tokens';
import { AppText, Button, InlineError, TextField } from '@/ui';

const EMAIL = /^\S+@\S+\.\S+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit() {
    if (submitting) return;

    const trimmed = email.trim();
    const problem = !trimmed
      ? 'Enter your email address.'
      : !EMAIL.test(trimmed)
        ? 'That email address looks incomplete.'
        : null;

    if (problem) {
      setError(null);
      setFieldError(problem);
      requestAnimationFrame(() => emailRef.current?.focus());
      return;
    }

    Keyboard.dismiss();
    setError(null);
    setFieldError(null);
    setSubmitting(true);
    try {
      const result = await requestPasswordReset(trimmed);
      setSent(result.message);
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

  const backToSignIn = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  };

  return (
    <AuthShell
      title="Let’s get you back in."
      subtitle="Tell us the email you signed up with and we’ll send a link to set a new password. The link stays good for an hour."
      onBack={backToSignIn}
    >
      {sent ? (
        <AuthNotice
          icon="mail-outline"
          title="Check your inbox"
          action={<Button label="Back to sign in" variant="ghost" onPress={backToSignIn} />}
        >
          {sent}
        </AuthNotice>
      ) : (
        <>
          <InlineError message={error} />
          <TextField
            ref={emailRef}
            label="Email"
            filled
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              if (fieldError) setFieldError(null);
              if (error) setError(null);
            }}
            placeholder="you@example.com"
            error={fieldError ?? undefined}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Button
            label="Send reset link"
            size="lg"
            variant="primary"
            loading={submitting}
            onPress={submit}
            style={styles.submit}
          />
          <Pressable accessibilityRole="link" hitSlop={8} onPress={backToSignIn}>
            <AppText variant="label" tone="muted" style={styles.back}>
              Back to sign in
            </AppText>
          </Pressable>
        </>
      )}
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  submit: { marginTop: space.sm },
  back: { textAlign: 'center' },
});
