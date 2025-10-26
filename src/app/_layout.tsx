import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, router, Link } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { View, TouchableOpacity, Text, Platform } from "react-native";

import { useColorScheme } from "@/src/components/useColorScheme";
import Colors from "@/src/constants/Colors";
import { SessionProvider, useSession } from "../../context/SessionProvider";

// Import your global CSS file
import "../../global.css";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

function SplashScreenController() {
  const { loading: sessionLoading } = useSession();
  const [loaded, error] = useFonts({
    SpaceMono: require("../../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    // Only hide splash screen when BOTH fonts AND session are loaded
    if (loaded && !sessionLoading) {
      SplashScreen.hideAsync();
    }
  }, [loaded, sessionLoading]);

  // Show loading screen until everything is ready
  if (!loaded || sessionLoading) {
    return null;
  }

  return null;
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <SplashScreenController />
      <RootLayoutNav />
    </SessionProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { session, loading } = useSession();

  // Avoid flashing auth screens before session is known
  if (loading) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <View className="flex-1">
      <Stack
        screenOptions={{
          headerRight: () => (
            <View className="flex-row items-center mr-2">
              {Platform.OS === "web" ? (
                <>
                  <Link href="/">
                    <Text className="px-3 py-2 text-blue-600">Home</Text>
                  </Link>
                  <Link href="/tournaments/browse">
                    <Text className="px-3 py-2 text-blue-600">Tournaments</Text>
                  </Link>
                </>
              ) : (
                <>
                  <TouchableOpacity className="px-3 py-2 rounded-lg mr-1" onPress={() => router.push("/")}>
                    <View className="flex-row items-center">
                      <FontAwesome name="home" size={18} color={Colors[colorScheme ?? "light"].tint} />
                      <Text className="ml-1 text-blue-600">Home</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity className="px-3 py-2 rounded-lg" onPress={() => router.push("/tournaments/browse")}>
                    <View className="flex-row items-center">
                      <FontAwesome name="trophy" size={18} color={Colors[colorScheme ?? "light"].tint} />
                      <Text className="ml-1 text-blue-600">Tournaments</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ),
        }}
      >
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: "modal" }} />
        </Stack.Protected>

        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      </View>
    </ThemeProvider>
  );
}
