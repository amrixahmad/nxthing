import React from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs, router } from "expo-router";
import { View, TouchableOpacity, Text, Platform } from "react-native";

import Colors from "@/src/constants/Colors";
import { useColorScheme } from "@/src/components/useColorScheme";
import { useClientOnlyValue } from "@/src/components/useClientOnlyValue";

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => (
          <View className="flex-row items-center mr-2">
            <TouchableOpacity
              className="px-3 py-2 rounded-lg mr-1"
              onPress={() => {
                if (Platform.OS === "web") {
                  window.location.assign("/");
                } else {
                  router.push("/");
                }
              }}
            >
              <View className="flex-row items-center">
                <FontAwesome name="home" size={18} color={Colors[colorScheme ?? "light"].tint} />
                <Text className="ml-1 text-blue-600">Home</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              className="px-3 py-2 rounded-lg"
              onPress={() => {
                if (Platform.OS === "web") {
                  window.location.assign("/tournaments/browse");
                } else {
                  router.push("/tournaments/browse");
                }
              }}
            >
              <View className="flex-row items-center">
                <FontAwesome name="trophy" size={18} color={Colors[colorScheme ?? "light"].tint} />
                <Text className="ml-1 text-blue-600">Tournaments</Text>
              </View>
            </TouchableOpacity>
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="openai"
        options={{
          title: "OpenAI",
          tabBarIcon: ({ color }) => (
            <TabBarIcon name="lightbulb-o" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{
          title: "Tournaments",
          tabBarIcon: ({ color }) => <TabBarIcon name="trophy" color={color} />,
        }}
      />
      <Tabs.Screen
        name="host"
        options={{
          title: "Host",
          tabBarIcon: ({ color }) => <TabBarIcon name="briefcase" color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
      />
    </Tabs>
  );
}
