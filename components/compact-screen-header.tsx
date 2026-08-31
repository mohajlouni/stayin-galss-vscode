import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { useI18n } from "@/lib/i18n";
import { GlowGlassCard } from "@/components/glow-glass-card";

import { LiveDateTime } from "./live-date-time";
import { ScreenBackButton } from "./screen-back-button";

type CompactScreenHeaderProps = {
  title: string;
  logoUrl?: string;
  icon?: ComponentProps<typeof MaterialIcons>["name"];
  accentColor?: string;
  plain?: boolean;
  showDateTime?: boolean;
  backHref?: Href;
  action?: {
    label: string;
    accessibilityLabel: string;
    onPress: () => void;
    icon?: ComponentProps<typeof MaterialIcons>["name"];
  };
  accessory?: ReactNode;
};

export function CompactScreenHeader({ title, logoUrl, icon = "holiday-village", accentColor, plain = false, showDateTime = true, backHref, action, accessory }: CompactScreenHeaderProps) {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { formatDate, formatTime } = useAppPreferences();
  const [clock, setClock] = useState(() => Date.now());
  const accent = accentColor ?? colors.primary;
  const row: "row" | "row-reverse" = isRTL ? "row-reverse" : "row";
  const align: "left" | "right" = isRTL ? "right" : "left";

  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const headerContent = <>
    {backHref ? <ScreenBackButton fallbackHref={backHref} /> : null}
    {!plain ? <View style={[styles.avatar, { backgroundColor: accent + "16" }]}>{logoUrl ? <Image source={{ uri: logoUrl }} contentFit="cover" cachePolicy="memory-disk" transition={180} style={styles.avatarImage} accessibilityLabel="Business logo" /> : <Image source={require("../assets/images/stayin-logo.jpg")} contentFit="cover" transition={180} style={styles.avatarImage} accessibilityLabel="StayIn logo" />}</View> : null}
    <View style={styles.titleBlock}>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 20, fontWeight: "900", textAlign: align }}>{title}</Text>
      {showDateTime ? <LiveDateTime timestamp={clock} language={language} formatDate={formatDate} formatTime={formatTime} color={colors.muted} align={align} style={styles.liveDateTime} /> : null}
    </View>
    {action ? <Pressable accessibilityLabel={action.accessibilityLabel} onPress={action.onPress} style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pressed ? 0.76 : 1 }]}><MaterialIcons name={action.icon ?? "add"} size={20} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "900" }}>{action.label}</Text></Pressable> : null}
    {accessory ? <>{accessory}</> : null}
  </>;
  if (plain) return <View style={[styles.plainContainer, { flexDirection: row }]}>{headerContent}</View>;
  return <GlowGlassCard style={styles.container} contentStyle={[styles.containerContent, { flexDirection: row }]}>{headerContent}</GlowGlassCard>;
}

const styles = StyleSheet.create({
  container: { minHeight: 74, borderRadius: 24 },
  containerContent: { minHeight: 74, padding: 12, alignItems: "center", gap: 10 },
  plainContainer: { minHeight: 48, paddingHorizontal: 1, paddingVertical: 3, alignItems: "center", gap: 10 },
  avatar: { width: 47, height: 47, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  avatarImage: { width: "100%", height: "100%" },
  titleBlock: { flex: 1, minWidth: 0 },
  liveDateTime: { marginTop: 4 },
  action: { minHeight: 43, borderRadius: 15, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, flexShrink: 0 },
});
