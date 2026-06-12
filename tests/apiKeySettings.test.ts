import { beforeEach, describe, expect, it, vi } from "vitest";
import { initClient, resetClient } from "@/core/llm/client";
import {
  createApiKeySettingsService,
  maskApiKey,
  type ApiKeyStore,
} from "@/features/settings/apiKeySettings";

vi.mock("@/core/llm/client", () => ({
  initClient: vi.fn(),
  resetClient: vi.fn(),
}));

function store(initial: string | null = null) {
  let key = initial;
  const apiKeyStore: ApiKeyStore = {
    get: vi.fn(async () => key),
    save: vi.fn(async (next) => {
      key = next;
    }),
    delete: vi.fn(async () => {
      key = null;
    }),
  };
  return apiKeyStore;
}

describe("apiKeySettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maskApiKey 不暴露完整 key", () => {
    expect(maskApiKey("sk-ant-api03-abcdef123456")).toBe("sk-ant-…3456");
    expect(maskApiKey("short")).toBe("••••");
  });

  it("loadStatus 返回未设置状态", async () => {
    const service = createApiKeySettingsService(store());

    await expect(service.loadStatus()).resolves.toEqual({
      provider: "claude",
      configured: false,
      maskedKey: null,
    });
  });

  it("save 会 trim key、保存并初始化 Claude client", async () => {
    const apiKeyStore = store();
    const service = createApiKeySettingsService(apiKeyStore);

    const status = await service.save("  sk-ant-api03-abcdef123456  ");

    expect(apiKeyStore.save).toHaveBeenCalledWith(
      "sk-ant-api03-abcdef123456",
      "claude",
    );
    expect(initClient).toHaveBeenCalledWith("sk-ant-api03-abcdef123456", "claude");
    expect(status).toEqual({
      provider: "claude",
      configured: true,
      maskedKey: "sk-ant-…3456",
      clientInitialized: true,
    });
  });

  it("save 支持初始化 DeepSeek provider", async () => {
    const apiKeyStore = store();
    const service = createApiKeySettingsService(apiKeyStore);

    const status = await service.save("  sk-ds-abcdef123456  ", "deepseek");

    expect(apiKeyStore.save).toHaveBeenCalledWith(
      "sk-ds-abcdef123456",
      "deepseek",
    );
    expect(initClient).toHaveBeenCalledWith("sk-ds-abcdef123456", "deepseek");
    expect(status).toEqual({
      provider: "deepseek",
      configured: true,
      maskedKey: "sk-ds-a…3456",
      clientInitialized: true,
    });
  });

  it("initializeSavedKey 用 keychain 中的 key 初始化 Claude client", async () => {
    const service = createApiKeySettingsService(store("sk-ant-api03-abcdef123456"));

    const status = await service.initializeSavedKey();

    expect(initClient).toHaveBeenCalledWith("sk-ant-api03-abcdef123456", "claude");
    expect(status).toEqual({
      provider: "claude",
      configured: true,
      maskedKey: "sk-ant-…3456",
      clientInitialized: true,
    });
  });

  it("initializeSavedKey 支持 DeepSeek provider", async () => {
    const service = createApiKeySettingsService(store("sk-ds-abcdef123456"));

    const status = await service.initializeSavedKey("deepseek");

    expect(initClient).toHaveBeenCalledWith("sk-ds-abcdef123456", "deepseek");
    expect(status).toEqual({
      provider: "deepseek",
      configured: true,
      maskedKey: "sk-ds-a…3456",
      clientInitialized: true,
    });
  });

  it("initializeSavedKey 在未设置 key 时不初始化 client", async () => {
    const service = createApiKeySettingsService(store());

    const status = await service.initializeSavedKey();

    expect(initClient).not.toHaveBeenCalled();
    expect(resetClient).toHaveBeenCalledTimes(1);
    expect(status).toEqual({
      provider: "claude",
      configured: false,
      maskedKey: null,
      clientInitialized: false,
    });
  });

  it("initializeSavedKey resets runtime when selected provider has no key", async () => {
    const service = createApiKeySettingsService(store());

    const status = await service.initializeSavedKey("deepseek");

    expect(initClient).not.toHaveBeenCalled();
    expect(resetClient).toHaveBeenCalledTimes(1);
    expect(status).toEqual({
      provider: "deepseek",
      configured: false,
      maskedKey: null,
      clientInitialized: false,
    });
  });

  it("空 key 被拒绝", async () => {
    const service = createApiKeySettingsService(store());

    await expect(service.save("   ")).rejects.toThrow("API Key 不能为空");
  });

  it("delete 清空 key", async () => {
    const apiKeyStore = store("sk-ant-api03-abcdef123456");
    const service = createApiKeySettingsService(apiKeyStore);

    const status = await service.delete();

    expect(apiKeyStore.delete).toHaveBeenCalledWith("claude");
    expect(resetClient).toHaveBeenCalledTimes(1);
    expect(status).toEqual({
      provider: "claude",
      configured: false,
      maskedKey: null,
    });
  });
});
