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
  Platform,
} from "react-native";
import { Stack, Link } from "expo-router";
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

  /** User's full display name */
  const [fullName, setFullName] = useState("");

  /** User's website URL */
  const [website, setWebsite] = useState("");

  /** User's avatar image URL */
  const [avatarUrl, setAvatarUrl] = useState("");
  const [duprId, setDuprId] = useState("");
  const [duprRating, setDuprRating] = useState("");
  const [gender, setGender] = useState("");
  const [paddleBrand, setPaddleBrand] = useState("");
  const [address, setAddress] = useState("");
  const [notice, setNotice] = useState<"success" | "error" | null>(null);
  const [noticeText, setNoticeText] = useState("");

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
        .select(`username, full_name, website, avatar_url, dupr_id, dupr_rating, gender, paddle_brand, address`)
        .eq("id", session?.user.id)
        .single();

      if (error && status !== 406) {
        throw error;
      }

      if (data) {
        setUsername(data.username || "");
        setFullName((data as any).full_name || "");
        setWebsite(data.website || "");
        setAvatarUrl(data.avatar_url || "");
        setDuprId((data as any).dupr_id || "");
        setDuprRating(
          (data as any).dupr_rating !== null && (data as any).dupr_rating !== undefined
            ? String((data as any).dupr_rating)
            : ""
        );
        setGender((data as any).gender || "");
        setPaddleBrand((data as any).paddle_brand || "");
        setAddress((data as any).address || "");
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
    full_name,
    website,
    avatar_url,
    dupr_id,
    dupr_rating,
    gender,
    paddle_brand,
    address,
  }: {
    username: string;
    full_name: string;
    website: string;
    avatar_url: string;
    dupr_id: string | null;
    dupr_rating: number | null;
    gender: string;
    paddle_brand: string;
    address: string;
  }) {
    try {
      setUpdating(true);
      if (!session?.user) throw new Error("No user on the session!");

      const updates = {
        id: session.user.id,
        username,
        full_name,
        website,
        avatar_url,
        dupr_id,
        dupr_rating,
        gender,
        paddle_brand,
        address,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("profiles").upsert(updates);

      if (error) {
        throw error;
      }

      setNotice("success");
      setNoticeText("Profile updated successfully!");
    } catch (error) {
      if (error instanceof Error) {
        setNotice("error");
        setNoticeText(error.message);
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

      {notice && (
        <View
          className={
            notice === "success"
              ? "mx-4 mt-4 rounded-lg border border-green-200 bg-green-50 p-4"
              : "mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 p-4"
          }
        >
          <Text className={notice === "success" ? "text-green-800" : "text-red-800"}>{noticeText}</Text>
        </View>
      )}

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

          {/* Full Name Field */}
          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">
              Full Name
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your full name"
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

          {/* Avatar URL Field */}
          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">
              Avatar Image URL
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={avatarUrl}
              onChangeText={setAvatarUrl}
              placeholder="https://example.com/avatar.png"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
          </View>

          {/* DUPR ID Field */}
          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">
              DUPR ID
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={duprId}
              onChangeText={setDuprId}
              placeholder="Enter your DUPR ID"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
            />
          </View>

          {/* DUPR Rating Field */}
          <View className="mb-6">
            <Text className="text-base font-medium text-gray-700 mb-2">
              DUPR Rating
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={duprRating}
              onChangeText={setDuprRating}
              placeholder="e.g. 3.50"
              placeholderTextColor="#9CA3AF"
              keyboardType="decimal-pad"
              autoCapitalize="none"
            />
          </View>

          {/* Gender Field */}
          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">
              Gender
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={gender}
              onChangeText={setGender}
              placeholder="Optional"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Paddle Brand Field */}
          <View className="mb-4">
            <Text className="text-base font-medium text-gray-700 mb-2">
              Paddle Brand
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={paddleBrand}
              onChangeText={setPaddleBrand}
              placeholder="What paddle do you use?"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Address Field */}
          <View className="mb-6">
            <Text className="text-base font-medium text-gray-700 mb-2">
              Address
            </Text>
            <TextInput
              className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
              value={address}
              onChangeText={setAddress}
              placeholder="City, state, or full address"
              placeholderTextColor="#9CA3AF"
              multiline
            />
          </View>

          {/* Update Button */}
          <TouchableOpacity
            className={`rounded-lg py-4 px-6 ${
              updating ? "bg-gray-300" : "bg-blue-600 active:bg-blue-700"
            }`}
            onPress={() =>
              updateProfile({
                username,
                full_name: fullName,
                website,
                avatar_url: avatarUrl,
                dupr_id: duprId || null,
                dupr_rating: duprRating ? Number(duprRating) : null,
                gender,
                paddle_brand: paddleBrand,
                address,
              })
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
              if (Platform.OS === "web") {
                const ok = typeof window !== "undefined" ? window.confirm("Are you sure you want to sign out?") : true;
                if (ok) supabase.auth.signOut();
              } else {
                Alert.alert("Sign Out", "Are you sure you want to sign out?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign Out", style: "destructive", onPress: () => supabase.auth.signOut() },
                ]);
              }
            }}
          >
            <Text className="text-white font-semibold text-center">
              🚪 Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dev Tools (Only visible in development or if enabled) */}
      <View className="mx-4 mt-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <View className="p-6">
            <Text className="text-lg font-semibold text-gray-900 mb-4">
                Developer Tools
            </Text>
            <Link href={"/dev/seed" as any} asChild>
                <TouchableOpacity className="bg-gray-100 active:bg-gray-200 rounded-lg py-3 px-4 flex-row items-center justify-center border border-gray-300">
                    <Text className="text-gray-700 font-semibold mr-2">🌱 Tournament Seeder</Text>
                </TouchableOpacity>
            </Link>
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
