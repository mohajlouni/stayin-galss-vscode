import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

export type HighlightSegment = { text: string; hit: boolean };

/** يقسّم النص إلى مقاطع مستقلة ويميّز المطابقات ضمن نص مركّب (بحث عرقي شامل). */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const parts: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < lower.length) {
    const at = lower.indexOf(trimmed, cursor);
    if (at === -1) {
      parts.push({ text: text.slice(cursor), hit: false });
      break;
    }
    if (at > cursor) parts.push({ text: text.slice(cursor, at), hit: false });
    parts.push({ text: text.slice(at, at + trimmed.length), hit: true });
    cursor = at + trimmed.length;
    if (cursor >= text.length) break;
  }
  return parts.length ? parts : [{ text, hit: false }];
}

/** نص قابل للرّبط مع تظليل أصفر نابض لكلمات البحث المطابقة دون كسر التنسيق. */
export function HighlightedText({ text, query, style, numberOfLines, hitStyle }: { text: string; query: string; style?: StyleProp<TextStyle>; numberOfLines?: number; hitStyle?: StyleProp<TextStyle> }) {
  const parts = highlightSegments(text, query);
  if (parts.length === 1 && !parts[0].hit) {
    return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  }
  return <Text style={style} numberOfLines={numberOfLines}>{parts.map((part, index) => part.hit ? <Text key={index} style={[styles.hit, hitStyle]}>{part.text}</Text> : <Text key={index}>{part.text}</Text>)}</Text>;
}

const styles = StyleSheet.create({
  hit: { backgroundColor: "#FBBF24", color: "#0F172A", fontWeight: "900" },
});