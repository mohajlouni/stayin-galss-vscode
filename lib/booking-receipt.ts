import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { APP_BRAND_LOGO_URL } from "./brand";
import { buildBookingReceiptHtml, type BookingReceipt } from "./booking-receipt-markup";

export { buildBookingReceiptHtml, type BookingReceipt } from "./booking-receipt-markup";

export async function shareBookingReceipt(receipt: BookingReceipt) {
  if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) return false;
  const receiptWithBrandLogo = { ...receipt, businessLogoUrl: receipt.businessLogoUrl || APP_BRAND_LOGO_URL };
  const { uri } = await Print.printToFileAsync({ html: buildBookingReceiptHtml(receiptWithBrandLogo) });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: ".pdf", dialogTitle: "مشاركة إيصال الحجز" });
  return true;
}
