//! 自定义 Tauri 命令：API Key 存取（走 OS keychain，绝不进明文/数据库）。
//! 见开发计划 §10。Windows 下落在凭据管理器。

use keyring::Entry;

const SERVICE: &str = "ai.potentia.banlea";
const ACCOUNT: &str = "anthropic_api_key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// 保存 API Key 到系统 keychain
#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    entry()?.set_password(&key).map_err(|e| e.to_string())
}

/// 读取 API Key；未设置时返回 None
#[tauri::command]
pub fn get_api_key() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(p) => Ok(Some(p)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// 删除 API Key（不存在也视为成功）
#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
