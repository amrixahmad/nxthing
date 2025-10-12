/**
 * @fileoverview OpenAI Assistant Screen
 * Provides a chat interface for users to interact with OpenAI's GPT-3.5-turbo model
 * via Supabase Edge Functions. Features professional UI with loading states and error handling.
 *
 * @author Your Name
 * @version 1.0.0
 */

import { useState } from "react";
import {
  View,
  TextInput,
  Text,
  Alert,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import { Stack } from "expo-router";

/**
 * OpenAI Assistant screen component
 * Provides a user interface for AI chat interactions
 *
 * @component
 * @returns {JSX.Element} The OpenAI assistant screen
 *
 * @example
 * // Used in Expo Router tab navigation
 * <OpenAIScreen />
 */
export default function OpenAIScreen() {
  /** User's input prompt/question */
  const [prompt, setPrompt] = useState("");

  /** AI response from OpenAI */
  const [response, setResponse] = useState("");

  /** Loading state during API calls */
  const [loading, setLoading] = useState(false);

  /**
   * Calls the OpenAI Edge Function with the user's prompt
   * Handles validation, loading states, and error management
   *
   * @async
   * @function callOpenAIFunction
   * @throws {Error} When prompt is empty or API call fails
   */
  const callOpenAIFunction = async () => {
    if (!prompt) {
      Alert.alert("Please enter a prompt");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.functions.invoke("openai", {
      body: { message: prompt },
    });

    if (error) {
      Alert.alert("Error", error.message || "Failed to get AI response");
    } else {
      setResponse(data.message);
    }
    setLoading(false);
  };

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <Stack.Screen options={{ title: "AI Assistant" }} />

      {/* Header Section */}
      <View className="bg-white border-b border-gray-200">
        <View className="px-6 py-8 items-center">
          <Text className="text-3xl font-bold text-gray-900 mb-2">
            🤖 AI Assistant
          </Text>
          <Text className="text-sm text-gray-600 text-center">
            Powered by OpenAI & Supabase Edge Functions
          </Text>
        </View>
      </View>

      {/* Description Card */}
      <View className="mx-4 mt-6 bg-white rounded-xl shadow-sm border border-gray-100">
        <View className="p-6">
          <Text className="text-lg font-semibold text-gray-900 mb-4">
            What can I help you with today?
          </Text>

          <Text className="text-gray-700 mb-4 leading-6">
            I'm an AI assistant that can help you with various tasks:
          </Text>

          <View className="space-y-2 mb-4">
            <Text className="text-gray-600 flex-row items-center">
              • Answer questions and explain concepts
            </Text>
            <Text className="text-gray-600">• Write and edit content</Text>
            <Text className="text-gray-600">
              • Solve problems and brainstorm ideas
            </Text>
            <Text className="text-gray-600">
              • Code assistance and debugging
            </Text>
            <Text className="text-gray-600">• Research and analysis</Text>
          </View>

          <View className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <Text className="text-blue-800 text-sm font-medium mb-1">
              💡 Try asking:
            </Text>
            <Text className="text-blue-700 text-sm">
              "Explain React Native hooks" or "Write a professional email"
            </Text>
          </View>
        </View>
      </View>

      {/* Input Section */}
      <View className="mx-4 mt-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <View className="p-6">
          <Text className="text-base font-semibold text-gray-900 mb-3">
            Your question or prompt
          </Text>

          <TextInput
            className="border border-gray-300 rounded-lg p-4 text-base text-gray-900 bg-white min-h-[100px]"
            placeholder="Type your question here..."
            placeholderTextColor="#9CA3AF"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            textAlignVertical="top"
            style={{ fontFamily: "System" }}
          />

          <TouchableOpacity
            className={`mt-4 rounded-lg py-4 px-6 ${
              loading || !prompt.trim()
                ? "bg-gray-300"
                : "bg-blue-600 active:bg-blue-700"
            }`}
            onPress={callOpenAIFunction}
            disabled={loading || !prompt.trim()}
          >
            <Text
              className={`text-center font-semibold ${
                loading || !prompt.trim() ? "text-gray-500" : "text-white"
              }`}
            >
              {loading ? "🧠 AI is thinking..." : "✨ Ask AI"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading State */}
      {loading && (
        <View className="mx-4 mt-4 bg-blue-50 rounded-xl border border-blue-200">
          <View className="p-6 items-center">
            <Text className="text-blue-800 font-medium">
              Processing your request...
            </Text>
            <Text className="text-blue-600 text-sm mt-1">
              This may take a few seconds
            </Text>
          </View>
        </View>
      )}

      {/* Response Section */}
      {response && (
        <View className="mx-4 mt-4 bg-white rounded-xl shadow-sm border border-gray-100">
          <View className="p-6">
            <View className="flex-row items-center mb-4">
              <Text className="text-lg font-semibold text-green-700">
                🤖 AI Response
              </Text>
            </View>

            <View className="bg-gray-50 border-l-4 border-green-500 rounded-r-lg p-4">
              <Text className="text-gray-900 leading-6 text-base">
                {response}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Footer */}
      <View className="mt-8 mb-6 px-6">
        <Text className="text-center text-xs text-gray-500 leading-5">
          This AI assistant is powered by OpenAI's language models{"\n"}
          via secure Supabase Edge Functions
        </Text>
      </View>
    </ScrollView>
  );
}
