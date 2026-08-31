import { type UtilityReading, type UtilityReadingType } from "./booking-model";

/** Default unit rates (JOD per kWh / m³ / L). */
export const UTILITY_RATES: Record<UtilityReadingType, number> = { electricity: 0.12, water: 0.75, gas_fuel: 0.9 };
/** Per-stay consumption thresholds above which the reading is flagged excessive. */
export const UTILITY_THRESHOLDS: Record<UtilityReadingType, number> = { electricity: 200, water: 40, gas_fuel: 100 };

export const UTILITY_TYPES: UtilityReadingType[] = ["electricity", "water", "gas_fuel"];

export function utilityTypeLabel(type: UtilityReadingType, language: "ar" | "en") {
  return ({ electricity: ["كهرباء", "Electricity"], water: ["مياه", "Water"], gas_fuel: ["غاز ووقود", "Gas / fuel"] } as const)[type][language === "ar" ? 0 : 1];
}

export function utilityTypeIcon(type: UtilityReadingType): "bolt" | "water-drop" | "local-fire-department" {
  return type === "electricity" ? "bolt" : type === "water" ? "water-drop" : "local-fire-department";
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

/** Consumed units = checkOutReading - checkInReading (never negative). */
export function computeConsumedUnits(checkInReading: number, checkOutReading: number) {
  return Math.max(0, round2(checkOutReading - checkInReading));
}

/** Full cost computation for a reading using configurable (or default) rate + threshold. */
export function computeUtilityCost(type: UtilityReadingType, checkInReading: number, checkOutReading: number, config: { unitRate?: number; threshold?: number } = {}) {
  const consumedUnits = computeConsumedUnits(checkInReading, checkOutReading);
  const unitRate = config.unitRate ?? UTILITY_RATES[type];
  return { consumedUnits, unitRate, totalCost: round2(consumedUnits * unitRate), isExcessive: consumedUnits > (config.threshold ?? UTILITY_THRESHOLDS[type]) };
}

/** Aggregates energy/fuel cost across completed readings (for reports). */
export function summarizeUtilityReadings(readings: UtilityReading[]) {
  let totalCost = 0;
  let excessCount = 0;
  const byChalet = new Map<string, number>();
  for (const reading of readings) {
    const consumed = reading.consumedUnits ?? (reading.checkInReading !== undefined && reading.checkOutReading !== undefined ? computeConsumedUnits(reading.checkInReading, reading.checkOutReading) : 0);
    const cost = reading.totalCost ?? round2(consumed * (reading.unitRate ?? 0));
    if (cost > 0) {
      totalCost = round2(totalCost + cost);
      byChalet.set(reading.chaletId, round2((byChalet.get(reading.chaletId) ?? 0) + cost));
    }
    if (reading.isExcessive) excessCount += 1;
  }
  return { totalCost, excessCount, byChalet };
}

/** Best-matching open (check-in only) reading for a booking/chalet + unit type. */
export function findOpenUtilityReading(readings: UtilityReading[] | undefined, chaletId: string | undefined, type: UtilityReadingType, bookingId?: string): UtilityReading | undefined {
  const list = readings ?? [];
  const sameType = list.filter((reading) => reading.type === type && reading.chaletId === (chaletId ?? reading.chaletId) && reading.checkOutReading === undefined);
  return sameType.find((reading) => bookingId && reading.bookingId === bookingId) ?? sameType[0];
}

export function findUtilityReadingForBooking(readings: UtilityReading[] | undefined, bookingId: string | undefined, type?: UtilityReadingType) {
  const list = readings ?? [];
  return list.filter((reading) => reading.bookingId && reading.bookingId === bookingId && (!type || reading.type === type));
}