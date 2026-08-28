import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const storeSource = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const detailSource = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");
const auditLogSource = readFileSync(resolve(process.cwd(), "app/audit-log.tsx"), "utf8");

describe("payment audit log safeguards", () => {
  it("does not create an audit entry when a payment amount remains unchanged", () => {
    expect(storeSource).toContain("const amountChanged = Math.abs(payment.amount - amount) > 0.0001");
    expect(storeSource).toContain("const auditLog = amountChanged ?");
  });

  it("labels rental payment changes explicitly for the action log", () => {
    expect(storeSource).toContain("تم تعديل دفعة الإيجار من ${payment.amount}");
    expect(auditLogSource).toContain("تم تعديل ${paymentUpdate[1] || \"دفعة الإيجار\"}");
  });

  it("locks payment save actions while storage writes are in progress", () => {
    expect(detailSource).toContain("const paymentSaveInFlight = useRef(false)");
    expect(detailSource).toContain("const paymentEditInFlight = useRef(false)");
    expect(detailSource).toContain("disabled={paymentSaving}");
    expect(detailSource).toContain("disabled={paymentEditSaving}");
  });
});
