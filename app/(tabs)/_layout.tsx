import { Tabs } from "expo-router";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { type ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";
import { useChaletScope } from "@/lib/chalet-scope";
import { useWorkspaceAccess } from "@/lib/workspace-access";

type TabIconName = ComponentProps<typeof IconSymbol>["name"];

function GlassTabIcon({ name, color, focused, size }: { name: TabIconName; color: string; focused: boolean; size: number }) {
  return <View style={[styles.tabIconWrap, focused && [styles.activeIconHalo, { backgroundColor: color + "14", shadowColor: color }]]}><IconSymbol name={name} size={size} color={color} />{focused ? <View style={[styles.activeDot, { backgroundColor: color, shadowColor: color }]} /> : null}</View>;
}

export default function TabLayout() {
  const colors = useColors();
  const { can } = useWorkspaceAccess();
  const { selectedChalet } = useChaletScope();
  const insets = useSafeAreaInsets();
  const { direction } = useAppPreferences();
  const { t } = useI18n();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  const isDark = colors.background === "#070B10";
  const accent = selectedChalet?.color ?? colors.primary;
  return <Tabs initialRouteName="index" screenOptions={{ headerShown: false, freezeOnBlur: false, sceneStyle: { backgroundColor: colors.background }, tabBarActiveTintColor: accent, tabBarInactiveTintColor: colors.muted, tabBarActiveBackgroundColor: "transparent", tabBarBackground: () => <View pointerEvents="none" style={styles.tabBackground}>{Platform.OS !== "android" ? <BlurView intensity={18} tint={isDark ? "dark" : "light"} style={styles.tabBlur} /> : null}<View style={[styles.tabMaterial, { backgroundColor: isDark ? "rgba(10, 14, 24, 0.86)" : "rgba(255,255,255,0.92)" }]} /><LinearGradient colors={["rgba(255,255,255,0.035)", isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.06)", "rgba(255,255,255,0.035)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tabRim} /></View>, tabBarStyle: { position: "relative", backgroundColor: "transparent", borderTopWidth: 0, height: 60 + bottomPadding, marginHorizontal: 12, marginBottom: bottomPadding, paddingTop: 6, paddingBottom: 6, paddingHorizontal: 4, borderRadius: 26, overflow: Platform.OS === "android" ? "visible" : "hidden", elevation: Platform.OS === "android" ? 2 : 7, shadowColor: "#000000", shadowOpacity: Platform.OS === "android" ? 0 : 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, direction }, tabBarItemStyle: { minHeight: 50, borderRadius: 18, marginHorizontal: 2 }, tabBarLabelStyle: { fontSize: 10, fontWeight: "800", letterSpacing: 0.1 } }}>
    <Tabs.Screen name="index" options={{ title: t("home"), tabBarIcon: ({ color, focused }) => <GlassTabIcon name="house.fill" size={23} color={color} focused={focused} /> }} />
    <Tabs.Screen name="calendar" options={{ title: t("calendar"), tabBarIcon: ({ color, focused }) => <GlassTabIcon name="event" size={23} color={color} focused={focused} /> }} />
    <Tabs.Screen name="crm" options={{ title: t("crm"), tabBarIcon: ({ color, focused }) => <GlassTabIcon name="group" size={23} color={color} focused={focused} /> }} />
    <Tabs.Screen name="bookings" options={{ title: t("bookings"), tabBarIcon: ({ color, focused }) => <GlassTabIcon name="calendar" size={23} color={color} focused={focused} /> }} />
    <Tabs.Screen name="reports" options={{ title: t("reports"), href: can("view_financial_reports") ? undefined : null, tabBarIcon: ({ color, focused }) => <GlassTabIcon name="bar-chart" size={23} color={color} focused={focused} /> }} />
    <Tabs.Screen name="more" options={{ title: t("more"), tabBarIcon: ({ color, focused }) => <GlassTabIcon name="more" size={25} color={color} focused={focused} /> }} />
    <Tabs.Screen name="settings" options={{ href: null }} />
    <Tabs.Screen name="waitlist" options={{ href: null }} />
  </Tabs>;
}

const styles = StyleSheet.create({
  tabBackground: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: 26, backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.11)", borderTopColor: "rgba(255, 255, 255, 0.16)" },
  tabBlur: { ...StyleSheet.absoluteFillObject },
  tabMaterial: { ...StyleSheet.absoluteFillObject },
  tabRim: { position: "absolute", top: 0, left: 18, right: 18, height: 1, backgroundColor: "rgba(255, 255, 255, 0.06)" },
  tabIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  activeIconHalo: { shadowColor: "#FF6B47", shadowOpacity: 0.28, shadowRadius: 14, elevation: 6 },
  activeDot: { position: "absolute", width: 5, height: 5, borderRadius: 2.5, bottom: -2.5, shadowColor: "#FF6B47", shadowOpacity: 0.85, shadowRadius: 6, elevation: 4 },
});
