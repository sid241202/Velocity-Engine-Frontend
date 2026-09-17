import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import authService from '../services/AuthService';

const AuthContext = createContext(null);

/**
 * AuthProvider — single source of truth for "is there a valid WSO2 session
 * right now". Replaces what used to be two independent probes (Landing's
 * own checkAuthentication() and ProtectedRoute's own checkAuth()) that ran
 * on different components at different times and could disagree with each
 * other mid-flight.
 *
 * status: 'checking' (initial session probe in flight) | 'authenticated' |
 * 'unauthenticated'. Callback.jsx calls markAuthenticated() directly right
 * after a successful token exchange so the rest of the app picks up the new
 * session on the same client-side render pass — no hard page reload needed
 * to make a fresh probe see it.
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('checking');
  const bootStartRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());

  const checkAuth = useCallback(async () => {
    try {
      const authed = await authService.isAuthenticated();
      setStatus(authed ? 'authenticated' : 'unauthenticated');
    } catch (err) {
      console.error('AuthProvider: session check failed, treating as unauthenticated', err);
      setStatus('unauthenticated');
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const markAuthenticated = useCallback(() => setStatus('authenticated'), []);
  const markUnauthenticated = useCallback(() => setStatus('unauthenticated'), []);

  const value = useMemo(
    () => ({
      status,
      markAuthenticated,
      markUnauthenticated,
      recheck: checkAuth,
      bootStart: bootStartRef.current,
    }),
    [status, markAuthenticated, markUnauthenticated, checkAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** useAuth — read the current session status ('checking' | 'authenticated' | 'unauthenticated'). */
// eslint-disable-next-line react-refresh/only-export-components -- intentional: hook co-located with its provider
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
