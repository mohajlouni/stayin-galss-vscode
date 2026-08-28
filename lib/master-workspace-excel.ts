import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import * as XLSX from "xlsx";

type WorkspaceExport = { exportedAt: string; version: number; workspace: { id: number; name: string; currency: string | null; timeZone: string | null }; payload: string | null };

function tabularRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object").map((row) => Object.fromEntries(Object.entries(row).map(([key, cell]) => [key, typeof cell === "object" && cell !== null ? JSON.stringify(cell) : cell ?? ""])));
}

function cleanFilename(name: string) { return name.replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "stay-in-workspace"; }

export async function exportMasterWorkspaceExcel(exported: WorkspaceExport) {
  let payload: Record<string, unknown> = {};
  if (exported.payload) {
    try { payload = JSON.parse(exported.payload) as Record<string, unknown>; }
    catch { throw new Error("workspace-export-invalid"); }
  }
  const workbook = XLSX.utils.book_new();
  const overview = XLSX.utils.json_to_sheet([{ "اسم المنشأة": exported.workspace.name, "معرف المنشأة": exported.workspace.id, "إصدار المزامنة": exported.version, "وقت التصدير": exported.exportedAt, "العملة": exported.workspace.currency ?? "", "المنطقة الزمنية": exported.workspace.timeZone ?? "" }]);
  XLSX.utils.book_append_sheet(workbook, overview, "ملخص");
  const sheets: Array<[string, string]> = [["الحجوزات", "bookings"], ["المصروفات", "expenses"], ["الوحدات", "chalets"], ["طلبات الانتظار", "waitlist"], ["سجل الإجراءات", "auditLog"], ["القوالب", "templates"]];
  sheets.forEach(([title, key]) => {
    const rows = tabularRows(payload[key]);
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ ملاحظة: "لا توجد بيانات مسجلة" }]);
    XLSX.utils.book_append_sheet(workbook, sheet, title);
  });
  const filename = `${cleanFilename(exported.workspace.name)}-${new Date(exported.exportedAt).toISOString().slice(0, 10)}.xlsx`;
  if (Platform.OS === "web") {
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
    return { filename, shared: false };
  }
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx" });
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error("workspace-excel-sharing-unavailable");
  await Sharing.shareAsync(uri, { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", dialogTitle: `تصدير Excel — ${exported.workspace.name}`, UTI: "com.microsoft.excel.xlsx" });
  return { filename, shared: true };
}
