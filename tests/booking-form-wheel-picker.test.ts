import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const picker = readFileSync(resolve(process.cwd(), "components/ui/WheelTimePicker.tsx"), "utf8");
const form = readFileSync(resolve(process.cwd(), "app/booking-form.tsx"), "utf8");

describe("booking form iOS wheel time picker", () => {
  it("provides an inertia-snapping hour/minute/period wheel component", () => {
    expect(picker).toContain("snapToInterval={ITEM_HEIGHT}");
    expect(picker).toContain('decelerationRate="fast"');
    expect(picker).toContain("onMomentumScrollEnd={settle}");
    expect(picker).toContain("const hours = useMemo(");
    expect(picker).toContain("const minutes = useMemo(");
    expect(picker).toContain("const periods = useMemo(");
  });

  it("offers quick presets 10:00 ص, 02:00 م, 08:00 م, 09:00 م", () => {
    expect(picker).toContain('const PRESETS = ["10:00", "14:00", "20:00", "21:00"]');
    expect(picker).toContain("formatTime12(preset, language, timeFormat)");
    expect(picker).toContain("applyPreset");
  });

  it("replaces raw arrival/departure text inputs with wheel-picker triggers in flexible slots", () => {
    expect(form).toContain('import { WheelTimePicker } from "@/components/ui/WheelTimePicker"');
    expect(form).toContain('const [timeWheelOpen, setTimeWheelOpen] = useState<"start" | "end" | null>(null)');
    expect(form).toContain('onPress={() => { setTimeWheelOpen("start")');
    expect(form).toContain('onPress={() => { setTimeWheelOpen("end")');
    expect(form).toContain('timeFormat={deviceSettings.timeFormat}');
    expect(form).toContain("setTimeError(false); setTimeWheelOpen(null)");
    expect(form).toContain("<TimeFieldTrigger editable={flexibleSlot}");
    expect(form).not.toContain("setStartTime(parseTime(value, startTime))");
    expect(form).not.toContain("setEndTime(parseTime(value, endTime))");
  });

  it("wires the wheel picker straight to the booking time state", () => {
    expect(form).toContain('initialTime={timeWheelOpen === "start" ? startTime : endTime}');
    expect(form).toContain('onConfirm={(next) => { if (timeWheelOpen === "start") setStartTime(next); else setEndTime(next);');
  });

  it("marks mandatory time fields red when flexible-slot validation fails", () => {
    expect(form).toContain("const [timeError, setTimeError] = useState(false)");
    expect(form).toContain("setTimeError(true)");
    expect(form).toContain("error={flexibleTimeConflict || timeError}");
    expect(form).toContain("أدخل وقت وصول ووقت مغادرة صحيحين للفترة المخصصة");
  });
});

describe("booking form recipient role badges", () => {
  it("shows bracketed role labels for the main treasury and held float", () => {
    expect(form).toContain('ar: "[خزينة رئيسية]", en: "[Master treasury]"');
    expect(form).toContain('ar: "[ذمة / عهدة معلقة]", en: "[Held float / pending custody]"');
  });
});