import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

function extensionFor(uri: string) {
  const match = /\.([a-zA-Z0-9]{2,5})(?:\?.*)?$/.exec(uri);
  return match?.[1]?.toLowerCase() || "jpg";
}

/** Copies the optional payment receipt into app-managed storage for reliable local access. */
export async function persistPaymentReceipt(sourceUri: string | undefined, bookingId: string, paymentId: string) {
  if (!sourceUri?.trim() || Platform.OS === "web" || !FileSystem.documentDirectory) return sourceUri;
  const directory = `${FileSystem.documentDirectory}payment-receipts/`;
  if (sourceUri.startsWith(directory)) return sourceUri;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const target = `${directory}${bookingId}-${paymentId}-${Date.now()}.${extensionFor(sourceUri)}`;
  await FileSystem.copyAsync({ from: sourceUri, to: target });
  return target;
}
