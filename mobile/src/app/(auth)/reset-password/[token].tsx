import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { resetPasswordWithToken } from '@/api/passwordReset';
import { AuthNotice, AuthShell } from '@/components/auth/AuthShell';
import { space } from '@/theme/tokens';
import { AppText, Button, InlineError, TextField } from '@/ui';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    if (submitting || !token) return;
    if (password.length < 6) return setError('Use at least 6 characters for your password.');
    if (password !== confirm) return setError('The two passwords do not match.');

    Keyboard.dismiss();
    setError(null);
    setSubmitting(true);
    try {
      await resetPasswordWithToken(token, password);
      setDone(true);
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
    <AuthShell
      title={done ? 'You’re all set.' : 'Choose a new password.'}
      subtitle={
        done
          ? 'Your password has changed. Sign in with the new one and pick up where you left off.'
          : 'Make it something you’ll remember. At least six characters.'
      }
    >
      {!token ? (
        <AuthNotice
          icon="alert-circle-outline"
          title="This reset link is incomplete"
          action={
            <Button
              label="Request a new link"
              variant="ghost"
              onPress={() => router.replace('/forgot-password')}
            />
          }
        >
          Ask for a fresh link and open it from the same device.
        </AuthNotice>
      ) : done ? (
        <AuthNotice
          icon="checkmark-circle-outline"
          title="Password updated"
          action={
            <Button label="Sign in" variant="accent" onPress={() => router.replace('/sign-in')} />
          }
        >
          Sign in with your new password to continue.
        </AuthNotice>
      ) : (
        <>
          <InlineError message={error} />
          <TextField
            label="New password"
            filled
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <TextField
            ref={confirmRef}
            label="Confirm new password"
            filled
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Type it once more"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button
            label="Save new password"
            size="lg"
            variant="accent"
            loading={submitting}
            onPress={submit}
            style={styles.submit}
          />
          <Pressable
            accessibilityRole="link"
            hitSlop={8}
            onPress={() => router.replace('/forgot-password')}
          >
            <AppText variant="label" tone="muted" style={styles.back}>
              Request a new link
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
