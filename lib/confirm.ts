import { Alert, Platform } from "react-native";

export function showAlert(title: string, message: string): void {
  if (Platform.OS === "web") {
    const webWindow = globalThis as unknown as { alert?: (text: string) => void };
    webWindow.alert?.(message);
    return;
  }
  Alert.alert(title, message);
}