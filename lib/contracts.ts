import { type Booking, formatBookingReference, type Settings } from "./booking-model";

export type SignatureStroke = { points: Array<[number, number]> };

/** Serializes captured signature strokes into the base64 JSON stored on the contract. */
export function strokesToBase64(strokes: Array<Array<[number, number]>>) {
  try {
    const payload = strokes.filter((points) => Array.isArray(points) && points.length >= 2).map((points) => ({ points }));
    return typeof btoa === "function" ? btoa(JSON.stringify(payload)) : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the stored base64 JSON back into stroke point lists for the signature preview or PDF. */
export function decodeSignatureStrokes(base64?: string): Array<Array<[number, number]>> {
  if (!base64) return [];
  try {
    const decoded = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      const points = Array.isArray(item) ? item : Array.isArray(item && typeof item === "object" && "points" in item ? item.points : undefined) ? (item as { points: unknown }).points : [];
      if (!Array.isArray(points)) return [];
      return points.filter((point): point is [number, number] => Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])) && Math.abs(Number(point[0])) <= 5000 && Math.abs(Number(point[1])) <= 5000).map((point) => [Math.round(Number(point[0]) * 100) / 100, Math.round(Number(point[1]) * 100) / 100] as [number, number]);
    }).filter((points) => points.length >= 2);
  } catch {
    return [];
  }
}

function escapeHtml(value: string | undefined) {
  return (value ?? "—").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function row(label: string, value: string) {
  return `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

/** Renders the stored signature as an inline SVG polyline for the printed PDF, avoiding rasterization. */
export function buildSignatureSvg(base64?: string, width = 360, height = 110) {
  const strokes = decodeSignatureStrokes(base64);
  if (!strokes.length) return `<div class="unsigned">${escapeHtml("لم يوقّع الضيف بعد")}</div>`;
  const polylines = strokes.map((points, index) => `<polyline points="${points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="none" stroke="#102622" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="${index === 0 ? 1 : Math.max(0.55, 1 - index * 0.12)}"/>`).join("");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fdfcfa" rx="12"/><g>${polylines}</g></svg>`;
}

export type ContractHtmlInput = {
  businessName: string;
  businessLogoUrl?: string;
  guestName: string;
  phone: string;
  chaletName?: string;
  bookingReference?: string;
  bookingTypeLabel: string;
  startDateLabel: string;
  endDateLabel: string;
  rentalTotal: string;
  depositAmount: string;
  terms: string;
  signatureBase64?: string;
  signedByName?: string;
  signedAtLabel?: string;
};

export function buildContractHtml(input: ContractHtmlInput) {
  const logo = input.businessLogoUrl ? `<img class="logo" src="${escapeHtml(input.businessLogoUrl)}" alt="شعار المنشأة"/>` : `<div class="logo-fallback">S</div>`;
  const reference = formatBookingReference(input.bookingReference);
  const displayedReference = reference === "—" ? "مرجع الحجز غير متوفر" : reference;
  const termsItems = input.terms.split(/\r?\n/).map((term) => term.trim()).filter(Boolean).map((term) => `<li>${escapeHtml(term)}</li>`).join("");
  const signature = buildSignatureSvg(input.signatureBase64);
  const signerLine = [input.signedByName?.trim(), input.signedAtLabel?.trim()].filter(Boolean).join(" · ");
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"/><style>body{margin:0;background:#f3f7f6;color:#102622;font-family:Arial,sans-serif}.page{padding:28px}.head{background:#0f766e;color:white;border-radius:20px;padding:24px}.head-top{display:flex;gap:12px;align-items:center}.logo,.logo-fallback{width:46px;height:46px;border-radius:14px;background:#fff;color:#0f766e;object-fit:cover;display:flex;align-items:center;justify-content:center;font-size:25px;font-weight:800}.eyebrow{font-size:12px;opacity:.82}.title{font-size:27px;font-weight:800;margin-top:4px}.reference{margin-top:12px;font-size:13px;direction:ltr;text-align:right}.limit{display:flex;gap:6px;margin-top:8px}.tag{background:white;color:#0f766e;border-radius:9px;padding:4px 9px;font-size:11px;font-weight:800}.identity{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.identity div,.section{background:white;border:1px solid #d8e7e3;border-radius:16px;padding:14px}.label{font-size:11px;color:#64807a;margin-bottom:5px}.section{margin-top:15px}.section h2{font-size:15px;margin:0 0 10px;color:#0f766e}.row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid #edf3f1;font-size:13px}.row:last-child{border-bottom:0}.row span{color:#64807a}.row strong{color:#102622;text-align:left}.money{display:grid;grid-template-columns:1fr 1fr;gap:8px}.money div{background:#f4faf8;border-radius:12px;padding:11px}.money span{font-size:10px;color:#64807a;display:block}.money strong{font-size:16px;color:#0f766e;margin-top:5px;display:block}.terms ul{margin:0;padding:0 18px 0 0}.terms li{font-size:13px;line-height:22px;color:#334e49;margin-bottom:7px}.sigbox{background:#fdfcfa;border:1px dashed #b8d3cc;border-radius:16px;padding:16px;margin-top:15px}.sigbox .label{color:#64807a;font-size:11px;font-weight:800}.sigline{margin-top:9px;font-size:12px;color:#334e49}.footer{text-align:center;color:#64807a;font-size:11px;margin-top:22px;line-height:18px}</style></head><body><main class="page"><header class="head"><div class="head-top">${logo}<div><div class="eyebrow">${escapeHtml(input.businessName)} — عقد إيجار رقمي</div><div class="title">اتفاقية إقامة موقّعة من الضيف</div></div></div><div class="reference">${escapeHtml(displayedReference)}</div><div class="limit"><span class="tag">استعارة مرافق</span><span class="tag">إقرار بالتسليم والالتزام</span></div></header><section class="identity"><div><div class="label">الضيف</div><strong>${escapeHtml(input.guestName)}</strong><div class="label" style="margin-top:8px;direction:ltr">${escapeHtml(input.phone)}</div></div><div><div class="label">الوحدة</div><strong>${escapeHtml(input.chaletName)}</strong><div class="label" style="margin-top:8px">${escapeHtml(input.bookingTypeLabel)}</div></div></section><section class="section"><h2>فترة الإقامة</h2>${row("تاريخ الوصول", input.startDateLabel)}${row("تاريخ المغادرة", input.endDateLabel)}</section><section class="section"><h2>التفاصيل المالية</h2><div class="money"><div><span>إجمالي الإيجار</span><strong>${escapeHtml(input.rentalTotal)}</strong></div><div><span>تأمين مسترد</span><strong>${escapeHtml(input.depositAmount)}</strong></div></div></section><section class="section terms"><h2>شروط الإقامة والالتزامات</h2><ul>${termsItems}</ul></section><section class="section sigbox"><div class="label">توقيع الضيف الإلكتروني</div>${signature}<div class="sigline">${escapeHtml(signerLine)}</div></section><div class="footer">هذه الاتفاقية صادرة من ${escapeHtml(input.businessName)} وتوثّق إقرار الضيف بشروط الإقامة عند تأكيد الحجز.<br/>تُحفظ نسخة موقعة تلقائيًا في سجل العقود.</div></main></body></html>`;
}

/** Builds the immutable terms snapshot recorded the moment the agreement is signed. */
export function contractTermsSnapshot(booking: Pick<Booking, "bookingReference" | "customerName" | "phone" | "chaletName" | "startDate" | "endDate" | "bookingType" | "startTime" | "endTime">, settings: Settings, stayContractTerms: string) {
  const typeLabel = settings.bookingTypes[booking.bookingType]?.label ?? booking.bookingType;
  return [
    `مُنشأة: ${settings.businessName}`,
    `مرجع الحجز: ${formatBookingReference(booking.bookingReference)}`,
    `الضيف: ${booking.customerName} · الهاتف: ${booking.phone}`,
    `الوحدة: ${booking.chaletName ?? "-"}`,
    `الفترة: ${booking.startDate} ${booking.startTime ?? ""} ← ${booking.endDate} ${booking.endTime ?? ""} (${typeLabel})`,
    `الشروط المتفق عليها:`,
    ...(stayContractTerms.trim().split(/\r?\n/).map((term) => term.trim()).filter(Boolean)),
  ].join("\n");
}