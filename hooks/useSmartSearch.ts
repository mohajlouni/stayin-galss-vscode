import { useMemo } from "react";

import { normalizeArabicText } from "@/utils/textNormalization";

/** مستخرج حقول نصية/رقمية من عنصر واحد ليجري البحث فيها معًا.
 *  يكتب مرة واحدة على مستوى الموديول ويُمرَّر ثابتًا حتى لا يُعاد الحساب كل رندر. */
export type SmartSearchExtractor<T> = (item: T) => ReadonlyArray<string | number | null | undefined>;

/** يطابق عنصرًا واحدًا: يبني نصًّا موحّدًا من كل الحقول ثم يبحث عن نص الاستعلام بداخله. */
export function matchesQueryText<T>(item: T, query: string, extract: SmartSearchExtractor<T>): boolean {
  const q = normalizeArabicText(query);
  if (!q) return true;
  return extract(item).some((value) => normalizeArabicText(value).includes(q));
}

/** محرّك البحث الذكي المشترك: يصفّي القائمة حسب استعلام موحّد عربي/إنجليزي مع تثبيت حسابات الـ memo. */
export function useSmartSearch<T>(items: ReadonlyArray<T>, query: string, extract: SmartSearchExtractor<T>): T[] {
  return useMemo(() => {
    const q = normalizeArabicText(query);
    if (!q) return [...items];
    return items.filter((item) => extract(item).some((value) => normalizeArabicText(value).includes(q)));
  }, [items, query, extract]);
}