import { describe, expect, it } from "vitest";
import { countryForInternationalPhone, normalizeInternationalPhone } from "../lib/phone-number";
import { readFileSync } from "node:fs";

describe("international phone normalization", () => {
  it("accepts valid E.164 numbers and removes harmless separators", () => {
    expect(normalizeInternationalPhone("+962 79 000 0000")).toEqual({ value: "+962790000000", error: null });
    expect(normalizeInternationalPhone("0044 (20) 7946-0018")).toEqual({ value: "+442079460018", error: null });
  });

  it("converts Jordanian local mobile numbers and Arabic numerals to international E.164", () => {
    expect(normalizeInternationalPhone("079 000 0000")).toEqual({ value: "+962790000000", error: null });
    expect(normalizeInternationalPhone("٠٧٩ ٠٠٠ ٠٠٠٠")).toEqual({ value: "+962790000000", error: null });
  });

  it("uses the selected country code for a national number and restores that country from E.164", () => {
    expect(normalizeInternationalPhone("050 123 4567", "+966")).toEqual({ value: "+966501234567", error: null });
    expect(countryForInternationalPhone("+971501234567").iso).toBe("AE");
  });

  it("keeps an empty number optional and rejects incomplete or malformed numbers", () => {
    expect(normalizeInternationalPhone("")).toEqual({ value: null, error: null });
    expect(normalizeInternationalPhone("0790")).toEqual({ value: null, error: "invalid" });
    expect(normalizeInternationalPhone("+000790000000")).toEqual({ value: null, error: "invalid" });
  });

  it("exposes the selected-country phone UI in the booking form and persists a normalized value", () => {
    const form = readFileSync("app/booking-form.tsx", "utf8");
    expect(form).toContain("COUNTRY_DIALING_CODES");
    expect(form).toContain("DEFAULT_COUNTRY_DIALING_CODE");
    expect(form).toContain("normalizeInternationalPhone(phone, phoneCountry.code)");
    expect(form).toContain("phone: normalizedPhone.value ?? phone");
    expect(form).toContain("اختيار رمز الدولة");
  });
});
