import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Stack, router } from "expo-router";
import * as Linking from "expo-linking";

export default function AuthCallback() {
  const [message, setMessage] = useState("Completing verification...");

  useEffect(() => {
    (async () => {
      try {
        await Linking.getInitialURL();
        setMessage("Email verified. You can continue in the app.");
      } catch {
        setMessage("Email verified. You can continue in the app.");
      }
    })();
  }, []);

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
