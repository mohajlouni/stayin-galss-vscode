import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";
import { formatTime12 } from "@/lib/booking-model";

const ITEM_HEIGHT = 42;
const WHEEL_HEIGHT = ITEM_HEIGHT * 3;
const PRESETS = ["10:00", "14:00", "20:00", "21:00"];

type WheelTimePickerProps = {
  visible: boolean;
  title: string;
  initialTime: string;
  timeFormat: "12h" | "24h";
  language: "ar" | "en";
  onConfirm: (time: string) => void;
  onClose: () => void;
};

function pad2(value: number) { return String(value).padStart(2, "0"); }

function hourIndexFrom24(hour: number, twelveHour: boolean) {
  if (!twelveHour) return Math.max(0, Math.min(23, hour));
  const label = hour % 12 || 12;
  return label - 1;
}

function hour24FromIndex(index: number, isPM: boolean, twelveHour: boolean) {
  if (!twelveHour) return index;
  const label = index + 1;
  if (label === 12) return isPM ? 12 : 0;
  return isPM ? label + 12 : label;
}

type WheelProps = {
  items: string[];
  index: number;
  width: number;
  fade: string;
  highlight: string;
  highlightBorder: string;
  foreground: string;
  muted: string;
  onChange: (index: number) => void;
};

function Wheel({ items, index, width, fade, highlight, highlightBorder, foreground, muted, onChange }: WheelProps) {
  const ref = useRef<ScrollView>(null);
  const [current, setCurrent] = useState(index);

  useEffect(() => {
    if (!items.length || !ref.current) return;
    ref.current.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  }, [index, items]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
    setCurrent(next);
    if (next !== index) onChange(next);
  };

  const select = (next: number) => {
    setCurrent(next);
    onChange(next);
    ref.current?.scrollTo({ y: next * ITEM_HEIGHT, animated: true });
  };

  return (
    <View style={{ width, height: WHEEL_HEIGHT, overflow: "hidden" }}>
      <View pointerEvents="none" style={[styles.wheelHighlighter, { top: ITEM_HEIGHT, backgroundColor: highlight, borderColor: highlightBorder, width }]} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * ITEM_HEIGHT }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={settle}
        scrollEventThrottle={16}
      >
        <View style={{ paddingVertical: ITEM_HEIGHT }}>
          {items.map((item, i) => {
            const isSelected = i === current;
            return (
              <Pressable key={item} onPress={() => select(i)} style={styles.wheelRow}>
                <Text style={{ color: isSelected ? foreground : muted, fontSize: 18, fontWeight: isSelected ? "900" : "600", writingDirection: "ltr" }}>{item}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View pointerEvents="none" style={[styles.wheelFade, { top: 0, backgroundColor: fade }]} />
      <View pointerEvents="none" style={[styles.wheelFade, { bottom: 0, backgroundColor: fade }]} />
    </View>
  );
}

export function WheelTimePicker({ visible, title, initialTime, timeFormat, language, onConfirm, onClose }: WheelTimePickerProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isArabic = language === "ar";
  const align = isArabic ? "right" : "left";
  const twelveHour = timeFormat === "12h";
  const hours = useMemo(() => twelveHour ? Array.from({ length: 12 }, (_, i) => `${i + 1}`) : Array.from({ length: 24 }, (_, i) => pad2(i)), [twelveHour]);
  const minutes = useMemo(() => Array.from({ length: 12 }, (_, i) => pad2(i * 5)), []);
  const periods = useMemo(() => isArabic ? ["ص", "م"] : ["AM", "PM"], [isArabic]);
  const parsed = useMemo(() => {
    const [hour = 9, minute = 0] = initialTime.split(":").map(Number);
    return {
      hourIndex: hourIndexFrom24(hour || 0, twelveHour),
      minuteIndex: Math.max(0, Math.min(11, Math.round((minute || 0) / 5))),
      periodIndex: hour < 12 ? 0 : 1,
    };
  }, [initialTime, twelveHour]);

  const [hourIndex, setHourIndex] = useState(parsed.hourIndex);
  const [minuteIndex, setMinuteIndex] = useState(parsed.minuteIndex);
  const [periodIndex, setPeriodIndex] = useState(parsed.periodIndex);

  useEffect(() => {
    setHourIndex(parsed.hourIndex);
    setMinuteIndex(parsed.minuteIndex);
    setPeriodIndex(parsed.periodIndex);
  }, [parsed.hourIndex, parsed.minuteIndex, parsed.periodIndex]);

  const preview = useMemo(() => {
    const hour = hour24FromIndex(hourIndex, periodIndex === 1, twelveHour);
    return `${pad2(hour)}:${pad2(minuteIndex * 5)}`;
  }, [hourIndex, minuteIndex, periodIndex, twelveHour]);

  const applyPreset = (value: string) => {
    const [hour = 10, minute = 0] = value.split(":").map(Number);
    setHourIndex(hourIndexFrom24(hour, twelveHour));
    setMinuteIndex(Math.max(0, Math.min(11, Math.round((minute || 0) / 5))));
    setPeriodIndex(hour < 12 ? 0 : 1);
  };

  const confirmablePreview = `${formatTime12(preview, language, timeFormat)}`;

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(insets.bottom, 16) + 10 }]}>
          <View style={[styles.header, { flexDirection: isArabic ? "row-reverse" : "row" }]}>
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: "900", textAlign: align }}>{title}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: align }}>{isArabic ? "اسحب العجلات أو اضغط على الاختصارات" : "Swipe the wheels or tap a shortcut"}</Text>
            </View>
            <Pressable accessibilityLabel={isArabic ? "إغلاق اختيار الوقت" : "Close time picker"} onPress={onClose} style={[styles.closeButton, { backgroundColor: colors.surfaceMuted }]}>
              <MaterialIcons name="close" size={20} color={colors.primary} />
            </Pressable>
          </View>

          <Text style={{ color: colors.primary, fontSize: 30, fontWeight: "900", textAlign: "center", marginTop: 6, writingDirection: "ltr" }}>{confirmablePreview}</Text>

          <View style={[styles.presets, { flexDirection: isArabic ? "row-reverse" : "row" }]}>
            {PRESETS.map((preset) => {
              const isSelected = preset === preview;
              return (
                <Pressable key={preset} onPress={() => applyPreset(preset)} style={({ pressed }) => [styles.presetChip, { backgroundColor: isSelected ? colors.primary : colors.surfaceMuted, borderColor: isSelected ? colors.primary : colors.border, opacity: pressed ? 0.72 : 1 }]}>
                  <Text style={{ color: isSelected ? "#FFFFFF" : colors.foreground, fontSize: 12.5, fontWeight: "900", writingDirection: "ltr" }}>{formatTime12(preset, language, timeFormat)}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.wheels}>
            <View style={styles.wheelColumn}>
              <Text style={[styles.wheelLabel, { color: colors.muted, textAlign: align }]}>{isArabic ? "الساعات" : "Hours"}</Text>
              <Wheel items={hours} index={hourIndex} width={84} fade={colors.surface} highlight={colors.primary + "14"} highlightBorder={colors.primary + "3D"} foreground={colors.foreground} muted={colors.muted} onChange={setHourIndex} />
            </View>
            <View style={styles.wheelColumn}>
              <Text style={[styles.wheelLabel, { color: colors.muted, textAlign: align }]}>{isArabic ? "الدقائق" : "Minutes"}</Text>
              <Wheel items={minutes} index={minuteIndex} width={84} fade={colors.surface} highlight={colors.primary + "14"} highlightBorder={colors.primary + "3D"} foreground={colors.foreground} muted={colors.muted} onChange={setMinuteIndex} />
            </View>
            {twelveHour ? <View style={styles.wheelColumn}>
              <Text style={[styles.wheelLabel, { color: colors.muted, textAlign: align }]}>{isArabic ? "الفترة" : "Period"}</Text>
              <Wheel items={periods} index={periodIndex} width={92} fade={colors.surface} highlight={colors.primary + "14"} highlightBorder={colors.primary + "3D"} foreground={colors.foreground} muted={colors.muted} onChange={setPeriodIndex} />
            </View> : null}
          </View>

          <Pressable onPress={() => onConfirm(preview)} style={({ pressed }) => [styles.confirm, { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 }]}>
            <Text style={{ color: "#FFFFFF", fontWeight: "900", fontSize: 16 }}>{isArabic ? "تأكيد الوقت" : "Confirm time"}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={{ color: colors.muted, fontWeight: "800" }}>{isArabic ? "إلغاء" : "Cancel"}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "flex-end" },
  sheet: { borderWidth: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 14, gap: 4 },
  header: { alignItems: "center", gap: 9 },
  flex: { flex: 1, minWidth: 0 },
  closeButton: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  presets: { gap: 7, marginTop: 13, flexWrap: "wrap", justifyContent: "center" },
  presetChip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 7 },
  wheels: { flexDirection: "row", gap: 8, alignItems: "flex-start", justifyContent: "center", marginTop: 10 },
  wheelColumn: { alignItems: "center", gap: 5 },
  wheelLabel: { fontSize: 10, fontWeight: "800" },
  wheelRow: { height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  wheelFade: { position: "absolute", left: 0, right: 0, height: ITEM_HEIGHT, zIndex: 4 },
  wheelHighlighter: { position: "absolute", height: ITEM_HEIGHT, borderRadius: 13, zIndex: 1 },
  confirm: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 13 },
  cancel: { minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 12 },
});