import React, { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRBAC } from '../context/RBACContext';
import SessionLoading from '../components/SessionLoading';

/**
 * ProtectedRoute — the single gate for /dashboard. Waits on BOTH the auth
 * session (AuthContext) and the RBAC permission fetch that depends on it
 * (RBACContext) before rendering anything real, showing one branded loading
 * transition the whole time instead of letting Dashboard/PermissionGuard
 * mount early and render a wrong-looking intermediate state (e.g. Access
 * Denied while permissions are still in flight).
 */
const ProtectedRoute = ({ children }) => {
  const { status, bootStart } = useAuth();
  const { loading: rbacLoading } = useRBAC();
  const loggedReadyRef = useRef(false);

  const ready = status === 'authenticated' && !rbacLoading;

  useEffect(() => {
    if (ready && !loggedReadyRef.current) {
      loggedReadyRef.current = true;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      console.info(`[auth-bootstrap] session + permissions ready in ${Math.round(now - bootStart)}ms`);
    }
  }, [ready, bootStart]);

  if (status === 'checking' || (status === 'authenticated' && rbacLoading)) {
    return <SessionLoading message="Verifying secure access..." />;
  }

  if (status !== 'authenticated') {
    return <Navigate to="/" replace />;
  }

  return children;
};

export default ProtectedRoute;
