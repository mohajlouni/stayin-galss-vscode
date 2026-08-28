import type { ComponentType } from "react";

export type ChaletMapCoordinate = { latitude: number; longitude: number };
export const ChaletMapPicker: ComponentType<{ coordinate: ChaletMapCoordinate; onChange: (coordinate: ChaletMapCoordinate) => void }>;
