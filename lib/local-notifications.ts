/**
 * تحميل مؤجَّل وآمن لوحدات الإشعارات المحلية (local notifications).
 *
 * ⚠️ لا تستورد `expo-notifications` مباشرةً في أي ملف — استخدم هذا الملف.
 *
 * السبب: `expo-notifications/build/index.js` (البرميل) ينفّذ آثاراً جانبية على
 * مستوى الموديول قبل أن يعمل أي حارس في تطبيقنا:
 *   • سطر 5  : console.warn "functionality is not fully supported in Expo Go"
 *   • سطر 35 : إعادة تصدير DevicePushTokenAutoRegistration.fx
 *   • سطر 38 : TokenEmitter
 * وكلاهما يستدعي addPushTokenListener → warnOfExpoGoPushUsage()، وهذه تستدعي
 * `console.error` على Android (وليس warn)، فتُرفع شاشة LogBox حمراء عند الإقلاع
 * في Expo Go حتى وإن لم نطلب أي رمز دفع عن بُعد إطلاقاً.
 *
 * الحل: استيراد عميق للأوراق فقط. تحقّقنا من أن **لا ملف واحد** داخل build/
 * يستورد `./index`، فلا تُحمَّل السلسلة أبداً.
 *
 * ملاحظة: getExpoPushTokenAsync غير مصرَّح باستخدامه هنا لأنه يستورد
 * DevicePushTokenAutoRegistration.fx داخلياً — لذلك الإشعارات عن بُعد تبقى في
 * `lib/notification-runtime.ts` خلف حارس Expo Go.
 */

/** الواجهة المكشوفة من الأوراق — مطابقة للأسماء الحقيقية في build/. */
async function createLocalNotificationsApi() {
  const [handler, permissions, schedule, cancel, channel, channelTypes, types] = await Promise.all([
    import("expo-notifications/build/NotificationsHandler"),
    import("expo-notifications/build/NotificationPermissions"),
    import("expo-notifications/build/scheduleNotificationAsync"),
    import("expo-notifications/build/cancelScheduledNotificationAsync"),
    import("expo-notifications/build/setNotificationChannelAsync"),
    import("expo-notifications/build/NotificationChannelManager.types"),
    import("expo-notifications/build/Notifications.types"),
  ]);

  // يُسجَّل مرة واحدة: كيف تُعرض الإشعارات عندما يكون التطبيق في المقدمة.
  handler.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  return {
    getPermissionsAsync: permissions.getPermissionsAsync,
    requestPermissionsAsync: permissions.requestPermissionsAsync,
    scheduleNotificationAsync: schedule.default,
    cancelScheduledNotificationAsync: cancel.default,
    setNotificationChannelAsync: channel.default,
    AndroidImportance: channelTypes.AndroidImportance,
    SchedulableTriggerInputTypes: types.SchedulableTriggerInputTypes,
  };
}

export type LocalNotificationsApi = Awaited<ReturnType<typeof createLocalNotificationsApi>>;

let pending: Promise<LocalNotificationsApi | null> | null = null;

/**
 * يحمّل الأوراق مرة واحدة ويُخزّنها. يُرجع `null` عند أي فشل بدلاً من الانهيار،
 * حتى لا تُعطِّل الإشعارات الاختيارية حفظ الحجوزات.
 */
export function loadLocalNotifications(): Promise<LocalNotificationsApi | null> {
  pending ??= createLocalNotificationsApi().catch(() => null);
  return pending;
}