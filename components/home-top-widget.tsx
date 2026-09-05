import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";

import { BentoGlassCard } from "@/components/bento-glass-card";
import { ChaletWeatherWidget } from "@/components/chalet-weather-widget";
import { LunarPhasePanel } from "@/components/lunar-phase-panel";
import { useColors } from "@/hooks/use-colors";
import { APP_BRAND_NAME } from "@/lib/brand";
import { weekdayLabel } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useChaletScope } from "@/lib/chalet-scope";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";
import { useGlobalFeatureFlags } from "@/lib/feature-flags";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type HomeTopWidgetProps = {
  logoUrl?: string;
  unreadCount: number;
  onNewBooking: () => void;
  onNotifications: () => void;
};

export function HomeTopWidget({ logoUrl, unreadCount, onNewBooking, onNotifications }: HomeTopWidgetProps) {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { formatDate, formatTime, deviceSettings } = useAppPreferences();
  const { chalets } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const [clock, setClock] = useState(() => Date.now());
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const scopedChalet = selectedChaletId ? chalets.find((item) => item.id === selectedChaletId) ?? chalets[0] : chalets[0];
  const nearWater = scopedChalet?.nearWater === true;
  const dateKey = `${new Date(clock).getFullYear()}-${String(new Date(clock).getMonth() + 1).padStart(2, "0")}-${String(new Date(clock).getDate()).padStart(2, "0")}`;
  const time = `${String(new Date(clock).getHours()).padStart(2, "0")}:${String(new Date(clock).getMinutes()).padStart(2, "0")}`;
  const dateTime = `${weekdayLabel(dateKey, language)}، ${formatDate(dateKey)} · ${formatTime(time)}`;

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const globalFlags = useGlobalFeatureFlags();
  const showWeather = globalFlags.feat_automation_weather;
  const showLunar = deviceSettings.showLunarPhase && globalFlags.feat_lunar_calendar;
  const hasTiles = showWeather || showLunar;
  const [collapsed, setCollapsed] = useState(false);
  const [rendered, setRendered] = useState(hasTiles);
  const height = useRef(new Animated.Value(hasTiles && !collapsed ? 1 : 0)).current;

  useEffect(() => {
    if (!hasTiles) { setRendered(false); setCollapsed(false); return; }
    height.setValue(collapsed ? 0 : 1);
    if (!collapsed) setRendered(true);
    Animated.timing(height, {
      toValue: collapsed ? 0 : 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => { if (finished && collapsed) setRendered(false); });
  }, [collapsed, hasTiles, height]);

  const accent = colors.primary;

  return (
    <BentoGlassCard radius={24} elevated accentColor={accent} contentStyle={styles.containerContent}>
      <View style={[styles.headerRow, { flexDirection: row }]}>
        <View style={[styles.avatar, { backgroundColor: accent + "12", borderWidth: 1, borderColor: accent + "1A" }]}>{logoUrl ? <Image source={{ uri: logoUrl }} contentFit="cover" cachePolicy="memory-disk" transition={180} style={styles.avatarImage} accessibilityLabel="Business logo" /> : <Image source={require("../assets/images/stayin-logo.jpg")} contentFit="cover" transition={180} style={styles.avatarImage} accessibilityLabel="StayIn logo" />}</View>
        <View style={styles.titleBlock}>
          <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 19, fontWeight: "900", letterSpacing: 0.2, textAlign: align }}>{APP_BRAND_NAME}</Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 11.5, fontWeight: "700", marginTop: 3, textAlign: align, writingDirection: language === "ar" ? "rtl" : "ltr" }}>{dateTime}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "حجز جديد" : "New booking"} onPress={onNewBooking} style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pressed ? 0.72 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}><MaterialIcons name="add" size={19} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }}>{language === "ar" ? "حجز جديد" : "New booking"}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "مركز الإشعارات" : "Notification center"} onPress={onNotifications} style={({ pressed }) => [styles.bellButton, { borderColor: unreadCount > 0 ? colors.warning + "70" : colors.border, backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}><MaterialIcons name="notifications" size={19} color={unreadCount > 0 ? colors.warning : colors.muted} />{unreadCount > 0 ? <View style={[styles.bellBadge, { backgroundColor: colors.warning }]}><Text style={{ color: "#13181D", fontSize: 9, fontWeight: "900" }}>{unreadCount > 9 ? "9+" : unreadCount}</Text></View> : null}</Pressable>
      </View>

      {hasTiles ? <>
        <Pressable accessibilityRole="button" accessibilityLabel={collapsed ? (language === "ar" ? "إظهار الطقس والقمر" : "Show weather & moon") : (language === "ar" ? "إخفاء الطقس والقمر" : "Hide weather & moon")} onPress={() => setCollapsed((current) => !current)} style={({ pressed }) => [styles.collapseHandle, { flexDirection: row, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name={collapsed ? "keyboard-arrow-down" : "keyboard-arrow-up"} size={18} color={colors.muted} /><Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, fontWeight: "800", textAlign: align }}>{collapsed ? (language === "ar" ? "إظهار الطقس والقمر" : "Show weather & moon") : (language === "ar" ? "إخفاء الطقس والقمر" : "Hide weather & moon")}</Text><View style={styles.flex} /></Pressable>
        <Animated.View style={[styles.collapseBody, { opacity: height, transform: [{ scaleY: height }] }]}>
          {rendered ? <>
            {showWeather ? <View style={styles.tile}><ChaletWeatherWidget compact /></View> : null}
            {showLunar ? <View style={styles.tile}><LunarPhasePanel compact nearWater={nearWater} /></View> : null}
          </> : null}
        </Animated.View>
      </> : null}
    </BentoGlassCard>
  );
}

const styles = StyleSheet.create({
  containerContent: { padding: 14 },
  headerRow: { alignItems: "center", gap: 11 },
  avatar: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  avatarImage: { width: "100%", height: "100%" },
  titleBlock: { flex: 1, minWidth: 0 },
  action: { minHeight: 44, borderRadius: 15, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5, flexShrink: 0, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  bellButton: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  bellBadge: { position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#070B10" },
  collapseHandle: { marginTop: 12, minHeight: 26, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 4 },
  collapseBody: { overflow: "hidden" },
  flex: { flex: 1 },
  tile: { marginTop: 10 },
});
