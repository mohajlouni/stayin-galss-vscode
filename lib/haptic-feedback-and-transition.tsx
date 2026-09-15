/**
 * Haptic + transition feedback hooks + a safe async notification bootstrap ping.
 *
 * ### Expo Go / expo-notifications safety (CCR-088)
 *
 * `expo-notifications` (SDK 54) exposes a module-scope side-effect in its
 * **barrel** (`node_modules/expo-notifications/build/index.js`):
 *
 *   ```js
 *   if (isRunningInExpoGo() && !areWeTestingWithJest()) {
 *     console.warn(
 *       "`expo-notifications` functionality is not fully supported in Expo Go ..."
 *     );
 *   }
 *   export { setAutoServerRegistrationEnabledAsync } from './DevicePushTokenAutoRegistration.fx';
 *   export { addPushTokenListener } from './TokenEmitter';
 *   ```
 *
 * Importing that barrel at module scope (even only for types, because TS still
 * evaluates the module for `emitDecoratorMetadata`/nominal checks and because
 * Metro includes the JS in the bundle) therefore:
 *   - prints a LogBox warning on every load in Expo Go,
 *   - registers a push token listener that Expo Go no longer supports.
 *
 * To keep Expo Go silent, this project never imports the barrel. Every consumer
 * deep-imports the underlying leaf modules:
 *
 *   ```ts
 *   import NotificationsHandler from 'expo-notifications/build/NotificationsHandler';
 *   import NotificationPermissions from 'expo-notifications/build/NotificationPermissions';
 *   import scheduleNotificationAsync from 'expo-notifications/build/scheduleNotificationAsync';
 *   import cancelScheduledNotificationAsync from 'expo-notifications/build/cancelScheduledNotificationAsync';
 *   import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync';
 *
 *   import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
 *   import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
 *   ```
 *
 * Those leaves import only `requireNativeModule(...)` / `NativeModules.*`, so they
 * never re-enter the barrel and never trigger `DevicePushTokenAutoRegistration.fx`.
 *
 * ### Where the async imports happen
 *
 * - Booking/checkout reminders: `lib/checkout-notifications.ts`
 * - Waitlist priority reminders: `lib/waitlist-priority-notifications.ts`
 * - User-facing settings screen: `app/(tabs)/settings.tsx`
 * - Boot-level permissions ping: `lib/notification-bootstrap-ping.tsx`
 *
 * ### Schema migrations (related SSR risk)
 *
 * The reminder tables were migrated during the v13 schema refresh (see
 * `tmp/pg-v12-force-refresh-and-fix-readonly.sql`):
 *
 *   - `view_checkout_scheduled_reminders`
 *   - `view_waitlist_priority_scheduled_reminders`
 *   - `fn_schedule_checkout_reminders`
 *   - `fn_schedule_waitlist_priority_reminders`
 *   - `fn_cancel_checkout_reminders`
 *   - `fn_cancel_waitlist_priority_reminders`
 *
 * If a Supabase local instance is stale after pulling `docker-compose.yml`, the
 * recommended refresh sequence is in `doc/docker-reinit-after-pull.md`.
 */

import { useEffect, useRef } from "react";
import { Portal, Modal, Text, View, StyleSheet, AccessibilityInfo } from "react-native";
import {
  createContext,
  useContext,
  useCallback,
  useEffect as useEffectHook,
} from "react";
import { useAppPreferences } from "@/lib/app-preferences";
import { useChaletScope } from "@/lib/chalet-scope";
import { useColors } from "@/hooks/use-colors";
import { Animated } from "@/lib/anim-backend";
import { useEmbodiedMotion } from "@/hooks/use-embodied-motion";export { useUIFeedback } from "@/hooks/use-ui-feedback";
export { useScreenActivated } from "@/hooks/use-screen-activated";
export { useReduceMotionPref } from "@/hooks/use-embodied-motion";