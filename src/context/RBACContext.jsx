import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  ME_ENDPOINT,
  AUTH_DEBUG_USER_ID_STORAGE_KEY,
  AUTH_DEBUG_DEFAULT_USER_ID,
} from '../config/appConfig';
import { getAuthHeaders } from '../services/apiClient';

const RBACContext = createContext(null);

function readStoredDebugUserId() {
  if (typeof window === 'undefined') return AUTH_DEBUG_DEFAULT_USER_ID;
  return window.localStorage.getItem(AUTH_DEBUG_USER_ID_STORAGE_KEY) || AUTH_DEBUG_DEFAULT_USER_ID;
}

/**
 * RBACProvider — fetches the current user's roles and permissions from
 * GET /me once at mount (and whenever the debug identity changes), and
 * exposes them via useRBAC() to the rest of the app.
 *
 * Fails CLOSED: if /me cannot be reached or returns an error, permissions
 * resolve to an empty set (every hasPermission check returns false) rather
 * than defaulting to full access. This mirrors the backend's own posture in
 * internal/services/rbac.go — the frontend gating is a UX convenience on top
 * of that, never a substitute for it, so it should fail the same direction.
 */
export function RBACProvider({ children }) {
  const [debugUserId, setDebugUserIdState] = useState(readStoredDebugUserId);
  const [state, setState] = useState({
    userId: null,
    roles: [],
    permissions: new Set(),
    loading: true,
    error: '',
  });

  const setDebugUserId = useCallback((id) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_DEBUG_USER_ID_STORAGE_KEY, id);
    }
    setDebugUserIdState(id);
  }, []);

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
  }, [debugUserId]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

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
      debugUserId,
      setDebugUserId,
    }),
    [state, hasPermission, hasAnyPermission, hasAllPermissions, fetchMe, debugUserId, setDebugUserId]
  );

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>;
}

/** useRBAC — read the current user's roles/permissions and check helpers. */
export function useRBAC() {
  const ctx = useContext(RBACContext);
  if (!ctx) {
    throw new Error('useRBAC must be used within an RBACProvider');
  }
  return ctx;
}
