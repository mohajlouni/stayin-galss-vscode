import { View, type ViewProps } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { cn } from "@/lib/utils";
import { AmbientScreenBackground } from "@/components/ambient-screen-background";

export interface ScreenContainerProps extends ViewProps {
  edges?: Edge[];
  className?: string;
  containerClassName?: string;
  safeAreaClassName?: string;
}

export function ScreenContainer({
  children,
  edges = ["top", "left", "right"],
  className,
  containerClassName,
  safeAreaClassName,
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
      <AmbientScreenBackground />
      <SafeAreaView edges={edges} className={cn("flex-1", safeAreaClassName)} style={{ flex: 1, minHeight: 0, zIndex: 1, backgroundColor: "transparent" }}>
        <View className={cn("flex-1", className)} style={{ flex: 1, minHeight: 0, zIndex: 1, direction, backgroundColor: "transparent" }}>{children}</View>
      </SafeAreaView>
    </View>
  );
}
