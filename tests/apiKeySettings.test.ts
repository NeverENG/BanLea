import { describe, expect, it, vi } from "vitest";
import {
  createApiKeySettingsService,
  maskApiKey,
  type ApiKeyStore,
} from "@/features/settings/apiKeySettings";

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
  it("maskApiKey 不暴露完整 key", () => {
    expect(maskApiKey("sk-ant-api03-abcdef123456")).toBe("sk-ant-…3456");
    expect(maskApiKey("short")).toBe("••••");
  });

  it("loadStatus 返回未设置状态", async () => {
    const service = createApiKeySettingsService(store());

    await expect(service.loadStatus()).resolves.toEqual({
      configured: false,
      maskedKey: null,
    });
  });

  it("save 会 trim key 并返回已设置状态", async () => {
    const apiKeyStore = store();
    const service = createApiKeySettingsService(apiKeyStore);

    const status = await service.save("  sk-ant-api03-abcdef123456  ");

    expect(apiKeyStore.save).toHaveBeenCalledWith("sk-ant-api03-abcdef123456");
    expect(status).toEqual({
      configured: true,
      maskedKey: "sk-ant-…3456",
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

    expect(apiKeyStore.delete).toHaveBeenCalledTimes(1);
    expect(status).toEqual({
      configured: false,
      maskedKey: null,
    });
  });
});
