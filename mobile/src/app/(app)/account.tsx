import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  changePassword as changePasswordRequest,
  checkHandle,
  removeAvatar as removeAvatarRequest,
  updateProfile,
  uploadAvatar,
  type ProfileChanges,
} from '@/api/account';
import { useSession } from '@/auth/SessionProvider';
import { ChatRecoverySettings } from '@/components/ChatRecovery';
import {
  DEFAULT_PASSWORD_POLICY,
  passwordProblem,
} from '@/lib/passwordPolicy';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import {
  AppText,
  Avatar,
  Button,
  Card,
  InlineError,
  PasswordStrength,
  Screen,
  TextField,
} from '@/ui';

const NAME_MAX = 40;
const BIO_MAX = 280;
const HANDLE_SHAPE = /^[a-z0-9_]{3,24}$/;
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function BackRow() {
  const { palette } = useTheme();

  return (
    <View style={styles.topRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={({ pressed }) => [
          styles.back,
          { backgroundColor: palette.muted, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="chevron-back" size={18} color={palette.foreground} />
      </Pressable>
      <AppText variant="wordmark" tone="primary">
        waytowalk
      </AppText>
    </View>
  );
}

export default function AccountScreen() {
  const { palette } = useTheme();
  const { user, updateUser } = useSession();

  const currentName = user?.name ?? '';
  const currentHandle = user?.handle ?? '';
  const currentBio = user?.bio ?? '';
  const avatarUrl = user?.avatarUrl;

  const [name, setName] = useState(currentName);
  const [handle, setHandle] = useState(currentHandle ? `@${currentHandle}` : '');
  const [bio, setBio] = useState(currentBio);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNote, setPasswordNote] = useState<string | null>(null);

  const [debouncedHandle, setDebouncedHandle] = useState(currentHandle);

  const nextName = normalizeText(name);
  const nextBio = normalizeText(bio);
  const nextHandle = normalizeHandle(handle);

  const nameChanged = nextName !== currentName;
  const handleChanged = nextHandle !== currentHandle;
  const bioChanged = nextBio !== currentBio;
  const dirty = nameChanged || handleChanged || bioChanged;

  const handleShapeValid = HANDLE_SHAPE.test(nextHandle);
  const handleClearing = handleChanged && nextHandle.length === 0;
  const handleSettled = debouncedHandle === nextHandle;

  // Availability lives on the server; the debounced value keeps a fast typist
  // from asking about every prefix of a half-typed handle.
  const handleLookup = useQuery({
    queryKey: ['handle-check', debouncedHandle],
    queryFn: () => checkHandle(debouncedHandle),
    enabled: handleChanged && handleShapeValid && handleSettled,
    staleTime: 60_000,
    retry: 1,
  });

  const checkingHandle =
    handleChanged && handleShapeValid && (!handleSettled || handleLookup.isFetching);
  const handleCheck = handleSettled && handleShapeValid ? handleLookup.data : undefined;
  const handleReady =
    !handleChanged ||
    handleClearing ||
    (handleCheck?.handle === nextHandle && handleCheck.available === true);

  useEffect(() => {
    if (handleSettled) return;
    const timer = setTimeout(() => setDebouncedHandle(nextHandle), 450);
    return () => clearTimeout(timer);
  }, [nextHandle, handleSettled]);

  const handleError = !handleChanged || handleClearing
    ? undefined
    : !handleShapeValid
      ? 'Usernames are 3–24 characters: lowercase letters, numbers and underscores.'
      : handleCheck && !handleCheck.available
        ? handleCheck.reason === 'reserved'
          ? 'That username is kept for the app itself. Try another.'
          : handleCheck.reason === 'taken'
            ? `Someone already travels as @${nextHandle}. Try another.`
            : 'That username won’t work. Try another.'
        : handleLookup.isError && handleSettled
          ? 'We couldn’t check that username just now. Give it a moment and try again.'
          : undefined;

  const handleHint = !handleChanged
    ? 'This is how other travellers find you.'
    : handleClearing
      ? 'Leave it blank to drop your username — only possible while none of your trips are published.'
      : !handleShapeValid
        ? 'Lowercase letters, numbers and underscores.'
        : checkingHandle
          ? `Checking whether @${nextHandle} is free…`
          : handleCheck?.available
            ? `Good news — @${nextHandle} is free.`
            : undefined;

  const editName = (value: string) => {
    setSavedNote(null);
    setName(value);
  };
  const editHandle = (value: string) => {
    setSavedNote(null);
    setHandle(value);
  };
  const editBio = (value: string) => {
    setSavedNote(null);
    setBio(value);
  };

  async function saveProfile() {
    if (saving || !dirty || !handleReady) return;
    setSaving(true);
    setProfileError(null);
    setSavedNote(null);

    const changes: ProfileChanges = {};
    if (nameChanged) changes.name = nextName;
    if (handleChanged) changes.handle = nextHandle;
    if (bioChanged) changes.bio = nextBio;

    try {
      const saved = await updateProfile(changes);
      updateUser(saved);
      setName(saved.name ?? '');
      setHandle(saved.handle ? `@${saved.handle}` : '');
      setBio(saved.bio ?? '');
      setSavedNote('Saved. Your profile is up to date.');
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'That didn’t save. Give it another try.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function pickPhoto() {
    if (photoBusy) return;
    setPhotoError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPhotoError('Photo access is off. Turn it on in your device settings to choose a picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > PHOTO_MAX_BYTES) {
      setPhotoError('That photo is over 2 MB. Pick a smaller one and try again.');
      return;
    }

    setPhotoBusy(true);
    try {
      const saved = await uploadAvatar({
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
        file: asset.file,
      });
      updateUser(saved);
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : 'That photo didn’t upload. Try another one.'
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  async function dropPhoto() {
    if (photoBusy) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      updateUser(await removeAvatarRequest());
    } catch (error) {
      setPhotoError(
        error instanceof Error ? error.message : 'The photo didn’t come off. Try again.'
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submitPassword() {
    if (passwordBusy || !passwordReady) return;
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordNote(null);
    try {
      await changePasswordRequest(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNote('Password updated. Other devices have been signed out.');
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : 'That didn’t go through. Give it another try.'
      );
    } finally {
      setPasswordBusy(false);
    }
  }

  const displayName = nextName || user?.label || user?.email || 'Traveller';
  const passwordIssue = newPassword
    ? passwordProblem(newPassword, DEFAULT_PASSWORD_POLICY, {
        email: user?.email,
        name: user?.name,
      })
    : null;
  const passwordErrorField = passwordIssue ?? undefined;
  const confirmError =
    confirmPassword && confirmPassword !== newPassword ? 'Those two don’t match yet.' : undefined;
  const passwordReady =
    currentPassword.length > 0 &&
    !passwordIssue &&
    newPassword !== currentPassword &&
    confirmPassword === newPassword;

  return (
    <Screen scroll avoidKeyboard edges={['top', 'bottom']} contentContainerStyle={styles.content}>
      <BackRow />

      <View style={styles.page}>
        <View style={styles.intro}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.eyebrowTick, { backgroundColor: palette.accent }]} />
            <AppText variant="caption" tone="muted" style={styles.eyebrow}>
              YOUR ACCOUNT
            </AppText>
          </View>
          <AppText variant="display">The person behind the plans</AppText>
          <AppText tone="muted">
            Your name and photo travel with you on shared trips. Nothing here changes until you
            save it.
          </AppText>
        </View>

        <Card style={styles.photoCard}>
          <View style={styles.photoRow}>
            <Avatar name={displayName} size={72} uri={avatarUrl} />
            <View style={styles.photoText}>
              <AppText variant="bodyStrong">Profile photo</AppText>
              <AppText variant="caption" tone="muted">
                JPG, PNG or WebP, up to 2 MB. Square photos look best.
              </AppText>
              <View style={styles.photoActions}>
                <Button
                  label={avatarUrl ? 'Change photo' : 'Add a photo'}
                  size="sm"
                  variant="secondary"
                  loading={photoBusy}
                  onPress={pickPhoto}
                />
                {avatarUrl ? (
                  <Button
                    label="Remove"
                    size="sm"
                    variant="ghost"
                    disabled={photoBusy}
                    onPress={dropPhoto}
                  />
                ) : null}
              </View>
            </View>
          </View>
          <InlineError message={photoError} />
        </Card>

        <Card style={styles.formCard}>
          <TextField
            label="Name"
            value={name}
            onChangeText={editName}
            placeholder="What should people call you?"
            maxLength={NAME_MAX}
            autoCapitalize="words"
          />
          <TextField
            label="Username"
            value={handle}
            onChangeText={editHandle}
            placeholder="@yourname"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={25}
            error={handleError}
            hint={handleHint}
          />
          <View>
            <TextField
              label="Bio"
              value={bio}
              onChangeText={editBio}
              placeholder="A line about how you travel."
              multiline
              maxLength={BIO_MAX}
              style={styles.bioInput}
            />
            <AppText variant="caption" tone="muted" style={styles.counter}>
              {BIO_MAX - bio.length} characters left
            </AppText>
          </View>

          <InlineError message={profileError} />
          {savedNote ? (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={16} color={palette.primary} />
              <AppText variant="caption" tone="primary" style={styles.savedText}>
                {savedNote}
              </AppText>
            </View>
          ) : null}

          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            size="lg"
            loading={saving}
            disabled={!dirty || !handleReady}
            onPress={saveProfile}
          />
          <AppText variant="caption" tone="muted" style={styles.saveNote}>
            {!dirty
              ? 'Everything is up to date.'
              : !handleReady
                ? 'Pick a free username before saving.'
                : 'Saves to your account right away.'}
          </AppText>
        </Card>

        <Card style={styles.passwordCard}>
          <View style={styles.cardHead}>
            <View style={[styles.headIcon, { backgroundColor: palette.muted }]}>
              <Ionicons name="lock-closed-outline" size={17} color={palette.primary} />
            </View>
            <View style={styles.headText}>
              <AppText variant="heading">Sign-in &amp; password</AppText>
              <AppText variant="caption" tone="muted">
                Change the key to your account.
              </AppText>
            </View>
          </View>

          <TextField
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
          />
          <TextField
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={DEFAULT_PASSWORD_POLICY.maxLength}
            error={passwordErrorField}
          />
          <PasswordStrength value={newPassword} email={user?.email} name={user?.name} />
          <TextField
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            maxLength={DEFAULT_PASSWORD_POLICY.maxLength}
            error={confirmError}
          />

          <InlineError message={passwordError} />
          {passwordNote ? (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={16} color={palette.primary} />
              <AppText variant="caption" tone="primary" style={styles.savedText}>
                {passwordNote}
              </AppText>
            </View>
          ) : null}

          <Button
            label={passwordBusy ? 'Updating…' : 'Update password'}
            variant="secondary"
            loading={passwordBusy}
            disabled={!passwordReady}
            onPress={submitPassword}
          />
          <AppText variant="caption" tone="muted" style={styles.saveNote}>
            Changing your password signs out your other devices.
          </AppText>
        </Card>

        <ChatRecoverySettings key={user?._id} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.sm, paddingBottom: space.xxxl },
  page: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: space.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.lg },
  back: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { letterSpacing: -0.4 },
  intro: { gap: space.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowTick: { width: 12, height: 2, borderRadius: radius.pill },
  eyebrow: { letterSpacing: 1.1, fontSize: 11 },
  photoCard: { gap: space.md },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  photoText: { flex: 1, gap: 4 },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: 4 },
  formCard: { gap: space.lg },
  bioInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: 12 },
  counter: { marginTop: 6, textAlign: 'right' },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  savedText: { flex: 1 },
  saveNote: { textAlign: 'center' },
  passwordCard: { gap: space.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: 2 },
});
