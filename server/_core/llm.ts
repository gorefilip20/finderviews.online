/**
 * Thin LLM gateway. Finder only uses this for briefs and proposal narrative, and always
 * with a schema-constrained response, so callers can rely on parseable JSON.
 */
import { ENV } from "./env";

export type LLMMessage = { role: "system" | "user" | "assistant"; content: string };

export type LLMRequest = {
  model?: string;
  messages: LLMMessage[];
  response_format?: unknown;
  temperature?: number;
};

export type LLMResponse = {
  choices: { message: { content: string | null } }[];
};

export type LLMModel = { id: string; name?: string };

function gateway() {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new Error(
      "The AI service is not configured. Set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY to enable AI briefs.",
    );
  }
  return { url: ENV.forgeApiUrl.replace(/\/+$/, ""), key: ENV.forgeApiKey };
}

export async function listLLMModels(): Promise<{ data: LLMModel[] }> {
  const { url, key } = gateway();
  const response = await fetch(`${url}/v1/models`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) throw new Error(`Model list failed (${response.status})`);
  const payload = (await response.json()) as { data?: LLMModel[] };
  return { data: payload.data || [] };
}

export async function invokeLLM(request: LLMRequest): Promise<LLMResponse> {
  const { url, key } = gateway();
  const response = await fetch(`${url}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => response.statusText);
    throw new Error(`AI request failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  return (await response.json()) as LLMResponse;
}
