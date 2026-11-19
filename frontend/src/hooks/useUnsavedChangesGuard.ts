import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface UnsavedChangesGuard {
  /** A navigation is waiting for a decision. */
  blocked: boolean;
  /** Where the pending navigation would go. */
  target: string | null;
  saving: boolean;
  error: string | null;
  /** Keep the current page and cancel the pending navigation. */
  stay: () => void;
  /** Throw the edits away and continue to the pending destination. */
  discard: () => void;
  /** Persist the editor, then continue; stays put when the save fails. */
  saveAndLeave: () => Promise<void>;
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * Route + refresh guard for editor surfaces.
 *
 * The app uses `<BrowserRouter>` rather than a data router, so React Router's
 * `useBlocker` is unavailable. This listens in the capture phase for internal
 * links, restores the current URL after back/forward, and leaves the native
 * `beforeunload` prompt to the browser. `onSave` is optional; without it the
 * dialog offers only Stay and Discard.
 */
export function useUnsavedChangesGuard(
  when: boolean,
  onSave?: () => Promise<boolean>
): UnsavedChangesGuard {
  const navigate = useNavigate();
  const location = useLocation();
  const [target, setTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const whenRef = useRef(when);
  whenRef.current = when;
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const targetRef = useRef(target);
  targetRef.current = target;
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!when) {
      setTarget(null);
      setError(null);
    }
  }, [when]);

  useEffect(() => {
    if (!when) return;

    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!anchor) return;
      if (anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) {
        return;
      }
      const url = new URL(anchor.getAttribute('href') || '', window.location.href);
      if (url.origin !== window.location.origin) return;
      const next = `${url.pathname}${url.search}${url.hash}`;
      if (next === currentPath()) return;
      event.preventDefault();
      event.stopPropagation();
      setError(null);
      setTarget(next);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [when]);

  useEffect(() => {
    if (!when) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers need a truthy string to show the prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  useEffect(() => {
    const onPopState = () => {
      if (!whenRef.current || targetRef.current) return;
      const next = currentPath();
      const here = `${locationRef.current.pathname}${locationRef.current.search}${locationRef.current.hash}`;
      if (next === here) return;
      // Browser back/forward has already moved; put the address bar back and
      // ask before completing the navigation.
      navigate(here, { replace: true });
      setError(null);
      setTarget(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigate]);

  const stay = () => {
    setTarget(null);
    setError(null);
  };

  const discard = () => {
    const destination = targetRef.current;
    setTarget(null);
    setError(null);
    if (destination) navigate(destination);
  };

  const saveAndLeave = async () => {
    const destination = targetRef.current;
    if (!destination || saving) return;
    if (!saveRef.current) {
      discard();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveRef.current();
      if (!saved) {
        setError('We could not save your changes. Stay here to fix the problem or discard them.');
        return;
      }
      setTarget(null);
      navigate(destination);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'We could not save your changes. Stay here to fix the problem or discard them.'
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    blocked: target !== null,
    target,
    saving,
    error,
    stay,
    discard,
    saveAndLeave,
  };
}
