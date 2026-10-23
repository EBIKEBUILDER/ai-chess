// src/lib/ai/gemini-interactions.ts
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { GeminiModelId, ThinkingLevel } from "@/types/chess";

const ALLOWED_GEMINI_MODELS: ReadonlySet<string> = new Set([
  "gemini-4-argon",
  "gemini-3.8-flash",
]);

const ALLOWED_THINKING_LEVELS: ReadonlySet<string> = new Set([
  "low",
  "medium",
  "high",
]);

let cachedAiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!cachedAiClient) {
    cachedAiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "missing-gemini-api-key",
    });
  }
  return cachedAiClient;
}

export interface GeminiStructuredInteractionParams {
  model: GeminiModelId;
  thinkingLevel: ThinkingLevel;
  systemInstruction: string;
  inputPrompt: string;
  jsonSchema: Record<string, unknown>;
  previousInteractionId?: string | null;
}

export interface GeminiInteractionResult<T> {
  parsedOutput: T;
  interactionId: string;
  thoughtSummaryText: string | null;
  totalThoughtTokens: number | null;
  latencyMs: number;
}

/**
 * Executes a stateful turn using the Google Gemini Interactions API (GA June 2026).
 * Preserves conversation memory server-side via previous_interaction_id while re-specifying
 * interaction-scoped parameters (system_instruction, generation_config, response_format).
 */
export async function executeGeminiStructuredInteraction<T>(
  params: GeminiStructuredInteractionParams
): Promise<GeminiInteractionResult<T>> {
  if (!ALLOWED_GEMINI_MODELS.has(params.model)) {
    throw new Error(
      `Invalid Gemini model "${params.model}". Only "gemini-4-argon" and "gemini-3.8-flash" are permitted.`
    );
  }

  if (!ALLOWED_THINKING_LEVELS.has(params.thinkingLevel)) {
    throw new Error(
      `Invalid thinking_level "${params.thinkingLevel}". Permitted values: "low", "medium", "high".`
    );
  }

  const startTime = performance.now();

  // Build the Interactions API payload.
  // Note: temperature, top_p, and top_k are intentionally omitted as Gemini 4 and 3.8 ignore them.
  const requestPayload: Record<string, unknown> = {
    model: params.model,
    input: params.inputPrompt,
    system_instruction: params.systemInstruction,
    store: true,
    generation_config: {
      thinking_level: params.thinkingLevel,
      thinking_summaries: "auto",
      max_output_tokens: 2048,
    },
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: params.jsonSchema,
    },
  };

  if (params.previousInteractionId) {
    requestPayload.previous_interaction_id = params.previousInteractionId;
  }

  const aiClient = getGeminiClient();

  // Call the Interactions API endpoint
  const interaction: any = await (aiClient as any).interactions.create(requestPayload);

  const latencyMs = Math.round(performance.now() - startTime);

  // Extract chronological thought summaries from interaction.steps
  const thoughtSegments: string[] = [];
  if (Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (step.type === "thought" && Array.isArray(step.summary)) {
        for (const contentBlock of step.summary) {
          if (contentBlock.type === "text" && typeof contentBlock.text === "string") {
            thoughtSegments.push(contentBlock.text.trim());
          }
        }
      }
    }
  }

  const thoughtSummaryText =
    thoughtSegments.length > 0 ? thoughtSegments.join("\n\n") : null;

  const rawText: string = interaction.output_text || "";
  if (!rawText) {
    throw new Error("Gemini Interactions API returned an empty output_text payload.");
  }

  // Validate against JSON schema using Zod v3.24+ z.fromJSONSchema or direct parse
  const parsedJson = JSON.parse(rawText);
  const fromJSONSchemaFn = Reflect.get(z, "fromJSONSchema");
  const dynamicZodValidator =
    typeof fromJSONSchemaFn === "function"
      ? fromJSONSchemaFn.call(z, params.jsonSchema)
      : z.any();

  const validatedData = dynamicZodValidator.parse(parsedJson) as T;

  return {
    parsedOutput: validatedData,
    interactionId: interaction.id,
    thoughtSummaryText,
    totalThoughtTokens:
      typeof interaction.total_thought_tokens === "number"
        ? interaction.total_thought_tokens
        : null,
    latencyMs,
  };
}
