# تقرير تدقيق الجودة والأمان وQA — Hajez

**تاريخ التدقيق:** 17 أغسطس 2026  
**النطاق:** تطبيق Expo/React Native، طبقة التخزين المحلي، مسارات Expo Router، منطق الحجوزات، خادم القالب المضمّن، وتبعيات الإنتاج.

> **الحكم المختصر:** نجح التطبيق في فحص الأنواع، والاختبارات الحالية، والفحص البرمجي، وتصدير Android. ومع ذلك، توجد ثغرة مشروطة عالية الأثر في مفتاح توقيع الجلسات، وثلاثة مخاطر عالية تخص تسرب جلسات المصادقة أو فقدان مدفوعات، وعدة مشاكل متوسطة في سلامة البيانات والتحقق من المدخلات. لا ينبغي نشر طبقة الخادم المضمّنة قبل معالجة عناصر **الحرج** و**العالي**.

## منهجية ونتائج الاختبار

راجعت المسارات والمكونات الأساسية يدويًا، بما في ذلك مخزن الحجوزات، نموذج الحجز، الإعدادات، تفاصيل الحجز، طبقة المصادقة، وتهيئة الجلسات في الخادم. كذلك أجريت بحثًا ساكنًا عن الأسرار والرموز وعمليات الملفات والطلبات الشبكية، وراجعة مستقلة ثانية لمسارات فقد البيانات. ولم يُعثر في الشفرة المصدرية المراجعة على مفتاح API أو كلمة مرور أو رمز وصول **مكتوب صراحةً**.

| الفحص | النتيجة | الملاحظات |
|---|---:|---|
| `pnpm check` | ناجح | لا أخطاء TypeScript. |
| `pnpm test` | ناجح | 33 اختبارًا ناجحًا واختبار واحد متخطى؛ يتركز معظمها في نموذج البيانات. |
| `pnpm lint` | ناجح | يوجد تحذير غير حاجب عن تحديد نوع الوحدة في `eslint.config.js`. |
| `expo export --platform android` | ناجح | تم إنتاج حزمة Android قابلة للتصدير. |
| تدقيق التبعيات عبر سجل الحزم | غير مكتمل | أمر `pnpm audit` لم يعد بنتيجة ضمن مهلة الشبكة؛ لذلك لا توجد دعوى بأن شجرة التبعيات خالية من CVEs. |
| اختبار واجهة على جهاز فعلي | غير منفذ آليًا | لم يُستخدم اختبار متصفح للمحاكي وفق قيود التطبيق المحمول؛ يلزم فحص يدوي في Expo Go/نسخة تطوير بعد الإصلاحات. |

## الملخص حسب الشدة

| الشدة | العدد | الأولوية العملية |
|---|---:|---|
| حرِج | 1 | عالج قبل تشغيل خادم المصادقة في بيئة إنتاج. |
| عالٍ | 3 | عالج قبل أي اعتماد على تسجيل الدخول أو بيانات المدفوعات. |
| متوسط | 6 | عالج في الدورة التالية مع اختبارات انحدار. |
| منخفض | 3 | عالج أثناء صقل UX وتوسيع QA. |

## المشكلات الحرجة

### C-01 — توقيع جلسات قابل للتزوير إذا غاب `JWT_SECRET`

| الحقل | التفاصيل |
|---|---|
| الموقع | `server/_core/env.ts:1-10` و`server/_core/sdk.ts:138-140` |
| السبب الجذري | يعرّف `ENV.cookieSecret` قيمة فارغة افتراضية، ثم تستخدم `getSessionSecret` هذه القيمة مباشرةً لتوقيع JWT بخوارزمية HS256 من دون رفض التشغيل أو الطلب. القيمة الفارغة معلومة لأي مهاجم. |
| الأثر | **مشروط بالإعداد:** إذا شغّل الخادم الإنتاجي بلا `JWT_SECRET` قوي، يمكن إنشاء JWT صالح باسم أي `openId`، بما في ذلك حساب المالك إن وُجدت إجراءات محمية لاحقًا. |
| الإصلاح | افشل مبكرًا في الإنتاج عند غياب سر عشوائي قوي، ولا تقبل قيمة افتراضية. |

**التعديل الجاهز في `server/_core/env.ts`:**

```ts
const cookieSecret = process.env.JWT_SECRET ?? "";

if (process.env.NODE_ENV === "production" && cookieSecret.length < 32) {
  throw new Error("JWT_SECRET must be set to a random value of at least 32 characters in production.");
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret,
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
```

## المشكلات العالية

### H-01 — تسريب محتمل لرموز الجلسة ورؤوس الاستجابة في سجلات العميل

| الحقل | التفاصيل |
|---|---|
| الموقع | `lib/_core/api.ts:22-33, 40-58, 98-111` و`lib/_core/auth.ts:23-29, 45-47, 89-110` و`hooks/use-auth.ts:51-64, 107-133` |
| السبب الجذري | تسجل طبقة العميل رؤوس الاستجابة كاملةً، وتطبع `Set-Cookie` إن ظهر، وتطبع بادئات لرموز الجلسة وبيانات مستخدم كاملة. |
| الأثر | يمكن أن تصل الرموز أو معلومات PII إلى سجل Metro أو أدوات تصحيح الجهاز أو خدمات تجميع السجلات عند تفعيلها. |
| الإصلاح | احذف سجل الرمز والرؤوس وبيانات المستخدم؛ وإذا لزم تشخيص وقتي فاستخدم اسم العملية ورمز حالة فقط خلف شرط تطوير صارم. |

**التعديل الجاهز في `lib/_core/api.ts`:**

```ts
const response = await fetch(url, {
  ...options,
  headers,
  credentials: "include",
});

if (!response.ok) {
  const errorText = await response.text();
  let errorMessage = `API request failed (${response.status})`;
  try {
    const errorJson = JSON.parse(errorText) as { error?: string; message?: string };
    errorMessage = errorJson.error || errorJson.message || errorMessage;
  } catch {
    // لا تسجل نص استجابة غير موثوق أو رؤوس حساسة.
  }
  throw new Error(errorMessage);
}
```

احذف أسطر `console.log`/`console.error` التي تطبع الرمز أو بيانات المستخدم أو `response.headers` أو `Set-Cookie` من الملفين المذكورين. يُنصح بتخزين رموز الجلسات على Android وiOS عبر `expo-secure-store` كما هو مستخدم بالفعل، لأنه يوفر تخزينًا محليًا مشفرًا للقيَم الصغيرة [1] [2].

### H-02 — جلسة لمدة عام من دون آلية إبطال لخيار Bearer

| الحقل | التفاصيل |
|---|---|
| الموقع | `shared/const.ts:2` و`server/_core/sdk.ts:162-179` و`server/_core/oauth.ts:78-84, 113-123, 131-135` |
| السبب الجذري | يوقّع الخادم JWT صالحًا لعام كامل. عملية تسجيل الخروج تمسح الكوكي فقط ولا تلغي Bearer token مصدره؛ يظل الرمز المنسوخ صالحًا إلى انتهاء الصلاحية. |
| الأثر | نافذة إساءة استخدام طويلة عند تسرب رمز. يزيد ذلك أثر H-01. |
| الإصلاح | خفّض عمر الوصول، واستخدم جلسات قصيرة قابلة للتجديد، وأضف `jti` مخزنًا في قاعدة بيانات/قائمة إبطال دائمة للتحقق منه في `verifySession`. |

**تخفيف فوري جاهز في `shared/const.ts` و`server/_core/oauth.ts`:**

```ts
// shared/const.ts
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
```

```ts
// server/_core/oauth.ts
import { COOKIE_NAME, SESSION_TTL_MS } from "../../shared/const.js";

const sessionToken = await sdk.createSessionToken(userInfo.openId!, {
  name: userInfo.name || "",
  expiresInMs: SESSION_TTL_MS,
});

res.cookie(COOKIE_NAME, sessionToken, {
  ...cookieOptions,
  maxAge: SESSION_TTL_MS,
});
```

> هذا تخفيف وليس إبطالًا كاملاً. ينبغي أن تتضمن المعالجة النهائية جدول جلسات يحفظ `jti` وتاريخ الانتهاء والإلغاء؛ ويجب رفض رمز الإلغاء داخل `verifySession`.

### H-03 — تعديل حجز ذي دفعات متعددة قد يمحو الدفعات السابقة

| الحقل | التفاصيل |
|---|---|
| الموقع | `app/booking-form.tsx:58-63` |
| السبب الجذري | عند تحرير حجز ثم إدخال قيمة في حقل الدفعة، تبني `draft.payments` مصفوفة جديدة فيها دفعة واحدة بدل المصفوفة الموجودة. |
| الأثر | فقدان دفعات وملاحظات وتواريخ سابقة بعد حفظ تعديل غير مالي للحجز. |
| الإصلاح | لا تعدّل الدفعات التاريخية من نموذج الحجز؛ سجّل الدفعات وإدارتها حصريًا من شاشة التفاصيل. |

**التعديل الجاهز داخل بناء `draft` في `app/booking-form.tsx`:**

```ts
const initialPayment = deposit
  ? [{
      id: `p-${Date.now()}`,
      amount: Number(deposit),
      date: localDateISO(),
      note: language === "ar" ? "العربون/الدفعة الأولى" : "Deposit/first payment",
    }]
  : [];

const payments = existing ? existing.payments : initialPayment;

return {
  // بقية خصائص draft كما هي
  payments,
} as Booking;
```

عند وجود `existing`، عطّل أو أخفِ حقل `deposit` في نموذج التعديل وأضف نصًا يوجّه المستخدم إلى شاشة التفاصيل لإضافة دفعة جديدة.

## المشكلات المتوسطة

### M-01 — حذف شاليه يترك مراجع يتيمة في الحجوزات وقائمة الانتظار

| الحقل | التفاصيل |
|---|---|
| الموقع | `lib/booking-store.tsx:83` و`app/(tabs)/settings.tsx:100-106` و`lib/chalet-scope.tsx:30-35` |
| السبب الجذري | `deleteChalet` يحذف الشاليه من القائمة فقط، لكنه لا يعالج `chaletId` في الحجوزات وطلبات الانتظار المتصلة به. الواجهة تحذّر، لكن طبقة البيانات نفسها لا تحمي هذا الثابت. |
| الأثر | تظهر السجلات بلون/اسم احتياطي، وقد تختفي عند فلترة شاليه أو يُصفّر النطاق العالمي فجأة. |
| الإصلاح | احتفظ بالاسم التاريخي ثم أزل المعرف الميت عند الحذف، أو الأفضل أضف `isArchived` بدل الحذف الفعلي. |

**تعديل آمن مباشر في `lib/booking-store.tsx`:**

```ts
deleteChalet: async (id) => {
  const deleted = data.chalets.find((chalet) => chalet.id === id);
  if (!deleted) return;

  await persist({
    ...data,
    chalets: data.chalets.filter((chalet) => chalet.id !== id),
    bookings: data.bookings.map((booking) =>
      booking.chaletId === id
        ? { ...booking, chaletId: undefined, chaletName: booking.chaletName || deleted.name }
        : booking,
    ),
    waitlist: data.waitlist.map((entry) =>
      entry.chaletId === id
        ? { ...entry, chaletId: undefined, chaletName: entry.chaletName || deleted.name }
        : entry,
    ),
  });
},
```

### M-02 — فشل التخزين قد يعرض بيانات غير محفوظة، وفشل القراءة قد يعلق حالة التهيئة

| الحقل | التفاصيل |
|---|---|
| الموقع | `lib/booking-store.tsx:43-60` |
| السبب الجذري | تحميل `AsyncStorage.getItem` لا يملك `catch/finally`، و`persist` يستدعي `setData` قبل نجاح `AsyncStorage.setItem`. |
| الأثر | عند عطل التخزين، قد يبقى `hydrated` بقيمة `false` أو يرى المستخدم تعديلًا ثم يفقده عند إعادة التشغيل، من دون رسالة خطأ. |
| الإصلاح | ضع التحميل داخل دالة `async` مع `try/catch/finally`، واعرض خطأ قابلاً للاسترداد، واستخدم مرجعًا للبيانات أو طابور كتابة لتجنب فقد تحديثات سريعة. |

**تحميل محصن جاهز في `lib/booking-store.tsx`:**

```ts
useEffect(() => {
  let active = true;

  const hydrate = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (active && raw) setData(parseBackupData(raw));
    } catch {
      if (active) setData(EMPTY_DATA);
      Alert.alert("تعذر تحميل البيانات", "تعذر الوصول إلى التخزين المحلي. أعد المحاولة قبل إجراء تعديلات جديدة.");
    } finally {
      if (active) setHydrated(true);
    }
  };

  void hydrate();
  return () => { active = false; };
}, []);
```

### M-03 — التحقق من السعر والدفعة والتاريخ يقبل `NaN` أو تاريخ مغادرة سابقًا

| الحقل | التفاصيل |
|---|---|
| الموقع | `app/booking-form.tsx:68-74` و`app/booking-detail.tsx:32-39` |
| السبب الجذري | الشرط `Number(value) <= 0` لا يرفض `NaN`، ولا يوجد شرط `endDate >= startDate`. كذلك تسجل شاشة التفاصيل دفعة `NaN` ثم تعرض نجاحًا. |
| الأثر | حجوزات بسعر صفر أو نطاق زمني معكوس ودفعات غير صالحة؛ بعدها تصبح التقارير والتعارضات غير موثوقة. |
| الإصلاح | استخدم تحققًا موحدًا من رقم منتهٍ وموجب، وتحقق من ترتيب التاريخ قبل حساب التعارض أو الحفظ. |

**مساعد جاهز واستخدامه في `booking-form.tsx` و`booking-detail.tsx`:**

```ts
function toPositiveFiniteAmount(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

const basePrice = toPositiveFiniteAmount(price);
if (!name.trim() || !chaletId || basePrice === null) {
  return Alert.alert(
    language === "ar" ? "بيانات ناقصة" : "Missing data",
    language === "ar"
      ? "أدخل اسم العميل والشاليه والتاريخ وسعرًا موجبًا صالحًا."
      : "Enter the customer name, chalet, dates, and a valid positive price.",
  );
}
if (endDate < startDate) {
  return Alert.alert(title, language === "ar" ? "يجب أن يكون تاريخ المغادرة في تاريخ الوصول أو بعده." : "Check-out must be on or after check-in.");
}
```

وفي `pay`:

```ts
const paymentAmount = toPositiveFiniteAmount(amount);
if (!paymentAmount) {
  Alert.alert(language === "ar" ? "دفعة غير صالحة" : "Invalid payment", language === "ar" ? "أدخل مبلغًا موجبًا صالحًا." : "Enter a valid positive amount.");
  return;
}
await addPayment(booking.id, { id: `p-${Date.now()}`, amount: paymentAmount, date: localDateISO(), note: note.trim() });
```

### M-04 — استيراد ملف JSON غير محدود الحجم وضعيف التحقق من سجلات الحجز

| الحقل | التفاصيل |
|---|---|
| الموقع | `lib/booking-store.tsx:99-110` و`lib/backup-import.ts:7-27` |
| السبب الجذري | يقرأ التطبيق كامل الملف إلى الذاكرة بلا حد للحجم. ثم يتحقق المحلل من وجود المصفوفات فقط ويحوّل عناصرها إلى `Booking[]` بلا تحقق حقلي. |
| الأثر | ملف كبير قد يسبب تجمدًا/نفاد ذاكرة، وملف صغير لكنه منظم شكليًا قد يحفظ سجلات ناقصة تكسر العرض أو الحسابات. |
| الإصلاح | ارفض ملفات أكبر من حد متحفظ، وحدد نوع كل حجز/دفعة/شاليه قبل المعاينة، ثم أظهر سببًا محددًا للمستخدم. |

**حاجز حجم جاهز في `lib/booking-store.tsx`:**

```ts
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const asset = result.assets[0];
if (asset.size !== undefined && asset.size > MAX_BACKUP_BYTES) {
  Alert.alert("ملف كبير جدًا", "اختر نسخة احتياطية بحجم 5 ميغابايت أو أقل.");
  return false;
}
const raw = await FileSystem.readAsStringAsync(asset.uri, {
  encoding: FileSystem.EncodingType.UTF8,
});
if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) {
  throw new Error("backup-too-large");
}
```

### M-05 — تحديثات إعدادات الجهاز السريعة قد تكتب حالة قديمة فوق حالة أحدث

| الحقل | التفاصيل |
|---|---|
| الموقع | `lib/app-preferences.tsx:88-92` |
| السبب الجذري | يبني `updateDeviceSettings` القيمة الجديدة من `deviceSettings` الملتقطة داخل الإغلاق. تبديل مفاتيح متتالٍ بسرعة قد يستخدم لقطة قديمة ويهمل تغييرًا سابقًا. |
| الأثر | قد تعود اللغة أو المظهر أو حالة الإشعارات إلى قيمة غير مقصودة بعد إعادة التشغيل. |
| الإصلاح | استخدم مرجعًا محدثًا للقيمة الأخيرة وتسلسلًا واحدًا لحفظ التغييرات. |

**التعديل الجاهز في `lib/app-preferences.tsx`:**

```ts
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const deviceSettingsRef = useRef(deviceSettings);
const settingsRef = useRef(settings);

useEffect(() => { deviceSettingsRef.current = deviceSettings; }, [deviceSettings]);
useEffect(() => { settingsRef.current = settings; }, [settings]);

const updateDeviceSettings = useCallback(async (patch: Partial<DeviceSettings>) => {
  const next = { ...deviceSettingsRef.current, ...patch };
  deviceSettingsRef.current = next;
  setDeviceSettings(next);
  await updateSettings({ ...settingsRef.current, device: next });
}, [updateSettings]);
```

### M-06 — بيانات العملاء والمدفوعات محفوظة بنص واضح في `AsyncStorage`

| الحقل | التفاصيل |
|---|---|
| الموقع | `lib/booking-store.tsx:1, 11, 44, 59` |
| السبب الجذري | تحفظ أرقام الهاتف والأسماء والملاحظات وحالة المدفوعات في JSON داخل AsyncStorage، من دون تشفير على مستوى التطبيق. |
| الأثر | على جهاز مخترق أو نسخة احتياطية غير محمية، يمكن استخراج بيانات العملاء بسهولة أكبر. هذا مهم لأن التطبيق يحتوي PII وبيانات مالية تشغيلية. |
| الإصلاح | لا تنقل JSON الضخم كما هو إلى SecureStore (المكتبة مصممة لقيم صغيرة وقد ترفض قيَمًا كبيرة [1]). بدلاً من ذلك، استخدم قاعدة بيانات محلية مشفرة أو تشفيرًا مضبوطًا مع مفتاح صغير محفوظ في SecureStore؛ وأضف قفلًا محليًا اختياريًا قبل فتح التطبيق. |

## المشكلات المنخفضة

### L-01 — الإلغاء في شاشة تفاصيل الحجز فوري بلا تأكيد

| الموقع | `app/booking-detail.tsx:92-95` |
|---|---|
| السبب والأثر | الزر يغيّر الحالة إلى `cancelled` ثم يعود فورًا. لمسة عرضية تفقد حجزًا تشغيليًا مؤكدًا من دون فرصة مراجعة. |
| الإصلاح | استخدم `Alert.alert` تأكيديًا مثل شاشة القائمة، وأظهر فشل الحفظ إن حدث. |

```ts
const confirmCancellation = () => {
  Alert.alert(t("cancel"), language === "ar" ? "هل تريد إلغاء هذا الحجز؟" : "Cancel this booking?", [
    { text: language === "ar" ? "لا" : "No", style: "cancel" },
    {
      text: language === "ar" ? "نعم" : "Yes",
      style: "destructive",
      onPress: async () => {
        try {
          await updateBooking({ ...booking, status: "cancelled" });
          router.back();
        } catch {
          Alert.alert(language === "ar" ? "تعذر الحفظ" : "Save failed");
        }
      },
    },
  ]);
};
```

### L-02 — اعتماد مسارات مخفية داخل مجموعة التبويبات

| الموقع | `app/(tabs)/_layout.tsx:23-24` مع استدعاءات `router.push("/(tabs)/settings")` و`router.push("/(tabs)/waitlist")` |
|---|---|
| السبب والأثر | المساران مضافان إلى `Tabs` مع `href: null` ثم يدفعهما التطبيق يدويًا. يعمل التصدير الحالي، لكنه بنية هشة للتعامل مع الروابط العميقة أو تغييرات Expo Router، ويصعب اختبارها خارج التنقل الداخلي. |
| الإصلاح | انقل الشاشتين إلى Stack خارج مجموعة التبويبات أو أضف اختبارات روابط عميقة على Android. |

### L-03 — فجوات QA في التفاعلات وبيانات الحافة

| الموقع | `tests/*.test.ts`، خصوصًا `tests/chalet-management.test.ts:22-43` و`tests/backup-import.test.ts:5-21` |
|---|---|
| السبب والأثر | الاختبارات الحالية تغطي الحسابات والترحيل الأساسيين فقط. لا توجد اختبارات لحفظ فاشل، حذف شاليه مرتبط، تحرير دفعات متعددة، رقم `NaN`، تاريخ معكوس، أو حالات التنقل/الأزرار. |
| الإصلاح | أضف اختبارات وحدة للحالات الحرجة، ثم اختبار جهاز يدوي/آلي لمسارات إضافة وتعديل وإلغاء واستيراد النسخة. |

```ts
// بعد نقل toPositiveFiniteAmount إلى lib/booking-model.ts وتصديرها:
it("rejects a reversed date range and invalid payment text", () => {
  expect("2026-08-21" < "2026-08-22").toBe(true);
  expect(toPositiveFiniteAmount("not-a-number")).toBeNull();
  expect(toPositiveFiniteAmount("0")).toBeNull();
  expect(toPositiveFiniteAmount("42.50")).toBe(42.5);
});

it("retains historical payments while editing an existing booking", () => {
  const existing = [
    { id: "p1", amount: 20, date: "2026-08-01" },
    { id: "p2", amount: 30, date: "2026-08-02" },
  ];
  const payments = existing;
  expect(payments).toEqual(existing);
});
```

## تدفقات تمت مراجعتها

| التدفق | النتيجة | ملاحظة |
|---|---|---|
| فتح التطبيق وتزويد الحالة | مقبول مع خطر M-02 | لا يوجد خطأ TypeScript أو فشل بناء. |
| إضافة حجز واختيار شاليه | يعمل منطقيًا | يحتاج تحقق M-03. |
| تعارض الحجوزات حسب الشاليه | مغطى باختبارات قائمة | الاختبارات تؤكد استقلال شاليهين مختلفين. |
| تعديل حجز ومدفوعاته | غير آمن حاليًا | H-03. |
| حذف شاليه مرتبط | يعرض تحذيرًا لكن يترك مرجعًا يتيمًا | M-01. |
| استيراد/تصدير النسخ | مسار موجود | يحتاج M-04 وM-06. |
| المصادقة | غير مستخدمة في واجهة Hajez الحالية | ما زال الخادم المضمّن يحمل المخاطر عند تفعيله أو نشره. |

## خطة المعالجة المقترحة

1. عالج C-01 وH-01 وH-02 قبل تفعيل أو نشر أي مسار مصادقة أو API خارجي.
2. عالج H-03 وM-01 وM-03 قبل إدخال بيانات تشغيلية فعلية؛ هذه عناصر سلامة بيانات مباشرة.
3. طبّق M-02 وM-04 وM-05 وM-06، ثم أضف اختبارات الانحدار المذكورة.
4. نفّذ QA يدويًا على Android: إضافة حجز، تعديل حجز مع دفعتين، حذف شاليه مرتبط، إدخال مبلغ نصي/لا نهائي، استيراد ملف كبير، ثم فحص الوضعين الداكن والفاتح.
5. أعد تشغيل `pnpm audit --prod --json` من بيئة تملك اتصالًا صالحًا بسجل الحزم وسجّل CVEs المنسوبة إلى رقم الإصدار الدقيق قبل النشر.

## المراجع

[1]: https://docs.expo.dev/versions/latest/sdk/securestore/ "Expo SecureStore — التخزين المحلي المشفر وحدود الحجم"

[2]: https://docs.expo.dev/develop/authentication/ "Expo Authentication — حماية المسارات وإدارة جلسات OAuth"
