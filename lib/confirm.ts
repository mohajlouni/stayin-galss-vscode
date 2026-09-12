import { Alert, Platform } from "react-native";

type ConfirmOptions = {
  title: string;
  message: string;
  cancelLabel?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

export function confirmAction({ title, message, cancelLabel = "Cancel", confirmLabel = "OK", destructive = false, onConfirm }: ConfirmOptions): void {
  if (Platform.OS === "web") {
    const webWindow = globalThis as unknown as { confirm?: (text: string) => boolean };
    if (webWindow.confirm?.(message)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel" },
    { text: confirmLabel, style: destructive ? "destructive" : "default", onPress: onConfirm },
  ]);
}

export function showAlert(title: string, message: string): void {
  if (Platform.OS === "web") {
    const webWindow = globalThis as unknown as { alert?: (text: string) => void };
    webWindow.alert?.(message);
    return;
  }
  Alert.alert(title, message);
}