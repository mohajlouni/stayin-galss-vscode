export type AppErrorCode = "validation" | "unauthorized" | "forbidden" | "conflict" | "network" | "not-found" | "unknown";

/**
 * خطأ تطبيقي برسالة عربية واضحة للمستخدم ورمز صنف للتشخيص.
 * يُستخدم في طبقات الخدمة والمعالجة الموحدة للعرض النهائي.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly arMessage: string;

  constructor(code: AppErrorCode, arMessage: string, cause?: unknown) {
    super(arMessage, { cause });
    this.name = "AppError";
    this.code = code;
    this.arMessage = arMessage;
  }
}

const AR_NETWORK = "تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.";
const AR_FORBIDDEN = "لا تملك صلاحية تنفيذ هذا الإجراء.";
const AR_CONFLICT = "تعارض في البيانات الحالية. راجع الحجوزات ثم أعد المحاولة.";
const AR_UNAUTHORIZED = "انتهت صلاحية جلستك. سجّل الدخول مجددًا.";

function classifyNetwork(error: Error): string | null {
  const message = error.message.toLowerCase();
  if (/network|fetch failed|load failed|connection|timeout|abort/i.test(message)) return AR_NETWORK;
  if (/forbidden|denied|permission|not allowed|create-booking-forbidden/i.test(message)) return AR_FORBIDDEN;
  if (/conflict/i.test(message)) return AR_CONFLICT;
  if (/unauthorized|session expired|not authenticated|not authed/i.test(message)) return AR_UNAUTHORIZED;
  return null;
}

/** يحوّل أي خطأ مجهول إلى رسالة عربية أوضح للمستخدم مع بديل آمن. */
export function resolveErrorMessage(error: unknown, fallback = "حدث خطأ غير متوقع. حاول مرة أخرى."): string {
  if (error instanceof AppError) return error.arMessage;
  if (error instanceof Error) return classifyNetwork(error) ?? fallback;
  return fallback;
}