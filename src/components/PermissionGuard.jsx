import RequirePermission from './RequirePermission';
import AccessDenied from './AccessDenied';

/**
 * PermissionGuard — route/page-level RBAC gate. Same permission logic as
 * RequirePermission, but defaults the fallback to a full Access Denied
 * panel instead of rendering nothing: silently hiding an entire page a
 * user landed on (e.g. via a stale link or programmatic navigation) would
 * look like a bug, not a permissions boundary.
 *
 * This app is tab-based (see pages/Dashboard.jsx) rather than routed per
 * page, so "route guard" here means wrapping each tab-panel's content —
 * the same component works unchanged if any tab is later promoted to a
 * real react-router route.
 */
export default function PermissionGuard({ permission, anyOf, allOf, label, children }) {
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
