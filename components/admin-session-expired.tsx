import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import * as Auth from "@/lib/_core/auth";

/**
 * Shown when an admin screen's server call fails with `UNAUTHORIZED` — the
 * stored session token is stale, unverifiable, or intentionally bypassed
 * (e.g. the offline local bridge). Instead of a dead-end "locked" card that
 * never recovers, the user is sent back to a fresh server login.
 */
export function AdminSessionExpired() {
  const colors = useColors();

  useEffect(() => {
    void Auth.removeSessionToken();
    void Auth.clearUserInfo();
  }, []);

  return (
    <ScreenContainer>
      <View style={styles.center}>
        <MaterialIcons name="lock-clock" size={38} color={colors.warning} />
        <Text style={[styles.title, { color: colors.foreground }]}>انتهت صلاحية الجلسة أو لم تُتحقق من الخادم</Text>
        <Text style={[styles.text, { color: colors.muted }]}>أعد تسجيل الدخول لفتح أدوات الإدارة العليا.</Text>
        <Pressable onPress={() => router.replace("/auth/login")} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={styles.whiteText}>العودة إلى تسجيل الدخول</Text></Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  title: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  text: { fontSize: 13, lineHeight: 20, textAlign: "center" },
  button: { minHeight: 46, paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  whiteText: { color: "#FFFFFF", fontWeight: "900" },
});