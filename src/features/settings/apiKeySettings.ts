import {
  deleteApiKey,
  getApiKey,
  saveApiKey,
  type ApiKeyProvider,
} from "@/core/llm/apiKey";
import type { LlmProvider } from "@/core/llm/client";

export type ApiProvider = ApiKeyProvider;

export interface ApiKeyStore {
  get(provider: ApiProvider): Promise<string | null>;
  save(key: string, provider: ApiProvider): Promise<void>;
  delete(provider: ApiProvider): Promise<void>;
}

export interface ApiKeyStatus {
  provider: ApiProvider;
  configured: boolean;
  maskedKey: string | null;
}

export interface ApiKeyRuntimeStatus extends ApiKeyStatus {
  clientInitialized: boolean;
}

export interface ApiKeySettingsService {
  loadStatus(provider?: ApiProvider): Promise<ApiKeyStatus>;
  initializeSavedKey(provider?: ApiProvider): Promise<ApiKeyRuntimeStatus>;
  save(key: string, provider?: ApiProvider): Promise<ApiKeyRuntimeStatus>;
  delete(provider?: ApiProvider): Promise<ApiKeyStatus>;
}

const keychainStore: ApiKeyStore = {
  get: getApiKey,
  save: saveApiKey,
  delete: deleteApiKey,
};

export function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return "••••";
  }
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export const API_PROVIDER_LABELS: Record<ApiProvider, string> = {
  claude: "Claude",
  deepseek: "DeepSeek",
};

async function initializeLlmClient(
  key: string | null,
  provider: ApiProvider,
): Promise<boolean> {
  if (!key) {
    return false;
  }
  const { initClient } = await import("@/core/llm/client");
  initClient(key, provider as LlmProvider);
  return true;
}

async function resetLlmClient(): Promise<void> {
  const { resetClient } = await import("@/core/llm/client");
  resetClient();
}

function statusFromKey(key: string | null, provider: ApiProvider): ApiKeyStatus {
  return {
    provider,
    configured: Boolean(key),
    maskedKey: key ? maskApiKey(key) : null,
  };
}

export function createApiKeySettingsService(
  store: ApiKeyStore = keychainStore,
): ApiKeySettingsService {
  async function loadStatus(provider: ApiProvider = "claude"): Promise<ApiKeyStatus> {
    const key = await store.get(provider);
    return statusFromKey(key, provider);
  }

  return {
    loadStatus,

    async initializeSavedKey(provider = "claude") {
      const key = await store.get(provider);
      return {
        ...statusFromKey(key, provider),
        clientInitialized: await initializeLlmClient(key, provider),
      };
    },

    async save(key, provider = "claude") {
      const trimmed = key.trim();
      if (!trimmed) {
        throw new Error("API Key 不能为空");
      }
      await store.save(trimmed, provider);
      return {
        ...statusFromKey(trimmed, provider),
        clientInitialized: await initializeLlmClient(trimmed, provider),
      };
    },

    async delete(provider = "claude") {
      await store.delete(provider);
      await resetLlmClient();
      return loadStatus(provider);
    },
  };
}
