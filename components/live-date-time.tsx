import { Text, type TextStyle } from "react-native";

import { weekdayLabel } from "@/lib/booking-model";

function dateKeyFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeFromTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function LiveDateTime({ timestamp, language, formatDate, formatTime, color, align, style }: { timestamp: number; language: "ar" | "en"; formatDate: (date: string) => string; formatTime: (time: string) => string; color: string; align: "left" | "right"; style?: TextStyle }) {
  const dateKey = dateKeyFromTimestamp(timestamp);
  const text = language === "ar"
    ? `${weekdayLabel(dateKey, language)}، ${formatDate(dateKey)} · ${formatTime(timeFromTimestamp(timestamp))}`
    : `${weekdayLabel(dateKey, language)}, ${formatDate(dateKey)} · ${formatTime(timeFromTimestamp(timestamp))}`;
  return <Text numberOfLines={1} style={[{ color, fontSize: 12, fontWeight: "700", textAlign: align, writingDirection: language === "ar" ? "rtl" : "ltr" }, style]}>{text}</Text>;
}
