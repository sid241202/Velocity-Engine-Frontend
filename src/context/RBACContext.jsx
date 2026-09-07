import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ME_ENDPOINT } from '../config/appConfig';
import { getAuthHeaders } from '../services/apiClient';

const RBACContext = createContext(null);

/**
 * RBACProvider — fetches the current user's roles and permissions from
 * GET /me once at mount, and exposes them via useRBAC() to the rest of the
 * app.
 *
 * Fails CLOSED: if /me cannot be reached or returns an error, permissions
 * resolve to an empty set (every hasPermission check returns false) rather
 * than defaulting to full access. This mirrors the backend's own posture in
 * internal/services/rbac.go — the frontend gating is a UX convenience on top
 * of that, never a substitute for it, so it should fail the same direction.
 */
export function RBACProvider({ children }) {
  const [state, setState] = useState({
    userId: null,
    roles: [],
    permissions: new Set(),
    ledTeamIds: [],
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
        ledTeamIds: data.led_team_ids || [],
        loading: false,
        error: '',
      });
    } catch (e) {
      console.error('RBAC: failed to load /me — defaulting to no permissions', e);
      setState({
        userId: null,
        roles: [],
        permissions: new Set(),
        ledTeamIds: [],
        loading: false,
        error: e.message || 'Unable to verify permissions',
      });
    }
  }, []);

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

  // canAccessAdminPanel: full iam:manage (SUPER_ADMIN today) OR leads at
  // least one team. Not a resource:action permission string on purpose —
  // "which team(s) you lead" is scoped data, not a flat boolean, so it
  // can't be expressed through hasPermission the way every other gate in
  // this app is. See src/components/AdminPanel/AdminPanel.jsx.
  const canAccessAdminPanel = state.permissions.has('iam:manage') || state.ledTeamIds.length > 0;
  const isSuperAdmin = state.permissions.has('iam:manage');

  const value = useMemo(
    () => ({
      ...state,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      canAccessAdminPanel,
      isSuperAdmin,
      refetch: fetchMe,
    }),
    [state, hasPermission, hasAnyPermission, hasAllPermissions, canAccessAdminPanel, isSuperAdmin, fetchMe]
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
