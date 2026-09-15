import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { cn } from "@/lib/utils";
import { DynamicGlassBackground } from "@/components/dynamic-glass-background";

export interface ScreenContainerProps extends ViewProps {
  edges?: Edge[];
  className?: string;
  containerClassName?: string;
  safeAreaClassName?: string;
  /**
   * المشهد الزجاجي الخلفي زخرفي بالكامل. الشاشات التي تحتاج خلفية صلبة نظيفة
   * (شاشة الدخول مثلًا) تمرّر `false` فلا يُركّب أي مشهد خلفي فوق المحتوى.
   */
  ambientBackground?: boolean;
}

export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
  ambientBackground = true,
  style,
  ...props
}: ScreenContainerProps) {
  const { direction } = useAppPreferences();
  const colors = useColors();
  return (
    <View
      className={cn("flex-1", "bg-background", containerClassName)}
      style={[{ flex: 1, minHeight: 0, direction, backgroundColor: colors.background }, style]}
      {...props}
    >
      {ambientBackground ? <DynamicGlassBackground /> : null}
      <SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={{ flex: 1, minHeight: 0, zIndex: 1, backgroundColor: "transparent" }}>
        <View className={cn("flex-1", className)} style={{ flex: 1, minHeight: 0, zIndex: 1, direction, backgroundColor: "transparent" }}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
