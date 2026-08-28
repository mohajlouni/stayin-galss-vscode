import { formatBookingReference } from "./booking-model";

export type FinancialReceipt = {
  businessName: string;
  guestName: string;
  chaletName?: string;
  bookingReference?: string;
  movementTitle: string;
  amountLabel: string;
  dateLabel: string;
  timeLabel?: string;
  paymentMethodLabel: string;
  note?: string;
};

const escapeHtml = (value: string | undefined) => (value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character] ?? character);

export function buildFinancialReceiptHtml(receipt: FinancialReceipt) {
  const row = (label: string, value: string | undefined) => value ? `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value)}</td></tr>` : "";
  const bookingReference = receipt.bookingReference ? formatBookingReference(receipt.bookingReference) : undefined;
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>@page{margin:24px}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#12231f;background:#fff;margin:0;direction:rtl}.card{border:1px solid #b9d4ca;border-radius:18px;padding:24px}.brand{color:#0f8b83;font-size:14px;font-weight:700}.title{font-size:24px;font-weight:800;margin:8px 0 4px}.subtitle{color:#61736e;font-size:13px;margin:0 0 20px}.amount{background:#eaf8ef;color:#168247;border-radius:12px;padding:15px;font-size:22px;font-weight:800;text-align:center;margin:12px 0 16px}table{width:100%;border-collapse:collapse}td{padding:11px 0;border-bottom:1px solid #e2ece8;font-size:13px}td:first-child{color:#61736e;width:40%}td:last-child{text-align:left;font-weight:700;direction:rtl}.foot{margin-top:20px;color:#72847e;font-size:11px;text-align:center}</style></head><body><main class="card"><div class="brand">${escapeHtml(receipt.businessName || "حاجز — إدارة الحجوزات")}</div><h1 class="title">إيصال حركة مالية</h1><p class="subtitle">${escapeHtml(receipt.movementTitle)}</p><div class="amount">${escapeHtml(receipt.amountLabel)}</div><table>${row("العميل", receipt.guestName)}${row("الشاليه", receipt.chaletName)}${row("رقم الحجز", bookingReference)}${row("التاريخ", receipt.dateLabel)}${row("الوقت", receipt.timeLabel)}${row("طريقة الحركة", receipt.paymentMethodLabel)}${row("ملاحظة", receipt.note)}</table><p class="foot">تم إنشاء هذا الإيصال من تطبيق حاجز لإدارة الحجوزات.</p></main></body></html>`;
}
