import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/booking-form.tsx"), "utf8");

describe("Booking form edit validation", () => {
  it("validates phone and positive rental values before saving, then returns an updated booking to details", () => {
    expect(source).toContain("normalizeInternationalPhone(phone, phoneCountry.code)");
    expect(source).toContain("toPositiveFiniteAmount(price)");
    expect(source).toContain("!rentalPrice");
    expect(source).toContain('pathname: "/booking-detail"');
    expect(source).toContain('updated: "1"');
  });

  it("keeps the compact form clear by surfacing missing inputs and reserving space above the fixed action dock", () => {
    expect(source).toContain("const bookingReady = missingItems.length === 0");
    expect(source).toContain("أدخل السعر يدويًا أو حدده من الإعدادات");
    expect(source).toContain("paddingBottom: 148");
  });

  it("keeps the RTL rent total in a field-sized third column", () => {
    expect(source).toContain('const rentRow: "row" | "row-reverse" = isArabic ? "row-reverse" : "row"');
    expect(source).toContain('styles.rentSummaryRow, { flexDirection: rentRow }');
    expect(source).toContain('styles.rentFinalInput');
    expect(source).toContain('rentFinalInput: { minHeight: 42');
    expect(source).toContain('formatMoney(draft.price, settings.currency)');
    expect(source).not.toContain('rentFinalColumn');
    const rentRowStart = source.indexOf('styles.rentSummaryRow, { flexDirection: rentRow }');
    const totalIndex = source.indexOf('الإجمالي بعد الخصم', rentRowStart);
    const discountIndex = source.indexOf('label(t("discount"))', rentRowStart);
    const priceIndex = source.indexOf('سعر الإيجار', rentRowStart);
    expect(totalIndex).toBeLessThan(discountIndex);
    expect(discountIndex).toBeLessThan(priceIndex);
  });
});
