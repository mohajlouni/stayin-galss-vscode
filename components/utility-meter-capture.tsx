import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { type UtilityMeterInput, type UtilityReadingType } from "@/lib/booking-model";
import { utilityTypeIcon, utilityTypeLabel } from "@/lib/utility-readings";

type Palette = {
  background: string;
  foreground: string;
  muted: string;
  primary: string;
  surface: string;
  surfaceMuted: string;
  warning: string;
  error: string;
};

type Props = {
  colors: Palette;
  language: "ar" | "en";
  isRTL: boolean;
  saving: boolean;
  value: UtilityMeterInput | undefined;
  onChange: (value: UtilityMeterInput | undefined) => void;
  title?: string;
};

const UNIT_TYPES: readonly (UtilityReadingType | "none")[] = ["none", "electricity", "water", "gas_fuel"];

export function UtilityMeterCapture({ colors, language, isRTL, saving, value, onChange, title }: Props) {
  const [draft, setDraft] = useState(value ? String(value.reading) : "");
  const [selecting, setSelecting] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const activeType: UtilityReadingType | "none" = value?.type ?? "none";

  const applyReading = (text: string) => {
    setDraft(text);
    const parsed = Number(text);
    if (!text.trim() || text.trim() === "." || !Number.isFinite(parsed) || parsed < 0) {
      onChange(undefined);
      return;
    }
    onChange({ type: value?.type ?? "electricity", reading: Math.round(parsed * 100) / 100, photoUri: value?.photoUri });
  };

  const applyType = (type: UtilityReadingType | "none") => {
    if (type === "none") {
      onChange(undefined);
      return;
    }
    const parsed = Number(draft);
    onChange(Number.isFinite(parsed) && parsed >= 0 ? { type, reading: Math.round(parsed * 100) / 100, photoUri: value?.photoUri } : { type, reading: 0, photoUri: value?.photoUri });
  };

  const capture = async (source: "camera" | "library") => {
    try {
      setSelecting(true);
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert(language === "ar" ? "إذن الكاميرا مطلوب" : "Camera permission required", language === "ar" ? "سمح للكاميرا بتوثيق قراءة العداد." : "Allow camera access to capture the meter reading.");
          return;
        }
      }
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 });
      if (!result.canceled && result.assets[0]?.uri) onChange({ type: value?.type ?? "electricity", reading: (value?.reading ?? Number(draft)) || 0, photoUri: value?.photoUri ?? result.assets[0].uri });
    } catch {
      Alert.alert(language === "ar" ? "تعذر إرفاق صورة العداد" : "Could not attach meter photo", language === "ar" ? "حاول مرة أخرى." : "Please try again.");
    } finally {
      setSelecting(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceMuted }]}>
      <View style={[styles.header, { flexDirection: row }]}>
        <View style={[styles.icon, { backgroundColor: colors.warning + "19" }]}><MaterialIcons name="speed" size={18} color={colors.warning} /></View>
        <View style={styles.flex}>
          <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{title ?? (language === "ar" ? "قراءة عداد الطاقة" : "Utility meter reading")}</Text>
          <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{language === "ar" ? "تُحتسب تكلفة الاستهلاك وتُخصم من صافي الربح" : "Consumption cost is deducted from net profit"}</Text>
        </View>
      </View>

      <View style={[styles.typeRow, { flexDirection: row }]}>
        {UNIT_TYPES.map((type) => { const selected = activeType === type; return (
          <Pressable key={type} disabled={saving} onPress={() => applyType(type)} style={({ pressed }) => [styles.typeChip, { backgroundColor: selected ? colors.primary : colors.background, opacity: pressed || saving ? 0.6 : 1 }]}>
            {type !== "none" ? <MaterialIcons name={utilityTypeIcon(type)} size={13} color={selected ? "#FFFFFF" : colors.muted} /> : null}
            <Text numberOfLines={1} style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 10, fontWeight: "900", textAlign: "center" }}>{type === "none" ? (language === "ar" ? "بدون" : "None") : utilityTypeLabel(type, language)}</Text>
          </Pressable>
        ); })}
      </View>

      {activeType !== "none" ? <>
        <TextInput key={activeType} value={draft} onChangeText={(text) => applyReading(text.replace(/[^0-9.]/g, "").slice(0, 11))} editable={!saving} keyboardType="numeric" placeholder={language === "ar" ? "قراءة العداد الحالية" : "Current meter reading"} placeholderTextColor={colors.muted} style={[styles.readingInput, { color: colors.foreground, backgroundColor: colors.background, textAlign: align, writingDirection: isRTL ? "rtl" : "ltr" }]} />
        <View style={[styles.photoRow, { flexDirection: row }]}>
          <Pressable disabled={saving || selecting} onPress={() => void capture("camera")} style={({ pressed }) => [styles.photoButton, { backgroundColor: colors.background, opacity: pressed || saving || selecting ? 0.58 : 1 }]}><MaterialIcons name="photo-camera" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "تصوير العداد" : "Camera"}</Text></Pressable>
          <Pressable disabled={saving || selecting} onPress={() => void capture("library")} style={({ pressed }) => [styles.photoButton, { backgroundColor: colors.background, opacity: pressed || saving || selecting ? 0.58 : 1 }]}><MaterialIcons name="add-photo-alternate" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "رفع صورة" : "Upload"}</Text></Pressable>
        </View>
        {value?.photoUri ? <View style={[styles.previewRow, { flexDirection: row }]}><Image source={{ uri: value.photoUri }} accessibilityLabel={language === "ar" ? "معاينة صورة العداد" : "Meter photo preview"} style={styles.preview} /><Pressable disabled={saving} onPress={() => { setDraft(value ? String(value.reading) : ""); onChange({ ...value, photoUri: undefined }); }} style={({ pressed }) => [styles.remove, { backgroundColor: colors.error + "12", opacity: pressed || saving ? 0.6 : 1 }]}><MaterialIcons name="delete-outline" size={17} color={colors.error} /></Pressable></View> : null}
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, padding: 12, marginTop: 11 },
  header: { alignItems: "center", gap: 9 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  typeRow: { gap: 6, marginTop: 9, flexWrap: "wrap" },
  typeChip: { flexShrink: 1, minHeight: 34, minWidth: 64, borderRadius: 11, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  readingInput: { minHeight: 46, borderRadius: 14, paddingHorizontal: 12, marginTop: 9, fontSize: 15, fontWeight: "800" },
  photoRow: { gap: 7, marginTop: 8 },
  photoButton: { flex: 1, minHeight: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  previewRow: { alignItems: "center", gap: 8, marginTop: 8 },
  preview: { flex: 1, height: 96, borderRadius: 13, resizeMode: "cover" },
  remove: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});