import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useRef, useState } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Polyline } from "react-native-svg";
import { useColors } from "@/hooks/use-colors";
import { strokesToBase64 } from "@/lib/contracts";

const CANVAS_WIDTH = 360;
const CANVAS_HEIGHT = 120;

export function SignaturePad({ onChange, language }: { onChange: (base64: string | undefined) => void; language: "ar" | "en" }) {
  const colors = useColors();
  const [layout, setLayout] = useState({ width: 1, height: 1 });
  const [strokes, setStrokes] = useState<Array<[number, number][]>>([]);
  const current = useRef<[number, number][]>([]);
  const drawing = useRef(false);

  const scalePoint = (x: number, y: number): [number, number] => {
    const safeWidth = layout.width > 0 ? layout.width : 1;
    const safeHeight = layout.height > 0 ? layout.height : 1;
    return [Math.max(0, Math.min(1, x / safeWidth)) * CANVAS_WIDTH, Math.max(0, Math.min(1, y / safeHeight)) * CANVAS_HEIGHT];
  };

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setLayout({ width, height });
  };

  const handleStart = (event: GestureResponderEvent) => {
    drawing.current = true;
    current.current = [scalePoint(event.nativeEvent.locationX, event.nativeEvent.locationY)];
    setStrokes((prev) => [...prev, [...current.current]]);
  };

  const handleMove = (event: GestureResponderEvent) => {
    if (!drawing.current) return;
    const point = scalePoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
    current.current = [...current.current, point];
    setStrokes((prev) => prev.map((stroke, index) => index === prev.length - 1 ? [...current.current] : stroke));
  };

  const handleEnd = () => {
    drawing.current = false;
    if (current.current.length < 2) setStrokes((prev) => prev.slice(0, -1));
    onChange(strokesToBase64(strokes));
  };

  const clear = () => {
    drawing.current = false;
    current.current = [];
    setStrokes([]);
    onChange(undefined);
  };

  const emptyStrokes = strokes.length === 0;

  return <View style={styles.wrap}>
    <View
      style={[styles.canvas, { borderColor: colors.border, backgroundColor: colors.surface }]}
      onLayout={handleLayout}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      onTouchCancel={handleEnd}
    >
      {!emptyStrokes ? <Svg width="100%" height="100%" viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}><Polyline points={strokes.flat().map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} stroke={colors.foreground} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg> : <View style={styles.placeholder}><MaterialIcons name="gesture" size={26} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 7 }}>{language === "ar" ? "وقّع هنا بيدك أو بالقلم" : "Sign here with your finger or stylus"}</Text></View>}
    </View>
    <View style={styles.toolbar}>
      <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "مسح التوقيع" : "Clear signature"} onPress={clear} style={({ pressed }) => [styles.clearButton, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="delete-outline" size={16} color={colors.error} /><Text style={{ color: colors.error, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? "مسح" : "Clear"}</Text></Pressable>
      <Text style={{ color: colors.muted, fontSize: 10, flex: 1, textAlign: "center" }}>{language === "ar" ? "التوقيع يُرسَل كرسمة مستقلّة (SVG) دون تلوين الصور" : "The signature is stored as vector strokes (SVG), without rasterization"}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  canvas: { height: 150, width: "100%", borderRadius: 16, borderWidth: 1.4, borderStyle: "dashed", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  placeholder: { alignItems: "center", justifyContent: "center", opacity: 0.75 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
  clearButton: { minHeight: 32, borderRadius: 10, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, borderWidth: 1 },
});