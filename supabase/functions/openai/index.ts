/// <reference types="./types.d.ts" />

/**
 * @fileoverview OpenAI Edge Function for Supabase
 * This function provides a secure interface to OpenAI's GPT-3.5-turbo model
 * via Supabase Edge Functions, handling authentication, CORS, and error handling.
 *
 * @author Your Name
 * @version 1.0.0
 */

import { OpenAI } from "npm:openai@^4.0.0";

/**
 * Request interface for OpenAI API calls
 * @interface OpenAIRequest
 */
interface OpenAIRequest {
  /** The user's message/prompt to send to OpenAI */
  message: string;
}

/**
 * Response interface for successful OpenAI API calls
 * @interface OpenAIResponse
 */
interface OpenAIResponse {
  /** The AI-generated response message, or null if no response */
  message: string | null;
}

/**
 * Error response interface for failed requests
 * @interface ErrorResponse
 */
interface ErrorResponse {
  /** Error message describing what went wrong */
  error: string;
  /** Optional additional error details */
  details?: string;
}

/**
 * CORS headers applied to all responses
 * Allows cross-origin requests from any domain for local development
 * @constant {Object} corsHeaders
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * OpenAI client instance
 * Initialized with API key from environment variables
 * @constant {OpenAI} openai
 */
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY") || "",
});

/**
 * Main Edge Function handler
 * Processes requests to the OpenAI API with proper validation and error handling
 *
 * @param {Request} req - The incoming HTTP request
 * @returns {Promise<Response>} HTTP response with AI response or error
 *
 * @example
 * // POST request to the function
 * fetch('/functions/v1/openai', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ message: 'Hello, AI!' })
 * })
 */
Deno.serve(async (req: Request): Promise<Response> => {
  try {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
      return new Response("ok", {
        headers: corsHeaders,
      });
    }

    // Only allow POST requests
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" } as ErrorResponse),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse and validate request body
    let requestBody: OpenAIRequest;
    try {
      requestBody = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
        } as ErrorResponse),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { message } = requestBody;

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return new Response(
        JSON.stringify({
          error: "Message is required and must be a non-empty string",
        } as ErrorResponse),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if OpenAI API key is configured
    if (!Deno.env.get("OPENAI_API_KEY")) {
      return new Response(
        JSON.stringify({
          error: "OpenAI API key not configured",
        } as ErrorResponse),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful AI assistant. Provide concise and helpful responses.",
        },
        {
          role: "user",
          content: message.trim(),
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const responseMessage = completion.choices[0]?.message?.content;

    const responseData: OpenAIResponse = {
      message: responseMessage || null,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("OpenAI API Error:", error);

    // Handle different types of errors
    let errorMessage = "Failed to process your request";
    let details: string | undefined;

    if (error instanceof Error) {
      details = error.message;

      // Handle specific OpenAI errors
      if (error.message.includes("API key")) {
        errorMessage = "Invalid OpenAI API key";
      } else if (error.message.includes("quota")) {
        errorMessage = "OpenAI API quota exceeded";
      } else if (error.message.includes("rate limit")) {
        errorMessage = "OpenAI API rate limit exceeded";
      }
    }

    const errorResponse: ErrorResponse = {
      error: errorMessage,
      details,
    };

    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
