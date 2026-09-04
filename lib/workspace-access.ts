import { useAuth } from "@/hooks/use-auth";
import { useAuthSession } from "@/lib/auth-session";
import { trpc } from "@/lib/trpc";
import { EMPLOYEE_PERMISSIONS, GUEST_PERMISSIONS, MANAGER_PERMISSIONS, STAFF_PERMISSIONS, CARETAKER_PERMISSIONS, normalizeWorkspacePermissions, type PermissionKey } from "@/shared/workspace-permissions";

export const SUPER_ADMIN_EMAIL = "moh.ajlouni.90@gmail.com";

const SUPER_ADMIN_PHONE_DIGITS = new Set(["797402940", "962797402940"]);

function toPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  const arabicToLatin: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  };
  const digits = Array.from(phone)
    .map((character) => arabicToLatin[character] ?? character)
    .join("")
    .replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

function isSuperAdminPhone(phone: string | null | undefined): boolean {
  const digits = toPhoneDigits(phone);
  return !!digits && SUPER_ADMIN_PHONE_DIGITS.has(digits);
}

export function useWorkspaceAccess() {
  const { currentUser, isAuthenticated, loading, refresh } = useAuthSession();
  const auth = useAuth();
  const user = auth.user;
  const workspace = trpc.workspace.me.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const role = workspace.data?.member?.role ?? null;
  const isManager = isAuthenticated && (role === "owner" || role === "admin");
  const isStaff = isAuthenticated && role === "staff";
  const isCaretaker = isAuthenticated && role === "caretaker";
  const isSuperAdmin = Boolean(
    user?.isSuperAdmin ||
    user?.role === "super_admin" ||
    user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL ||
    currentUser?.email?.toLowerCase() === SUPER_ADMIN_EMAIL ||
    isSuperAdminPhone(user?.phone) ||
    isSuperAdminPhone(currentUser?.phone),
  );
  const permissions = !isAuthenticated
    ? GUEST_PERMISSIONS
    : isManager
      ? MANAGER_PERMISSIONS
      : isStaff
        ? STAFF_PERMISSIONS
        : isCaretaker
          ? CARETAKER_PERMISSIONS
          : normalizeWorkspacePermissions(workspace.data?.member?.permissions ?? EMPLOYEE_PERMISSIONS, role === "guest" ? "guest" : "employee");

  return {
    user: currentUser ? { ...currentUser, name: currentUser.fullName } : null,
    loading: loading || (isAuthenticated && workspace.isLoading),
    isAuthenticated,
    role,
    isSuperAdmin,
    activeWorkspaceId: workspace.data?.workspace?.id ?? null,
    isOwner: role === "owner",
    isManager,
    isEmployee: isStaff,
    isStaff,
    isCaretaker,
    isGuest: role === "guest",
    permissions,
    can: (permission: PermissionKey) => isManager || permissions[permission],
    refresh,
    refetchWorkspace: workspace.refetch,
  };
}
