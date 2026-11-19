import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { resetPasswordWithToken } from '@/api/passwordReset';
import { AuthNotice, AuthShell } from '@/components/auth/AuthShell';
import {
  DEFAULT_PASSWORD_POLICY,
  passwordProblem,
} from '@/lib/passwordPolicy';
import { space } from '@/theme/tokens';
import { AppText, Button, InlineError, PasswordStrength, TextField } from '@/ui';

type FieldErrors = {
  password?: string;
  confirm?: string;
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((previous) =>
      previous[field] ? { ...previous, [field]: undefined } : previous
    );
  }

  async function submit() {
    if (submitting || !token) return;

    const nextErrors: FieldErrors = {};
    if (!password) {
      nextErrors.password = 'Choose a new password.';
    } else {
      const problem = passwordProblem(password);
      if (problem) nextErrors.password = problem;
    }
    if (!confirm) {
      nextErrors.confirm = 'Re-enter your password to confirm it.';
    } else if (password !== confirm) {
      nextErrors.confirm = 'The two passwords do not match.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setError(null);
      setFieldErrors(nextErrors);
      requestAnimationFrame(() => {
        if (nextErrors.password) passwordRef.current?.focus();
        else confirmRef.current?.focus();
      });
      return;
    }

    Keyboard.dismiss();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await resetPasswordWithToken(token, password);
      setPassword('');
      setConfirm('');
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
          : 'Make it something you’ll remember. This link works once and expires after an hour.'
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
          Sign in with your new password to continue. If you enabled chat backup, have your saved recovery code ready. Resetting your password does not erase backups, but it locks their password access.
        </AuthNotice>
      ) : (
        <>
          <InlineError message={error} />
          <TextField
            ref={passwordRef}
            label="New password"
            filled
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              clearFieldError('password');
            }}
            placeholder="Choose a password"
            error={fieldErrors.password}
            maxLength={DEFAULT_PASSWORD_POLICY.maxLength}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <PasswordStrength value={password} />
          <TextField
            ref={confirmRef}
            label="Confirm new password"
            filled
            value={confirm}
            onChangeText={(value) => {
              setConfirm(value);
              clearFieldError('confirm');
            }}
            placeholder="Type it once more"
            error={fieldErrors.confirm}
            maxLength={DEFAULT_PASSWORD_POLICY.maxLength}
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
            variant="primary"
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
