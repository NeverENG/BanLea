#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  use tauri_plugin_sql::{Migration, MigrationKind};

  // 数据库迁移（§11）。版本号单调递增，后续新增迁移在此追加。
  let migrations = vec![Migration {
    version: 1,
    description: "init schema",
    sql: include_str!("../migrations/0001_init.sql"),
    kind: MigrationKind::Up,
  }];

  tauri::Builder::default()
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:banlea.db", migrations)
        .build(),
    )
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
