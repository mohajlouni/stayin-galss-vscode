import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const store = readFileSync(resolve(process.cwd(), "lib/booking-store.tsx"), "utf8");
const form = readFileSync(resolve(process.cwd(), "app/booking-form.tsx"), "utf8");

describe("booking save regression guards", () => {
  it("persists locally without blocking navigation on the remote sync or supabase mirror", () => {
    expect(store).toContain("void saveRemoteData.mutateAsync");
    expect(store).toContain("void saveWorkspaceState");
    expect(store).toContain("setSyncConflict(isWorkspaceVersionConflict(error))");
    expect(store).toContain("expectedVersion: remoteVersion");
  });

  it("prevents duplicate submissions with a synchronous ref lock and disables the save button", () => {
    expect(form).toContain("const [isSubmitting, setIsSubmitting] = useState(false)");
    expect(form).toContain("const submittingRef = useRef(false)");
    expect(form).toContain("if (submittingRef.current) return;");
    expect(form).toContain("if (!beginSubmit()) return;");
    expect(form).toContain("disabled={isSubmitting}");
    expect(form).toContain('<ActivityIndicator size="small" color="#FFFFFF" />');
  });

  it("announces success and closes the form after the booking is written", () => {
    expect(form).toContain('ToastAndroid.show(language === "ar" ? "تم تسجيل الحجز بنجاح" : "Booking saved successfully", ToastAndroid.SHORT)');
    expect(form).toContain("notifyBookingSaved();");
    expect(form).toContain("router.back();");
  });
});