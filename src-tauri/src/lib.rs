mod workstation;

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use workstation::{
    detect_workstation_root, ensure_workstation, list_tasks as scan_tasks, open_path, resolve_open_path,
    submit_task as write_task, AppSettings, DetectResult, IncomingFile, OpenTarget, Task,
};

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> AppSettings {
    let Ok(path) = settings_path(app) else {
        return AppSettings::default();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn persist_settings(app: &AppHandle, settings: &AppSettings) -> Result<AppSettings, String> {
    let path = settings_path(app)?;
    let mut next = settings.clone();
    if next.poll_ms < 1500 {
        next.poll_ms = 4000;
    }
    next.poll_ms = next.poll_ms.min(30_000);
    if next.theme != "light" && next.theme != "dark" {
        next.theme = "system".into();
    }
    fs::write(path, serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    Ok(next)
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
}

#[tauri::command]
fn detect_root(app: AppHandle) -> DetectResult {
    let settings = load_settings(&app);
    detect_workstation_root(exe_dir(), &settings.workstation_root)
}

#[tauri::command]
fn get_settings(app: AppHandle) -> AppSettings {
    let mut settings = load_settings(&app);
    if settings.workstation_root.is_empty() {
        if let Some(root) = detect_workstation_root(exe_dir(), "").root {
            settings.workstation_root = root;
        }
    }
    settings
}

#[tauri::command]
fn save_settings(app: AppHandle, settings: AppSettings) -> Result<AppSettings, String> {
    persist_settings(&app, &settings)
}

#[tauri::command]
fn ensure_root(root: String) -> Result<serde_json::Value, String> {
    let path = ensure_workstation(&PathBuf::from(root))?;
    Ok(serde_json::json!({ "root": path.to_string_lossy() }))
}

#[tauri::command]
fn list_tasks(root: String) -> Result<Vec<Task>, String> {
    Ok(scan_tasks(&PathBuf::from(root)))
}

#[tauri::command]
fn submit_task(
    root: String,
    text: String,
    short_name: String,
    operator: String,
    files: Vec<IncomingFile>,
    date: Option<String>,
) -> Result<Task, String> {
    write_task(
        &PathBuf::from(root),
        &text,
        &short_name,
        &operator,
        &files,
        date.as_deref(),
    )
}

#[tauri::command]
fn open_folder(root: String, target: OpenTarget) -> Result<(), String> {
    let path = resolve_open_path(&PathBuf::from(root), &target);
    open_path(&path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            detect_root,
            get_settings,
            save_settings,
            ensure_root,
            list_tasks,
            submit_task,
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("启动水务AI聊天壳失败");
}
