import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

function extensionFor(uri: string) {
  const match = /\.([a-zA-Z0-9]{2,5})(?:\?.*)?$/.exec(uri);
  return match?.[1]?.toLowerCase() || "jpg";
}

/** Copies a picked photo into app-managed storage so it remains available after restart. */
export async function persistChaletImage(sourceUri: string | undefined, chaletId: string) {
  if (!sourceUri?.trim()) return undefined;
  if (Platform.OS === "web" || !FileSystem.documentDirectory) return sourceUri;
  const directory = `${FileSystem.documentDirectory}chalet-images/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const target = `${directory}${chaletId}-${Date.now()}.${extensionFor(sourceUri)}`;
  await FileSystem.copyAsync({ from: sourceUri, to: target });
  return target;
}

/** Deletes only images owned by this app; external gallery files are never removed. */
export async function removeManagedChaletImage(uri: string | undefined) {
  if (!uri || Platform.OS === "web" || !FileSystem.documentDirectory) return;
  const managedDirectory = `${FileSystem.documentDirectory}chalet-images/`;
  if (!uri.startsWith(managedDirectory)) return;
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
