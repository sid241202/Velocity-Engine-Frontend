import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ME_ENDPOINT } from '../config/appConfig';
import { getAuthHeaders } from '../services/apiClient';
import { useAuth } from './AuthContext';

const RBACContext = createContext(null);

/**
 * RBACProvider — fetches the current user's roles and permissions from
 * GET /me, and exposes them via useRBAC() to the rest of the app.
 *
 * Keyed off AuthContext's status rather than firing at mount unconditionally:
 * fetching /me before a session exists (e.g. while a login is still mid
 * token-exchange on /callback) would always 401 and resolve to "no
 * permissions" before the real permission set is even knowable, which is
 * exactly the kind of premature partial state this app should never show.
 * `loading` stays true for the whole 'checking'/'authenticated'-pending
 * window, so callers (ProtectedRoute) can gate the real UI on it.
 *
 * Fails CLOSED: if /me cannot be reached or returns an error, permissions
 * resolve to an empty set (every hasPermission check returns false) rather
 * than defaulting to full access. This mirrors the backend's own posture in
 * internal/services/rbac.go — the frontend gating is a UX convenience on top
 * of that, never a substitute for it, so it should fail the same direction.
 */
export function RBACProvider({ children }) {
  const { status: authStatus } = useAuth();
  const [state, setState] = useState({
    userId: null,
    roles: [],
    permissions: new Set(),
    loading: true,
    error: '',
  });

  const fetchMe = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const res = await fetch(ME_ENDPOINT, {
        headers: await getAuthHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Authorization check failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      setState({
        userId: data.user_id,
        roles: data.roles || [],
        permissions: new Set(data.permissions || []),
        loading: false,
        error: '',
      });
    } catch (e) {
      console.error('RBAC: failed to load /me — defaulting to no permissions', e);
      setState({
        userId: null,
        roles: [],
        permissions: new Set(),
        loading: false,
        error: e.message || 'Unable to verify permissions',
      });
    }
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchMe();
    } else if (authStatus === 'unauthenticated') {
      // No session to check permissions for — resolve immediately to an
      // empty, non-error set rather than firing a /me call that can only 401.
      setState({ userId: null, roles: [], permissions: new Set(), loading: false, error: '' });
    }
    // authStatus === 'checking': leave loading: true, nothing to fetch yet.
  }, [authStatus, fetchMe]);

  const hasPermission = useCallback((permission) => state.permissions.has(permission), [state.permissions]);
  const hasAnyPermission = useCallback(
    (perms) => perms.some((p) => state.permissions.has(p)),
    [state.permissions]
  );
  const hasAllPermissions = useCallback(
    (perms) => perms.every((p) => state.permissions.has(p)),
    [state.permissions]
  );

  const value = useMemo(
    () => ({
      ...state,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refetch: fetchMe,
    }),
    [state, hasPermission, hasAnyPermission, hasAllPermissions, fetchMe]
  );

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>;
}

/** useRBAC — read the current user's roles/permissions and check helpers. */
// eslint-disable-next-line react-refresh/only-export-components -- intentional: hook co-located with its provider
export function useRBAC() {
  const ctx = useContext(RBACContext);
  if (!ctx) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return ctx;
}
