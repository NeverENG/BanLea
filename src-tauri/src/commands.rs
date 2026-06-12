//! 自定义 Tauri 命令：API Key 存取（走 OS keychain，绝不进明文/数据库）。
//! 见开发计划 §10。Windows 下落在凭据管理器。

use keyring::Entry;

const SERVICE: &str = "ai.potentia.banlea";
const CLAUDE_ACCOUNT: &str = "anthropic_api_key";
const DEEPSEEK_ACCOUNT: &str = "deepseek_api_key";

fn account_for_provider(provider: Option<String>) -> &'static str {
    match provider.as_deref() {
        Some("deepseek") => DEEPSEEK_ACCOUNT,
        _ => CLAUDE_ACCOUNT,
    }
}

fn entry(provider: Option<String>) -> Result<Entry, String> {
    Entry::new(SERVICE, account_for_provider(provider)).map_err(|e| e.to_string())
}

/// 保存 API Key 到系统 keychain
#[tauri::command]
pub fn save_api_key(key: String, provider: Option<String>) -> Result<(), String> {
    entry(provider)?.set_password(&key).map_err(|e| e.to_string())
}

/// 读取 API Key；未设置时返回 None
#[tauri::command]
pub fn get_api_key(provider: Option<String>) -> Result<Option<String>, String> {
    match entry(provider)?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 删除 API Key（不存在也视为成功）
#[tauri::command]
pub fn delete_api_key(provider: Option<String>) -> Result<(), String> {
    match entry(provider)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
