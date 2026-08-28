import { Text, View } from "react-native";

export type ChaletMapCoordinate = { latitude: number; longitude: number };

export function ChaletMapPicker({ coordinate }: { coordinate: ChaletMapCoordinate; onChange: (coordinate: ChaletMapCoordinate) => void }) {
  return <View style={{ height: 160, alignItems: "center", justifyContent: "center", padding: 18, backgroundColor: "#0F1F1D", borderRadius: 14 }}><Text style={{ color: "#C7D7D2", textAlign: "center", lineHeight: 20 }}>الخريطة التفاعلية متاحة داخل تطبيق Android أو iOS. الإحداثيات الحالية: {coordinate.latitude.toFixed(5)}, {coordinate.longitude.toFixed(5)}</Text></View>;
}
