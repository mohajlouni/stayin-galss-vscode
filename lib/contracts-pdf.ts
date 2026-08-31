import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { APP_BRAND_LOGO_URL } from "./brand";
import { buildContractHtml, type ContractHtmlInput } from "./contracts";

export { buildContractHtml, type ContractHtmlInput } from "./contracts";

/** Generates the digital lease PDF and opens the native share sheet (non-web). */
export async function shareContractPdf(input: ContractHtmlInput) {
  if (Platform.OS === "web" || !(await Sharing.isAvailableAsync())) return false;
  const signedContract = { ...input, businessLogoUrl: input.businessLogoUrl || APP_BRAND_LOGO_URL };
  const { uri } = await Print.printToFileAsync({ html: buildContractHtml(signedContract) });
  await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: ".pdf", dialogTitle: "مشاركة عقد الإيجار" });
  return true;
}