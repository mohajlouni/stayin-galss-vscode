import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GlowGlassCard } from "@/components/glow-glass-card";
import { ScreenContainer } from "@/components/screen-container";
import { SubScreenHeader } from "@/components/sub-screen-header";
import { useColors } from "@/hooks/use-colors";
import { useAppPreferences } from "@/lib/app-preferences";
import { useBookings } from "@/lib/booking-store";
import { type Booking, type LoyaltyAccount, type LoyaltyTransaction, formatMoney, rentalTotal } from "@/lib/booking-model";
import { useI18n } from "@/lib/i18n";
import { JOD_PER_POINT, LOYALTY_TIER_ORDER, deriveLoyaltyTier, loyaltyTierIcon, loyaltyTierLabel, loyaltyTierPerkLabel, loyaltyMultiplier, pointsValueJod, redemptionForSubtotal } from "@/lib/loyalty";
import { useWorkspaceAccess } from "@/lib/workspace-access";

const TIER_THEME: Record<string, string> = {
  bronze: "#B08D57",
  silver: "#98A6B4",
  gold: "#E3B341",
  platinum: "#C9A585",
};

export default function LoyaltyScreen() {
  const colors = useColors();
  const { language, isRTL, t } = useI18n();
  const { formatDate } = useAppPreferences();
  const { customers, bookings, loyaltyAccounts = [], loyaltyTransactions = [], settings, redeemLoyaltyPoints } = useBookings();
  const { can } = useWorkspaceAccess();
  const align = isRTL ? "right" : "left";
  const row = isRTL ? "row-reverse" : "row";
  const [redeemAccount, setRedeemAccount] = useState<LoyaltyAccount | null>(null);
  const [bookingId, setBookingId] = useState<string | undefined>();
  const [pointsInput, setPointsInput] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!can("view_financial_reports")) {
    return <ScreenContainer><GlowGlassCard style={styles.locked} contentStyle={styles.lockedContent}><MaterialIcons name="lock" size={32} color={colors.primary} /><Text style={[styles.lockedTitle, { color: colors.foreground, textAlign: align }]}>{language === "ar" ? "هذه الصفحة غير مفعّلة لصلاحياتك" : "This page is not enabled for your permissions"}</Text><Text style={[styles.lockedText, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "اطلب من المدير تفعيل صلاحية عرض برنامج الولاء." : "Ask your manager to enable loyalty program access."}</Text></GlowGlassCard></ScreenContainer>;
  }

  const customerName = (account: LoyaltyAccount) => customers?.find((customer) => customer.id === account.customerId)?.name ?? account.customerId;
  const customerPhones = (account: LoyaltyAccount) => {
    const customer = customers?.find((item) => item.id === account.customerId);
    return new Set<string>([customer?.phone ?? "", customer?.e164 ?? ""].filter(Boolean));
  };
  const bookingMatches = (account: LoyaltyAccount, booking: Booking) => {
    const phones = customerPhones(account);
    return (phones.size === 0 || phones.has(booking.phone)) && booking.status !== "cancelled";
  };
  const accountBookings = (account: LoyaltyAccount) => bookings.filter((booking) => bookingMatches(account, booking)).sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
  const redeemTargetBookings = redeemAccount ? accountBookings(redeemAccount) : [];
  const targetBooking = redeemTargetBookings.find((booking) => booking.id === bookingId) ?? redeemTargetBookings[0];
  const points = Number(pointsInput);
  const maxRedemption = targetBooking && redeemAccount ? redemptionForSubtotal(redeemAccount.pointsBalance, rentalTotal(targetBooking)) : { points: 0, amount: 0 };
  const redeemAmount = Number.isFinite(points) && points > 0 ? Math.min(pointsValueJod(points), rentalTotal(targetBooking) || Infinity) : 0;
  const redeemReady = Boolean(targetBooking && redeemAccount && Number.isFinite(points) && Math.floor(points) > 0 && redeemAccount.pointsBalance >= Math.floor(points) && redeemAmount > 0 && can("edit_bookings"));

  const startRedeem = (account: LoyaltyAccount) => {
    setRedeemAccount(account);
    setBookingId(undefined);
    setPointsInput("");
    setNote("");
  };

  const confirmRedeem = async () => {
    if (!redeemAccount || !targetBooking || !redeemReady) return;
    setSaving(true);
    try {
      await redeemLoyaltyPoints({ customerId: redeemAccount.customerId, bookingId: targetBooking.id, bookingReference: targetBooking.bookingReference, points: Math.floor(points), amount: redeemAmount, note: note.trim() || undefined });
      Alert.alert(language === "ar" ? "تم الاسترداد بنجاح" : "Redemption completed", language === "ar" ? `خصم ${Math.floor(points)} نقطة بقيمة ${redeemAmount.toFixed(2)} ${settings.currency} من حجز ${targetBooking.bookingReference ?? targetBooking.customerName}.` : `${Math.floor(points)} points worth ${redeemAmount.toFixed(2)} ${settings.currency} applied to ${targetBooking.bookingReference ?? targetBooking.customerName}.`);
      setRedeemAccount(null);
    } catch (error) {
      Alert.alert(language === "ar" ? "تعذر الاسترداد" : "Redemption failed", error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const totalPoints = loyaltyAccounts.reduce((sum, account) => sum + account.pointsBalance, 0);
  const transactions = [...loyaltyTransactions].sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SubScreenHeader title={language === "ar" ? "برنامج الولاء" : "Loyalty program"} />

      <GlowGlassCard radius={24} style={styles.summary} contentStyle={styles.summaryContent}>
        <View style={[styles.summaryHeader, { flexDirection: row }]}>
          <View style={[styles.icon, { backgroundColor: colors.primary + "1A" }]}><MaterialIcons name="workspace-premium" size={24} color={colors.primary} /></View>
          <View style={styles.flex}>
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900", textAlign: align }}>{language === "ar" ? "رصيد النقاط الإجمالي" : "Total point balance"}</Text>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: align }}>{language === "ar" ? "تكسب نقاطًا تلقائيًا عند إنهاء كل إقامة" : "Points are earned automatically on stay completion"}</Text>
          </View>
        </View>
        <View style={[styles.summaryNumbers, { flexDirection: row }]}>
          <View style={styles.flex}><Text style={[styles.summaryValue, { color: colors.foreground, textAlign: align }]}>{totalPoints}</Text><Text style={[styles.summaryCaption, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "نقطة متاحة" : "available points"}</Text></View>
          <View style={[styles.flex, { alignItems: isRTL ? "flex-start" : "flex-end" }]}><Text style={[styles.summaryValue, { color: colors.primary, textAlign: align }]}>{formatMoney(pointsValueJod(totalPoints), settings.currency)}</Text><Text style={[styles.summaryCaption, { color: colors.muted, textAlign: align }]}>{language === "ar" ? "قيمة استرداد نقدي" : "cashback value"}</Text></View>
        </View>
        <View style={[styles.tierRow, { flexDirection: row }]}>
          {LOYALTY_TIER_ORDER.map((tier) => <View key={tier} style={[styles.tierChip, { backgroundColor: TIER_THEME[tier] + "22" }]}><MaterialIcons name={loyaltyTierIcon(tier)} size={13} color={TIER_THEME[tier]} /><Text style={{ color: TIER_THEME[tier], fontSize: 10, fontWeight: "900" }}>{loyaltyTierLabel(tier, language)}</Text></View>)}
        </View>
        <Text style={{ color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 8, textAlign: align }}>{language === "ar" ? `نقطة واحدة = ${JOD_PER_POINT} د.أ · برونزي ×1 · فضي ×1.2 · ذهبي ×1.5 · بلاتيني ×2` : `1 point = ${JOD_PER_POINT} JOD · Bronze ×1 · Silver ×1.2 · Gold ×1.5 · Platinum ×2`}</Text>
      </GlowGlassCard>

      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", marginTop: 17, marginBottom: 6, textAlign: align }}>{language === "ar" ? "حسابات العملاء" : "Customer accounts"}</Text>
      {loyaltyAccounts.length === 0 ? <GlowGlassCard radius={20} style={styles.empty} contentStyle={styles.emptyContent}><MaterialIcons name="workspace-premium" size={26} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, marginTop: 6, textAlign: "center", lineHeight: 18 }}>{language === "ar" ? "لا توجد حسابات ولاء بعد — تُنشأ تلقائيًا عند إتمام إقامة ضيف مُسجّل." : "No loyalty accounts yet — they are created automatically when a registered guest completes a stay."}</Text></GlowGlassCard> : loyaltyAccounts.map((account, index) => (
        <View key={account.id} style={[styles.accountCard, { backgroundColor: colors.surfaceMuted }]}>
          <View style={[styles.accountHeader, { flexDirection: row }]}>
            <View style={[styles.avatar, { backgroundColor: TIER_THEME[account.tier] + "22" }]}><MaterialIcons name={loyaltyTierIcon(account.tier)} size={19} color={TIER_THEME[account.tier]} /></View>
            <View style={styles.flex}>
              <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14, fontWeight: "900", textAlign: align }}>{customerName(account)}</Text>
              <View style={[styles.tierBadge, { flexDirection: row, backgroundColor: TIER_THEME[account.tier] + "1F" }]}><Text style={{ color: TIER_THEME[account.tier], fontSize: 10, fontWeight: "900" }}>{loyaltyTierLabel(account.tier, language)}</Text><Text style={{ color: colors.muted, fontSize: 9 }}>·</Text><Text numberOfLines={1} style={{ color: TIER_THEME[account.tier], fontSize: 9, flexShrink: 1 }}>{loyaltyTierPerkLabel(account.tier, language)}</Text></View>
            </View>
            {can("edit_bookings") ? <Pressable accessibilityRole="button" accessibilityLabel={language === "ar" ? "استرداد نقاط" : "Redeem points"} onPress={() => startRedeem(account)} style={({ pressed }) => [styles.redeemButton, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}><MaterialIcons name="redeem" size={16} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "900" }}>{language === "ar" ? "استرداد" : "Redeem"}</Text></Pressable> : null}
          </View>
          <View style={[styles.accountStats, { flexDirection: row }]}>
            <View style={styles.flex}><Text style={{ color: colors.foreground, fontSize: 21, fontWeight: "900", textAlign: align }}>{account.pointsBalance}</Text><Text style={{ color: colors.muted, fontSize: 10, textAlign: align }}>{language === "ar" ? "نقطة" : "points"}</Text></View>
            <View style={styles.flex}><Text style={{ color: colors.primary, fontSize: 15, fontWeight: "900", textAlign: align }}>{formatMoney(pointsValueJod(account.pointsBalance), settings.currency)}</Text><Text style={{ color: colors.muted, fontSize: 10, textAlign: align }}>{language === "ar" ? "قيمة نقدية" : "cashback"}</Text></View>
            <View style={[styles.flex, { alignItems: isRTL ? "flex-start" : "flex-end" }]}><Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", textAlign: align }}>{account.lifetimeEarned}{language === "ar" ? " مكتسبة" : " earned"}</Text><Text style={{ color: colors.muted, fontSize: 10, textAlign: align }}>{language === "ar" ? "· " : ""}{account.lifetimeRedeemed}{language === "ar" ? " مستردة" : " redeemed"}</Text></View>
          </View>
          {index < loyaltyAccounts.length - 1 ? null : null}
        </View>
      ))}

      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "900", marginTop: 17, marginBottom: 6, textAlign: align }}>{language === "ar" ? "آخر الحركات" : "Recent activity"}</Text>
      {transactions.length === 0 ? <GlowGlassCard radius={20} style={styles.empty} contentStyle={styles.emptyContent}><MaterialIcons name="receipt-long" size={24} color={colors.muted} /><Text style={{ color: colors.muted, fontSize: 12, marginTop: 6, textAlign: "center" }}>{language === "ar" ? "لا توجد حركات حتى الآن." : "No activity yet."}</Text></GlowGlassCard> : transactions.slice(0, 30).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} colors={colors} language={language} isRTL={isRTL} align={align} row={row} formatDate={formatDate} />)}
    </ScrollView>

    <Modal visible={Boolean(redeemAccount)} transparent animationType="slide" onRequestClose={() => { if (!saving) setRedeemAccount(null); }} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} disabled={saving} onPress={() => setRedeemAccount(null)} />
        <GlowGlassCard radius={28} intensity={34} style={styles.sheet} contentStyle={styles.sheetContent}>
          <ScrollView contentContainerStyle={{ paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
            <View style={[styles.header, { flexDirection: row }]}>
              <View style={[styles.icon, { backgroundColor: colors.primary + "18" }]}><MaterialIcons name="redeem" size={22} color={colors.primary} /></View>
              <View style={styles.flex}>
                <Text style={{ color: colors.foreground, fontSize: 19, fontWeight: "900", textAlign: align }}>{language === "ar" ? "استرداد نقاط الولاء" : "Redeem loyalty points"}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3, textAlign: align }}>{redeemAccount ? customerName(redeemAccount) : ""}{redeemAccount ? ` · ${redeemAccount.pointsBalance} ${language === "ar" ? "نقطة" : "points"}` : ""}</Text>
              </View>
              <Pressable disabled={saving} onPress={() => setRedeemAccount(null)} style={({ pressed }) => [styles.close, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.55 : 1 }]}><MaterialIcons name="close" size={20} color={colors.muted} /></Pressable>
            </View>

            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", marginTop: 15, textAlign: align }}>{language === "ar" ? "الحجز المستهدف" : "Target booking"}</Text>
            <View style={[styles.bookingList, { flexDirection: isRTL ? "column" : "column" }]}>
              {redeemTargetBookings.length === 0 ? <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6, textAlign: align, lineHeight: 17 }}>{language === "ar" ? "لا توجد حجوزات لهذا العميل قابلة للاسترداد." : "No redeemable bookings for this customer."}</Text> : redeemTargetBookings.map((booking) => { const selected = targetBooking?.id === booking.id; return (
                <Pressable key={booking.id} disabled={saving} onPress={() => setBookingId(booking.id)} style={({ pressed }) => [styles.bookingRow, { backgroundColor: selected ? colors.primary : colors.background, borderColor: selected ? colors.primary : colors.surfaceMuted, flexDirection: row, opacity: pressed || saving ? 0.7 : 1 }]}>
                  <MaterialIcons name="event" size={15} color={selected ? "#FFFFFF" : colors.muted} />
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={{ color: selected ? "#FFFFFF" : colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{booking.bookingReference ?? booking.customerName}</Text>
                    <Text numberOfLines={1} style={{ color: selected ? "#FFFFFFCC" : colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{formatDate(booking.startDate)} · {formatMoney(rentalTotal(booking), settings.currency)}</Text>
                  </View>
                  <MaterialIcons name={selected ? "check-circle" : "radio-button-unchecked"} size={16} color={selected ? "#FFFFFF" : colors.muted} />
                </Pressable>
              ); })}
            </View>

            <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "800", marginTop: 13, textAlign: align }}>{language === "ar" ? "عدد النقاط" : "Points to redeem"}</Text>
            <View style={[styles.pointsRow, { flexDirection: row }]}>
              <TextInput value={pointsInput} onChangeText={(text) => setPointsInput(text.replace(/[^0-9]/g, "").slice(0, 6))} editable={!saving} keyboardType="number-pad" placeholder={language === "ar" ? "نقطة" : "points"} placeholderTextColor={colors.muted} style={[styles.pointsInput, { color: colors.foreground, backgroundColor: colors.surfaceMuted, textAlign: align }]} />
              <Pressable disabled={saving || maxRedemption.points <= 0} onPress={() => setPointsInput(String(maxRedemption.points))} style={({ pressed }) => [styles.maxChip, { backgroundColor: maxRedemption.points > 0 ? colors.success : colors.surfaceMuted, opacity: pressed || saving || maxRedemption.points <= 0 ? 0.6 : 1 }]}><Text style={{ color: maxRedemption.points > 0 ? "#FFFFFF" : colors.muted, fontSize: 10, fontWeight: "900" }}>{language === "ar" ? "الأقصى" : "Max"}</Text></Pressable>
            </View>
            <View style={[styles.redeemPreview, { flexDirection: row, backgroundColor: colors.surfaceMuted }]}>
              <View style={styles.flex}><Text style={{ color: colors.muted, fontSize: 10, textAlign: align }}>{language === "ar" ? "قيمة الخصم على الحجز" : "Discount on booking"}</Text><Text style={{ color: redeemAmount > 0 ? colors.success : colors.foreground, fontSize: 17, fontWeight: "900", marginTop: 2, textAlign: align }}>{formatMoney(redeemAmount, settings.currency)}</Text></View>
              {redeemAccount && Number.isFinite(points) && points > 0 && redeemAccount.pointsBalance < Math.floor(points) ? <Text style={{ color: colors.error, fontSize: 10, textAlign: align }}>{language === "ar" ? "الرصيد غير كافٍ" : "Insufficient points"}</Text> : <Text style={{ color: colors.muted, fontSize: 10, textAlign: align }}>{formatMoney(pointsValueJod(Number(pointsInput) || 0), settings.currency)}{language === "ar" ? " · مضاعف " : " · multiplier "}{loyaltyMultiplier(redeemAccount?.tier ?? "bronze")}</Text>}
            </View>
            <TextInput value={note} onChangeText={setNote} editable={!saving} multiline maxLength={160} placeholder={language === "ar" ? "ملاحظة الاسترداد (اختياري)" : "Redemption note (optional)"} placeholderTextColor={colors.muted} textAlignVertical="top" style={[styles.note, { color: colors.foreground, backgroundColor: colors.surfaceMuted, textAlign: align }]} />

            <View style={[styles.actions, { flexDirection: row }]}>
              <Pressable disabled={saving} onPress={() => setRedeemAccount(null)} style={({ pressed }) => [styles.secondary, { backgroundColor: colors.surfaceMuted, opacity: pressed || saving ? 0.58 : 1 }]}><Text style={{ color: colors.foreground, fontWeight: "900" }}>{language === "ar" ? "إلغاء" : "Cancel"}</Text></Pressable>
              <Pressable disabled={!redeemReady || saving} onPress={() => void confirmRedeem()} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed || !redeemReady || saving ? 0.55 : 1 }]}><MaterialIcons name={saving ? "hourglass-top" : "redeem"} size={19} color="#FFFFFF" /><Text style={{ color: "#FFFFFF", fontWeight: "900" }}>{saving ? (language === "ar" ? "جارٍ الحفظ" : "Saving") : (language === "ar" ? "تأكيد الاسترداد" : "Confirm redemption")}</Text></Pressable>
            </View>
          </ScrollView>
        </GlowGlassCard>
      </View>
    </Modal>
  </ScreenContainer>;
}

function TransactionRow({ transaction, colors, language, isRTL, align, row, formatDate }: { transaction: LoyaltyTransaction; colors: ReturnType<typeof useColors>; language: "ar" | "en"; isRTL: boolean; align: "left" | "right"; row: "row" | "row-reverse"; formatDate: (date: string) => string }) {
  const earn = transaction.type === "earn";
  const tone = earn ? colors.success : colors.warning;
  return <View style={[styles.transaction, { backgroundColor: colors.surfaceMuted, flexDirection: row }]}>
    <View style={[styles.txIcon, { backgroundColor: tone + "1A" }]}><MaterialIcons name={earn ? "add-circle" : "redeem"} size={17} color={tone} /></View>
    <View style={styles.flex}>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 12, fontWeight: "900", textAlign: align }}>{earn ? (language === "ar" ? "نقاط مكتسبة" : "Earned") : (language === "ar" ? "استرداد نقاط" : "Redeemed")}{transaction.bookingReference ? ` · ${transaction.bookingReference}` : ""}</Text>
      <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: align }}>{formatDate(transaction.createdAt.slice(0, 10))}{transaction.note ? ` · ${transaction.note}` : ""}</Text>
    </View>
    <View style={{ alignItems: isRTL ? "flex-start" : "flex-end" }}>
      <Text style={{ color: tone, fontSize: 13, fontWeight: "900", textAlign: align }}>{earn ? "+" : "−"}{transaction.points} {language === "ar" ? "ن" : "pts"}</Text>
      {transaction.amount > 0 ? <Text style={{ color: colors.muted, fontSize: 10, textAlign: align }}>{transaction.amount.toFixed(2)}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 18, paddingBottom: 26 },
  locked: { marginHorizontal: 18, marginTop: 90, borderRadius: 24 },
  lockedContent: { alignItems: "center", padding: 26 },
  lockedTitle: { fontSize: 17, fontWeight: "900", marginTop: 10 },
  lockedText: { fontSize: 12, marginTop: 6, lineHeight: 18 },
  summary: { borderRadius: 24 },
  summaryContent: { padding: 16 },
  summaryHeader: { alignItems: "center", gap: 11 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  summaryNumbers: { marginTop: 14, gap: 10 },
  summaryValue: { fontSize: 26, fontWeight: "900" },
  summaryCaption: { fontSize: 10, marginTop: 2 },
  tierRow: { gap: 6, marginTop: 12, flexWrap: "wrap" },
  tierChip: { minHeight: 28, borderRadius: 11, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", gap: 4, flexDirection: "row" },
  empty: { borderRadius: 20 },
  emptyContent: { alignItems: "center", padding: 20 },
  accountCard: { borderRadius: 18, padding: 12, marginBottom: 8 },
  accountHeader: { alignItems: "center", gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  tierBadge: { alignItems: "center", gap: 4, alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  redeemButton: { minHeight: 36, borderRadius: 12, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 5 },
  accountStats: { gap: 8, marginTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(128,128,128,0.22)", paddingTop: 11 },
  transaction: { alignItems: "center", gap: 10, borderRadius: 15, padding: 11, marginBottom: 7 },
  txIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7, 20, 18, 0.62)" },
  sheet: { maxHeight: "93%", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  sheetContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  header: { alignItems: "center", gap: 10 },
  close: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  bookingList: { gap: 6, marginTop: 7 },
  bookingRow: { alignItems: "center", gap: 8, borderRadius: 13, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  pointsRow: { alignItems: "center", gap: 7, marginTop: 7 },
  pointsInput: { flex: 1, minHeight: 44, borderRadius: 14, paddingHorizontal: 11, fontSize: 15, fontWeight: "800" },
  maxChip: { minHeight: 40, borderRadius: 12, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
  redeemPreview: { alignItems: "center", gap: 9, borderRadius: 15, padding: 12, marginTop: 9 },
  note: { minHeight: 64, borderRadius: 16, padding: 11, marginTop: 9, fontSize: 12, lineHeight: 18 },
  actions: { gap: 9, marginTop: 15 },
  secondary: { flex: 1, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  primary: { flex: 1.55, minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 7, flexDirection: "row" },
});