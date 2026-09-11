import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

import { type StaffFloatLedgerEntry, type StaffFloatLedgerEntryKind } from "./reporting";

type LedgerStatementExportInput = {
  businessName: string;
  currency: string;
  staffLabel: string;
  staffName?: string;
  generatedLabel: string;
  periodLabel: string;
  language: "ar" | "en";
  openingBalance: number;
  closingBalance: number;
  collected: number;
  expenses: number;
  handedOver: number;
  kindLabels: Record<StaffFloatLedgerEntryKind, string>;
  entries: StaffFloatLedgerEntry[];
  formatDate: (value: string) => string;
};

const escapeHtml = (value: string | number) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

export function buildLedgerStatementHtml({ businessName, currency, staffLabel, staffName, generatedLabel, periodLabel, language, openingBalance, closingBalance, collected, expenses, handedOver, kindLabels, entries, formatDate }: LedgerStatementExportInput) {
  const isArabic = language === "ar";
  const money = (amount: number) => `${Number(amount || 0).toFixed(2)} ${currency}`;
  const kpiCards = [
    [isArabic ? "الرصيد المعلق الحالي" : "Current pending balance", money(closingBalance), isArabic ? "صافي الذمة بنهاية الفترة" : "Net due at period end"],
    [isArabic ? "إجمالي المحصل (المستلم)" : "Total collected (received)", money(collected), isArabic ? "إيجار وتأمين" : "Rent and deposits"],
    [isArabic ? "إجمالي المصروفات (المرجوع / الخصم)" : "Total expenses (refunded / deducted)", money(expenses), isArabic ? "فواتير مصروفات العهدة" : "Float expense invoices"],
    [isArabic ? "إجمالي المورَّد للمالك" : "Total handed over to owner", money(handedOver), isArabic ? "توريدات مؤكدة" : "Approved transfers"],
  ].map(([label, value, hint]) => `<div class="kpi"><div class="kpiLabel">${escapeHtml(label)}</div><div class="kpiValue">${escapeHtml(value)}</div><div class="kpiHint">${escapeHtml(hint)}</div></div>`).join("");
  const rowCells = (entry: StaffFloatLedgerEntry) => {
    const positive = entry.amount >= 0;
    return [
      `<td class="date">${escapeHtml(formatDate(entry.date))}</td>`,
      `<td>${escapeHtml(entry.id)}</td>`,
      `<td><span class="badge">${escapeHtml(kindLabels[entry.kind])}</span></td>`,
      `<td class="note">${escapeHtml(entry.label)}</td>`,
      positive ? `<td class="inflow">${escapeHtml(money(entry.amount))}</td><td class="muted">—</td>` : `<td class="muted">—</td><td class="outflow">${escapeHtml(money(Math.abs(entry.amount)))}</td>`,
      `<td class="balance">${escapeHtml(money(entry.runningBalance))}</td>`,
    ].join("");
  };
  const tableRows = entries.length ? entries.map((entry) => `<tr>${rowCells(entry)}</tr>`).join("") : `<tr><td colspan="7" class="empty">${isArabic ? "لا توجد حركات ضمن هذه الفترة" : "No movements in this period"}</td></tr>`;

  return `<!DOCTYPE html><html dir="${isArabic ? "rtl" : "ltr"}" lang="${language}"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><style>@page{margin:20px}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#102A27;background:#fff;margin:0;direction:${isArabic ? "rtl" : "ltr"}}h1{font-size:22px;margin:0}.subtitle{color:#4C6762;font-size:12px;line-height:1.9;direction:${isArabic ? "rtl" : "ltr"}}.kpiGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.kpi{border:1px solid #D5E7E4;border-radius:12px;padding:12px 14px}.kpiLabel{color:#4C6762;font-size:11px;font-weight:700}.kpiValue{font-size:19px;font-weight:800;margin-top:4px;direction:ltr;text-align:${isArabic ? "left" : "right"}}.kpiHint{color:#718682;font-size:10px;margin-top:3px}.section{margin-top:18px;border:1px solid #D5E7E4;border-radius:14px;overflow:hidden;page-break-inside:auto}.section h2{font-size:14px;margin:0;padding:11px 14px;background:#F2FAF8}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:9px 10px;border-bottom:1px solid #E8F1EF;text-align:${isArabic ? "right" : "left"}}th{color:#4C6762;font-size:10px;background:#FAFDFC}tr:last-child td{border-bottom:0}.date{white-space:nowrap}.note{color:#35403D}.inflow{color:#15803D;font-weight:700;direction:ltr;text-align:${isArabic ? "left" : "right"}}.outflow{color:#BE123C;font-weight:700;direction:ltr;text-align:${isArabic ? "left" : "right"}}.balance{font-weight:800;direction:ltr;text-align:${isArabic ? "left" : "right"}}.muted{color:#A8B6B2}.badge{display:inline-block;background:#E4F7F2;color:#0F8B83;border-radius:999px;padding:2px 9px;font-size:10px;font-weight:800}.empty{color:#718682;text-align:center!important}.signArea{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:16px}.signBox{border-top:1.5px dashed #9DB5B0;padding-top:8px;color:#35403D;font-size:12px;text-align:center;min-height:58px}.footer{color:#718682;font-size:10px;text-align:center;margin-top:18px}</style></head><body><header><h1>${escapeHtml(businessName || (isArabic ? "StayIn" : "StayIn"))}</h1><div class="subtitle">${escapeHtml(isArabic ? "كشف حساب عهدة موظف" : "Staff float statement")} · ${escapeHtml(periodLabel)}<br/>${escapeHtml(staffLabel)}${staffName ? ` · ${escapeHtml(staffName)}` : ""} · ${escapeHtml(generatedLabel)}</div></header><section><h2>${escapeHtml(isArabic ? "الملخص المالي للفترة" : "Period financial summary")}</h2><div class="kpiGrid">${kpiCards}</div></section><section class="section"><h2>${escapeHtml(isArabic ? "سجل الحركات الكرونولوجي" : "Chronological movements")}</h2><table><thead><tr><th>${isArabic ? "التاريخ" : "Date"}</th><th>${isArabic ? "المرجع" : "Reference"}</th><th>${isArabic ? "النوع" : "Type"}</th><th>${isArabic ? "البيان" : "Notes"}</th><th>${isArabic ? "واردة (+)" : "Inflow (+)"}</th><th>${isArabic ? "صادرة (-)" : "Outflow (-)"}</th><th>${isArabic ? "الرصيد الجاري" : "Running balance"}</th></tr></thead><tbody>${tableRows}</tbody></table></section><div class="signArea"><div class="signBox">${isArabic ? "توقيع الموظف (المسلّم)" : "Staff signature (deliverer)"}</div><div class="signBox">${isArabic ? "توقيع الإدارة (المستلم)" : "Management signature (receiver)"}</div></div><div class="footer">${escapeHtml(isArabic ? "سند تسوية عهدة — صادر من تطبيق StayIn" : "Float settlement statement — issued by StayIn")}</div></body></html>`;
}

export async function exportLedgerStatementPdf(input: LedgerStatementExportInput) {
  const html = buildLedgerStatementHtml(input);
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") {
      const reportWindow = window.open("", "_blank");
      if (reportWindow) {
        reportWindow.document.write(html);
        reportWindow.document.close();
        reportWindow.focus();
        reportWindow.print();
        return;
      }
    }
    throw new Error("ledger-statement-popup-blocked");
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { dialogTitle: input.language === "ar" ? "مشاركة كشف حساب العهدة" : "Share float statement", mimeType: "application/pdf", UTI: ".pdf" });
    return;
  }
  throw new Error("ledger-statement-sharing-unavailable");
}