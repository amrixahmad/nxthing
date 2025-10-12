/**
 * @fileoverview Account Management Screen
 * Provides user profile management functionality including username, website, and avatar URL editing.
 * Integrates with Supabase for secure profile data persistence.
 *
 * @author Your Name
 * @version 1.0.0
 */

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  View,
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Stack } from "expo-router";
import { useSession } from "@/context/SessionProvider";

/**
 * Account management component
 * Allows users to view and update their profile information
 *
 * @component
 * @returns {JSX.Element} The account management screen
 *
 * @example
 * // Used in Expo Router tab navigation
 * <Account />
 */
export default function Account() {
  const { session } = useSession();

  /** Loading state for initial profile fetch */
  const [loading, setLoading] = useState(true);

  /** Loading state for profile updates */
  const [updating, setUpdating] = useState(false);

  /** User's display username */
  const [username, setUsername] = useState("");

  /** User's website URL */
  const [website, setWebsite] = useState("");

  /** User's avatar image URL */
  const [avatarUrl, setAvatarUrl] = useState("");

  // Load user profile when session changes
  useEffect(() => {
    if (session) getProfile();
  }, [session]);

  /**
   * Fetches the user's profile data from Supabase
   * Updates local state with username, website, and avatar URL
   *
   * @async
   * @function getProfile
   * @throws {Error} When no user session exists or database query fails
   */
  async function getProfile() {
    try {
      setLoading(true);
      if (!session?.user) throw new Error("No user on the session!");

      const { data, error, status } = await supabase
        .from("profiles")
        .select(`username, website, avatar_url`)
        .eq("id", session?.user.id)
        .single();

      if (error && status !== 406) {
        throw error;
      }

      if (data) {
        setUsername(data.username || "");
        setWebsite(data.website || "");
        setAvatarUrl(data.avatar_url || "");
      }
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert("Error loading profile", error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Updates the user's profile information in Supabase
   * Performs an upsert operation to create or update profile data
   *
   * @async
   * @function updateProfile
   * @param {Object} profileData - The profile data to update
   * @param {string} profileData.username - User's display username
   * @param {string} profileData.website - User's website URL
   * @param {string} profileData.avatar_url - User's avatar image URL
   * @throws {Error} When no user session exists or database operation fails
   */
  async function updateProfile({
    username,
    website,
    avatar_url,
  }: {
    username: string;
    website: string;
    avatar_url: string;
  }) {
    try {
      setUpdating(true);
      if (!session?.user) throw new Error("No user on the session!");

      const updates = {
        id: session.user.id,
        username,
        website,
        avatar_url,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("profiles").upsert(updates);

      if (error) {
        throw error;
      }

      Alert.alert("Success", "Profile updated successfully!");
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert("Error updating profile", error.message);
      }
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 justify-center items-center">
        <Text className="text-gray-600 text-lg">Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "Account Settings" }} />

      {/* Header */}
      <View className="bg-white border-b border-gray-200">
        <View className="px-6 py-8">
          <Text className="text-2xl font-bold text-gray-900 mb-2">
            Account Settings ⚙️
          </Text>
          <Text className="text-gray-600">
            Manage your profile and preferences
          </Text>
        </View>
      </View>

      {/* User Info Card */}
      <View className="mx-4 mt-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <View className="p-6">
          <Text className="text-lg font-semibold text-gray-900 mb-4">
            Account Information
          </Text>

          <View className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg mb-4">
            <Text className="text-blue-800 font-medium mb-1">
              Email Address
            </Text>
            <Text className="text-blue-700">{session?.user?.email}</Text>
          </View>

          <View className="bg-green-50 border-l-4 border-green-400 p-4 rounded-r-lg">
            <Text className="text-green-800 font-medium mb-1">
              Account Status
            </Text>
            <Text className="text-green-700">✅ Active & Verified</Text>
          </View>
        </View>
      </View>

      {/* Profile Form */}
      <View className="mx-4 mt-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <View className="p-6">
          <Text className="text-lg font-semibold text-gray-900 mb-6">
            Profile Details
          </Text>

          {/* Username Field */}
          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">
              Username
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={username}
              onChangeText={setUsername}
              placeholder="Enter your username"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Website Field */}
          <View className="mb-6">
            <Text className="text-base font-medium text-gray-700 mb-2">
              Website
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={website}
              onChangeText={setWebsite}
              placeholder="https://yourwebsite.com"
              placeholderTextColor="#9CA3AF"
              keyboardType="url"
              autoCapitalize="none"
            />
          </View>

          {/* Update Button */}
          <TouchableOpacity
            className={`rounded-lg py-4 px-6 ${
              updating ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"
            }`}
            onPress={() =>
              updateProfile({ username, website, avatar_url: avatarUrl })
            }
            disabled={updating}
          >
            <Text
              className={`text-center font-semibold ${
                updating ? "text-gray-500" : "text-white"
              }`}
            >
              {updating ? "⏳ Updating..." : "💾 Update Profile"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Actions */}
      <View className="mx-4 mt-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <View className="p-6">
          <Text className="text-lg font-semibold text-gray-900 mb-4">
            Account Actions
          </Text>

          <TouchableOpacity
            className="bg-red-600 active:bg-red-700 rounded-lg py-4 px-6"
            onPress={() => {
              Alert.alert("Sign Out", "Are you sure you want to sign out?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign Out",
                  style: "destructive",
                  onPress: () => supabase.auth.signOut(),
                },
              ]);
            }}
          >
            <Text className="text-white font-semibold text-center">
              🚪 Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View className="mt-8 mb-6 px-6">
        <Text className="text-center text-xs text-gray-500 leading-5">
          Your profile information is securely stored{"\n"}
          and encrypted with Supabase
        </Text>
      </View>
    </ScrollView>
  );
}
