import { ActivityIndicator, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { ThemedView } from "@/components/themed-view";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asUser(value: unknown): Auth.User | null {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.openId !== "string") return null;
  return {
    id: value.id,
    openId: value.openId,
    name: typeof value.name === "string" ? value.name : null,
    email: typeof value.email === "string" ? value.email : null,
    loginMethod: typeof value.loginMethod === "string" ? value.loginMethod : null,
    lastSignedIn: new Date(typeof value.lastSignedIn === "string" ? value.lastSignedIn : Date.now()),
  };
}

export default function OAuthCallback() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    sessionToken?: string;
    user?: string;
  }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const fail = (message: string) => {
      if (!active) return;
      setStatus("error");
      setErrorMessage(message);
    };

    const finish = () => {
      if (!active) return;
      setStatus("success");
      redirectTimer = setTimeout(() => router.replace("/workspace-gate"), 1000);
    };

    const persistUser = async (candidate: unknown) => {
      const user = asUser(candidate);
      if (user) await Auth.setUserInfo(user);
    };

    const persistDirectSession = async (token: string, encodedUser?: string) => {
      await Auth.setSessionToken(token);
      if (encodedUser) {
        try {
          const decoded = typeof atob !== "undefined"
            ? atob(encodedUser)
            : Buffer.from(encodedUser, "base64").toString("utf-8");
          await persistUser(JSON.parse(decoded) as unknown);
        } catch {
          // The server will still validate the stored token on its next protected request.
        }
      }
      finish();
    };

    const handleCallback = async () => {
      try {
        if (params.sessionToken) {
          await persistDirectSession(params.sessionToken, params.user);
          return;
        }

        let code = params.code ?? null;
        let state = params.state ?? null;
        let sessionToken: string | null = null;
        const callbackError = params.error ?? null;

        if (!code && !state && !callbackError) {
          const initialUrl = await Linking.getInitialURL();
          if (initialUrl) {
            const query = new URL(initialUrl, "http://localhost").searchParams;
            code = query.get("code");
            state = query.get("state");
            sessionToken = query.get("sessionToken");
          }
        }

        if (callbackError) {
          fail("Authentication was not completed.");
          return;
        }
        if (sessionToken) {
          await persistDirectSession(sessionToken);
          return;
        }
        if (!code || !state) {
          fail("Missing authentication response.");
          return;
        }

        const result = await Api.exchangeOAuthCode(code, state);
        if (!result.sessionToken) {
          fail("Authentication could not establish a session.");
          return;
        }

        await Auth.setSessionToken(result.sessionToken);
        await persistUser(result.user);
        finish();
      } catch {
        fail("Failed to complete authentication.");
      }
    };

    void handleCallback();
    return () => {
      active = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [params.code, params.error, params.sessionToken, params.state, params.user, router]);

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && <><ActivityIndicator size="large" /><Text className="mt-4 text-base leading-6 text-center text-foreground">Completing authentication...</Text></>}
        {status === "success" && <><Text className="text-base leading-6 text-center text-foreground">Authentication successful!</Text><Text className="text-base leading-6 text-center text-foreground">Redirecting...</Text></>}
        {status === "error" && <><Text className="mb-2 text-xl font-bold leading-7 text-error">Authentication failed</Text><Text className="text-base leading-6 text-center text-foreground">{errorMessage}</Text></>}
      </ThemedView>
    </SafeAreaView>
  );
}
