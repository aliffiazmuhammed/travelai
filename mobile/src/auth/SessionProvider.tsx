import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  getMe,
  signOut as apiSignOut,
  signin as apiSignin,
  signup as apiSignup,
  type SessionUser,
} from '@/api/auth';
import { ApiError, setUnauthorizedHandler } from '@/api/client';
import { clearSessionToken, getSessionToken, setSessionToken } from '@/auth/tokenStorage';
import { keyBackup } from '@/auth/chatKeyBackup';
import { queryClient } from '@/query/client';

export type SessionStatus = 'loading' | 'signedIn' | 'signedOut';

interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  /** True when the server rejected a stored token, so sign-in can say why. */
  sessionExpired: boolean;
  /** Where the auth layout sends a fresh session (an invite or reset link). */
  nextRoute: string | null;
  signIn: (email: string, password: string, nextRoute?: string) => Promise<void>;
  signUp: (
    input: { email: string; password: string; name?: string },
    nextRoute?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  /** Apply the server's projection after the owner edits their own profile. */
  updateUser: (next: SessionUser) => void;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [expired, setExpired] = useState(false);
  const [nextRoute, setNextRoute] = useState<string | null>(null);
  const sessionSequence = useRef(0);

  useEffect(() => {
    let active = true;
    const ticket = ++sessionSequence.current;

    // A token can expire between launches; the API client reports that here so
    // the app returns to sign-in instead of showing errors on every screen.
    setUnauthorizedHandler(() => {
      sessionSequence.current += 1;
      void keyBackup.end().catch(() => {});
      clearSessionToken().catch(() => {});
      queryClient.clear();
      setUser(null);
      setStatus('signedOut');
      setExpired(true);
    });

    (async () => {
      try {
        const token = await getSessionToken();
        if (!token) {
          if (active && ticket === sessionSequence.current) setStatus('signedOut');
          return;
        }

        const me = await getMe();
        if (!active || ticket !== sessionSequence.current) return;
        setUser(me);
        setStatus('signedIn');
        void keyBackup.begin(me._id, token).catch(() => {});
      } catch (error) {
        if (!active || ticket !== sessionSequence.current) return;
        // A rejected token is worthless; a network failure is not, so keep it
        // for the next launch and just fall back to the sign-in screen.
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          await clearSessionToken().catch(() => {});
        }
        if (active) {
          setUser(null);
          setStatus('signedOut');
        }
      }
    })();

    return () => {
      active = false;
      setUnauthorizedHandler(null);
    };
  }, []);

  const acceptSession = useCallback(async (
    response: { user: SessionUser; token: string },
    ticket: number,
    password: string,
    next?: string,
  ) => {
    if (!await setSessionToken(response.token, () => ticket === sessionSequence.current)) return;
    if (ticket !== sessionSequence.current) return;
    queryClient.clear();
    setExpired(false);
    setNextRoute(next && next.startsWith('/') ? next : null);
    setUser(response.user);
    setStatus('signedIn');
    void keyBackup.begin(response.user._id, response.token, password).catch(() => {});
  }, []);

  const signIn = useCallback(async (email: string, password: string, next?: string) => {
    const ticket = ++sessionSequence.current;
    await keyBackup.end().catch(() => {});
    const response = await apiSignin(email, password);
    await acceptSession(response, ticket, password, next);
  }, [acceptSession]);

  const signUp = useCallback(
    async (input: { email: string; password: string; name?: string }, next?: string) => {
      const ticket = ++sessionSequence.current;
      await keyBackup.end().catch(() => {});
      const response = await apiSignup(input.email, input.password, input.name);
      await acceptSession(response, ticket, input.password, next);
    },
    [acceptSession]
  );

  const signOut = useCallback(async () => {
    sessionSequence.current += 1;
    const cleanup = keyBackup.end();
    const tokenCleanup = apiSignOut();
    queryClient.clear();
    setExpired(false);
    setNextRoute(null);
    setUser(null);
    setStatus('signedOut');
    // Signing out is already complete in memory; a storage failure must not
    // surface as a rejected action in the UI.
    await Promise.allSettled([cleanup, tokenCleanup]);
  }, []);

  const updateUser = useCallback((next: SessionUser) => {
    setUser((previous) => previous?._id === next._id ? next : previous);
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      sessionExpired: expired,
      nextRoute,
      signIn,
      signUp,
      signOut,
      updateUser,
    }),
    [status, user, expired, nextRoute, signIn, signUp, signOut, updateUser]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return value;
}
