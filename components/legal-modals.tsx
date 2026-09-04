import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

type LegalSection = { heading: string; body: string };

type LegalContent = { title: string; effective: string; note: string; sections: LegalSection[] };

const AR_TERMS: LegalContent = {
  title: "شروط وأحكام استخدام منصة StayIn",
  effective: "تاريخ السريان: أيلول 2026",
  note: "مسودة تشغيلية لحماية حقوق StayIn والمستخدمين؛ يراجعها محامٍ مؤهل في بلد التشغيل قبل النشر التجاري.",
  sections: [
    { heading: "طبيعة المنصة والدور التقني", body: "StayIn هي منصة تقنية ووسيط إلكتروني يربط بين أصحاب المنشآت والعملاء والمستخدمين، وتوفر أدوات رقمية لتنظيم وإدارة الحجوزات. لا تعتبر StayIn مالكاً أو مديراً تشغيلياً أو وكيلاً عن أي منشأة مدرجة، ما لم ينص صراحة على خلاف ذلك." },
    { heading: "المنصة قيد التطوير", body: "يقر المستخدم بأن StayIn مشروع ومنصة قيد التطوير والتحسين المستمر، وتخضع الخصائص والميزات للتحديث الدوري." },
    { heading: "مجانية الخدمة الحالية", body: "تقدم خدمات المنصة أو أجزاء منها مجاناً في الوقت الحالي وحتى إشعار آخر، ولا تشكل هذه المجانية التزاماً دائماً، مع احتفاظ StayIn بالحق في فرض رسوم أو باقات مدفوعة مستقبلاً." },
    { heading: "مسؤولية المستخدم", body: "يلتزم المستخدم بتقديم بيانات دقيقة وصحيحة، ويتحمل المسؤولية القانونية والتنظيمية الكاملة عن حسابه وعن سرية بيانات الوصول والأنشطة المنفذة من خلاله." },
    { heading: "منع إساءة الاستخدام والاحتيال", body: "يحظر تماماً التلاعب بالأسعار أو مواعيد التوفر، أو إنشاء حجوزات أو حسابات وهمية، أو استغلال المنصة لأي أغراض احتيالية أو ضارة بالنظام وباقي الأطراف." },
    { heading: "تعليق وإنهاء الحساب", body: "تحتفظ StayIn بالحق الكامل في تقييد أو تعليق أو إنهاء حساب أي مستخدم أو منشأة بصورة فورية عند ارتكاب أي مخالفة لهذه الشروط أو الإضرار بالمنظومة." },
    { heading: "تعديل الخدمات والشروط", body: "يحق لإدارة StayIn تعديل أو تطوير أو إيقاف أي خدمة، وتعديل هذه الشروط والسياسات مستقبلاً وفقاً للإشعارات المعتمدة والأطر القانونية النافذة." },
    { heading: "حدود المسؤولية", body: "تنحصر مسؤولية StayIn في توفير الوسيط التقني، ولا تتحمل النزاعات الميدانية أو الأضرار الفردية المستقلة بين الأطراف، بما يتوافق مع القوانين والأنظمة المعمول بها في المملكة الأردنية الهاشمية." },
    { heading: "القانون والاختصاص", body: "تخضع هذه الشروط وتفسر بموجب التشريعات السارية في المملكة الأردنية الهاشمية." },
  ],
};

const EN_TERMS: LegalContent = {
  title: "StayIn Terms & Conditions",
  effective: "Effective Date: September 2026",
  note: "Operational draft protecting the rights of StayIn and its users; please have it reviewed by a qualified lawyer in your operating country before commercial launch.",
  sections: [
    { heading: "Platform Nature & Role", body: "StayIn is a digital intermediary platform connecting property owners with guests and users, providing software solutions to coordinate bookings and operations. StayIn is not the owner, operator, or legal agent of any listed property, unless expressly stated otherwise in writing." },
    { heading: "Platform Under Active Development", body: "The user acknowledges that StayIn is an evolving project subject to ongoing enhancement, and operational workflows or features may be updated regularly." },
    { heading: "Temporary Free Access", body: "StayIn services or parts thereof are provided free of charge currently and until further notice; this free access does not constitute a permanent obligation, and StayIn reserves the right to introduce subscriptions or paid tiers in the future." },
    { heading: "User Responsibility", body: "Users agree to provide accurate and updated information and assume full legal and operational responsibility for their account security, credentials, and all actions taken through it." },
    { heading: "Prohibited Conduct & Anti-Fraud", body: "Rate manipulation, fraudulent or mock bookings, fictitious accounts, or exploiting the system to breach platform integrity are strictly prohibited." },
    { heading: "Account Suspension & Termination", body: "StayIn reserves the right to restrict, suspend, or terminate any account or listing immediately upon violating these terms or engaging in abusive behavior." },
    { heading: "Future Amendments", body: "StayIn reserves the right to modify, evolve, or discontinue any feature and amend these terms and conditions in accordance with applicable legal frameworks." },
    { heading: "Limitation of Liability", body: "StayIn's liability is strictly limited to providing the technical intermediary platform. StayIn assumes no liability for on-ground disputes or physical damages between independent parties, compliant with applicable laws in the Hashemite Kingdom of Jordan." },
    { heading: "Governing Law & Jurisdiction", body: "These terms shall be governed by and construed in accordance with the laws of the Hashemite Kingdom of Jordan." },
  ],
};

const AR_PRIVACY: LegalContent = {
  title: "سياسة الخصوصية وحماية البيانات الشخصية",
  effective: "تاريخ السريان: أيلول 2026",
  note: "",
  sections: [
    { heading: "الأساس القانوني", body: "تلتزم منصة StayIn بحماية البيانات الشخصية ومعالجتها بمسؤولية وفقاً لأحكام قانون حماية البيانات الشخصية الأردني رقم 24 لسنة 2023." },
    { heading: "البيانات المجمعة", body: "الاسم، رقم الهاتف، البريد الإلكتروني، بيانات الوحدات والمنشآت، وسجلات النشاط التقني لضمان موثوقية وأمان الخدمة." },
    { heading: "أغراض الاستخدام", body: "تفعيل الحسابات، التحقق عبر رموز OTP، تأكيد العمليات التشغيلية والحجوزات، تحسين أداء المنصة، وإرسال التنبيهات الضرورية." },
    { heading: "مشاركة البيانات", body: "لا يتم بيع أو تأجير البيانات مطلقاً؛ تقتصر المشاركة على البيانات التشغيلية الأساسية بين المالك والعميل لإنجاز الحجز، أو للامتثال لمتطلبات رسمية وقانونية." },
    { heading: "أمن السجلات", body: "استخدام بنية برمجية وسحابية مشفرة لحماية البيانات من الوصول أو التعديل أو التلف غير المصرح به." },
    { heading: "حقوق المستخدم", body: "يحق للمستخدم الوصول لبياناته وطلب تصحيحها أو تعديلها من خلال التواصل مع دعم StayIn." },
  ],
};

const EN_PRIVACY: LegalContent = {
  title: "Privacy Policy & Data Protection",
  effective: "Effective Date: September 2026",
  note: "",
  sections: [
    { heading: "Legal Framework", body: "StayIn is committed to protecting and processing personal data in full compliance with the Jordanian Personal Data Protection Law No. 24 of 2023." },
    { heading: "Data Collected", body: "Name, phone number, email address, property/workspace specifications, and technical security audit logs." },
    { heading: "Processing Purposes", body: "Account provisioning, OTP verification, operational coordination, transaction logging, platform stability, and service notifications." },
    { heading: "Data Sharing", body: "We do not sell or lease personal records. Minimal necessary details are shared between hosts and guests to fulfill bookings, or as required by official legal authorities." },
    { heading: "Security Safeguards", body: "Encrypted storage infrastructure is utilized to safeguard records against unauthorized access, destruction, or tampering." },
    { heading: "User Rights", body: "Users hold the right to access and request corrections to their personal data by contacting StayIn support." },
  ],
};

export type LegalModalKind = "terms" | "privacy";

export function TermsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { language } = useI18n();
  const content = language === "ar" ? AR_TERMS : EN_TERMS;
  return <LegalModal visible={visible} onClose={onClose} content={content} />;
}

export function PrivacyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { language } = useI18n();
  const content = language === "ar" ? AR_PRIVACY : EN_PRIVACY;
  return <LegalModal visible={visible} onClose={onClose} content={content} />;
}

function LegalModal({ visible, onClose, content }: { visible: boolean; onClose: () => void; content: LegalContent }) {
  const { isRTL } = useI18n();
  const colors = useColors();
  const align = isRTL ? "right" : "left";
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={() => undefined} style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: 18, lineHeight: 26, fontWeight: "900", textAlign: align }}>{content.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4, textAlign: align }}>{content.effective}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="إغلاق" onPress={onClose} style={[styles.close, { backgroundColor: colors.surfaceMuted }]}>
              <MaterialIcons name="close" size={21} color={colors.primary} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {content.note ? <View style={[styles.notice, { backgroundColor: colors.warning + "12", borderColor: colors.warning + "55" }]}><Text style={{ color: colors.warning, textAlign: align, fontSize: 11, lineHeight: 17, fontWeight: "800" }}>{content.note}</Text></View> : null}
            {content.sections.map((section, index) => (
              <View key={`${index}-${section.heading}`} style={[styles.card, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900", textAlign: align }}>{index + 1}. {section.heading}</Text>
                <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 20, marginTop: 6, textAlign: align }}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Pressable accessibilityRole="button" onPress={onClose} style={[styles.done, { backgroundColor: colors.primary }]}>
              <Text style={{ color: colors.background, fontSize: 14, fontWeight: "900" }}>{isRTL ? "تم" : "Done"}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { maxHeight: "82%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#00000012" },
  flex: { flex: 1, minWidth: 0 },
  close: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  body: { paddingVertical: 14, gap: 10 },
  notice: { borderRadius: 12, borderWidth: 1, padding: 11 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12 },
  footer: { borderTopWidth: 1, paddingTop: 12 },
  done: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
