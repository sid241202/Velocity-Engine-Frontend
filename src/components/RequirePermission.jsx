import { useRBAC } from '../context/RBACContext';

/**
 * RequirePermission — component-level RBAC gate for buttons, graphs, and
 * analysis panels. This is a UX convenience only: the backend independently
 * re-verifies every permission-gated action (see
 * internal/middleware/auth.go RequirePermission on the backend) and is the
 * real security boundary. Hiding/disabling here just keeps the UI honest
 * about what the current role can actually do.
 *
 * Two usage styles:
 *
 *   1) Hide/replace (children is a node) — renders `fallback` (default:
 *      nothing) when the permission check fails:
 *        <RequirePermission permission={PERMISSIONS.RULES_DELETE}>
 *          <button onClick={deleteRule}>Delete</button>
 *        </RequirePermission>
 *
 *   2) Disable-in-place (children is a render function) — always renders,
 *      but hands the caller an `allowed` boolean so it can disable a
 *      control and show a tooltip instead of removing it from the layout:
 *        <RequirePermission permission={PERMISSIONS.RULES_PUBLISH}>
 *          {(allowed) => (
 *            <button disabled={!allowed} title={!allowed ? 'Requires rules:publish' : undefined}>
 *              Publish
 *            </button>
 *          )}
 *        </RequirePermission>
 *
 * Pass exactly one of `permission` (single key), `anyOf` (array, OR), or
 * `allOf` (array, AND). While the permission set is still loading, or if
 * none of the three props is given, the check fails closed (not allowed).
 */
export default function RequirePermission({ permission, anyOf, allOf, fallback = null, children }) {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading } = useRBAC();

  const allowed = !loading && (
    permission ? hasPermission(permission)
    : anyOf ? hasAnyPermission(anyOf)
    : allOf ? hasAllPermissions(allOf)
    : false
  );

  if (typeof children === 'function') {
    return children(allowed);
  }
  return allowed ? children : fallback;
}
