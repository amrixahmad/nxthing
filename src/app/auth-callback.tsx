import { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, TextInput, Platform } from "react-native";
import { Stack, router } from "expo-router";
import * as Linking from "expo-linking";
import { useSession } from "../../context/SessionProvider";
import { supabase } from "../../lib/supabase";

// Check for recovery mode synchronously on initial load
function checkIsRecoveryMode(): boolean {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const hash = window.location.hash;
    const search = window.location.search;
    // Check both hash and query params for recovery indicators
    return hash.includes("type=recovery") || search.includes("type=recovery");
  }
  return false;
}

export default function AuthCallback() {
  const [message, setMessage] = useState("Completing verification...");
  const { session, loading } = useSession();
  // Initialize with synchronous check to prevent flash/redirect
  const [isPasswordReset, setIsPasswordReset] = useState(() => checkIsRecoveryMode());
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [initialized, setInitialized] = useState(false);
  const hasCheckedAuth = useRef(false);

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event from Supabase
    const { data: authListener } = supabase.auth.onAuthStateChange((event, _session) => {
      console.log("Auth callback event:", event);
      if (event === "PASSWORD_RECOVERY") {
        setIsPasswordReset(true);
        setMessage("Set your new password below.");
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (hasCheckedAuth.current) return;
    hasCheckedAuth.current = true;

    (async () => {
      try {
        // Check URL for password reset or email confirmation flow
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const hash = window.location.hash;
          const search = window.location.search;
          console.log("Auth callback - hash:", hash, "search:", search);
          
          // Check for password recovery
          if (hash.includes("type=recovery") || search.includes("type=recovery")) {
            setIsPasswordReset(true);
            setMessage("Set your new password below.");
            setInitialized(true);
            return;
          }
          
          // Check for email confirmation (type=signup or type=email_change)
          if (hash.includes("type=signup") || hash.includes("type=email_change")) {
            // Supabase should have already processed the token from the hash
            // Wait a moment for the session to be established
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Verify the session was created
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession) {
              setMessage("Email confirmed successfully! Redirecting...");
            } else {
              setMessage("Email confirmed. Please sign in to continue.");
            }
            setInitialized(true);
            return;
          }
          
          // If there's a hash with access_token, Supabase is processing auth
          if (hash.includes("access_token")) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            setMessage("Authentication complete. Redirecting...");
            setInitialized(true);
            return;
          }
        }
        await Linking.getInitialURL();
        setMessage("Email verified. You can continue in the app.");
      } catch (err) {
        console.error("Auth callback error:", err);
        setMessage("Email verified. You can continue in the app.");
      }
      setInitialized(true);
    })();
  }, []);

  useEffect(() => {
    // Only auto-redirect if not in password reset mode AND initialization is complete
    // Add a small delay to allow PASSWORD_RECOVERY event to fire
    const timer = setTimeout(() => {
      if (initialized && !loading && session && !isPasswordReset) {
        router.replace("/" as any);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [loading, session, isPasswordReset, initialized]);

  async function handleUpdatePassword() {
    if (!newPassword || !confirmPassword) {
      setNotice({ type: "error", text: "Please fill in both password fields." });
      return;
    }
    if (newPassword.length < 6) {
      setNotice({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ type: "error", text: "Passwords do not match." });
      return;
    }

    setUpdating(true);
    setNotice(null);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      console.error("Password update error:", error.message);
      setNotice({ type: "error", text: error.message });
    } else {
      setNotice({ type: "success", text: "Password updated successfully! Redirecting..." });
      setTimeout(() => {
        router.replace("/" as any);
      }, 1500);
    }
    setUpdating(false);
  }

  if (isPasswordReset) {
    return (
      <View className="flex-1 bg-gray-50">
        <Stack.Screen options={{ title: "Reset Password" }} />
        <View className="px-4 mt-10">
          <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <Text className="text-xl font-semibold text-gray-900 mb-4 text-center">Set New Password</Text>
            
            {notice && (
              <Text className={`mb-4 text-center ${notice.type === "success" ? "text-green-700" : "text-red-700"}`}>
                {notice.text}
              </Text>
            )}

            <View className="mb-4">
              <Text className="text-base font-medium text-gray-700 mb-2">New Password</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                onChangeText={setNewPassword}
                value={newPassword}
                secureTextEntry
                placeholder="Minimum 6 characters"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            </View>

            <View className="mb-6">
              <Text className="text-base font-medium text-gray-700 mb-2">Confirm Password</Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                secureTextEntry
                placeholder="Re-enter your password"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
            </View>

            <TouchableOpacity
              className={`rounded-lg py-4 px-6 ${updating ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"}`}
              onPress={handleUpdatePassword}
              disabled={updating}
            >
              <Text className={`text-center font-semibold ${updating ? "text-gray-500" : "text-white"}`}>
                {updating ? "Updating..." : "Update Password"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Email Verification" }} />
      <View className="px-4 mt-10">
        <View className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <Text className="text-base text-gray-900 mb-4">{message}</Text>
          <TouchableOpacity className="rounded-lg py-3 px-4 bg-blue-600 active:bg-blue-700" onPress={() => router.replace("/(auth)") }>
            <Text className="text-center text-white font-semibold">Continue to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
