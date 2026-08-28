import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { buildFinancialReceiptHtml, type FinancialReceipt } from "./financial-receipt-markup";

export { buildFinancialReceiptHtml, type FinancialReceipt } from "./financial-receipt-markup";

export async function shareFinancialReceipt(receipt: FinancialReceipt) {
  if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) return false;
  const { uri } = await Print.printToFileAsync({ html: buildFinancialReceiptHtml(receipt) });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: ".pdf", dialogTitle: "مشاركة إيصال الحركة المالية" });
  return true;
}
