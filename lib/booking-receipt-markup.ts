import { formatBookingReference } from "./booking-model";

export type BookingReceipt = {
  businessName: string;
  businessLogoUrl?: string;
  guestName: string;
  phone: string;
  chaletName: string;
  bookingReference?: string;
  bookingType: string;
  checkInLabel: string;
  checkOutLabel: string;
  periodLabel: string;
  rentalTotal: string;
  paidAmount: string;
  rentalBalance: string;
  initialPaymentMethod?: string;
  arrivalPaymentMethod?: string;
  depositRecorded: string;
  depositPaymentMethod?: string;
  depositRefunded: string;
  depositHeld: string;
};

function escapeHtml(value: string | undefined) {
  return (value ?? "—").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function row(label: string, value: string) {
  return `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export function buildBookingReceiptHtml(receipt: BookingReceipt) {
  const logo = receipt.businessLogoUrl ? `<img class="logo" src="${escapeHtml(receipt.businessLogoUrl)}" alt="شعار المنشأة"/>` : `<div class="logo-fallback">S</div>`;
  const bookingReference = formatBookingReference(receipt.bookingReference);
  const displayedReference = bookingReference === "—" ? "مرجع الحجز غير متوفر" : bookingReference;
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><style>body{margin:0;background:#f3f7f6;color:#102622;font-family:Arial,sans-serif}.page{padding:28px}.head{background:#0f766e;color:white;border-radius:20px;padding:24px}.head-top{display:flex;gap:12px;align-items:center}.logo,.logo-fallback{width:46px;height:46px;border-radius:14px;background:#fff;color:#0f766e;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:25px;font-weight:800}.eyebrow{font-size:12px;opacity:.82}.title{font-size:27px;font-weight:800;margin-top:4px}.reference{margin-top:12px;font-size:13px;direction:ltr;text-align:right}.identity{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.identity div,.section{background:white;border:1px solid #d8e7e3;border-radius:16px;padding:14px}.label{font-size:11px;color:#64807a;margin-bottom:5px}.section{margin-top:15px}.section h2{font-size:15px;margin:0 0 10px;color:#0f766e}.row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid #edf3f1;font-size:13px}.row:last-child{border-bottom:0}.row span{color:#64807a}.row strong{color:#102622;text-align:left;direction:rtl}.money{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.money div{background:#f4faf8;border-radius:12px;padding:11px}.money span{font-size:10px;color:#64807a;display:block}.money strong{font-size:15px;color:#102622;margin-top:5px;display:block}.balance strong{color:#b7791f}.footer{text-align:center;color:#64807a;font-size:11px;margin-top:20px}</style></head><body><main class="page"><header class="head"><div class="head-top">${logo}<div><div class="eyebrow">${escapeHtml(receipt.businessName)}</div><div class="title">إيصال حجز</div></div></div><div class="reference">${escapeHtml(displayedReference)}</div></header><section class="identity"><div><div class="label">العميل</div><strong>${escapeHtml(receipt.guestName)}</strong><div class="label" style="margin-top:6px;direction:ltr;text-align:right">${escapeHtml(receipt.phone)}</div></div><div><div class="label">الشاليه</div><strong>${escapeHtml(receipt.chaletName)}</strong><div class="label" style="margin-top:6px">${escapeHtml(receipt.bookingType)}</div></div></section><section class="section"><h2>تفاصيل الإقامة</h2>${row("الوصول", receipt.checkInLabel)}${row("المغادرة", receipt.checkOutLabel)}${row("وقت الفترة", receipt.periodLabel)}</section><section class="section"><h2>ملخص الإيجار</h2><div class="money"><div><span>إجمالي الإيجار</span><strong>${escapeHtml(receipt.rentalTotal)}</strong></div><div><span>المدفوع</span><strong>${escapeHtml(receipt.paidAmount)}</strong></div><div class="balance"><span>المتبقي</span><strong>${escapeHtml(receipt.rentalBalance)}</strong></div></div>${receipt.initialPaymentMethod ? row("طريقة الدفعة الأولى", receipt.initialPaymentMethod) : ""}${receipt.arrivalPaymentMethod ? row("طريقة دفعة الوصول", receipt.arrivalPaymentMethod) : ""}</section><section class="section"><h2>التأمين</h2><div class="money"><div><span>المسجل</span><strong>${escapeHtml(receipt.depositRecorded)}</strong></div><div><span>المسترد</span><strong>${escapeHtml(receipt.depositRefunded)}</strong></div><div><span>قيد الحيازة</span><strong>${escapeHtml(receipt.depositHeld)}</strong></div></div>${receipt.depositPaymentMethod ? row("طريقة استلام التأمين", receipt.depositPaymentMethod) : ""}</section><div class="footer">تم إنشاء الإيصال من ${escapeHtml(receipt.businessName)}</div></main></body></html>`;
}
