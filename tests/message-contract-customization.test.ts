import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

describe("message and stay-contract customization", () => {
  it("stores visibility controls and editable templates", () => {
    const model = read("lib/booking-model.ts");
    const settings = read("app/(tabs)/settings.tsx");
    expect(model).toContain("showReadyMessages");
    expect(model).toContain("showStayContract");
    expect(model).toContain("readyMessageTemplate");
    expect(model).toContain("arrivalMessageTemplate");
    expect(model).toContain("checkoutMessageTemplate");
    expect(model).toContain("contractSummaryTemplate");
    expect(model).toContain("stayContractTerms");
    expect(settings).toContain("التواصل وعقد الإقامة");
  });

  it("uses custom text in the confirmation message and contract clauses", () => {
    const messages = read("lib/whatsapp-helper.ts");
    const contract = read("lib/booking-contract.ts");
    const detail = read("app/booking-detail.tsx");
    expect(messages).toContain("customConfirmationTemplate");
    expect(messages).toContain("customArrivalTemplate");
    expect(messages).toContain("customCheckoutTemplate");
    expect(messages).toContain("customContractSummaryTemplate");
    expect(messages).toContain("{العميل}");
    expect(contract).toContain("customTerms");
    expect(contract).toContain("renderedTerms");
    expect(detail).toContain("deviceSettings.showReadyMessages");
    expect(detail).toContain("deviceSettings.showStayContract");
    expect(detail).toContain("إدارة القوالب");
    expect(detail).toContain("TemplateManager");
  });
});
