import { type Booking, type InAppNotification, type LeaseContract, type MaintenanceTask, type NotificationRecipient, type NotificationType } from "./booking-model";

export function notificationTypeLabel(type: NotificationType, language: "ar" | "en") {
  return ({ new_booking: ["حجز جديد", "New booking"], payment_received: ["دفعة مستلمة", "Payment received"], checkin_alert: ["تنبيه وصول", "Check-in alert"], maintenance_due: ["صيانة مستحقة", "Maintenance due"], contract_signed: ["عقد موقّع", "Contract signed"], weather_advisory: ["تنبيه طقس", "Weather advisory"] } as const)[type][language === "ar" ? 0 : 1];
}

export function notificationTypeIcon(type: NotificationType): "event-available" | "payments" | "login" | "construction" | "description" | "wb-cloudy" {
  return type === "new_booking" ? "event-available" : type === "payment_received" ? "payments" : type === "checkin_alert" ? "login" : type === "maintenance_due" ? "construction" : type === "contract_signed" ? "description" : "wb-cloudy";
}

export function notificationRecipientLabel(recipient: NotificationRecipient, language: "ar" | "en") {
  return ({ owner: ["المالك", "Owner"], manager: ["المدير", "Manager"], guard: ["الحارس", "Guard"], all: ["الجميع", "Everyone"] } as const)[recipient][language === "ar" ? 0 : 1];
}

export function notificationDeepLink(notification: Pick<InAppNotification, "type" | "dataPayload">) {
  const bookingId = notification.dataPayload?.bookingId;
  if (notification.type === "maintenance_due") return "/maintenance-dashboard";
  if (notification.type === "contract_signed") return bookingId ? `/booking-detail?id=${encodeURIComponent(bookingId)}` : "/bookings";
  if (notification.type === "checkin_alert" || notification.type === "payment_received") return bookingId ? `/booking-detail?id=${encodeURIComponent(bookingId)}` : "/bookings";
  return bookingId ? `/booking-detail?id=${encodeURIComponent(bookingId)}` : "/bookings";
}

export function buildNewBookingNotification(booking: Pick<Booking, "customerName" | "chaletName" | "bookingReference">, language: "ar" | "en", businessName = ""): { title: string; body: string } {
  return {
    title: language === "ar" ? "حجز جديد مؤكد" : "New confirmed booking",
    body: language === "ar"
      ? `${booking.customerName} · ${booking.chaletName ?? "شاليه غير محدد"} · ${formatReference(booking.bookingReference)}${businessName ? ` · ${businessName}` : ""}`
      : `${booking.customerName} · ${booking.chaletName ?? "Unspecified chalet"} · ${formatReference(booking.bookingReference)}${businessName ? ` · ${businessName}` : ""}`,
  };
}

export function buildPaymentReceivedNotification(booking: Pick<Booking, "customerName" | "chaletName" | "bookingReference">, amount: number, currency: string, language: "ar" | "en"): { title: string; body: string } {
  const formattedAmount = `${amount.toFixed(2)} ${currency}`;
  return {
    title: language === "ar" ? "تم استلام دفعة" : "Payment received",
    body: language === "ar" ? `${booking.customerName} · ${formattedAmount} · ${formatReference(booking.bookingReference)}` : `${booking.customerName} · ${formattedAmount} · ${formatReference(booking.bookingReference)}`,
  };
}

export function buildCheckInAlertNotification(booking: Pick<Booking, "customerName" | "chaletName" | "startTime">, language: "ar" | "en"): { title: string; body: string } {
  return {
    title: language === "ar" ? "تم تسجيل وصول الضيف" : "Guest checked in",
    body: language === "ar" ? `${booking.customerName} · ${booking.chaletName ?? ""} · الوصول ${booking.startTime ?? ""}` : `${booking.customerName} · ${booking.chaletName ?? ""} · arrival ${booking.startTime ?? ""}`,
  };
}

export function buildMaintenanceDueNotification(task: Pick<MaintenanceTask, "title" | "chaletName" | "nextDueDate">, language: "ar" | "en"): { title: string; body: string } {
  return {
    title: language === "ar" ? "مهمة صيانة مستحقة" : "Maintenance task due",
    body: language === "ar" ? `${task.title} · ${task.chaletName ?? ""} · تستحق ${task.nextDueDate}` : `${task.title} · ${task.chaletName ?? ""} · due ${task.nextDueDate}`,
  };
}

export function buildContractSignedNotification(contract: Pick<LeaseContract, "guestName" | "bookingReference" | "chaletName">, language: "ar" | "en"): { title: string; body: string } {
  return {
    title: language === "ar" ? "تم توقيع عقد الإيجار" : "Lease agreement signed",
    body: language === "ar" ? `${contract.guestName} · ${contract.chaletName ?? ""} · ${formatReference(contract.bookingReference)}` : `${contract.guestName} · ${contract.chaletName ?? ""} · ${formatReference(contract.bookingReference)}`,
  };
}

export function sortNotifications(notifications: InAppNotification[]) {
  return [...notifications].sort((left, right) => Number(left.isRead) - Number(right.isRead) || right.createdAt.localeCompare(left.createdAt));
}

export function unreadNotificationCount(notifications: InAppNotification[]) {
  return notifications.filter((notification) => !notification.isRead).length;
}

export function notificationsForRecipient(notifications: InAppNotification[], recipients: NotificationRecipient[]) {
  return notifications.filter((notification) => notification.recipients.some((recipient) => recipients.includes(recipient) || recipient === "all"));
}

function formatReference(reference: string | undefined) {
  return reference ? `#${reference.replace(/^#+/, "")}` : "—";
}

export const NOTIFICATION_FILTERS = ["all", "new_booking", "payment_received", "checkin_alert", "maintenance_due", "contract_signed", "weather_advisory"] as const;
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];