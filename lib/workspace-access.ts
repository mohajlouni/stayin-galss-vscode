import { useAuth } from "@/hooks/use-auth";
import { useAuthSession } from "@/lib/auth-session";
import { trpc } from "@/lib/trpc";
import { EMPLOYEE_PERMISSIONS, GUEST_PERMISSIONS, MANAGER_PERMISSIONS, normalizeWorkspacePermissions, type PermissionKey } from "@/shared/workspace-permissions";

export function useWorkspaceAccess() {
  const { currentUser, isAuthenticated, loading, refresh } = useAuthSession();
  const workspace = trpc.workspace.me.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const role = workspace.data?.member?.role ?? null;
  const isManager = isAuthenticated && (role === "owner" || role === "admin");
  const isStaff = isAuthenticated && role === "staff";
  const permissions = !isAuthenticated
    ? GUEST_PERMISSIONS
    : isManager
      ? MANAGER_PERMISSIONS
      : normalizeWorkspacePermissions(workspace.data?.member?.permissions ?? EMPLOYEE_PERMISSIONS, role === "guest" ? "guest" : "employee");

  return {
    user: currentUser ? { ...currentUser, name: currentUser.fullName } : null,
    loading: loading || (isAuthenticated && workspace.isLoading),
    isAuthenticated,
    role,
    activeWorkspaceId: workspace.data?.workspace?.id ?? null,
    isOwner: role === "owner",
    isManager,
    isEmployee: isStaff,
    isStaff,
    isGuest: role === "guest",
    permissions,
    can: (permission: PermissionKey) => isManager || permissions[permission],
    refresh,
    refetchWorkspace: workspace.refetch,
  };
}
