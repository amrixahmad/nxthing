/**
 * @fileoverview Home Screen Component
 * The main dashboard screen that welcomes users and provides navigation to key app features.
 * Displays user information, quick action cards, and feature overview.
 *
 * @author Your Name
 * @version 1.0.0
 */

import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { useSession } from "@/context/SessionProvider";
import { Link } from "expo-router";

/**
 * Home screen component - main dashboard of the application
 * Shows welcome message, user info, and navigation cards to key features
 *
 * @component
 * @returns {JSX.Element} The home screen with welcome message and feature cards
 *
 * @example
 * // Used as the main tab in Expo Router
 * <HomeScreen />
 */
export default function HomeScreen() {
  const { session, loading } = useSession();

  // Show loading state while session is being determined
  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <Text className="text-gray-600 text-lg">Loading...</Text>
      </View>
    );
  }

  // Extract user information from session
  const userEmail = session?.user?.email;
  const userName = userEmail?.split("@")[0] || "User";

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Welcome Header */}
      <View className="bg-white border-b border-gray-200">
        <View className="px-6 py-8">
          <Text className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, {userName}! 👋
          </Text>
          <Text className="text-gray-600">
            What would you like to do today?
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View className="px-4 mt-6">
        <Text className="text-lg font-semibold text-gray-900 mb-4 px-2">
          Quick Actions
        </Text>

        <View className="space-y-3">
          {/* AI Assistant Card */}
          <Link href="/(tabs)/openai" asChild>
            <TouchableOpacity className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm active:bg-gray-50">
              <View className="flex-row items-center">
                <View className="bg-blue-100 rounded-full p-3 mr-4">
                  <Text className="text-2xl">🤖</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-gray-900 mb-1">
                    AI Assistant
                  </Text>
                  <Text className="text-gray-600 text-sm">
                    Ask questions, get help, and explore AI capabilities
                  </Text>
                </View>
                <Text className="text-gray-400 text-xl">›</Text>
              </View>
            </TouchableOpacity>
          </Link>

          {/* Account Settings Card */}
          <Link href="/(tabs)/account" asChild>
            <TouchableOpacity className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm active:bg-gray-50">
              <View className="flex-row items-center">
                <View className="bg-green-100 rounded-full p-3 mr-4">
                  <Text className="text-2xl">👤</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-gray-900 mb-1">
                    Account Settings
                  </Text>
                  <Text className="text-gray-600 text-sm">
                    Manage your profile and preferences
                  </Text>
                </View>
                <Text className="text-gray-400 text-xl">›</Text>
              </View>
            </TouchableOpacity>
          </Link>

          {/* Host Dashboard Card */}
          <Link href="/tournaments" asChild>
            <TouchableOpacity className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm active:bg-gray-50">
              <View className="flex-row items-center">
                <View className="bg-purple-100 rounded-full p-3 mr-4">
                  <Text className="text-2xl">🏆</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-gray-900 mb-1">
                    Host Dashboard
                  </Text>
                  <Text className="text-gray-600 text-sm">
                    Create and manage tournaments
                  </Text>
                </View>
                <Text className="text-gray-400 text-xl">›</Text>
              </View>
            </TouchableOpacity>
          </Link>
        </View>
      </View>

      {/* Features Overview */}
      <View className="px-4 mt-8">
        <Text className="text-lg font-semibold text-gray-900 mb-4 px-2">
          App Features
        </Text>

        <View className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <View className="p-6">
            <Text className="text-base font-medium text-gray-900 mb-4">
              This app includes:
            </Text>

            <View className="space-y-3">
              <View className="flex-row items-center">
                <Text className="text-green-500 mr-3">✓</Text>
                <Text className="text-gray-700 flex-1">
                  Secure authentication with Supabase
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-green-500 mr-3">✓</Text>
                <Text className="text-gray-700 flex-1">
                  AI assistant powered by OpenAI
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-green-500 mr-3">✓</Text>
                <Text className="text-gray-700 flex-1">
                  Profile management and settings
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-green-500 mr-3">✓</Text>
                <Text className="text-gray-700 flex-1">
                  Modern React Native with Expo Router
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-green-500 mr-3">✓</Text>
                <Text className="text-gray-700 flex-1">
                  Professional UI with NativeWind
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* User Info */}
      <View className="px-4 mt-6 mb-8">
        <View className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <Text className="text-blue-800 font-medium mb-1">
            Current Session
          </Text>
          <Text className="text-blue-600 text-sm">
            Logged in as: {userEmail}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
