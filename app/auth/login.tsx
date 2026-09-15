import { memo } from "react";

import { UnifiedAuthScreen } from "@/components/unified-auth-screen";

/**
 * مسار تسجيل الدخول: غلاف رقيق فوق شاشة الدخول الموحّدة (Bento Dark + Orange).
 * `memo` يثبّت هوية المسار عند إعادة رسم السياقات العليا أثناء الإقلاع، فلا
 * يُعاد تركيب حقول الإدخال ولا يفقد المستخدم التركيز أثناء الكتابة.
 */
const LoginRoute = memo(function LoginRoute() {
  return <UnifiedAuthScreen />;
});

export default LoginRoute;
