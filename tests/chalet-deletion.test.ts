import { describe, expect, it } from "vitest";

import { chaletLinkedBookingCount } from "../lib/booking-model";

describe("chalet deletion safeguards", () => {
  it("counts every linked booking state before confirming deletion", () => {
    const bookings = [
      { chaletId: "chalet-1", status: "confirmed" },
      { chaletId: "chalet-1", status: "completed" },
      { chaletId: "chalet-1", status: "cancelled" },
      { chaletId: "chalet-2", status: "confirmed" },
    ] as never;
    expect(chaletLinkedBookingCount("chalet-1", bookings)).toBe(3);
    expect(chaletLinkedBookingCount("chalet-2", bookings)).toBe(1);
  });
});
