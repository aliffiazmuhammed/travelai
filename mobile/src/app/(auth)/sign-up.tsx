import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, StyleSheet, TextInput } from 'react-native';

import { ApiError } from '@/api/client';
import { getAuthConfig } from '@/api/authConfig';
import { useSession } from '@/auth/SessionProvider';
import { AuthFooter, AuthShell } from '@/components/auth/AuthShell';
import { ConsentFields } from '@/components/auth/ConsentFields';
import { DEFAULT_LEGAL_CONFIG, type LegalConfig } from '@/lib/legal';
import {
  DEFAULT_PASSWORD_POLICY,
  passwordProblem,
  type PasswordPolicy,
} from '@/lib/passwordPolicy';
import { space } from '@/theme/tokens';
import { Button, InlineError, PasswordStrength, TextField } from '@/ui';

const EMAIL = /^\S+@\S+\.\S+$/;

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

export default function SignUpScreen() {
  const { signUp } = useSession();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string | string[] }>();
  const next = Array.isArray(params.next) ? params.next[0] : params.next;
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const emailRef = useRef<ComponentRef<typeof TextInput>>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [legal, setLegal] = useState<LegalConfig>(DEFAULT_LEGAL_CONFIG);
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy>(
    DEFAULT_PASSWORD_POLICY
  );
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [consentError, setConsentError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getAuthConfig()
      .then((config) => {
        if (active) {
          setLegal(config.legal);
          setPasswordPolicy(config.password);
        }
      })
      .catch(() => {
        // Keep the bundled defaults; the server rejects a stale pair with a
        // clear message rather than recording consent to unseen copy.
      });
    return () => {
      active = false;
    };
  }, []);

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((previous) =>
      previous[field] ? { ...previous, [field]: undefined } : previous
    );
  }

  async function submit() {
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const nextErrors: FieldErrors = {};

    if (trimmedName.length > 40) {
      nextErrors.name = 'Keep your name under 40 characters.';
    }
    if (!trimmedEmail) {
      nextErrors.email = 'Enter your email address.';
    } else if (!EMAIL.test(trimmedEmail)) {
      nextErrors.email = 'That email address looks incomplete.';
    }
    if (!password) {
      nextErrors.password = 'Choose a password.';
    } else {
      const problem = passwordProblem(password, passwordPolicy, {
        email: trimmedEmail,
        name: trimmedName,
      });
      if (problem) nextErrors.password = problem;
    }

    if (Object.keys(nextErrors).length > 0) {
      setError(null);
      setFieldErrors(nextErrors);
      // Focus after the errors render, so the field announces its message. The
      // shell's ScrollView brings the focused field into view on both platforms.
      requestAnimationFrame(() => {
        if (nextErrors.name) nameRef.current?.focus();
        else if (nextErrors.email) emailRef.current?.focus();
        else passwordRef.current?.focus();
      });
      return;
    }

    if (!acceptedLegal) {
      setError(null);
      setFieldErrors({});
      return setConsentError('Please accept the Terms and Privacy Policy to create an account.');
    }

    Keyboard.dismiss();
    setError(null);
    setConsentError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await signUp(
        {
          email: trimmedEmail,
          password,
          ...(trimmedName ? { name: trimmedName } : {}),
          consent: {
            termsVersion: legal.termsVersion,
            privacyVersion: legal.privacyVersion,
            marketingOptIn,
          },
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
        ref={nameRef}
        label="Name"
        filled
        value={name}
        onChangeText={(value) => {
          setName(value);
          clearFieldError('name');
        }}
        placeholder="Mira Chen"
        hint="Optional — people see this on your trips."
        error={fieldErrors.name}
        maxLength={40}
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
        onChangeText={(value) => {
          setEmail(value);
          clearFieldError('email');
        }}
        placeholder="you@example.com"
        error={fieldErrors.email}
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
        onChangeText={(value) => {
          setPassword(value);
          clearFieldError('password');
        }}
        placeholder="Choose a password"
        error={fieldErrors.password}
        maxLength={passwordPolicy.maxLength}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <PasswordStrength
        value={password}
        policy={passwordPolicy}
        email={email}
        name={name}
      />
      <ConsentFields
        legal={legal}
        accepted={acceptedLegal}
        marketingOptIn={marketingOptIn}
        onAcceptedChange={(accepted) => {
          setAcceptedLegal(accepted);
          if (accepted) setConsentError(null);
        }}
        onMarketingChange={setMarketingOptIn}
        error={consentError}
      />
      <Button
        label="Create account"
        size="lg"
        variant="primary"
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
