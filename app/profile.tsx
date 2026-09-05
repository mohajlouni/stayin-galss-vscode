import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInput as TextInputType } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ProfileSecurityLinks } from "@/components/profile-security-links";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";
import * as Auth from "@/lib/_core/auth";
import { useAuthSession } from "@/lib/auth-session";
import { useI18n } from "@/lib/i18n";
import { COUNTRY_DIALING_CODES, countryForInternationalPhone, DEFAULT_COUNTRY_DIALING_CODE, formatInternationalPhoneHint, normalizeInternationalPhone, type CountryDialingCode } from "@/lib/phone-number";
import { trpc } from "@/lib/trpc";

const OTP_LENGTH = 6;
const MAX_OTP_LENGTH = 12;

function sourceForAvatar(url: string | null | undefined) {
  return url?.startsWith("/") ? `${getApiBaseUrl()}${url}` : url ?? null;
}

function EmailChangeSheet({
  visible,
  currentEmail,
  language,
  isRTL,
  colors,
  onClose,
}: {
  visible: boolean;
  currentEmail: string | null;
  language: "ar" | "en";
  isRTL: boolean;
  colors: ReturnType<typeof useColors>;
  onClose: () => void;
}) {
  const request = trpc.profile.requestEmailChangeOtp.useMutation();
  const verify = trpc.profile.verifyEmailChangeOtp.useMutation();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const inputRef = useRef<TextInputType>(null);
  const currentCode = digits.join("");

  useEffect(() => {
    if (visible) {
      setEmail("");
      setStep("email");
      setDigits(Array(OTP_LENGTH).fill(""));
      setError(null);
      setInfo(null);
    }
  }, [visible]);

  useEffect(() => {
    if (step !== "otp") return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [step]);

  const sendCode = async () => {
    const target = email.trim();
    if (!target || (currentEmail && target.toLowerCase() === currentEmail.toLowerCase())) {
      setError(language === "ar" ? "أدخل بريدًا مختلفًا عن البريد الحالي." : "Enter an email different from the current one.");
      return;
    }
    if (request.isPending) return;
    setError(null);
    setInfo(null);
    try {
      await request.mutateAsync({ newEmail: target });
      setDigits(Array(OTP_LENGTH).fill(""));
      setStep("otp");
    } catch {
      setError(language === "ar" ? "تعذر إرسال رمز التحقق. تحقق من البريد وجرّب مجددًا." : "Could not send the verification code. Check the email and retry.");
    }
  };

  const handleChange = (text: string) => {
    setError(null);
    const clean = text.replace(/[^\d]/g, "").slice(0, MAX_OTP_LENGTH);
    setDigits(clean.split("").length ? clean.split("") : Array(OTP_LENGTH).fill(""));
  };

  const confirm = async () => {
    const token = currentCode.replace(/\s+/g, "").trim();
    if (verify.isPending) return;
    if (token.length < OTP_LENGTH) {
      setError(language === "ar" ? "أدخل رمز التحقق المكوّن من 6 أرقام." : "Enter the complete 6-digit verification code.");
      return;
    }
    setError(null);
    setInfo(null);
    try {
      await verify.mutateAsync({ newEmail: email.trim(), token });
      setInfo(language === "ar" ? "تم تغيير البريد الإلكتروني بنجاح." : "Email updated successfully.");
      onClose();
    } catch {
      setError(language === "ar" ? "رمز التحقق غير صحيح أو انتهت صلاحيته." : "The verification code is incorrect or has expired.");
    }
  };

  useEffect(() => {
    if (currentCode.replace(/\s+/g, "").trim().length >= OTP_LENGTH && !verify.isPending) void confirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCode]);

  const activeIndex = step === "otp" ? (digits.findIndex((d) => d === "") === -1 ? OTP_LENGTH - 1 : digits.findIndex((d) => d === "")) : -1;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.emailSheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.sheetHeader, { flexDirection: row }]}>
            <View style={styles.flex}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "تغيير البريد الإلكتروني" : "Change email address"}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>
                {step === "email" ? (language === "ar" ? "يُرسل رمز تحقق إلى البريد الجديد للتحقق من ملكيته، دون مغادرة التطبيق." : "A verification code is sent to the new email to confirm ownership — no external portal.") : (language === "ar" ? "أدخل رمز التحقق المرسل إلى بريدك الجديد." : "Enter the code sent to your new address.")}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={onClose} style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}>
              <MaterialIcons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {step === "email" ? (
            <>
              <TextInput
                value={email}
                onChangeText={(text) => setEmail(text)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder={language === "ar" ? "البريد الإلكتروني الجديد" : "New email address"}
                placeholderTextColor={colors.muted}
                style={[styles.emailInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align, writingDirection: "ltr" }]}
              />
              <Pressable disabled={request.isPending} accessibilityRole="button" accessibilityState={{ busy: request.isPending }} onPress={() => void sendCode()} style={({ pressed }) => [styles.emailAction, { backgroundColor: colors.primary, borderColor: colors.primary, flexDirection: row, opacity: pressed || request.isPending ? 0.7 : 1 }]}>
                {request.isPending ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="mark-email-read" size={18} color={colors.foreground} />}
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", flex: 1, textAlign: align }}>{request.isPending ? (language === "ar" ? "جارٍ الإرسال…" : "Sending…") : (language === "ar" ? "إرسال رمز التحقق" : "Send verification code")}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable accessibilityRole="button" accessibilityLabel="حقل إدخال رمز التحقق" onPress={() => inputRef.current?.focus()} style={styles.digitsRow}>
                {digits.map((digit, index) => (
                  <View key={index} style={[styles.digitBox, { borderColor: activeIndex === index ? colors.primary : (digit ? colors.primary : colors.border), backgroundColor: colors.surfaceMuted }]}>
                    <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "900" }}>{digit || "·"}</Text>
                  </View>
                ))}
              </Pressable>
              <TextInput
                ref={inputRef}
                value={currentCode}
                onChangeText={handleChange}
                keyboardType="number-pad"
                maxLength={MAX_OTP_LENGTH}
                autoFocus
                caretHidden
                accessibilityLabel="رمز التحقق"
                style={styles.hiddenInput}
              />
              <Pressable disabled={verify.isPending} accessibilityRole="button" accessibilityState={{ busy: verify.isPending }} onPress={() => void confirm()} style={({ pressed }) => [styles.emailAction, { backgroundColor: colors.primary, borderColor: colors.primary, flexDirection: row, opacity: pressed || verify.isPending ? 0.7 : 1 }]}>
                {verify.isPending ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="verified-user" size={18} color={colors.foreground} />}
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", flex: 1, textAlign: align }}>{verify.isPending ? (language === "ar" ? "جارٍ التحقق…" : "Verifying…") : (language === "ar" ? "تأكيد تغيير البريد" : "Confirm change")}</Text>
              </Pressable>
              <Pressable disabled={request.isPending} onPress={() => void sendCode()} style={({ pressed }) => [styles.resendLink, { opacity: pressed ? 0.6 : 1, alignItems: isRTL ? "flex-end" : "flex-start" }]}>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900", textAlign: align }}>{language === "ar" ? "إعادة إرسال الرمز" : "Resend code"}</Text>
              </Pressable>
            </>
          )}

          {error ? <View style={[styles.feedback, { borderColor: colors.error + "62", backgroundColor: colors.error + "12", flexDirection: row }]}><MaterialIcons name="error-outline" size={17} color={colors.error} /><Text style={{ color: colors.error, fontSize: 12, fontWeight: "800", flex: 1, textAlign: align }}>{error}</Text></View> : null}
          {info ? <View style={[styles.feedback, { borderColor: colors.success + "62", backgroundColor: colors.success + "12", flexDirection: row }]}><MaterialIcons name="check-circle-outline" size={17} color={colors.success} /><Text style={{ color: colors.success, fontSize: 12, fontWeight: "800", flex: 1, textAlign: align }}>{info}</Text></View> : null}
        </View>
      </View>
    </Modal>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const { currentUser, refresh } = useAuthSession();
  const profile = trpc.profile.me.useQuery(undefined, { retry: false });
  const saveProfile = trpc.profile.update.useMutation();
  const uploadAvatar = trpc.profile.uploadAvatar.useMutation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryDialingCode>(DEFAULT_COUNTRY_DIALING_CODE);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [emailSheetVisible, setEmailSheetVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const sourceUser = profile.data ?? currentUser;
  const verifiedEmail = sourceUser?.email?.trim() || null;
  const userCode = sourceUser?.userCode?.trim() || null;
  const profileMe = profile.data;

  useEffect(() => {
    if (!sourceUser) return;
    const displayName = "name" in sourceUser ? sourceUser.name : sourceUser.fullName;
    setName(displayName ?? "");
    setPhone(sourceUser.phone ?? "");
    setCountry(countryForInternationalPhone(sourceUser.phone));
    setAvatarUrl(sourceUser.avatarUrl ?? null);
  }, [sourceUser]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  const copyUserCode = async () => {
    if (!userCode) return;
    try {
      await Clipboard.setStringAsync(userCode);
      setCopied(true);
    } catch {
      // Best-effort: never block the UI if the clipboard is unavailable.
    }
  };

  const saveLocalUser = async (user: { id: number; openId: string; name: string | null; email: string | null; phone: string | null; avatarUrl: string | null; userCode?: string | null; loginMethod: string | null; lastSignedIn: Date | string }) => Auth.setUserInfo({ id: user.id, openId: user.openId, name: user.name, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl, userCode: user.userCode ?? null, loginMethod: user.loginMethod, lastSignedIn: new Date(user.lastSignedIn) });
  const persist = async () => {
    const normalizedName = name.trim();
    const normalizedPhone = normalizeInternationalPhone(phone, country.code);
    if (normalizedName.length < 2) {
      Alert.alert(language === "ar" ? "اسم مطلوب" : "Name required", language === "ar" ? "أدخل الاسم الكامل المكون من حرفين على الأقل." : "Enter a full name of at least two characters.");
      return;
    }
    if (normalizedPhone.error) {
      Alert.alert(language === "ar" ? "رقم دولي غير صالح" : "Invalid international number", language === "ar" ? "اكتب الرقم بصيغة دولية مثل +962790000000. يمكن إدخال الرقم الأردني المحلي 079… وسيحوّله التطبيق تلقائيًا." : "Enter an international number such as +962790000000.");
      return;
    }
    if (normalizedPhone.value) setPhone(normalizedPhone.value);
    try {
      const user = await saveProfile.mutateAsync({ name: normalizedName, phone: normalizedPhone.value });
      await saveLocalUser(user);
      await refresh();
      Alert.alert(language === "ar" ? "تم حفظ الملف الشخصي" : "Profile saved", language === "ar" ? "حُدّثت بياناتك الشخصية بنجاح." : "Your personal details were updated.");
    } catch {
      Alert.alert(language === "ar" ? "تعذر الحفظ" : "Could not save", language === "ar" ? "تحقق من اتصالك وتسجيل دخولك ثم حاول مرة أخرى." : "Check your connection and sign-in, then try again.");
    }
  };
  const selectAvatar = async (camera: boolean) => {
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(language === "ar" ? "إذن الكاميرا مطلوب" : "Camera permission required", language === "ar" ? "اسمح بالكاميرا لالتقاط صورة شخصية." : "Allow camera access to take a profile photo.");
        return;
      }
    }
    const result = camera ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    const mimeType = result.assets[0].mimeType === "image/png" || result.assets[0].mimeType === "image/webp" ? result.assets[0].mimeType : "image/jpeg";
    try {
      const uploaded = await uploadAvatar.mutateAsync({ base64: result.assets[0].base64, mimeType });
      setAvatarUrl(uploaded.avatarUrl ?? null);
      await saveLocalUser(uploaded.user);
      await refresh();
    } catch {
      Alert.alert(language === "ar" ? "تعذر رفع الصورة" : "Could not upload photo", language === "ar" ? "اختر صورة أصغر من 2 ميغابايت ثم حاول مرة أخرى." : "Choose an image smaller than 2MB and try again.");
    }
  };

  const imageSource = sourceForAvatar(avatarUrl);
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><CompactScreenHeader title={language === "ar" ? "ملفي الشخصي" : "My profile"} backHref="/(tabs)/more" icon="person" plain showDateTime={false} /><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.avatarRow, { flexDirection: row }]}><View style={[styles.avatar, { backgroundColor: colors.primary + "1A", borderColor: colors.primary }]}>{imageSource ? <Image source={imageSource} style={styles.image} contentFit="cover" /> : <MaterialIcons name="person" size={42} color={colors.primary} />}</View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الصورة الشخصية" : "Profile photo"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "صورة مربعة واضحة، حتى 2 ميغابايت." : "A clear square image, up to 2MB."}</Text><View style={[styles.imageActions, { flexDirection: row }]}><Pressable disabled={uploadAvatar.isPending} onPress={() => void selectAvatar(false)} style={({ pressed }) => [styles.photoButton, { borderColor: colors.primary, opacity: pressed || uploadAvatar.isPending ? 0.58 : 1 }]}><MaterialIcons name="photo-library" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "رفع صورة" : "Choose"}</Text></Pressable><Pressable disabled={uploadAvatar.isPending} onPress={() => void selectAvatar(true)} style={({ pressed }) => [styles.photoButton, { borderColor: colors.primary, opacity: pressed || uploadAvatar.isPending ? 0.58 : 1 }]}><MaterialIcons name="photo-camera" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "التقاط" : "Camera"}</Text></Pressable></View></View></View><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "معرّف المستخدم" : "User ID"}</Text><View style={[styles.userCodeRow, { flexDirection: row }]}><View style={[styles.userCodePill, { borderColor: colors.primary, backgroundColor: colors.primary + "0C", flexDirection: row }]}><MaterialIcons name="badge" size={17} color={colors.primary} /><Text numberOfLines={1} style={{ color: colors.primary, fontSize: 14, fontWeight: "900", writingDirection: "ltr" }}>{userCode ?? (language === "ar" ? "…" : "…")}</Text></View>{userCode ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "نسخ معرّف المستخدم" : "Copy user ID"} onPress={() => void copyUserCode()} style={({ pressed }) => [styles.copyButton, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, flexDirection: row, opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name={copied ? "check" : "content-copy"} size={16} color={copied ? colors.success : colors.muted} /><Text style={{ color: copied ? colors.success : colors.muted, fontSize: 11, fontWeight: "900" }}>{copied ? (language === "ar" ? "تم النسخ" : "Copied") : (language === "ar" ? "نسخ" : "Copy")}</Text></Pressable> : null}</View><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 6, textAlign: align }}>{language === "ar" ? "معرّف فريد للقراءة فقط يُمنح عند إنشاء الحساب." : "A unique read-only identifier assigned on account creation."}</Text><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الاسم الكامل" : "Full name"}</Text><TextInput value={name} onChangeText={setName} placeholder={language === "ar" ? "الاسم الكامل" : "Full name"} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align }]} /><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "رقم الهاتف الدولي" : "International phone number"}</Text><View style={[styles.phoneRow, { flexDirection: row }]}><Pressable accessibilityRole="button" onPress={() => setCountryPickerVisible(true)} style={({ pressed }) => [styles.countryButton, { borderColor: colors.border, backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.6 : 1 }]}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "900" }}>+{country.code}</Text><MaterialIcons name="arrow-drop-down" size={18} color={colors.primary} /></Pressable><TextInput value={phone} onChangeText={setPhone} placeholder={language === "ar" ? "رقم الجوال الدولي" : "International phone number"} placeholderTextColor={colors.muted} keyboardType="phone-pad" style={[styles.phoneInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, textAlign: align, writingDirection: "ltr" }]} /></View><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 5, textAlign: align }}>{formatInternationalPhoneHint().replace(DEFAULT_COUNTRY_DIALING_CODE.code, country.code)}</Text><View style={[styles.emailBlock, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "البريد الإلكتروني الموثق" : "Verified email address"}</Text><View style={[styles.emailValueRow, { flexDirection: row }]}><View style={styles.flex}><View style={[styles.emailLine, { flexDirection: row }]}><MaterialIcons name={verifiedEmail ? "verified" : "mail-outline"} size={17} color={verifiedEmail ? colors.success : colors.muted} /><Text numberOfLines={1} style={[styles.emailValue, { color: verifiedEmail ? colors.foreground : colors.muted, textAlign: align, writingDirection: "ltr" }]}>{verifiedEmail ?? (language === "ar" ? "لا يوجد بريد مرتبط بعد" : "No email linked yet")}</Text></View></View>{verifiedEmail ? <View style={[styles.verifiedBadge, { backgroundColor: colors.success + "18" }]}><Text style={{ color: colors.success, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "موثق" : "Verified"}</Text></View> : null}</View><View style={{ marginTop: 11 }}><View style={[styles.emailValueRow, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, textAlign: align }}>{language === "ar" ? "لتغيير بريدك، يُرسل رمز تحقق إلى البريد الجديد داخل التطبيق." : "To change your email, a verification code is sent to the new address in-app."}</Text></View></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تغيير البريد الإلكتروني" : "Change email address"} onPress={() => setEmailSheetVisible(true)} style={({ pressed }) => [styles.emailAction, { borderColor: colors.primary + "75", backgroundColor: colors.primary + "0C", flexDirection: row, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="edit" size={17} color={colors.primary} /><Text style={[styles.flex, { color: colors.primary, fontSize: 12, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "تغيير البريد" : "Change email"}</Text><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.primary} /></Pressable></View></View><View style={[styles.save, { backgroundColor: colors.primary, flexDirection: row }]}><Pressable accessibilityRole="button" disabled={saveProfile.isPending} onPress={() => void persist()} style={({ pressed }) => [styles.flex, { flexDirection: row, alignItems: "center", justifyContent: "center", gap: 8, opacity: pressed || saveProfile.isPending ? 0.7 : 1 }]}>{saveProfile.isPending ? <ActivityIndicator color={colors.foreground} /> : <MaterialIcons name="save" size={20} color={colors.foreground} />}<Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{saveProfile.isPending ? (language === "ar" ? "جارٍ الحفظ…" : "Saving…") : (language === "ar" ? "حفظ التغييرات" : "Save changes")}</Text></Pressable></View></View><ProfileSecurityLinks /><EmailChangeSheet visible={emailSheetVisible} currentEmail={profileMe?.email ?? currentUser?.email ?? null} language={language} isRTL={isRTL} colors={colors} onClose={() => { setEmailSheetVisible(false); void profile.refetch(); void refresh(); }} /><Modal visible={countryPickerVisible} transparent animationType="slide" onRequestClose={() => setCountryPickerVisible(false)}><View style={styles.modalBackdrop}><View style={[styles.countrySheet, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.sheetHeader, { flexDirection: row }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "اختر رمز الدولة" : "Select country code"}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "إغلاق" : "Close"} onPress={() => setCountryPickerVisible(false)} style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.6 : 1 }]}><MaterialIcons name="close" size={22} color={colors.muted} /></Pressable></View><ScrollView keyboardShouldPersistTaps="handled">{COUNTRY_DIALING_CODES.map((entry) => <Pressable key={entry.iso} accessibilityRole="button" onPress={() => { setCountry(entry); setCountryPickerVisible(false); }} style={({ pressed }) => [styles.countryOption, { flexDirection: row, backgroundColor: pressed ? colors.surfaceMuted : "transparent", borderBottomColor: colors.border }]}><Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", flex: 1, textAlign: align }}>{language === "ar" ? entry.nameAr : entry.nameEn}</Text><Text style={{ color: colors.muted, fontSize: 13, fontWeight: "700", writingDirection: "ltr" }}>+{entry.code}</Text>{country.code === entry.code ? <MaterialIcons name="check-circle" size={20} color={colors.primary} /> : null}</Pressable>)}</ScrollView></View></View></Modal></ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 16, paddingBottom: 48 },
  card: { borderWidth: 1, borderRadius: 22, padding: 15, marginTop: 14 },
  avatarRow: { gap: 13, alignItems: "center" },
  avatar: { width: 84, height: 84, borderRadius: 28, overflow: "hidden", borderWidth: 1, justifyContent: "center", alignItems: "center" },
  image: { width: "100%", height: "100%" },
  flex: { flex: 1, minWidth: 0 },
  imageActions: { gap: 7, marginTop: 9 },
  photoButton: { minHeight: 34, borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  label: { marginTop: 17, fontSize: 12, fontWeight: "900" },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginTop: 7, fontSize: 14 },
  phoneRow: { gap: 8, marginTop: 7 },
  countryButton: { minWidth: 78, minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 2 },
  phoneInput: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 14 },
  emailBlock: { borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 15 },
  emailValueRow: { gap: 8, alignItems: "flex-start", marginTop: 8 },
  emailLine: { alignItems: "center", gap: 6 },
  emailValue: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "800" },
  verifiedBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  emailAction: { minHeight: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", paddingHorizontal: 11, gap: 7, marginTop: 11 },
  userCodeRow: { gap: 8, alignItems: "center", marginTop: 7 },
  userCodePill: { minHeight: 38, borderRadius: 11, borderWidth: 1, paddingHorizontal: 12, alignItems: "center", gap: 6 },
  copyButton: { minHeight: 38, borderRadius: 11, borderWidth: 1, paddingHorizontal: 10, alignItems: "center", gap: 5 },
  save: { minHeight: 52, borderRadius: 14, marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "#07171499", justifyContent: "flex-end", padding: 14 },
  emailSheet: { borderWidth: 1, borderRadius: 22, padding: 16 },
  countrySheet: { maxHeight: "70%", borderWidth: 1, borderRadius: 22, padding: 16 },
  sheetHeader: { alignItems: "center", gap: 10, marginBottom: 8 },
  closeButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  emailInput: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginTop: 12, fontSize: 14 },
  digitsRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 8, marginTop: 14 },
  digitBox: { width: 48, height: 56, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hiddenInput: { position: "absolute", opacity: 0, height: 1, width: 1 },
  resendLink: { marginTop: 8, paddingVertical: 4 },
  feedback: { minHeight: 40, borderRadius: 12, padding: 10, alignItems: "center", gap: 8, marginTop: 12 },
  countryOption: { minHeight: 52, alignItems: "center", paddingHorizontal: 10, gap: 8, borderBottomWidth: 1 },
});
