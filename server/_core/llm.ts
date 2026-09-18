import { ENV } from "./env";

type LLMRequest = Record<string, unknown>;

export async function listLLMModels(): Promise<{ data: Array<{ id: string }> }> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return { data: [] };
  const response = await fetch(`${ENV.forgeApiUrl.replace(/\/+$/, "")}/v1/models`, {
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
  });
  if (!response.ok) throw new Error(`Model listing failed (${response.status})`);
  return (await response.json()) as { data: Array<{ id: string }> };
}

export async function invokeLLM(request: LLMRequest): Promise<any> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    throw new Error("LLM configuration is missing");
  }
  const response = await fetch(`${ENV.forgeApiUrl.replace(/\/+$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.forgeApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`LLM request failed (${response.status})`);
  return response.json();
}
