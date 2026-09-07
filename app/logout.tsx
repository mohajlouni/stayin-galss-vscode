import { router } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Auth from "@/lib/_core/auth";

/**
 * Reliable forced local sign-out. Opens `/logout` in any device browser to wipe
 * the client session (token + user) from secure storage regardless of the
 * stored session's server validity — it never depends on the tRPC logout or on
 * a server that the stale session may fail to reach. Redirects to the login
 * screen immediately after clearing.
 */
export default function ForceLogoutRoute() {
  const colors = useColors();

  useEffect(() => {
    let active = true;
    (async () => {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      if (active) router.replace("/auth/login");
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ScreenContainer>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.copy, { color: colors.muted }]}>جارٍ تسجيل الخروج…</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  copy: { fontSize: 13, fontWeight: "800", textAlign: "center" },
});