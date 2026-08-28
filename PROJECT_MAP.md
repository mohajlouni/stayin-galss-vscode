# PROJECT_MAP — StayIn (arabic-booking-manager)

آخر تحديث: 2026-08-29 | المصدر: github.com/mohajlouni/stayin-galss-vscode (branch: master)

## [TECH_STACK]

| الطبقة | التقنية | النسخة (المستوردة في pnpm-lock) | أحدث مستقر 2026-08-29 | الحالة |
|---|---|---|---|---|
| Mobile | Expo (SDK) | ~54.0.29 | 57.0.18 (SDK 57) | عالٍ — ترقية = انتقال SDK كامل |
| Mobile | react-native | 0.81.5 | 0.87.1 | مثبت ضمن SDK 54 — لا ترقية فردية |
| Mobile | react | 19.1.0 | 19.2.8 | مثبت ضمن SDK 54 |
| Mobile | expo-router | ~6.0.19 | 57.0.17 | مثبت ضمن SDK 54 |
| Mobile | nativewind | ^4.2.1 | 4.2.6 | متوافق (نفس الماجور) |
| Mobile | react-native-reanimated | ~4.1.6 | — | مثبت ضمن SDK 54 |
| UI | tailwind-merge / clsx / lucide | 2.6.0 / 2.1.1 | — | متوافق |
| API | express | ^4.22.1 | 5.2.1 (v5) | v4 متوافق — v5 خارج النطاق |
| API | @trpc/server | 11.7.2 | 11.18.0 | نفس الماجور — ترقية آمنة (مؤجلة) |
| Data | drizzle-orm | ^0.44.7 | 0.45.2 | ترقية بسيطة (مؤجلة) |
| Data | drizzle-kit | ^0.31.8 | 0.31.10 | ترقية بسيطة (مؤجلة) |
| Data | mysql2 | ^3.16.0 | 3.24.2 | متوافق |
| Data | @tanstack/react-query | ^5.90.12 | 5.102.8 | متوافق |
| Validation | zod | ^4.2.1 | 4.5.1 | متوافق |
| Auth | jose (JWT) | 6.1.0 | — | مثبت بدقة (مقفول بلا رمز ^) |
| Tooling | typescript | ~5.9.3 | 7.0.2 (TS7 Native) | TS7 = قفزة هامة — خارج النطاق |
| Tooling | vitest | ^2.1.9 | 4.1.11 | ترقية غير تُعقّد ولا تؤثر على التشغيل |
| Tooling | pnpm | 9.12.0 (packageManager) | — | مطلوب للتثبيت (غير مثبت محليًا) |

قاعدة صارمة: حزم `expo/*` تقفل بترابط ضمن SDK واحد. ترقية هذه الحزم فرديًا = كسر الحزمة. أي تحديث لها يكون عبر هجرة SDK كاملة (Milestone معزول).
مقفول/محدد (لا رمز ^): `@trpc/*=11.7.2`, `jose=6.1.0`, `react-native-maps=1.20.1`, `react-native-svg=15.12.1`.

## [SYSTEM_FLOW]

```
[Expo Go / APK / Web]
   │  Expo Router (app/…)
   │  Providers: Trpc → AuthSession → Booking → ChaletScope → AppPreferences → Theme → RouteAccessGate
   ▼
lib/booking-store (local JSON أولًا) ⇄ lib/workspace-sync (مزامنة/تعارض)
   │  tRPC client (lib/trpc.ts)
   ▼
/api/trpc  ← express + createExpressMiddleware (server/_core/index.ts)
   │
   ├── registerStorageProxy  (رفع/تنزيل ملفات)
   ├── registerOAuthRoutes   (OAuth خارجي)
   ├── /api/health
   ▼
server/routers.ts → server/db.ts (drizzle/mysql2)
   ├── جدول workspaceData: payload JSON للمنشأة + version (تفاؤلي + نسخ إنقاذ workspaceDataBackups)
   ├── جدولات الحسابات/المنشآت/العضوية/الصلاحيات/الحركة: users, workspaces, workspaceMembers, invitations, activeWorkspaces, workspaceOwnerPins, suggestions, superAdminAudit, accountDeletionRequests
   ▼
MySQL (DATABASE_URL)
```

التزامن: كتابة بيانات عمل المنشأة = JSON كامل بالـ version (قفل تفاؤلي). أي تعارض يُحفظ محليًا كنسخة إنقاذ ويعرض شريط مزامنة. لا يوجد CQRS ولا queue خارجية — حسب التصميم الحالي، لا تُضاف.

## [ARCHITECTURE]

- مونوليث واحد، واجهة Expo Router + خادم Express/tRPC في repo واحد. نطاق مشروع واحد (لا microservices).
- فصل وجوهري قائم وتُلتزم به (لا يُعاد بناؤه):
  - `server/_core/*` — بنية الخادم (env, trpc, cookies, context, oauth, storage, heartbeat)
  - `server/db.ts`, `server/routers.ts` — حدود البيانات والتعريفات الطرفية
  - `drizzle/schema.ts` — مخطط MySQL المصدري (مفقود حاليًا — انظر ORPHANS)
  - `lib/*` — منطق الميزات (booking-store, calendar-index, whatsapp, receipts, reporting, …) ببعد النطاق chaletScope/workspace
  - `shared/*` — الأنواع والثوابت والصلاحيات المشتركة فعليًا (types, const, workspace-permissions)
  - `app/`, `components/`, `constants/`, `hooks/` — طبقة العرض
- قاعدة المعمارية الجراحية:
  1. يُستخرج إلى `_core`/`shared` فقط المنطق تكرر فعليًا ≥3 مواضع. لا تجريد استباقي.
  2. لا ملفات دقيقة: لا تُنشأ ملفات أقل من ~40 سطر "خوف من الكبر". الاندماج عند حقيقته، لا فصل استعراضي.
  3. No Feature Creep: أي طلب/اقتراح خارج النطاق المُعتمد يُسجل في [ORPHANS & PENDING] ولا يُنفذ دون موافقة.

## [LOGGING]

- خادم واحد بسيط غير حظري: `server/_core/logger.ts` (المقترح) — مستويات error/warn/info/debug فقط، كتابة مجمّعة بطابور، بلا كشف أسرار/رموز/كوكيز. يُستبدل الـ console المنسوج الحالي عند اللمس فقط. لا مكتبات خارجية، لا تكوين معقد.

## [ORPHANS & PENDING]

- [مفقود] `drizzle/schema.ts` + مجلد `drizzle/` لا يرافقان الـ repo (مستورد من server/db.ts و drizzle.config.ts) → `tsc --noEmit` و drizzle CLI يعطّلان. قرار: إعادة توليد/استعادة المخطط (end-of-milestone مطلوب) — يحتاج عينة من الحالة الحقيقية.
- [مفقود] `lib/_core/manus-runtime.ts` ونظائره تشير لبنية Manus runtime — مراجعة إلزامية قبل النشر.
- [مخاطر] `dist-android-*` (33 مجلدًا ≈ 205MB APK/مخرجات بناء) مدفوعة في git — تُستبعد بـ .gitignore وتنظف من التاريخ؛ النشر عبر GitHub Releases.
- [مخاطر] الإصدارات API: لا `.env.local` مُلتقطة؛ متطلبات نشر: DATABASE_URL + JWT_SECRET قوي (فرض موجود) + أذونات CLOUD بيانات.
- [مخاطر] express CORS يردّد الـ origin — مراجعة قبل الإنتاج (allowlist معروف بدل الانعكاس المطلق).
- [أدوات محلية ناقصة] git و pnpm غير مثبتين على هذه الآلة (node v24.14.0, npm 11.9.0 متاحة).
- [مؤجل] ترقية Expo SDK 54→57 / TS 5.9→7 / Express v5 / Vitest 4 — Milestones معزولة بخطورة عالية، غير مقبولة في النطاق الحالي.