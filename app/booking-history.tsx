import { Redirect } from "expo-router";

export default function BookingHistoryScreen() {
  return <Redirect href={"/(tabs)/bookings" as never} />;
}
