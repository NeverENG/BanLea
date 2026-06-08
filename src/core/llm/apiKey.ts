import { invoke } from "@tauri-apps/api/core";

/**
 * API Key 存取（§10）。透传到 Rust 命令，实际落在 OS keychain。
 * 仅在 Tauri 运行时可用。
 */

export function saveApiKey(key: string): Promise<void> {
  return invoke<void>("save_api_key", { key });
}

export function getApiKey(): Promise<string | null> {
  return invoke<string | null>("get_api_key");
}

export function deleteApiKey(): Promise<void> {
  return invoke<void>("delete_api_key");
}
