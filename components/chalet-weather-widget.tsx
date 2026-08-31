import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { GlowGlassCard } from "@/components/glow-glass-card";
import { useAppPreferences } from "@/lib/app-preferences";
import { effectiveWeatherAdvisory, type Chalet } from "@/lib/booking-model";
import { useBookings } from "@/lib/booking-store";
import { useChaletScope } from "@/lib/chalet-scope";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { buildOpenMeteoUrl, buildWeatherAdvisories, buildWeatherLog, poolHeatingLabel, shouldRefreshWeather, weatherCodeLabel, weatherIconName, weatherRecommendation } from "@/lib/weather";

type WeatherGlyph = "sunny" | "partly-cloudy-day" | "cloud" | "rainy" | "snowing" | "thunderstorm" | "foggy";

const WEATHER_GLYPHS: Record<WeatherGlyph, React.ComponentProps<typeof MaterialIcons>["name"]> = {
  sunny: "wb-sunny",
  "partly-cloudy-day": "cloud",
  cloud: "cloud",
  rainy: "grain",
  snowing: "ac-unit",
  thunderstorm: "thunderstorm",
  foggy: "dehaze",
};

type ChaletWeatherWidgetProps = {
  chaletId?: string;
  compact?: boolean;
};

export const ChaletWeatherWidget = memo(function ChaletWeatherWidget({ chaletId, compact = false }: ChaletWeatherWidgetProps) {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const { formatDate } = useAppPreferences();
  const { weatherLogs, saveWeatherLog, settings } = useBookings();
  const { selectedChaletId } = useChaletScope();
  const { chalets } = useBookings();
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const weatherConfig = useMemo(() => effectiveWeatherAdvisory(settings), [settings]);

  const chalet = useMemo<Chalet | undefined>(() => {
    const id = chaletId ?? selectedChaletId ?? undefined;
    if (id) return chalets.find((item) => item.id === id) ?? chalets[0];
    return chalets[0];
  }, [chaletId, selectedChaletId, chalets]);

  const log = useMemo(() => weatherLogs?.find((item) => item.chaletId === chalet?.id), [weatherLogs, chalet?.id]);

  const refresh = useCallback(async () => {
    if (!chalet || refreshing) return;
    if (typeof chalet.latitude !== "number" || typeof chalet.longitude !== "number" || !Number.isFinite(chalet.latitude) || !Number.isFinite(chalet.longitude)) return;
    if (!shouldRefreshWeather(log)) return;
    setRefreshing(true);
    try {
      const response = await fetch(buildOpenMeteoUrl(chalet.latitude, chalet.longitude));
      if (!response.ok) throw new Error(`weather-http-${response.status}`);
      const payload = await response.json();
      const snapshot = buildWeatherLog(`weather-${chalet.id}-${Date.now()}`, chalet.id, chalet.latitude, chalet.longitude, payload);
      const advisories = buildWeatherAdvisories(snapshot, chalet, language, { enabled: weatherConfig.enabled, coldPoolThresholdC: weatherConfig.coldPoolThresholdC, recipients: weatherConfig.recipients });
      await saveWeatherLog(snapshot, advisories);
      setFailed(false);
    } catch {
      setFailed(Boolean(log));
    } finally {
      setRefreshing(false);
    }
  }, [chalet, refreshing, log, language, saveWeatherLog, weatherConfig]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!chalet) return null;
  if (!weatherConfig.enabled) return null;

  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const rec = log ? weatherRecommendation(log, chalet, language, weatherConfig.coldPoolThresholdC) : undefined;
  const now = log?.current;
  const accent = rec?.tone === "danger" ? colors.error : rec?.tone === "warning" ? colors.warning : colors.sky;
  const heating = log ? poolHeatingLabel(log, chalet, language, weatherConfig.coldPoolThresholdC) : undefined;

  return (
    <GlowGlassCard glowColor={accent} style={[styles.card, compact && styles.compactCard]} contentStyle={styles.cardContent}>
      <View style={[styles.headerRow, { flexDirection: row }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "منظومة الطقس" : "Weather & pool"}</Text>
          <Text style={[styles.chaletName, { color: colors.muted, textAlign: align }]} numberOfLines={1}>{chalet.name}</Text>
        </View>
        {refreshing ? <ActivityIndicator size="small" color={accent} /> : failed ? <MaterialIcons name="refresh" size={18} color={colors.muted} /> : <MaterialIcons name="wb-cloudy" size={18} color={accent} />}
      </View>

      {!log ? (
        <View style={[styles.loadingBlock, { flexDirection: row }]}>
          {!refreshing ? <MaterialIcons name="wb-sunny" size={18} color={colors.muted} /> : null}
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textAlign: align }}>{refreshing ? (language === "ar" ? "جارٍ جلب توقعات الطقس..." : "Fetching forecast...") : (language === "ar" ? "لا توجد بيانات طقس بعد — اضغط للتحديث" : "No weather data yet — pull to refresh")}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.currentRow, { flexDirection: row }]}>
            <View style={[styles.tempBlock, { flexDirection: "row-reverse", alignItems: "baseline" }]}>
              <Text style={[styles.temp, { color: colors.foreground }]}>{now?.temperature != null ? `°${Math.round(now.temperature)}` : "–"}</Text>
              <Text style={[styles.tempUnit, { color: colors.muted }]}>{language === "ar" ? "حاليًا" : "now"}</Text>
            </View>
            <View style={styles.currentFacts}>
              <Text style={[styles.fact, { color: colors.muted, textAlign: align }]} numberOfLines={1}>{log.current ? weatherCodeLabel(log.current.weatherCode, language) : ""}</Text>
              {log.current ? <Text style={[styles.fact, { color: colors.muted, textAlign: align, marginTop: 3 }]}>{language === "ar" ? "رياح" : "Wind"} {Math.round(log.current.windSpeed)} {language === "ar" ? "كم/س" : "km/h"}</Text> : null}
            </View>
          </View>

          {compact ? null : <View style={[styles.chipRow, { flexDirection: row }]}>
            <View style={[styles.chip, { backgroundColor: accent + "14", borderColor: accent + "44" }]}><MaterialIcons name="local-fire-department" size={13} color={accent} /><Text numberOfLines={1} style={[styles.chipText, { color: accent, textAlign: align }]}>{heating}</Text></View>
            <View style={[styles.chip, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}><MaterialIcons name="water-drop" size={13} color={colors.muted} /><Text numberOfLines={1} style={[styles.chipText, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "أمطار" : "Rain"} {Math.round(log.daily[0]?.precipitationProbabilityMax ?? 0)}%</Text></View>
          </View>}

          <View style={[styles.recBar, { backgroundColor: rec ? accent + "18" : colors.surfaceMuted, borderColor: rec ? accent + "44" : colors.border }]}>
            <MaterialIcons name={rec?.kind === "clear" ? "check-circle" : rec?.kind === "cold_pool" ? "local-fire-department" : "air"} size={14} color={accent} />
            <Text numberOfLines={2} style={[styles.recText, { color: accents(colors, rec?.tone), textAlign: align }]}>{rec?.label ?? (language === "ar" ? "التوقعات قيد التحديث" : "Forecast updating")}</Text>
          </View>

          {compact ? null : <View style={styles.weekRow}>
            {log.daily.slice(0, 7).map((day, index) => (
              <View key={day.date} style={styles.day}>
                <Text numberOfLines={1} style={[styles.dayLabel, { color: index === 0 ? accent : colors.muted, textAlign: "center" }]}>{index === 0 ? (language === "ar" ? "اليوم" : "Today") : formatDate(day.date)?.split("/").slice(0, 2).join("/")}</Text>
                <MaterialIcons name={WEATHER_GLYPHS[weatherIconName(day.weatherCode)]} size={14} color={index === 0 ? accent : colors.muted} />
                <Text style={[styles.dayTemp, { color: colors.foreground, textAlign: "center" }]} numberOfLines={1}>{Math.round(day.temperatureMax)}°</Text>
                <Text style={[styles.dayTempMin, { color: colors.muted, textAlign: "center" }]} numberOfLines={1}>{Math.round(day.temperatureMin)}°</Text>
              </View>
            ))}
          </View>}
        </>
      )}
    </GlowGlassCard>
  );
});

function accents(colors: ReturnType<typeof useColors>, tone: "info" | "warning" | "danger" | undefined) {
  return tone === "danger" ? colors.error : tone === "warning" ? colors.warning : colors.foreground;
}

const styles = StyleSheet.create({
  card: { borderRadius: 24, marginTop: 12 },
  compactCard: { borderRadius: 20 },
  cardContent: { padding: 14 },
  headerRow: { alignItems: "center", justifyContent: "space-between", gap: 10 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "900" },
  chaletName: { fontSize: 10, fontWeight: "600", marginTop: 1 },
  loadingBlock: { minHeight: 52, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 },
  currentRow: { alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 },
  tempBlock: { alignItems: "baseline", gap: 5 },
  temp: { fontSize: 34, fontWeight: "900" },
  tempUnit: { fontSize: 11, fontWeight: "800" },
  currentFacts: { flex: 1, minWidth: 0 },
  fact: { fontSize: 12, fontWeight: "700" },
  chipRow: { gap: 7, marginTop: 11, flexWrap: "wrap" },
  chip: { minHeight: 28, borderRadius: 9, borderWidth: 1, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 },
  chipText: { fontSize: 10, fontWeight: "900", flexShrink: 1 },
  recBar: { minHeight: 34, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 },
  recText: { flex: 1, fontSize: 11, fontWeight: "900" },
  weekRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 14 },
  day: { flex: 1, minWidth: 0, alignItems: "center", gap: 3 },
  dayLabel: { fontSize: 8, fontWeight: "900" },
  dayTemp: { fontSize: 10, fontWeight: "800" },
  dayTempMin: { fontSize: 8, fontWeight: "700" },
});