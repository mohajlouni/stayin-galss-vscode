import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { usePathname, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { RipplePressable } from "@/components/ripple-pressable";
import { useColors } from "@/hooks/use-colors";
import { useDemoMode } from "@/lib/demo-mode";
import { useGlobalFeatureFlags } from "@/lib/feature-flags";
import { FEATURE_ROUTE_GUARD_MAP } from "@/shared/feature-flags";

/** يمنع الوصول المباشر لأي شاشة تم تعطيل ميزتها من مركز التحكم في الميزات. */
export function FeatureRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const colors = useColors();
  const { isDemo } = useDemoMode();
  const global = useGlobalFeatureFlags();

  const blockedKey = pathname
    ? FEATURE_ROUTE_GUARD_MAP[pathname] ?? Object.entries(FEATURE_ROUTE_GUARD_MAP).find(([route]) => pathname.startsWith(`${route}/`))?.[1]
    : undefined;
  const blocked = !isDemo && !!blockedKey && global[blockedKey] === false;

  if (!blocked) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: colors.background }]}>
      <View style={[styles.card, { borderColor: colors.error }]}>
        <View style={[styles.iconWrap, { backgroundColor: `${colors.error}22` }]}>
          <MaterialIcons name="do-not-disturb" size={40} color={colors.error} />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>هذه الميزة غير متاحة حالياً</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>تم تعطيل هذه الشاشة من مركز التحكم في الميزات. راجع مالك المنشأة أو الإدارة العليا لتفعيلها.</Text>
        <RipplePressable
          accessibilityRole="button"
          accessibilityLabel="العودة للرئيسية"
          rippleColor="#FFFFFF3D"
          onPress={() => router.replace("/(tabs)")}
          style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 }]}
        >
          <MaterialIcons name="home" size={18} color="#FFFFFF" />
          <Text style={styles.buttonLabel}>العودة للرئيسية</Text>
        </RipplePressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { alignSelf: "stretch", borderRadius: 26, borderWidth: 1.5, padding: 26, alignItems: "center", gap: 14, maxWidth: 420 },
  iconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  hint: { fontSize: 13, textAlign: "center", lineHeight: 20 },
  button: { minHeight: 48, borderRadius: 16, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 },
  buttonLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
});