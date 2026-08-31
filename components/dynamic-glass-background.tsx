import { StyleSheet, View } from "react-native";

import { GlassSceneBackground } from "@/components/glass-scene-background";

/**
 * DynamicGlassBackground — الخلفية الزجاجية الديناميكية الموحّدة.
 * تعرض المشهد الزجاجي الأنيق الوحيد (كنفاس فضاء متدرج + ضوء SVG خالص)
 * خلف جميع الشاشات. لا صناديق معتمة — ضوء غير مباشر فقط.
 */
export function DynamicGlassBackground() {
  return (
    <View pointerEvents="none" style={styles.layer}>
      <GlassSceneBackground />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: "hidden",
  },
});