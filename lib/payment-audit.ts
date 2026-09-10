import AsyncStorage from "@react-native-async-storage/async-storage";

export type PaymentMethodAuditAction = "add" | "edit" | "activate" | "deactivate" | "default" | "delete" | "whatsapp";

export type PaymentMethodAuditEntry = {
  id: string;
  at: string;
  action: PaymentMethodAuditAction;
  target: string;
  detail: string;
  actorName: string;
  actorRole: string;
};

export const PAYMENT_METHODS_AUDIT_STORAGE_KEY = "@stayin_payment_methods_audit";

export const PAYMENT_METHOD_AUDIT_LABELS: Record<PaymentMethodAuditAction, { ar: string; en: string }> = {
  add: { ar: "إضافة حساب جديد", en: "Add new account" },
  edit: { ar: "تعديل بيانات", en: "Edit data" },
  activate: { ar: "تفعيل قناة", en: "Activate channel" },
  deactivate: { ar: "تعطيل قناة", en: "Deactivate channel" },
  default: { ar: "تغيير الحساب الافتراضي", en: "Change default account" },
  delete: { ar: "حذف", en: "Delete" },
  whatsapp: { ar: "تعديل بيانات", en: "Edit data" },
};

const MAX_AUDIT_ENTRIES = 200;

export async function loadPaymentMethodAudit(): Promise<PaymentMethodAuditEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(PAYMENT_METHODS_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PaymentMethodAuditEntry => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as Record<string, unknown>;
      return typeof item.id === "string" && typeof item.at === "string" && typeof item.action === "string";
    });
  } catch {
    return [];
  }
}

export async function appendPaymentMethodAudit(entry: Omit<PaymentMethodAuditEntry, "id" | "at">): Promise<PaymentMethodAuditEntry[]> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const next: PaymentMethodAuditEntry[] = [{ ...entry, id, at: new Date().toISOString() }, ...(await loadPaymentMethodAudit())].slice(0, MAX_AUDIT_ENTRIES);
  try {
    await AsyncStorage.setItem(PAYMENT_METHODS_AUDIT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage failures should never block a payment-method change
  }
  return next;
}

export async function clearPaymentMethodAudit(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PAYMENT_METHODS_AUDIT_STORAGE_KEY);
  } catch {
    // ignore
  }
}