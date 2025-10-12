import { StatusBar } from "expo-status-bar";
import { Platform, TouchableOpacity, ScrollView } from "react-native";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { AntDesign } from "@expo/vector-icons";

export default function ModalScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white border-b border-gray-200 pt-16 pb-4 px-6">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-gray-900">
            App Information
          </Text>
          <TouchableOpacity
            className="bg-gray-100 rounded-full p-2"
            onPress={() => router.back()}
          >
            <AntDesign name="close" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 px-6 py-6">
        {/* Welcome Card */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <View className="items-center mb-4">
            <View className="bg-blue-100 rounded-full p-4 mb-3">
              <Text className="text-3xl">📱</Text>
            </View>
            <Text className="text-xl font-bold text-gray-900 mb-2">
              Welcome to the Modal
            </Text>
            <Text className="text-gray-600 text-center leading-6">
              This is a modal screen that demonstrates how modals work in Expo
              Router.
            </Text>
          </View>
        </View>

        {/* Features Card */}
        <View className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
          <Text className="text-lg font-semibold text-gray-900 mb-4">
            🎯 Modal Features
          </Text>

          <View className="space-y-3">
            <View className="flex-row items-start">
              <View className="bg-green-100 rounded-full p-1 mr-3 mt-1">
                <AntDesign name="check" size={14} color="#059669" />
              </View>
              <View className="flex-1">
                <Text className="font-medium text-gray-900">
                  Full Screen Modal
                </Text>
                <Text className="text-gray-600 text-sm">
                  Presented as a modal with custom navigation
                </Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <View className="bg-green-100 rounded-full p-1 mr-3 mt-1">
                <AntDesign name="check" size={14} color="#059669" />
              </View>
              <View className="flex-1">
                <Text className="font-medium text-gray-900">
                  Professional Design
                </Text>
                <Text className="text-gray-600 text-sm">
                  Styled with NativeWind for consistent UI
                </Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <View className="bg-green-100 rounded-full p-1 mr-3 mt-1">
                <AntDesign name="check" size={14} color="#059669" />
              </View>
              <View className="flex-1">
                <Text className="font-medium text-gray-900">
                  Easy Navigation
                </Text>
                <Text className="text-gray-600 text-sm">
                  Simple close button to return to previous screen
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Tech Stack Card */}
        <View className="bg-blue-50 rounded-2xl border border-blue-200 p-6">
          <Text className="text-lg font-semibold text-blue-900 mb-4">
            🛠 Built With
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <View className="bg-white rounded-lg px-3 py-2 border border-blue-200">
              <Text className="text-blue-800 font-medium text-sm">
                Expo Router
              </Text>
            </View>
            <View className="bg-white rounded-lg px-3 py-2 border border-blue-200">
              <Text className="text-blue-800 font-medium text-sm">
                NativeWind
              </Text>
            </View>
            <View className="bg-white rounded-lg px-3 py-2 border border-blue-200">
              <Text className="text-blue-800 font-medium text-sm">
                TypeScript
              </Text>
            </View>
            <View className="bg-white rounded-lg px-3 py-2 border border-blue-200">
              <Text className="text-blue-800 font-medium text-sm">
                React Native
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Use a light status bar on iOS to account for the black space above the modal */}
      <StatusBar style={Platform.OS === "ios" ? "light" : "auto"} />
    </View>
  );
}
