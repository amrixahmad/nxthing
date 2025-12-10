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
  Image,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as Linking from "expo-linking";
import { supabase } from "../../../lib/supabase";
import { Stack, router } from "expo-router";

function generateFunPickleName(): string {
  const adjectives = [
    "Spicy",
    "Spinny",
    "Power",
    "Kitchen",
    "Dinking",
    "Smashing",
  ];
  const nouns = [
    "Pickler",
    "Dinker",
    "Smasher",
    "Baseliner",
    "Ace",
    "Rally",
  ];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const number = Math.floor(1 + Math.random() * 99);
  return `${adjective} ${noun} ${number}`;
}

function deriveUsernameFromEmail(email: string, userId: string): string {
  const atIndex = email.indexOf("@");
  const base = (atIndex > 0 ? email.slice(0, atIndex) : email)
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .slice(0, 20)
    .toLowerCase();
  const suffix = userId.replace(/-/g, "").slice(0, 6);
  return `${base}_${suffix}`;
}

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

  const [duprId, setDuprId] = useState("");
  const [duprRating, setDuprRating] = useState("");

  /** Loading state during authentication */
  const [loading, setLoading] = useState(false);

  /** Toggle between sign in and sign up modes */
  const [isSignUp, setIsSignUp] = useState(false);
  const [notice, setNotice] = useState<null | { type: "success" | "error"; text: string }>(null);
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const SHOW_APPLE_LOGIN = false;

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
      setNotice({ type: "error", text: "Please fill in all fields" });
      return;
    }

    setLoading(true);
    setNotice(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      console.error("Sign in error:", error.message, error.status, error);
      const emsg = String(error.message || "").toLowerCase();
      // Check if email is not confirmed
      if (emsg.includes("email not confirmed")) {
        setNotice({ type: "error", text: "Your email is not confirmed yet. Check your inbox for the confirmation link, or click 'Resend Confirmation' below." });
        setShowResendConfirmation(true);
      } else if (emsg.includes("invalid login") || emsg.includes("invalid email")) {
        setNotice({ type: "error", text: "Incorrect email or password. If you previously signed in with Google, please use 'Continue with Google' above or click 'Forgot Password' to set a password for email login." });
      } else {
        setNotice({ type: "error", text: error.message });
      }
    } else {
      setNotice({ type: "success", text: "Signed in successfully. Redirecting..." });
      setTimeout(() => {
        try { router.replace("/"); } catch {}
      }, 600);
    }
    setLoading(false);
  }

  async function handleOAuthSignIn(provider: "google" | "apple") {
    try {
      setLoading(true);
      setNotice(null);
      const funFullName = generateFunPickleName();

      let redirectTo: string | undefined;
      try {
        if (Platform.OS === "web") {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          redirectTo = `${origin}/auth-callback`;
        } else {
          redirectTo = "myapp://auth-callback";
        }
      } catch {}

      const { error } = await (supabase.auth as any).signInWithOAuth({
        provider,
        options: {
          redirectTo,
          data: {
            full_name: funFullName,
          },
        },
      });

      if (error) {
        Alert.alert("Authentication Error", error.message);
      }
    } finally {
      setLoading(false);
    }
  }

  /**
   * Handles password reset request
   * Sends a password reset email to the user
   */
  async function handleForgotPassword() {
    if (!email) {
      setNotice({ type: "error", text: "Please enter your email address" });
      return;
    }

    setLoading(true);
    setNotice(null);

    let redirectTo: string | undefined;
    try {
      if (Platform.OS === "web") {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        // Use production URL for password reset to ensure it works
        // Supabase needs the redirect URL to be in the allowed list
        if (origin.includes("localhost") || origin.includes("127.0.0.1")) {
          // For local dev, still use localhost but user needs to configure Supabase
          redirectTo = `${origin}/auth-callback`;
        } else {
          redirectTo = `${origin}/auth-callback`;
        }
      } else {
        redirectTo = "myapp://auth-callback";
      }
    } catch {}

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (error) {
      console.error("Password reset error:", error.message);
      setNotice({ type: "error", text: error.message });
    } else {
      setNotice({ type: "success", text: "Password reset email sent! Check your inbox." });
      setForgotPasswordMode(false);
    }
    setLoading(false);
  }

  /**
   * Resends the confirmation email to the user
   */
  async function handleResendConfirmation() {
    if (!email) {
      setNotice({ type: "error", text: "Please enter your email address" });
      return;
    }

    setLoading(true);
    setNotice(null);

    let redirectTo: string | undefined;
    try {
      if (Platform.OS === "web") {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        redirectTo = `${origin}/auth-callback`;
      } else {
        redirectTo = "myapp://auth-callback";
      }
    } catch {}

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      console.error("Resend confirmation error:", error.message);
      setNotice({ type: "error", text: error.message });
    } else {
      setNotice({ type: "success", text: "Confirmation email sent! Please check your inbox and click the link." });
      setShowResendConfirmation(false);
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
    // For native apps, send a magic-link redirect that opens back into the app via our scheme
    let opts: any = {};
    const funFullName = generateFunPickleName();
    try {
      if (Platform.OS !== "web") {
        const redirect = "myapp://auth-callback";
        opts = { options: { emailRedirectTo: redirect } };
      }
    } catch {}

    opts = {
      ...(opts || {}),
      options: {
        ...(opts.options || {}),
        data: {
          ...(opts.options?.data || {}),
          full_name: funFullName,
        },
      },
    };

    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, ...(opts || {}) });

    if (error) {
      Alert.alert("Sign Up Error", error.message);
      setLoading(false);
      return;
    }

    // Check if user already exists - Supabase returns identities as empty array for existing users
    const isExistingUser = data?.user?.identities?.length === 0;
    
    if (isExistingUser) {
      // Email already registered
      setNotice({ 
        type: "error", 
        text: "This email is already registered. Please sign in instead, or use 'Forgot Password' if you don't remember your password." 
      });
      setLoading(false);
      return;
    }

    // New user created successfully
    try {
      const user = data?.user;
      if (user) {
        const username = deriveUsernameFromEmail(user.email ?? email, user.id);
        const updates = {
          id: user.id,
          username,
          full_name: funFullName,
          dupr_id: duprId || null,
          dupr_rating: duprRating ? Number(duprRating) : null,
          updated_at: new Date().toISOString(),
        };
        await supabase.from("profiles").upsert(updates);
      }
    } catch (e) {
      console.error("Profile creation error:", e);
    }
    
    setNotice({ 
      type: "success", 
      text: "Account created! Please check your email and click the verification link to activate your account." 
    });
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

            <>
              <TouchableOpacity
                className="flex-row items-center justify-center rounded-lg py-3 px-4 mb-3 bg-white border border-gray-300"
                onPress={() => handleOAuthSignIn("google")}
                disabled={loading}
              >
                <View className="flex-row items-center">
                  <Image
                    source={{ uri: "https://developers.google.com/identity/images/g-logo.png" }}
                    className="w-5 h-5 mr-2"
                  />
                  <Text className="text-gray-800 font-medium">Continue with Google</Text>
                </View>
              </TouchableOpacity>

              {SHOW_APPLE_LOGIN && (
                <TouchableOpacity
                  className="flex-row items-center justify-center rounded-lg py-3 px-4 mb-3 bg-white border border-gray-300"
                  onPress={() => handleOAuthSignIn("apple")}
                  disabled={loading}
                >
                  <View className="flex-row items-center">
                    <FontAwesome name="apple" size={18} color="#000000" />
                    <Text className="ml-2 text-gray-800 font-medium">Continue with Apple</Text>
                  </View>
                </TouchableOpacity>
              )}

              <View className="flex-row items-center my-4">
                <View className="flex-1 h-px bg-gray-200" />
                <Text className="mx-3 text-gray-400 text-xs uppercase">
                  {isSignUp ? "Or continue with email" : "Or sign in with email"}
                </Text>
                <View className="flex-1 h-px bg-gray-200" />
              </View>
            </>

            {/* Forgot password prompt */}
            {forgotPasswordMode && !notice && (
              <Text className="mb-3 text-gray-600">
                Enter your email address and we'll send you a link to reset your password.
              </Text>
            )}

            {/* Notice - shown above email input */}
            {notice ? (
              <Text className={`mb-3 ${notice.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>{notice.text}</Text>
            ) : null}

            {/* Resend confirmation button */}
            {showResendConfirmation && !isSignUp && (
              <TouchableOpacity
                className="mb-3 py-2"
                onPress={handleResendConfirmation}
                disabled={loading}
              >
                <Text className="text-blue-600 font-medium text-center">
                  📧 Resend Confirmation Email
                </Text>
              </TouchableOpacity>
            )}

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

            {/* Password Input - hidden in forgot password mode */}
            {!forgotPasswordMode && (
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
                {!isSignUp && (
                  <TouchableOpacity
                    className="mt-2"
                    onPress={() => {
                      setForgotPasswordMode(true);
                      setNotice(null);
                    }}
                    disabled={loading}
                  >
                    <Text className="text-sm text-blue-600">Forgot Password?</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {isSignUp && (
              <>
                <View className="mb-4">
                  <Text className="text-base font-medium text-gray-700 mb-2">
                    DUPR ID (optional)
                  </Text>
                  <TextInput
                    className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                    onChangeText={setDuprId}
                    value={duprId}
                    placeholder="Enter your DUPR ID"
                    placeholderTextColor="#9CA3AF"
                    autoCapitalize="none"
                  />
                </View>

                <View className="mb-6">
                  <Text className="text-base font-medium text-gray-700 mb-2">
                    DUPR Rating (optional)
                  </Text>
                  <TextInput
                    className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white"
                    onChangeText={setDuprRating}
                    value={duprRating}
                    placeholder="e.g. 3.50"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="decimal-pad"
                    autoCapitalize="none"
                  />
                </View>
              </>
            )}

            {/* Submit Button */}
            {forgotPasswordMode ? (
              <>
                <TouchableOpacity
                  className={`rounded-lg py-4 px-6 mb-4 ${
                    loading || !email
                      ? "bg-gray-300"
                      : "bg-blue-600 active:bg-blue-700"
                  }`}
                  onPress={handleForgotPassword}
                  disabled={loading || !email}
                >
                  <Text
                    className={`text-center font-semibold ${
                      loading || !email ? "text-gray-500" : "text-white"
                    }`}
                  >
                    {loading ? "⏳ Sending..." : "📧 Send Recovery Email"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="py-3"
                  onPress={() => {
                    setForgotPasswordMode(false);
                    setNotice(null);
                  }}
                  disabled={loading}
                >
                  <Text className="text-center text-blue-600 font-medium">
                    ← Back to Sign In
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
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
                  onPress={() => {
                    setIsSignUp(!isSignUp);
                    setNotice(null);
                    setShowResendConfirmation(false);
                  }}
                  disabled={loading}
                >
                  <Text className="text-center text-blue-600 font-medium">
                    {isSignUp
                      ? "Already have an account? Sign In"
                      : "Don't have an account? Sign Up"}
                  </Text>
                </TouchableOpacity>
              </>
            )}
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
