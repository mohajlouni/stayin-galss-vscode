import * as Network from "expo-network";
import { useEffect, useState } from "react";

/**
 * Reports whether the device can reach the internet without blocking the first render.
 * A failed native/web network probe is treated as offline so sync controls stay safe.
 */
export function useInternetAvailability() {
  const [isInternetReachable, setInternetReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const applyState = (state: { isInternetReachable?: boolean | null; isConnected?: boolean | null }) => {
      if (!active) return;
      setInternetReachable(state.isInternetReachable ?? state.isConnected ?? false);
    };

    void Network.getNetworkStateAsync().then(applyState).catch(() => applyState({ isInternetReachable: false }));
    const subscription = Network.addNetworkStateListener(applyState);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return isInternetReachable;
}
