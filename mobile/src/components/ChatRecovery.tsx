import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { keyBackup } from '@/auth/chatKeyBackup';
import { backUpReadableHistory, type BackfillProgress } from '@/auth/chatKeyBackfill';
import { useSession } from '@/auth/SessionProvider';
import type { BackupDraft, BackupSnapshot, BackupStatus } from '@/lib/keyBackupSession';
import { radius, space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText, Button, Card, InlineError, Sheet, TextField } from '@/ui';

const descriptions: Record<BackupStatus, string> = {
  idle: 'Sign in to check chat backup.',
  loading: 'Checking your chat backup…',
  disabled: 'Chat backups are not enabled. Keep a device that can still read your history.',
  locked: 'Your account is signed in. Unlock chat backup separately to restore saved history.',
  unlocking: 'Unlocking chat backup securely. This can take a moment…',
  ready: 'Backup is unlocked. Readable keys are backed up as you open each trip; unvisited history is not yet confirmed.',
  recoveryNeeded: 'Your password was reset. Use your saved recovery code or this device’s saved backup key to restore access.',
  error: 'Chat backup could not be checked. Your account and any readable device chats still work.',
};

export function ChatRecoverySheet({ onClose }: { onClose: () => void }) {
  const snapshot = useSyncExternalStore(keyBackup.subscribe, keyBackup.getSnapshot);
  const { palette } = useTheme();
  const [draft, setDraft] = useState<BackupDraft | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const alive = useRef(true);
  const pendingDraft = useRef<BackupDraft | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pendingDraft.current?.key.fill(0);
      if (pendingDraft.current) pendingDraft.current.code = '';
    };
  }, []);

  function prepare(useCode: boolean) {
    setError(null);
    setNote(null);
    try {
      const next = keyBackup.prepare(useCode ? code : undefined);
      pendingDraft.current?.key.fill(0);
      pendingDraft.current = next;
      setDraft(next);
      setCode('');
      setPassword('');
      setAcknowledged(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Recovery could not be opened. Try again.');
    }
  }

  async function submit() {
    if (busy || !password || (draft && !acknowledged)) return;
    const enteredPassword = password;
    setPassword('');
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      if (draft) {
        await keyBackup.save(draft, enteredPassword);
        if (!alive.current) return;
        pendingDraft.current?.key.fill(0);
        pendingDraft.current = null;
        setDraft(null);
        setNote('Recovery saved. Your new code is active. Open your trips to back up the history this device can read.');
      } else {
        await keyBackup.unlock(enteredPassword);
        if (!alive.current) return;
        if (keyBackup.getSnapshot().status === 'ready') setNote('Chat backup is unlocked on this device.');
      }
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : 'Nothing was confirmed. Check your connection and try again.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function copyCode() {
    if (!draft) return;
    try {
      const copied = await Clipboard.setStringAsync(draft.code);
      if (alive.current) setNote(copied ? 'Copied. Save it somewhere private before continuing.' : 'Copy was unavailable. Select and copy the code instead.');
    } catch {
      if (alive.current) setError('Copy was unavailable. Select and copy the code instead.');
    }
  }

  const loading = busy || snapshot.status === 'loading' || snapshot.status === 'unlocking';
  const canUnlock = !draft && snapshot.metadata?.enrolled && snapshot.metadata.password && snapshot.status !== 'ready';
  const canRecover = !draft && snapshot.metadata?.enrolled;

  return (
    <Sheet
      visible
      avoidKeyboard
      title={draft ? 'Save your recovery code' : 'Keep your trip conversations'}
      subtitle={draft ? 'Shown only now. Save it somewhere private.' : 'Password-assisted chat backup'}
      onClose={() => { if (!busy) onClose(); }}
      footer={draft || canUnlock ? (
        <Button
          label={loading ? 'Working securely…' : draft ? 'I saved it · activate backup' : 'Unlock chat backup'}
          loading={loading}
          disabled={!password || (!!draft && !acknowledged)}
          onPress={() => void submit()}
          style={styles.flex}
        />
      ) : undefined}
    >
      <AppText tone="muted">{descriptions[snapshot.status]}</AppText>
      <InlineError message={error || snapshot.error} />
      {note ? <AppText tone="primary" accessibilityLiveRegion="polite">{note}</AppText> : null}
      {loading ? <AppText variant="caption" accessibilityLiveRegion="polite">Deriving and verifying keys. You can keep using your account when this finishes.</AppText> : null}
      {draft ? (
        <>
          <View style={[styles.code, { backgroundColor: palette.muted }]}>
            <AppText selectable variant="bodyStrong">{draft.code}</AppText>
          </View>
          <Button label="Copy recovery code" variant="secondary" onPress={() => void copyCode()} disabled={busy} />
          <AppText variant="caption" tone="muted">
            Anyone with this code and your backup can open saved trip keys. We never send the code to the server. After recovery, this replacement opens the current backup; an old code with a copied old backup can still work.
          </AppText>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledged, disabled: busy }}
            disabled={busy}
            onPress={() => setAcknowledged((value) => !value)}
            style={styles.checkbox}
          >
            <Ionicons name={acknowledged ? 'checkbox' : 'square-outline'} size={24} color={palette.primary} />
            <AppText style={styles.flex}>I saved this recovery code somewhere safe.</AppText>
          </Pressable>
          <TextField label="Current account password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!busy} />
          <AppText variant="caption" tone="muted">Enter it again to activate backup. The code is not active until the save succeeds.</AppText>
        </>
      ) : (
        <>
          {!snapshot.metadata?.enrolled && snapshot.status === 'disabled' ? (
            <>
              <AppText>
                Back up readable trip keys so a new phone can open saved history after password sign-in. History must first be backed up by a device that can read it. Web-only history needs the upcoming web migration.
              </AppText>
              <AppText variant="caption" tone="muted">
                This is not zero-knowledge recovery: our sign-in server receives your password. A compromised server could unlock backups, and stolen backups allow offline password guessing. Choose a strong, unique password.
              </AppText>
              <Button label="Set up chat backup" onPress={() => prepare(false)} />
              <Button label="Not now · backups stay off" variant="ghost" onPress={onClose} />
            </>
          ) : null}
          {canUnlock ? <TextField label="Account password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" editable={!loading} /> : null}
          {canRecover ? (
            <>
              {snapshot.status !== 'ready' ? <TextField label="Saved recovery code" value={code} onChangeText={setCode} placeholder="WTK1-…" autoCapitalize="none" autoCorrect={false} autoComplete="off" secureTextEntry editable={!loading} /> : null}
              {snapshot.status !== 'ready' ? <Button label="Use recovery code" variant="secondary" disabled={!code || loading} onPress={() => prepare(true)} /> : null}
              {snapshot.status === 'ready' || snapshot.status === 'recoveryNeeded' ? <Button label={snapshot.status === 'ready' ? 'Replace recovery code' : 'Try this device’s saved key'} variant="secondary" disabled={loading} onPress={() => prepare(false)} /> : null}
              <AppText variant="caption" tone="muted">Without a matching saved code or backup key, unavailable history cannot be recovered. Existing device chats may still work. Nothing will be erased or replaced automatically.</AppText>
            </>
          ) : null}
          {snapshot.status === 'error' || snapshot.status === 'locked' ? <Button label="Retry backup check" variant="ghost" disabled={loading} onPress={() => void keyBackup.refresh()} /> : null}
        </>
      )}
    </Sheet>
  );
}

const emptyProgress: BackfillProgress = { trips: 0, saved: 0, alreadySaved: 0, unavailable: 0, failedTrips: 0, finished: false };

export function ChatRecoverySettings() {
  const snapshot = useSyncExternalStore(keyBackup.subscribe, keyBackup.getSnapshot);
  // A new account session must start with fresh backfill progress; remounting
  // the card does that without resetting state inside an effect.
  return <RecoverySettings key={`${snapshot.userId ?? 'signed-out'}:${snapshot.sessionId ?? 0}`} snapshot={snapshot} />;
}

function RecoverySettings({ snapshot }: { snapshot: BackupSnapshot }) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<BackfillProgress>(emptyProgress);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const run = useRef(0);
  useEffect(() => () => { run.current += 1; }, []);

  async function backfill() {
    if (!snapshot.userId || backfillBusy) return;
    const ticket = ++run.current;
    setBackfillBusy(true);
    setBackfillError(null);
    try {
      await backUpReadableHistory(snapshot.userId, progress.finished ? emptyProgress : progress,
        () => run.current === ticket,
        (next) => { if (run.current === ticket) setProgress(next); });
    } catch (cause) {
      if (run.current === ticket) setBackfillError(cause instanceof Error ? cause.message : 'History backup paused. Try again.');
    } finally {
      if (run.current === ticket) setBackfillBusy(false);
    }
  }

  return (
    <Card style={styles.card}>
      <AppText variant="heading">Chat backup & recovery</AppText>
      <AppText tone="muted">{descriptions[snapshot.status]}</AppText>
      <Button label={snapshot.status === 'ready' ? 'Recovery settings' : 'Open chat recovery'} variant="secondary" onPress={() => setOpen(true)} />
      {snapshot.status === 'ready' ? (
        <>
          <Button label={backfillBusy ? 'Backing up readable history…' : progress.afterTripId && !progress.finished ? 'Continue history backup' : 'Back up readable history'} variant="ghost" loading={backfillBusy} onPress={() => void backfill()} />
          {backfillBusy ? <Button label="Pause backup" variant="ghost" onPress={() => { run.current += 1; setBackfillBusy(false); }} /> : null}
          {progress.trips > 0 || progress.finished ? <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {progress.trips} trips visited · {progress.saved} keys saved · {progress.alreadySaved} already saved · {progress.unavailable} unreadable epochs · {progress.failedTrips} trips no longer accessible.{progress.finished ? ' Reached the end of the accessible trip list. Unreadable history is not backed up.' : ' Unvisited history is not yet checked.'}
          </AppText> : null}
          <AppText variant="caption" tone="muted">Only history this device can open is migrated. Keep old devices available until their history has been backed up.</AppText>
        </>
      ) : null}
      <InlineError message={backfillError} />
      {open ? <ChatRecoverySheet key={`${snapshot.userId}:${snapshot.sessionId}`} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function SessionPrompt() {
  const snapshot = useSyncExternalStore(keyBackup.subscribe, keyBackup.getSnapshot);
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  const actionable = ['disabled', 'locked', 'recoveryNeeded', 'error'].includes(snapshot.status);
  if (dismissed || pathname === '/account' || !actionable) return null;
  return <ChatRecoverySheet onClose={() => setDismissed(true)} />;
}

export function ChatRecoveryPrompt() {
  const { user, status } = useSession();
  return status === 'signedIn' && user ? <SessionPrompt key={user._id} /> : null;
}

const styles = StyleSheet.create({
  card: { gap: space.md },
  code: { padding: space.lg, borderRadius: radius.lg },
  checkbox: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm },
  flex: { flex: 1 },
});
