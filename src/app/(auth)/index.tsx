/**
 * @fileoverview Authentication Screen
 * Provides user authentication functionality including sign in and sign up flows.
 * Features form validation, loading states, and seamless toggle between auth modes.
 *
 * @author Your Name
 * @version 1.0.0
 */

import React, { useState } from "react";
import {
  Alert,
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { Stack } from "expo-router";

/**
 * Authentication component with sign in and sign up functionality
 * Provides a professional card-based layout with form validation
 *
 * @component
 * @returns {JSX.Element} The authentication screen
 *
 * @example
 * // Used in Expo Router for unauthenticated users
 * <Auth />
 */
export default function Auth() {
  /** User's email address */
  const [email, setEmail] = useState("");

  /** User's password */
  const [password, setPassword] = useState("");

  /** Loading state during authentication */
  const [loading, setLoading] = useState(false);

  /** Toggle between sign in and sign up modes */
  const [isSignUp, setIsSignUp] = useState(false);

  /**
   * Handles user sign in with email and password
   * Validates input fields and manages loading state
   *
   * @async
   * @function signInWithEmail
   * @throws {Error} When authentication fails
   */
  async function signInWithEmail() {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      Alert.alert("Sign In Error", error.message);
    }
    setLoading(false);
  }

  /**
   * Handles user sign up with email and password
   * Validates input fields including password length requirements
   *
   * @async
   * @function signUpWithEmail
   * @throws {Error} When sign up fails or validation errors occur
   */
  async function signUpWithEmail() {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      Alert.alert("Sign Up Error", error.message);
    } else {
      Alert.alert("Success", "Check your email for verification link!");
    }
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView className="flex-1" contentContainerStyle={{ flexGrow: 1 }}>
        <Stack.Screen options={{ title: "Welcome" }} />

        {/* Header Section */}
        <View className="flex-1 justify-center px-6 py-12">
          <View className="items-center mb-12">
            <View className="bg-blue-100 rounded-full p-6 mb-6">
              <Text className="text-4xl">🚀</Text>
            </View>
            <Text className="text-3xl font-bold text-gray-900 mb-2 text-center">
              Welcome to the App
            </Text>
            <Text className="text-gray-600 text-center leading-6">
              {isSignUp
                ? "Create your account to get started with AI-powered features"
                : "Sign in to access your AI assistant and more"}
            </Text>
          </View>

          {/* Form Card */}
          <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <Text className="text-xl font-semibold text-gray-900 mb-6 text-center">
              {isSignUp ? "Create Account" : "Sign In"}
            </Text>

            {/* Email Input */}
            <View className="mb-4">
              <Text className="text-base font-medium text-gray-700 mb-2">
                Email Address
              </Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                onChangeText={setEmail}
                value={email}
                placeholder="your@email.com"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
              />
            </View>

            {/* Password Input */}
            <View className="mb-6">
              <Text className="text-base font-medium text-gray-700 mb-2">
                Password
              </Text>
              <TextInput
                className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                onChangeText={setPassword}
                value={password}
                secureTextEntry={true}
                placeholder={
                  isSignUp ? "Minimum 6 characters" : "Enter your password"
                }
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              {isSignUp && (
                <Text className="text-sm text-gray-500 mt-1">
                  Password must be at least 6 characters long
                </Text>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              className={`rounded-lg py-4 px-6 mb-4 ${
                loading || !email || !password
                  ? "bg-gray-300"
                  : "bg-blue-600 active:bg-blue-700"
              }`}
              onPress={isSignUp ? signUpWithEmail : signInWithEmail}
              disabled={loading || !email || !password}
            >
              <Text
                className={`text-center font-semibold ${
                  loading || !email || !password
                    ? "text-gray-500"
                    : "text-white"
                }`}
              >
                {loading
                  ? "⏳ Please wait..."
                  : isSignUp
                  ? "🎉 Create Account"
                  : "🔑 Sign In"}
              </Text>
            </TouchableOpacity>

            {/* Toggle Auth Mode */}
            <TouchableOpacity
              className="py-3"
              onPress={() => setIsSignUp(!isSignUp)}
              disabled={loading}
            >
              <Text className="text-center text-blue-600 font-medium">
                {isSignUp
                  ? "Already have an account? Sign In"
                  : "Don't have an account? Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Features Preview */}
          <View className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <Text className="text-blue-800 font-medium mb-2 text-center">
              ✨ What's Inside
            </Text>
            <Text className="text-blue-700 text-sm text-center leading-5">
              AI Assistant • Secure Authentication • Profile Management
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
