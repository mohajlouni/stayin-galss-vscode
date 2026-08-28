import { Redirect } from "expo-router";

/** Legacy entry retained only so saved links lead to the consolidated Settings screen. */
export default function PricingSettingsRedirect() {
  return <Redirect href="/(tabs)/settings" />;
}
