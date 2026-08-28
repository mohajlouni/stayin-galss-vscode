import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";

type UseAuthOptions = {
  autoFetch?: boolean;
};

export function useAuth(options?: UseAuthOptions) {
  const { autoFetch = true } = options ?? {};
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (Platform.OS === "web") {
        const apiUser = await Api.getMe();
        if (!apiUser) {
          setUser(null);
          await Auth.clearUserInfo();
          return;
        }

        const userInfo: Auth.User = {
          id: apiUser.id,
          openId: apiUser.openId,
          name: apiUser.name,
          email: apiUser.email,
          phone: apiUser.phone ?? null,
          avatarUrl: apiUser.avatarUrl ?? null,
          loginMethod: apiUser.loginMethod,
          lastSignedIn: new Date(apiUser.lastSignedIn),
        };
        setUser(userInfo);
        await Auth.setUserInfo(userInfo);
        return;
      }

      const sessionToken = await Auth.getSessionToken();
      setUser(sessionToken ? await Auth.getUserInfo() : null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Failed to restore authentication"));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    // End the UI session first so navigation never waits on a remote cookie request.
    setUser(null);
    setError(null);
    void Api.logout().catch(() => {
      // The device must still be able to clear its local session while offline.
    });
    try {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
    } catch {
      // Navigation must not be blocked if secure local storage is temporarily unavailable.
    }
  }, []);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  useEffect(() => {
    if (autoFetch) void fetchUser();
    else setLoading(false);
  }, [autoFetch, fetchUser]);

  return { user, loading, error, isAuthenticated, refresh: fetchUser, logout };
}
