import { invoke } from "@tauri-apps/api/core";

/**
 * API Key 存取（§10）。透传到 Rust 命令，实际落在 OS keychain。
 * 仅在 Tauri 运行时可用。
 */

export type ApiKeyProvider = "claude" | "deepseek";

const NON_TAURI_ERROR = "API Key 仅在 Tauri 桌面端可用";

function isTauriRuntime(): boolean {
  return Boolean(
    (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
}

function rejectOutsideTauri<T>(): Promise<T> {
  return Promise.reject(new Error(NON_TAURI_ERROR));
}

export function saveApiKey(
  key: string,
  provider: ApiKeyProvider = "claude",
): Promise<void> {
  if (!isTauriRuntime()) {
    return rejectOutsideTauri();
  }
  return invoke<void>("save_api_key", { key, provider });
}

export function getApiKey(
  provider: ApiKeyProvider = "claude",
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return rejectOutsideTauri();
  }
  return invoke<string | null>("get_api_key", { provider });
}

export function deleteApiKey(provider: ApiKeyProvider = "claude"): Promise<void> {
  if (!isTauriRuntime()) {
    return rejectOutsideTauri();
  }
  return invoke<void>("delete_api_key", { provider });
}
