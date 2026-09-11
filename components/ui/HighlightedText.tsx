import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

export type HighlightSegment = { text: string; hit: boolean };

const ARABIC_DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

/** يوحّد النص العربي: يزيل التشكيل ويوحّد الألف والياء والتاء المربوطة. */
export function normalizeArabic(input: string): string {
  return input
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .toLowerCase()
    .trim();
}

function normalizeWithMap(original: string) {
  const toOriginal: number[] = [];
  let normalized = "";
  for (let i = 0; i < original.length; i++) {
    const ch = original[i];
    const n = normalizeArabic(ch);
    if (n.length > 0) {
      toOriginal.push(i);
      normalized += n;
    }
  }
  return { normalized, toOriginal };
}

/** يقسّم النص إلى مقاطع ويُميّز المطابقات بعد توحيد البحث (عربي/إنجليزي) مع الحفاظ على التوقيت الأصلي للفصل. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const rawQuery = query.trim();
  if (!rawQuery) return [{ text, hit: false }];
  const nq = normalizeArabic(rawQuery);
  if (!nq) return [{ text, hit: false }];
  const { normalized, toOriginal } = normalizeWithMap(text);
  if (!normalized) return [{ text, hit: false }];
  const parts: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const at = normalized.indexOf(nq, cursor);
    if (at === -1) break;
    const oStart = toOriginal[at];
    const oEnd = toOriginal[at + nq.length - 1] + 1;
    if (at > cursor) parts.push({ text: text.slice(toOriginal[cursor], oStart), hit: false });
    parts.push({ text: text.slice(oStart, oEnd), hit: true });
    cursor = at + nq.length;
  }
  if (cursor < normalized.length) parts.push({ text: text.slice(toOriginal[cursor]), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}

/** نص مركّب مع تظليل طفيف لكلمات البحث المطابقة (حدّ جانبي كهرماني بدل صندوق مشوّه). */
export function HighlightedText({ text, query, style, numberOfLines, hitStyle }: { text: string; query: string; style?: StyleProp<TextStyle>; numberOfLines?: number; hitStyle?: StyleProp<TextStyle> }) {
  const parts = highlightSegments(text, query);
  if (parts.length === 1 && !parts[0].hit) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  return <Text style={style} numberOfLines={numberOfLines}>{parts.map((part, index) => part.hit ? <Text key={index} style={[styles.hit, hitStyle]}>{part.text}</Text> : <Text key={index}>{part.text}</Text>)}</Text>;
}

const styles = StyleSheet.create({
  hit: { fontWeight: "700", textDecorationLine: "underline", textDecorationColor: "#F59E0B" },
});