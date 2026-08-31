import { describe, expect, it } from "vitest";
import { buildContractHtml, buildSignatureSvg, contractTermsSnapshot, decodeSignatureStrokes, strokesToBase64 } from "../lib/contracts";
import { DEFAULT_SETTINGS } from "../lib/booking-model";

describe("signature encoding round trip", () => {
  it("serializes and decodes stroke points", () => {
    const strokes: [number, number][][] = [[[0, 0], [40, 60], [120, 90]], [[130, 30], [200, 20]]];
    const encoded = strokesToBase64(strokes);
    expect(encoded).toBeTruthy();
    const decoded = decodeSignatureStrokes(encoded);
    expect(decoded).toHaveLength(2);
    expect(decoded[0]).toEqual(strokes[0]);
  });

  it("is robust to malformed payloads", () => {
    expect(decodeSignatureStrokes(undefined)).toEqual([]);
    expect(decodeSignatureStrokes("not-base64")).toEqual([]);
    expect(decodeSignatureStrokes(btoa("{}"))).toEqual([]);
    expect(decodeSignatureStrokes(btoa(JSON.stringify([[0, 0]])))).toEqual([]);
    expect(decodeSignatureStrokes(btoa(JSON.stringify([{ points: [[0, 0], [1e9, 2]] }])))).toEqual([]);
  });
});

describe("buildSignatureSvg", () => {
  it("renders polylines when signed and a placeholder when empty", () => {
    const signed = buildSignatureSvg(strokesToBase64([[[5, 5], [50, 60]]]));
    expect(signed).toContain("<svg");
    expect(signed).toContain("<polyline");
    const empty = buildSignatureSvg(undefined);
    expect(empty).not.toContain("<polyline");
  });
});

describe("buildContractHtml", () => {
  it("produces a full RTL agreement with escaped guest and terms", () => {
    const html = buildContractHtml({
      businessName: "منشأة <الواحة>",
      guestName: "سارة & علي",
      phone: "+962791234567",
      chaletName: "شاليه الياسمين",
      bookingReference: "R-2026-001",
      bookingTypeLabel: "يوم كامل",
      startDateLabel: "2026/01/01",
      endDateLabel: "2026/01/02",
      rentalTotal: "200.00 د.أ",
      depositAmount: "50.00 د.أ",
      terms: "لا يُسمح بإقامة ضيوف إضافيين.\nالإتلاف يُخصم من التأمين.",
      signatureBase64: strokesToBase64([[[0, 0], [40, 60]]]),
      signedByName: "سارة",
      signedAtLabel: "2026/01/01",
    });
    expect(html).toContain("dir=\"rtl\"");
    expect(html).toContain("منشأة &lt;الواحة&gt;");
    expect(html).toContain("سارة &amp; علي");
    expect(html).toContain("<li>لا يُسمح بإقامة ضيوف إضافيين.</li>");
    expect(html).toContain("<svg");
    expect(html).toContain("توقيع الضيف الإلكتروني");
  });

  it("tolerates a missing signature and missing reference", () => {
    const html = buildContractHtml({ businessName: "X", guestName: "G", phone: "1", bookingTypeLabel: "-", startDateLabel: "-", endDateLabel: "-", rentalTotal: "1", depositAmount: "0", terms: "" });
    expect(html).toContain("مرجع الحجز غير متوفر");
    expect(html).toContain("unsigned");
  });
});

describe("contractTermsSnapshot", () => {
  it("records booking identity plus the agreed terms as a stable string", () => {
    const settings = DEFAULT_SETTINGS;
    const snapshot = contractTermsSnapshot({
      bookingReference: "R-1001",
      customerName: "أحمد",
      phone: "0797402940",
      chaletName: "شاليه الأمل",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      bookingType: "24h",
      startTime: "12:00",
      endTime: "12:00",
    }, settings, "الأول: إخلاء الوحدة بحالة نظيفة.\nالثاني: معاقبة الإتلاف.");
    expect(snapshot).toContain("الضيف: أحمد · الهاتف: 0797402940");
    expect(snapshot).toContain("R-1001");
    expect(snapshot).toContain("الأول: إخلاء الوحدة بحالة نظيفة.");
    expect(snapshot).toContain("الثاني: معاقبة الإتلاف.");
    expect(settings.businessName).toBeTruthy();
  });
});