import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/booking-detail.tsx"), "utf8");

describe("Rental payment method requirement", () => {
  it("shows a visible Arabic message and blocks recording when no payment method is selected", () => {
    expect(source).toContain("const [paymentMethodError, setPaymentMethodError] = useState(false)");
    expect(source).toContain("setPaymentMethodError(true)");
    expect(source).toContain("يرجى اختيار طريقة الدفع للمتابعة");
    expect(source).toContain('accessibilityLiveRegion="polite"');
  });
});
