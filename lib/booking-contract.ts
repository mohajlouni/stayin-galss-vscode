import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { APP_BRAND_LOGO_URL } from "./brand";

export type BookingContract = {
  businessName: string;
  businessLogoUrl?: string;
  guestName: string;
  phone: string;
  chaletName: string;
  bookingReference?: string;
  bookingType: string;
  checkInLabel: string;
  checkOutLabel: string;
  rentalTotal: string;
  depositHeld: string;
  customTerms?: string;
};

const escapeHtml = (value: string | undefined) => (value ?? "—").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
const detail = (label: string, value: string) => `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;

export function buildBookingContractHtml(contract: BookingContract) {
  const logo = contract.businessLogoUrl || APP_BRAND_LOGO_URL;
  const terms = (contract.customTerms ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
  const renderedTerms = (terms.length ? terms : ["يلتزم الضيف باستخدام الشاليه ومرافقه بعناية والمحافظة على محتوياته.", "يتم توثيق أي تلف مثبت قبل خصمه من مبلغ التأمين وفق سياسة المنشأة.", "يلتزم الضيف بموعد المغادرة المتفق عليه وتسليم الشاليه بالحالة المناسبة."]).map((term) => `<li>${escapeHtml(term)}</li>`).join("");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><style>body{margin:0;background:#f4f8f7;color:#102622;font-family:Arial,sans-serif}.page{padding:26px}.head{background:#0f766e;color:#fff;border-radius:20px;padding:22px;display:flex;align-items:center;gap:12px}.logo{width:48px;height:48px;border-radius:14px;object-fit:cover;background:#fff}.title{font-size:25px;font-weight:800}.sub{font-size:12px;opacity:.82;margin-top:4px}.box{margin-top:14px;background:#fff;border:1px solid #d9e7e3;border-radius:16px;padding:15px}.box h2{font-size:15px;color:#0f766e;margin:0 0 9px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.detail{background:#f6fbf9;border-radius:11px;padding:10px}.detail span{font-size:10px;color:#64807a;display:block;margin-bottom:4px}.detail strong{font-size:13px}.terms{padding:0 18px;margin:0}.terms li{font-size:12px;line-height:1.8;margin:6px 0}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:30px}.signature{border-top:1px solid #93aaa4;padding-top:8px;color:#64807a;font-size:11px;text-align:center}.notice{font-size:10px;line-height:1.6;color:#64807a;margin-top:16px;text-align:center}</style></head><body><main class="page"><header class="head"><img class="logo" src="${escapeHtml(logo)}" alt="شعار المنشأة"/><div><div class="title">عقد إقامة</div><div class="sub">${escapeHtml(contract.businessName)} · ${escapeHtml(contract.bookingReference || "مرجع الحجز غير متوفر")}</div></div></header><section class="box"><h2>أطراف العقد</h2><div class="grid">${detail("العميل", contract.guestName)}${detail("رقم الهاتف", contract.phone)}${detail("الشاليه", contract.chaletName)}${detail("نوع الإقامة", contract.bookingType)}</div></section><section class="box"><h2>تفاصيل الإقامة</h2><div class="grid">${detail("الوصول", contract.checkInLabel)}${detail("المغادرة", contract.checkOutLabel)}${detail("إجمالي الإيجار", contract.rentalTotal)}${detail("التأمين قيد الحيازة", contract.depositHeld)}</div></section><section class="box"><h2>الشروط التشغيلية</h2><ol class="terms">${renderedTerms}</ol></section><section class="signatures"><div class="signature">توقيع العميل</div><div class="signature">اعتماد ممثل المنشأة</div></section><p class="notice">هذا نموذج تشغيلي للمراجعة والمشاركة، وتُراجع شروط المنشأة وسياساتها قبل الاعتماد النهائي.</p></main></body></html>`;
}

export async function shareBookingContract(contract: BookingContract) {
  if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) return false;
  const { uri } = await Print.printToFileAsync({ html: buildBookingContractHtml(contract) });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: ".pdf", dialogTitle: "مشاركة عقد الإقامة" });
  return true;
}
