import { describe, expect, it } from "vitest";
import { buildCheckInAlertNotification, buildContractSignedNotification, buildMaintenanceDueNotification, buildNewBookingNotification, buildPaymentReceivedNotification, notificationDeepLink, notificationRecipientLabel, notificationsForRecipient, notificationTypeIcon, notificationTypeLabel, sortNotifications, unreadNotificationCount } from "../lib/notification-center";
import { type InAppNotification, type NotificationRecipient } from "../lib/booking-model";

const notification: InAppNotification = { id: "n1", recipients: ["owner", "manager"], type: "new_booking", title: "حجز جديد مؤكد", body: "أحمد", isRead: false, createdAt: "2026-01-01T09:00:00.000Z" };

const withRecipients = (recipients: NotificationRecipient[]): InAppNotification => ({ ...notification, id: `n-${Date.now()}-${recipients.join("-")}`, recipients });

describe("notification labels and icons", () => {
  it("localizes notification types and recipients", () => {
    expect(notificationTypeLabel("maintenance_due", "ar")).toBe("صيانة مستحقة");
    expect(notificationTypeLabel("contract_signed", "en")).toBe("Contract signed");
    expect(notificationRecipientLabel("guard", "ar")).toBe("الحارس");
  });

  it("maps icons per type", () => {
    expect(notificationTypeIcon("new_booking")).toBe("event-available");
    expect(notificationTypeIcon("payment_received")).toBe("payments");
  });
});

describe("notification builders", () => {
  it("builds Arabic messages with booking context", () => {
    const booking = { customerName: "أحمد", chaletName: "شاليه الأمل", bookingReference: "R-1001" };
    expect(buildNewBookingNotification(booking, "ar", "منشأة الواحة").body).toContain("أحمد · شاليه الأمل · #R-1001 · منشأة الواحة");
    expect(buildPaymentReceivedNotification(booking, 200, "د.أ", "ar").body).toContain("200.00 د.أ");
    expect(buildMaintenanceDueNotification({ title: "فحص المكيف", chaletName: "شاليه الأمل", nextDueDate: "2026-01-10" }, "ar").title).toBe("مهمة صيانة مستحقة");
    expect(buildContractSignedNotification({ guestName: "أحمد", bookingReference: "R-1001", chaletName: "شاليه الأمل" }, "ar").title).toBe("تم توقيع عقد الإيجار");
    expect(buildCheckInAlertNotification({ customerName: "أحمد", chaletName: "شاليه الأمل", startTime: "15:00" }, "ar").body).toContain("الوصول 15:00");
  });
});

describe("notification aggregation", () => {
  it("sorts unread first then newest", () => {
    const older = { ...notification, id: "n-old", createdAt: "2026-01-01T08:00:00.000Z" };
    const newerRead = { ...notification, id: "n-new", createdAt: "2026-01-02T10:00:00.000Z", isRead: true };
    const sorted = sortNotifications([newerRead, older]);
    expect(sorted.map((item) => item.id)).toEqual([older.id, newerRead.id]);
  });

  it("counts unread and filters by recipient", () => {
    const ownerOnly = withRecipients(["owner"]);
    const guardOnly = withRecipients(["guard"]);
    expect(unreadNotificationCount([notification, ownerOnly, guardOnly])).toBe(3);
    expect(notificationsForRecipient([notification, ownerOnly, guardOnly], ["manager"]).map((item) => item.id)).toEqual([notification.id]);
  });
});

describe("notificationDeepLink", () => {
  it("routes notifications to their context screen", () => {
    expect(notificationDeepLink({ type: "maintenance_due", dataPayload: {} })).toBe("/maintenance-dashboard");
    expect(notificationDeepLink({ type: "new_booking", dataPayload: { bookingId: "b1" } })).toBe("/booking-detail?id=b1");
    expect(notificationDeepLink({ type: "contract_signed", dataPayload: {} })).toBe("/bookings");
  });
});