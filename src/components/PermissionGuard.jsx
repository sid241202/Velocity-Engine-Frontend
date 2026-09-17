import RequirePermission from './RequirePermission';
import AccessDenied from './AccessDenied';
import PanelLoading from './PanelLoading';
import { useRBAC } from '../context/RBACContext';

/**
 * PermissionGuard — route/page-level RBAC gate. Same permission logic as
 * RequirePermission, but defaults the fallback to a full Access Denied
 * panel instead of rendering nothing: silently hiding an entire page a
 * user landed on (e.g. via a stale link or programmatic navigation) would
 * look like a bug, not a permissions boundary.
 *
 * Explicitly distinguishes "still loading" from "actually denied": while
 * the RBAC permission set is loading, RequirePermission fails closed (as it
 * should — never show something before you know it's allowed), but that
 * looks identical to a genuine denial unless this checks `loading` itself.
 * Without this, any RBAC refetch would flash Access Denied at a user who
 * turns out to have the permission a moment later.
 *
 * This app is tab-based (see pages/Dashboard.jsx) rather than routed per
 * page, so "route guard" here means wrapping each tab-panel's content —
 * the same component works unchanged if any tab is later promoted to a
 * real react-router route.
 */
export default function PermissionGuard({ permission, anyOf, allOf, label, children }) {
  const { loading } = useRBAC();

  if (loading) {
    return <PanelLoading label={`Checking access to ${label || 'this section'}…`} />;
  }

  return (
    <RequirePermission
      permission={permission}
      anyOf={anyOf}
      allOf={allOf}
      fallback={<AccessDenied label={label} />}
    >
      {children}
    </RequirePermission>
  );
}
