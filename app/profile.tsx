import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { CompactScreenHeader } from "@/components/compact-screen-header";
import { ProfileSecurityLinks } from "@/components/profile-security-links";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl, startOAuthLogin } from "@/constants/oauth";
import { useColors } from "@/hooks/use-colors";
import * as Auth from "@/lib/_core/auth";
import { useAuthSession } from "@/lib/auth-session";
import { useI18n } from "@/lib/i18n";
import { COUNTRY_DIALING_CODES, countryForInternationalPhone, DEFAULT_COUNTRY_DIALING_CODE, formatInternationalPhoneHint, normalizeInternationalPhone, type CountryDialingCode } from "@/lib/phone-number";
import { trpc } from "@/lib/trpc";

function sourceForAvatar(url: string | null | undefined) {
  return url?.startsWith("/") ? `${getApiBaseUrl()}${url}` : url ?? null;
}

function VerifiedEmailField({ email, language, isRTL, colors }: { email: string | null; language: "ar" | "en"; isRTL: boolean; colors: ReturnType<typeof useColors> }) {
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const openIdentityPortal = () => Alert.alert(
    language === "ar" ? "تعديل البريد الإلكتروني" : "Edit email address",
    language === "ar" ? "البريد الإلكتروني جزء من هوية الدخول الموثقة. ستفتح بوابة الهوية الآمنة لإضافته أو تعديله، ولن يُحفظ أي تغيير محليًا قبل توثيقه." : "Email is part of your verified sign-in identity. The secure identity portal will open to add or change it; nothing is stored locally before verification.",
    [{ text: language === "ar" ? "إلغاء" : "Cancel", style: "cancel" }, { text: language === "ar" ? "فتح بوابة الهوية" : "Open identity portal", onPress: () => void startOAuthLogin() }],
  );

  return <View style={[styles.emailBlock, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "البريد الإلكتروني الموثق" : "Verified email address"}</Text><View style={[styles.emailValueRow, { flexDirection: row }]}><View style={styles.flex}><View style={[styles.emailLine, { flexDirection: row }]}><MaterialIcons name={email ? "verified" : "mail-outline"} size={17} color={email ? colors.success : colors.muted} /><Text numberOfLines={1} style={[styles.emailValue, { color: email ? colors.foreground : colors.muted, textAlign: align, writingDirection: "ltr" }]}>{email ?? (language === "ar" ? "لا يوجد بريد موثق لهذه الهوية بعد" : "No verified email is linked yet")}</Text></View><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 5, textAlign: align }}>{language === "ar" ? "لأمان الحساب، يُدار البريد من بوابة الهوية ولا يُعدّل داخل التطبيق." : "For account security, email is managed through the identity portal, not in the app."}</Text></View>{email ? <View style={[styles.verifiedBadge, { backgroundColor: colors.success + "18" }]}><Text style={{ color: colors.success, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "موثق" : "Verified"}</Text></View> : null}</View><Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "تعديل البريد عبر بوابة الهوية" : "Edit email through identity portal"} onPress={openIdentityPortal} style={({ pressed }) => [styles.emailAction, { borderColor: colors.primary + "75", backgroundColor: colors.primary + "0C", flexDirection: row, opacity: pressed ? 0.68 : 1 }]}><MaterialIcons name="open-in-new" size={17} color={colors.primary} /><Text style={[styles.flex, { color: colors.primary, fontSize: 12, fontWeight: "900", textAlign: align }]}>{language === "ar" ? "تعديل عبر بوابة الهوية" : "Edit through identity portal"}</Text><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={19} color={colors.primary} /></Pressable></View>;
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
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const sourceUser = profile.data ?? currentUser;
  const verifiedEmail = sourceUser?.email?.trim() || null;

  useEffect(() => {
    if (!sourceUser) return;
    const displayName = "name" in sourceUser ? sourceUser.name : sourceUser.fullName;
    setName(displayName ?? "");
    setPhone(sourceUser.phone ?? "");
    setCountry(countryForInternationalPhone(sourceUser.phone));
    setAvatarUrl(sourceUser.avatarUrl ?? null);
  }, [sourceUser]);

  const saveLocalUser = async (user: { id: number; openId: string; name: string | null; email: string | null; phone: string | null; avatarUrl: string | null; loginMethod: string | null; lastSignedIn: Date | string }) => Auth.setUserInfo({ id: user.id, openId: user.openId, name: user.name, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl, loginMethod: user.loginMethod, lastSignedIn: new Date(user.lastSignedIn) });
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
  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><CompactScreenHeader title={language === "ar" ? "ملفي الشخصي" : "My profile"} backHref="/(tabs)/more" icon="person" plain showDateTime={false} /><View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}><View style={[styles.avatarRow, { flexDirection: row }]}><View style={[styles.avatar, { backgroundColor: colors.primary + "1A", borderColor: colors.primary }]}>{imageSource ? <Image source={imageSource} style={styles.image} contentFit="cover" /> : <MaterialIcons name="person" size={42} color={colors.primary} />}</View><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "الصورة الشخصية" : "Profile photo"}</Text><Text style={{ color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3, textAlign: align }}>{language === "ar" ? "صورة مربعة واضحة، حتى 2 ميغابايت." : "A clear square image, up to 2MB."}</Text><View style={[styles.imageActions, { flexDirection: row }]}><Pressable disabled={uploadAvatar.isPending} onPress={() => void selectAvatar(false)} style={({ pressed }) => [styles.photoButton, { borderColor: colors.primary, opacity: pressed || uploadAvatar.isPending ? 0.58 : 1 }]}><MaterialIcons name="photo-library" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "رفع صورة" : "Choose"}</Text></Pressable><Pressable disabled={uploadAvatar.isPending} onPress={() => void selectAvatar(true)} style={({ pressed }) => [styles.photoButton, { borderColor: colors.primary, opacity: pressed || uploadAvatar.isPending ? 0.58 : 1 }]}><MaterialIcons name="photo-camera" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "التقاط" : "Camera"}</Text></Pressable></View></View></View>{uploadAvatar.isPending ? <View style={[styles.uploading, { flexDirection: row, backgroundColor: colors.primary + "0C" }]}><ActivityIndicator size="small" color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>{language === "ar" ? "جارٍ رفع الصورة بأمان" : "Uploading photo securely"}</Text></View> : null}<Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "الاسم الكامل" : "Full name"}</Text><TextInput value={name} onChangeText={setName} placeholder={language === "ar" ? "الاسم الذي يظهر للفريق" : "Name shown to your team"} placeholderTextColor={colors.muted} textAlign={align} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted }]} /><Text style={[styles.label, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "رقم الهاتف الدولي" : "International phone number"}</Text><View style={[styles.phoneRow, { flexDirection: row }]}><Pressable onPress={() => setCountryPickerVisible(true)} style={({ pressed }) => [styles.countryButton, { backgroundColor: colors.surfaceMuted, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}><Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "900" }}>{country.code}</Text><MaterialIcons name="keyboard-arrow-down" size={17} color={colors.muted} /></Pressable><TextInput value={phone} onChangeText={setPhone} placeholder={formatInternationalPhoneHint().replace(DEFAULT_COUNTRY_DIALING_CODE.code, country.code)} keyboardType="phone-pad" placeholderTextColor={colors.muted} textAlign="left" style={[styles.phoneInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surfaceMuted, writingDirection: "ltr" }]} /></View><Text style={{ color: colors.muted, fontSize: 10, lineHeight: 16, marginTop: 7, textAlign: align }}>{language === "ar" ? `اختر الدولة ثم اكتب الرقم المحلي. سيحفظ التطبيق الرقم بالصيغة الدولية ${country.code}…` : `Select a country and enter the local number. It will be saved in international format ${country.code}…`}</Text><VerifiedEmailField email={verifiedEmail} language={language} isRTL={isRTL} colors={colors} /><Pressable disabled={saveProfile.isPending || uploadAvatar.isPending} onPress={() => void persist()} style={({ pressed }) => [styles.save, { backgroundColor: colors.primary, opacity: pressed || saveProfile.isPending || uploadAvatar.isPending ? 0.6 : 1 }]}><MaterialIcons name="save" size={20} color={colors.background} /><Text style={{ color: colors.background, fontWeight: "900" }}>{saveProfile.isPending ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (language === "ar" ? "حفظ التغييرات" : "Save changes")}</Text></Pressable></View><ProfileSecurityLinks /></ScrollView><Modal visible={countryPickerVisible} transparent animationType="fade" onRequestClose={() => setCountryPickerVisible(false)}><Pressable style={styles.modalBackdrop} onPress={() => setCountryPickerVisible(false)}><Pressable style={[styles.countrySheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => undefined}><Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "900", textAlign: align }}>{language === "ar" ? "اختر رمز الدولة" : "Select country code"}</Text><ScrollView style={styles.countryList}>{COUNTRY_DIALING_CODES.map((option) => <Pressable key={option.iso} onPress={() => { setCountry(option); setCountryPickerVisible(false); }} style={({ pressed }) => [styles.countryOption, { flexDirection: row, borderColor: colors.border, opacity: pressed ? 0.68 : 1 }]}><View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", textAlign: align }}>{language === "ar" ? option.nameAr : option.nameEn}</Text><Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{option.code}</Text></View>{country.iso === option.iso ? <MaterialIcons name="check-circle" size={20} color={colors.primary} /> : null}</Pressable>)}</ScrollView></Pressable></Pressable></Modal></ScreenContainer>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 16, paddingBottom: 48 }, card: { borderWidth: 1, borderRadius: 22, padding: 15, marginTop: 14 }, avatarRow: { gap: 13, alignItems: "center" }, avatar: { width: 84, height: 84, borderRadius: 28, overflow: "hidden", borderWidth: 1, justifyContent: "center", alignItems: "center" }, image: { width: "100%", height: "100%" }, flex: { flex: 1, minWidth: 0 }, imageActions: { gap: 7, marginTop: 9 }, photoButton: { minHeight: 34, borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 }, uploading: { marginTop: 13, borderRadius: 10, padding: 9, alignItems: "center", justifyContent: "center", gap: 7 }, label: { marginTop: 17, fontSize: 12, fontWeight: "900" }, input: { minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, marginTop: 7, fontSize: 14 }, phoneRow: { gap: 8, marginTop: 7 }, countryButton: { minWidth: 78, minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 2 }, phoneInput: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 14 }, emailBlock: { borderWidth: 1, borderRadius: 15, padding: 12, marginTop: 15 }, emailValueRow: { gap: 8, alignItems: "flex-start", marginTop: 8 }, emailLine: { alignItems: "center", gap: 6 }, emailValue: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: "800" }, verifiedBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 }, emailAction: { minHeight: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", paddingHorizontal: 11, gap: 7, marginTop: 11 }, save: { minHeight: 52, borderRadius: 14, marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, modalBackdrop: { flex: 1, backgroundColor: "#07171499", justifyContent: "flex-end", padding: 14 }, countrySheet: { maxHeight: "70%", borderWidth: 1, borderRadius: 22, padding: 16 }, countryList: { marginTop: 10 }, countryOption: { minHeight: 57, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
});
