import { describe, expect, it } from "vitest";
import { countryForInternationalPhone, normalizeInternationalPhone, normalizePhoneInput } from "../lib/phone-number";
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

describe("auto phone formatting for the member modal (normalizePhoneInput)", () => {
  it("turns a complete local 07 number into +9627… on change or submit", () => {
    expect(normalizePhoneInput("0791234567")).toBe("+962791234567");
    expect(normalizePhoneInput("079 123 4567")).toBe("+962791234567");
  });

  it("unwraps the 00 prefix into +", () => {
    expect(normalizePhoneInput("00962791234567")).toBe("+962791234567");
  });

  it("preserves an already-international number entered by the user", () => {
    expect(normalizePhoneInput("+9647912345678")).toBe("+9647912345678");
    expect(normalizePhoneInput("+962791234567")).toBe("+962791234567");
  });

  it("leaves partial input untouched until the number is complete", () => {
    expect(normalizePhoneInput("07")).toBe("07");
    expect(normalizePhoneInput("07912")).toBe("07912");
    expect(normalizePhoneInput("+96")).toBe("+96");
    expect(normalizePhoneInput("")).toBe("");
    expect(normalizePhoneInput("  ")).toBe("");
  });
});
