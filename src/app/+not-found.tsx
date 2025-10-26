import { Link, Stack } from "expo-router";
import { Text, View, TouchableOpacity } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Page Not Found" }} />
      <View className="flex-1 bg-gray-50 items-center justify-center px-6">
        {/* Error Illustration */}
        <View className="items-center mb-8">
          <View className="bg-red-100 rounded-full p-8 mb-6">
            <Text className="text-6xl">🚧</Text>
          </View>
          <Text className="text-3xl font-bold text-gray-900 mb-3 text-center">
            Oops! Page Not Found
          </Text>
          <Text className="text-gray-600 text-center leading-6 max-w-sm">
            The page you're looking for doesn't exist or may have been moved.
          </Text>
        </View>

        {/* Error Details Card */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8 w-full max-w-sm">
          <Text className="text-lg font-semibold text-gray-900 mb-4 text-center">
            What happened?
          </Text>
          <View className="space-y-2">
            <Text className="text-gray-600 text-sm">
              • The URL might be incorrect
            </Text>
            <Text className="text-gray-600 text-sm">
              • The page might have been removed
            </Text>
            <Text className="text-gray-600 text-sm">
              • You might not have permission
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="w-full max-w-sm">
          <Link href="/" asChild>
            <TouchableOpacity className="bg-blue-600 rounded-lg py-4 px-8 active:bg-blue-700 mb-3">
              <Text className="text-white font-semibold text-center">
                🏠 Return to Home
              </Text>
            </TouchableOpacity>
          </Link>
          <Link href="/tournaments/browse" asChild>
            <TouchableOpacity className="bg-gray-100 rounded-lg py-4 px-8 active:bg-gray-200">
              <Text className="text-gray-800 font-semibold text-center">
                🏆 Browse Tournaments
              </Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Help Text */}
        <Text className="text-gray-500 text-sm mt-6 text-center">
          Need help? Contact support if this issue persists.
        </Text>
      </View>
    </>
  );
}
