import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { resolveErrorMessage } from "@/lib/errors";

type AppErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
  /** شاشة بديلة بألوان ثابتة متوافقة مع زجاج Obsidian الداكن (تعمل حتى خارج ThemeProvider). */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type AppErrorBoundaryState = { error: Error | null };

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.root}>
        <View style={styles.glass}>
          <MaterialIcons name="error-outline" size={44} color="#FF6B47" />
          <Text style={styles.title}>{this.props.title ?? "حدث خطأ غير متوقع"}</Text>
          <Text style={styles.detail}>{resolveErrorMessage(this.state.error, "تعذر عرض الشاشة الحالية. أعد المحاولة أو أعد تشغيل التطبيق.")}</Text>
          <Pressable accessibilityRole="button" onPress={this.reset} style={({ pressed }) => [styles.button, { opacity: pressed ? 0.78 : 1 }]}>
            <MaterialIcons name="refresh" size={19} color="#070B10" />
            <Text style={styles.buttonText}>إعادة المحاولة</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 26, backgroundColor: "#070B10" },
  glass: { width: "100%", maxWidth: 420, alignItems: "center", gap: 14, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 30, backgroundColor: "rgba(17, 24, 39, 0.58)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.06)", shadowColor: "#FF6B47", shadowOpacity: 0.14, shadowRadius: 26, shadowOffset: { width: 0, height: 6 } },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", textAlign: "right" },
  detail: { color: "#8FA0B5", fontSize: 13, lineHeight: 21, textAlign: "right" },
  button: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#FF6B47", marginTop: 6 },
  buttonText: { color: "#070B10", fontSize: 13, fontWeight: "900" },
});