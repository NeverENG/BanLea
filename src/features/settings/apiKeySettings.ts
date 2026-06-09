import { deleteApiKey, getApiKey, saveApiKey } from "@/core/llm/apiKey";

export interface ApiKeyStore {
  get(): Promise<string | null>;
  save(key: string): Promise<void>;
  delete(): Promise<void>;
}

export interface ApiKeyStatus {
  configured: boolean;
  maskedKey: string | null;
}

export interface ApiKeyRuntimeStatus extends ApiKeyStatus {
  clientInitialized: boolean;
}

export interface ApiKeySettingsService {
  loadStatus(): Promise<ApiKeyStatus>;
  initializeSavedKey(): Promise<ApiKeyRuntimeStatus>;
  save(key: string): Promise<ApiKeyStatus>;
  delete(): Promise<ApiKeyStatus>;
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

async function initializeClaudeClient(key: string | null): Promise<boolean> {
  if (!key) {
    return false;
  }
  const { initClient } = await import("@/core/llm/client");
  initClient(key);
  return true;
}

async function resetClaudeClient(): Promise<void> {
  const { resetClient } = await import("@/core/llm/client");
  resetClient();
}

function statusFromKey(key: string | null): ApiKeyStatus {
  return {
    configured: Boolean(key),
    maskedKey: key ? maskApiKey(key) : null,
  };
}

export function createApiKeySettingsService(
  store: ApiKeyStore = keychainStore,
): ApiKeySettingsService {
  async function loadStatus(): Promise<ApiKeyStatus> {
    const key = await store.get();
    return statusFromKey(key);
  }

  return {
    loadStatus,

    async initializeSavedKey() {
      const key = await store.get();
      return {
        ...statusFromKey(key),
        clientInitialized: await initializeClaudeClient(key),
      };
    },

    async save(key) {
      const trimmed = key.trim();
      if (!trimmed) {
        throw new Error("API Key 不能为空");
      }
      await store.save(trimmed);
      return loadStatus();
    },

    async delete() {
      await store.delete();
      await resetClaudeClient();
      return loadStatus();
    },
  };
}
