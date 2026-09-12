/** مُوحِّد النص العربي المشترك الذي يُبنى عليه محرّك البحث الذكي في كل الشاشات.
 *  يزيل التشكيل والحركات، ويكسر التطويل، ويوحّد الألف والياء والتاء المربوطة
 *  والواو والهمزة، بحيث يطابق البحث "أحمد/احمد" و"فاطمة/فاطمه" و"العُهدة/العهده".
 */

const ARABIC_DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

/** يوحّد أي نص (نصّي أو رقمي أو فارغ) إلى شكل قابل للمطابقة الآمنة في البحث. */
export function normalizeArabicText(text: string | number | null | undefined): string {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .toLowerCase()
    .trim();
}