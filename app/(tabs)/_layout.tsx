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
  return <View style={[styles.tabIconWrap, focused && [styles.activeIconHalo, { backgroundColor: color + "1A", shadowColor: color }]]}><IconSymbol name={name} size={size} color={color} />{focused ? <View style={[styles.activeDot, { backgroundColor: color, shadowColor: color }]} /> : null}</View>;
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
  return <Tabs initialRouteName="index" screenOptions={{ headerShown: false, freezeOnBlur: false, sceneStyle: { backgroundColor: colors.background }, tabBarActiveTintColor: accent, tabBarInactiveTintColor: colors.muted, tabBarActiveBackgroundColor: "transparent", tabBarBackground: () => <View pointerEvents="none" style={styles.tabBackground}>{Platform.OS !== "android" ? <BlurView intensity={18} tint={isDark ? "dark" : "light"} style={styles.tabBlur} /> : null}<View style={[styles.tabMaterial, { backgroundColor: isDark ? "rgba(9, 12, 20, 0.82)" : "rgba(255,255,255,0.90)" }]} /><LinearGradient colors={["rgba(255,255,255,0.03)", isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.08)", "rgba(255,255,255,0.03)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tabRim} /></View>, tabBarStyle: { position: "relative", backgroundColor: "transparent", borderTopWidth: 0, height: 60 + bottomPadding, marginHorizontal: 12, marginBottom: bottomPadding, paddingTop: 7, paddingBottom: 7, paddingHorizontal: 4, borderRadius: 26, overflow: Platform.OS === "android" ? "visible" : "hidden", elevation: Platform.OS === "android" ? 2 : 6, shadowColor: "#000000", shadowOpacity: Platform.OS === "android" ? 0 : 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, direction }, tabBarItemStyle: { minHeight: 50, borderRadius: 18, marginHorizontal: 2 }, tabBarLabelStyle: { fontSize: 10.5, fontWeight: "800" } }}>
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
  tabBackground: { ...StyleSheet.absoluteFillObject, overflow: "hidden", borderRadius: 26, backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.12)", borderTopColor: "rgba(255, 255, 255, 0.2)" },
  tabBlur: { ...StyleSheet.absoluteFillObject },
  tabMaterial: { ...StyleSheet.absoluteFillObject },
  tabRim: { position: "absolute", top: 0, left: 16, right: 16, height: 1.4, backgroundColor: "rgba(255, 255, 255, 0.08)" },
  tabIconWrap: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  activeIconHalo: { shadowColor: "#FF6B47", shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  activeDot: { position: "absolute", width: 5, height: 5, borderRadius: 2.5, bottom: -2, shadowColor: "#FF6B47", shadowOpacity: 0.95, shadowRadius: 8, elevation: 4 },
});
