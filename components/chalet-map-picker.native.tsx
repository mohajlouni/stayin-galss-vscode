import MapView, { Marker, type MapPressEvent } from "react-native-maps";

export type ChaletMapCoordinate = { latitude: number; longitude: number };

export function ChaletMapPicker({ coordinate, onChange }: { coordinate: ChaletMapCoordinate; onChange: (coordinate: ChaletMapCoordinate) => void }) {
  return <MapView style={{ height: 250, width: "100%" }} initialRegion={{ ...coordinate, latitudeDelta: 0.08, longitudeDelta: 0.08 }} onPress={(event: MapPressEvent) => onChange(event.nativeEvent.coordinate)}><Marker coordinate={coordinate} /></MapView>;
}
