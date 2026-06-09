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

export interface ApiKeySettingsService {
  loadStatus(): Promise<ApiKeyStatus>;
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

export function createApiKeySettingsService(
  store: ApiKeyStore = keychainStore,
): ApiKeySettingsService {
  async function loadStatus(): Promise<ApiKeyStatus> {
    const key = await store.get();
    return {
      configured: Boolean(key),
      maskedKey: key ? maskApiKey(key) : null,
    };
  }

  return {
    loadStatus,

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
      return loadStatus();
    },
  };
}
