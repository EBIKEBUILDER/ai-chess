// src/lib/ai/openai-responses.ts
import OpenAI from "openai";
import type { OpenAIModelId, ThinkingLevel } from "@/types/chess";

let cachedOpenAIClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!cachedOpenAIClient) {
    cachedOpenAIClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "missing-openai-api-key",
    });
  }
  return cachedOpenAIClient;
}

export interface OpenAIStructuredResponseParams {
  model: OpenAIModelId;
  thinkingLevel: ThinkingLevel;
  systemInstruction: string;
  inputPrompt: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  previousResponseId?: string | null;
}

export interface OpenAIResponseResult<T> {
  parsedOutput: T;
  responseId: string;
  thoughtSummaryText: string | null;
  totalThoughtTokens: number | null;
  latencyMs: number;
}

/**
 * Executes a stateful turn using the OpenAI Responses API (`client.responses.create`).
 *
 * Parity with Gemini Interactions API:
 * 1. Stateful Multi-Turn Memory: `store: true` + `previous_response_id` retains full conversation history server-side.
 * 2. Strict JSON Schema Enforcement: `text.format: { type: "json_schema", strict: true, schema }` guarantees valid structured JSON.
 * 3. Deliberation / Reasoning Control: `reasoning: { effort: thinkingLevel, summary: "auto" }` on reasoning models (e.g. gpt-5.5).
 */
export async function executeOpenAIStructuredResponse<T>(
  params: OpenAIStructuredResponseParams
): Promise<OpenAIResponseResult<T>> {
  const startTime = performance.now();

  const requestBody: Record<string, unknown> = {
    model: params.model,
    instructions: params.systemInstruction,
    input: params.inputPrompt,
    store: true,
    text: {
      format: {
        type: "json_schema",
        name: params.schemaName,
        strict: true,
        schema: params.jsonSchema,
      },
    },
  };

  // Enable reasoning effort & reasoning summary blocks for reasoning-capable models (e.g. gpt-5.5)
  if (params.model === "gpt-5.5") {
    requestBody.reasoning = {
      effort: params.thinkingLevel,
      summary: "auto",
    };
  }

  if (params.previousResponseId) {
    requestBody.previous_response_id = params.previousResponseId;
  }

  const openaiClient = getOpenAIClient();
  const response: any = await openaiClient.responses.create(requestBody as any);
  const latencyMs = Math.round(performance.now() - startTime);

  const rawJsonText: string = response.output_text || "";
  if (!rawJsonText) {
    throw new Error("OpenAI Responses API returned an empty output_text.");
  }

  const parsedOutput = JSON.parse(rawJsonText) as T;

  // Extract reasoning summaries from response.output items if present
  const reasoningSegments: string[] = [];
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === "reasoning" && Array.isArray(item.summary)) {
        for (const s of item.summary) {
          if (typeof s.text === "string" && s.text.trim()) {
            reasoningSegments.push(s.text.trim());
          }
        }
      }
    }
  }

  const fallbackJustification =
    parsedOutput &&
    typeof (parsedOutput as any).tactical_justification === "string"
      ? (parsedOutput as any).tactical_justification
      : parsedOutput &&
          typeof (parsedOutput as any).coaching_explanation === "string"
        ? (parsedOutput as any).coaching_explanation
        : null;

  const thoughtSummaryText =
    reasoningSegments.length > 0
      ? reasoningSegments.join("\n\n")
      : fallbackJustification;

  const reasoningTokens =
    typeof response.usage?.output_tokens_details?.reasoning_tokens === "number"
      ? response.usage.output_tokens_details.reasoning_tokens
      : null;

  return {
    parsedOutput,
    responseId: response.id,
    thoughtSummaryText,
    totalThoughtTokens: reasoningTokens,
    latencyMs,
  };
}
