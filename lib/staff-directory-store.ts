import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { normalizeOnbookStaff, type OnbookStaff } from "@/lib/staff-directory";

/** مخزن المنتسبين الميدانيين على الكتاب (Track B) — إعدادات موثقة محليًا مفصولة عن بيانات المنشأة المشتركة. */
export const ONBOOK_STAFF_STORAGE_KEY = "@stayin_onbook_staff";

export async function loadOnbookStaff(): Promise<OnbookStaff[]> {
  try {
    const raw = await AsyncStorage.getItem(ONBOOK_STAFF_STORAGE_KEY);
    if (!raw) return [];
    return normalizeOnbookStaff(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveOnbookStaff(staff: OnbookStaff[]): Promise<void> {
  await AsyncStorage.setItem(ONBOOK_STAFF_STORAGE_KEY, JSON.stringify(normalizeOnbookStaff(staff)));
}

/** خطاف جاهز لإدارة دليل المنتسبين محليًا مع حفظ تلقائي. */
export function useOnbookStaff() {
  const [staff, setStaff] = useState<OnbookStaff[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void loadOnbookStaff().then((list) => {
      if (!mounted) return;
      setStaff(list);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);
  const commit = useCallback(async (next: OnbookStaff[]) => {
    const normalized = normalizeOnbookStaff(next);
    setStaff(normalized);
    await saveOnbookStaff(normalized);
    return normalized;
  }, []);
  return { staff, ready, commit };
}