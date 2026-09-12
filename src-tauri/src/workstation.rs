use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const INPUT_DIR: &str = "01_待处理任务_INPUT";
pub const OUTPUT_DIR: &str = "02_已完成交付_OUTPUT";
pub const ARCHIVE_DIR: &str = "03_历史归档_ARCHIVE";
pub const STAGING_DIR: &str = ".shuiwu-tmp";
pub const DEMAND_FILE: &str = "需求.txt";
pub const DELIVERY_NOTE_FILE: &str = "交付说明.txt";

fn default_theme() -> String {
    "system".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub workstation_root: String,
    pub operator: String,
    pub poll_ms: u64,
    #[serde(default = "default_theme")]
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            workstation_root: String::new(),
            operator: String::new(),
            poll_ms: 4000,
            theme: default_theme(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectResult {
    pub ok: bool,
    pub root: Option<String>,
    pub source: String,
    pub candidates: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    pub name: String,
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub folder_name: String,
    pub date: String,
    pub seq: Option<u32>,
    pub short_name: String,
    pub operator: String,
    pub demand: String,
    pub attachments: Vec<FileItem>,
    pub outputs: Vec<FileItem>,
    pub delivery_note: String,
    pub status: String,
    pub created_at: u128,
    pub delivered_at: Option<u128>,
    pub in_input: bool,
    pub in_output: bool,
    pub in_archive: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingFile {
    pub name: String,
    #[serde(default)]
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTarget {
    pub kind: String,
    pub folder_name: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedFolder {
    pub date: String,
    pub seq: Option<u32>,
    pub short_name: String,
    pub operator: String,
}

pub fn sanitize_segment(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '\n' | '\r' | '\t'))
        .collect();
    cleaned.trim().trim_start_matches('.').trim().to_string()
}

pub fn format_date() -> String {
    // 正式路径由前端传入工作站本地日期；此处仅作兜底（UTC）
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = now / 86400;
    let z = days as i64 + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}{:02}{:02}", y, m, d)
}

pub fn build_task_folder_name(
    date: &str,
    seq: Option<u32>,
    short_name: &str,
    operator: &str,
) -> Result<String, String> {
    let s = sanitize_segment(short_name);
    let o = sanitize_segment(operator);
    if s.is_empty() {
        return Err("简称不能为空".into());
    }
    if o.is_empty() {
        return Err("操作人不能为空".into());
    }
    if date.len() != 8 || !date.chars().all(|c| c.is_ascii_digit()) {
        return Err("日期格式应为 YYYYMMDD".into());
    }
    Ok(match seq {
        Some(n) if n > 1 => format!("{date}_{n}_{s}_{o}"),
        _ => format!("{date}_{s}_{o}"),
    })
}

pub fn parse_task_folder_name(name: &str) -> Option<ParsedFolder> {
    let bytes = name.as_bytes();
    if bytes.len() < 10 || !bytes[..8].iter().all(|b| b.is_ascii_digit()) || bytes[8] != b'_' {
        return None;
    }
    let rest = &name[9..];
    let parts: Vec<&str> = rest.split('_').collect();
    if parts.len() < 2 {
        return None;
    }
    if parts[0].chars().all(|c| c.is_ascii_digit()) && parts.len() >= 3 {
        let seq = parts[0].parse::<u32>().ok()?;
        let operator = (*parts.last()?).to_string();
        let short_name = parts[1..parts.len() - 1].join("_");
        return Some(ParsedFolder {
            date: name[..8].to_string(),
            seq: Some(seq),
            short_name,
            operator,
        });
    }
    let operator = (*parts.last()?).to_string();
    let short_name = parts[..parts.len() - 1].join("_");
    Some(ParsedFolder {
        date: name[..8].to_string(),
        seq: None,
        short_name,
        operator,
    })
}

pub fn next_task_folder_name(
    existing: &[String],
    short_name: &str,
    operator: &str,
    date: &str,
) -> Result<String, String> {
    let set: std::collections::HashSet<&String> = existing.iter().collect();
    let base = build_task_folder_name(date, None, short_name, operator)?;
    if !set.contains(&base) {
        return Ok(base);
    }
    let mut n = 2u32;
    loop {
        let name = build_task_folder_name(date, Some(n), short_name, operator)?;
        if !set.contains(&name) {
            return Ok(name);
        }
        n += 1;
    }
}

fn looks_like_workstation(root: &Path) -> bool {
    root.join(INPUT_DIR).exists()
}

fn walk_up(start: &Path, levels: usize) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut cur = start.to_path_buf();
    for _ in 0..levels {
        out.push(cur.clone());
        if let Some(parent) = cur.parent() {
            if parent == cur {
                break;
            }
            cur = parent.to_path_buf();
        } else {
            break;
        }
    }
    out
}

pub fn collect_candidates(exe_dir: Option<PathBuf>) -> Vec<PathBuf> {
    let mut list = Vec::new();
    if let Some(dir) = exe_dir {
        list.extend(walk_up(&dir, 4));
    }
    if let Ok(env_root) = std::env::var("SHUIWU_WORKSTATION") {
        list.push(PathBuf::from(env_root));
    }
    list.push(PathBuf::from("dev-workstation"));
    list.push(PathBuf::from(r"C:\Users\Administrator\Nutstore\1\我的坚果云\水务AI工作站"));
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        list.push(PathBuf::from(&home).join("Nutstore").join("1").join("我的坚果云").join("水务AI工作站"));
        list.push(PathBuf::from(&home).join("坚果云").join("水务AI工作站"));
        list.push(PathBuf::from(&home).join("Nutstore").join("水务AI工作站"));
    }
    if let Ok(user) = std::env::var("USERNAME").or_else(|_| std::env::var("USER")) {
        list.push(PathBuf::from(format!(
            r"C:\Users\{user}\Nutstore\1\我的坚果云\水务AI工作站"
        )));
    }
    list.push(PathBuf::from(r"D:\Nutstore\1\我的坚果云\水务AI工作站"));
    let mut seen = std::collections::HashSet::new();
    list.into_iter()
        .filter(|p| seen.insert(p.to_string_lossy().to_string()))
        .collect()
}

pub fn detect_workstation_root(exe_dir: Option<PathBuf>, preferred: &str) -> DetectResult {
    let candidates = collect_candidates(exe_dir.clone());
    let candidate_str: Vec<String> = candidates
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    if !preferred.is_empty() && looks_like_workstation(Path::new(preferred)) {
        return DetectResult {
            ok: true,
            root: Some(preferred.to_string()),
            source: "settings".into(),
            candidates: candidate_str,
        };
    }
    for item in &candidates {
        if looks_like_workstation(item) {
            let source = if exe_dir
                .as_ref()
                .is_some_and(|d| item.starts_with(d) || d.starts_with(item))
            {
                "exe-adjacent"
            } else {
                "well-known"
            };
            return DetectResult {
                ok: true,
                root: Some(item.to_string_lossy().to_string()),
                source: source.into(),
                candidates: candidate_str,
            };
        }
    }
    if !preferred.is_empty() && Path::new(preferred).exists() {
        return DetectResult {
            ok: true,
            root: Some(preferred.to_string()),
            source: "settings-empty".into(),
            candidates: candidate_str,
        };
    }
    DetectResult {
        ok: false,
        root: None,
        source: "unset".into(),
        candidates: candidate_str,
    }
}

pub fn ensure_workstation(root: &Path) -> Result<PathBuf, String> {
    fs::create_dir_all(root.join(INPUT_DIR)).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join(OUTPUT_DIR)).map_err(|e| e.to_string())?;
    fs::create_dir_all(root.join(ARCHIVE_DIR)).map_err(|e| e.to_string())?;
    Ok(root.to_path_buf())
}

fn is_skippable(name: &str) -> bool {
    if name.is_empty() || name == "." || name == ".." || name.starts_with('.') {
        return true;
    }
    let lower = name.to_ascii_lowercase();
    matches!(lower.as_str(), "thumbs.db" | "desktop.ini" | ".ds_store")
}

fn is_image_name(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| {
            matches!(
                e.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "tif" | "tiff"
            )
        })
        .unwrap_or(false)
}

fn list_subdirs(dir: &Path) -> Vec<String> {
    let Ok(rd) = fs::read_dir(dir) else {
        return vec![];
    };
    let mut names = Vec::new();
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if entry.path().is_dir() && !is_skippable(&name) && !name.starts_with(".shuiwu") && !name.starts_with(".staging")
        {
            names.push(name);
        }
    }
    names
}

fn read_text_if_exists(path: &Path) -> String {
    fs::read_to_string(path)
        .map(|s| s.trim_start_matches('\u{feff}').trim().to_string())
        .unwrap_or_default()
}

fn list_files(dir: &Path) -> Vec<FileItem> {
    let Ok(rd) = fs::read_dir(dir) else {
        return vec![];
    };
    let mut items = Vec::new();
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !entry.path().is_file() || is_skippable(&name) || name == DEMAND_FILE || name == DELIVERY_NOTE_FILE {
            continue;
        }
        items.push(FileItem {
            kind: if is_image_name(&name) {
                "image".into()
            } else {
                "file".into()
            },
            path: entry.path().to_string_lossy().to_string(),
            name,
        });
    }
    items.sort_by(|a, b| a.name.cmp(&b.name));
    items
}

fn mtime_ms(path: &Path) -> u128 {
    fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn latest_mtime(paths: &[&Path]) -> u128 {
    let mut latest = 0u128;
    for path in paths {
        let t = mtime_ms(path);
        if t > latest {
            latest = t;
        }
    }
    latest
}

fn delivery_time_ms(output_dir: &Path, archive_dir: &Path, outputs: &[FileItem], delivered: bool) -> Option<u128> {
    if !delivered {
        return None;
    }
    let note_out = output_dir.join(DELIVERY_NOTE_FILE);
    let note_arch = archive_dir.join(DELIVERY_NOTE_FILE);
    let mut latest = latest_mtime(&[&note_out, &note_arch, output_dir, archive_dir]);
    for item in outputs {
        latest = latest.max(mtime_ms(Path::new(&item.path)));
    }
    if latest == 0 {
        None
    } else {
        Some(latest)
    }
}

pub fn list_tasks(root: &Path) -> Vec<Task> {
    let input = root.join(INPUT_DIR);
    let output = root.join(OUTPUT_DIR);
    let archive = root.join(ARCHIVE_DIR);
    let input_names = list_subdirs(&input);
    let output_names = list_subdirs(&output);
    let archive_names = list_subdirs(&archive);
    let mut names = std::collections::BTreeSet::new();
    names.extend(input_names.iter().cloned());
    names.extend(output_names.iter().cloned());
    names.extend(archive_names.iter().cloned());

    let mut tasks = Vec::new();
    for folder_name in names {
        let in_input = input_names.iter().any(|n| n == &folder_name);
        let in_output = output_names.iter().any(|n| n == &folder_name);
        let in_archive = archive_names.iter().any(|n| n == &folder_name);
        let input_dir = input.join(&folder_name);
        let output_dir = output.join(&folder_name);
        let archive_dir = archive.join(&folder_name);
        let home = if in_input {
            &input_dir
        } else if in_output {
            &output_dir
        } else {
            &archive_dir
        };
        let parsed = parse_task_folder_name(&folder_name);
        let demand = {
            let a = read_text_if_exists(&input_dir.join(DEMAND_FILE));
            if !a.is_empty() {
                a
            } else {
                let b = read_text_if_exists(&output_dir.join(DEMAND_FILE));
                if !b.is_empty() {
                    b
                } else {
                    read_text_if_exists(&archive_dir.join(DEMAND_FILE))
                }
            }
        };
        let attachments = list_files(&input_dir);
        let outputs = if in_output {
            list_files(&output_dir)
        } else {
            list_files(&archive_dir)
        };
        let delivery_note = {
            let a = read_text_if_exists(&output_dir.join(DELIVERY_NOTE_FILE));
            if a.is_empty() {
                read_text_if_exists(&archive_dir.join(DELIVERY_NOTE_FILE))
            } else {
                a
            }
        };
        let delivered = outputs.iter().any(|f| f.kind == "image") || !delivery_note.is_empty();
        let status = if in_archive && !in_input && !in_output {
            "archived"
        } else if delivered {
            "delivered"
        } else {
            "processing"
        };
        let created_at = {
            let input_demand = input_dir.join(DEMAND_FILE);
            let output_demand = output_dir.join(DEMAND_FILE);
            let archive_demand = archive_dir.join(DEMAND_FILE);
            latest_mtime(&[&input_demand, &output_demand, &archive_demand, home])
        };
        let delivered_at = delivery_time_ms(&output_dir, &archive_dir, &outputs, delivered);
        tasks.push(Task {
            folder_name: folder_name.clone(),
            date: parsed.as_ref().map(|p| p.date.clone()).unwrap_or_default(),
            seq: parsed.as_ref().and_then(|p| p.seq),
            short_name: parsed
                .as_ref()
                .map(|p| p.short_name.clone())
                .unwrap_or_else(|| folder_name.clone()),
            operator: parsed.as_ref().map(|p| p.operator.clone()).unwrap_or_default(),
            demand,
            attachments,
            outputs,
            delivery_note,
            status: status.into(),
            created_at,
            delivered_at,
            in_input,
            in_output,
            in_archive,
        });
    }
    tasks.sort_by(|a, b| a.created_at.cmp(&b.created_at).then(a.folder_name.cmp(&b.folder_name)));
    tasks
}

fn unique_file_name(dir: &Path, name: &str) -> String {
    let safe = Path::new(name)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into())
        .replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], "_");
    if !dir.join(&safe).exists() {
        return safe;
    }
    let path = Path::new(&safe);
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let ext = path
        .extension()
        .map(|s| format!(".{}", s.to_string_lossy()))
        .unwrap_or_default();
    let mut i = 2;
    loop {
        let cand = format!("{stem}_{i}{ext}");
        if !dir.join(&cand).exists() {
            return cand;
        }
        i += 1;
    }
}

fn copy_dir(src: &Path, dest: &Path) -> io::Result<()> {
    fs::create_dir_all(dest)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let to = dest.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &to)?;
        } else {
            fs::copy(entry.path(), to)?;
        }
    }
    Ok(())
}

fn write_demand(path: &Path, text: &str) -> io::Result<()> {
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend(text.trim_start_matches('\u{feff}').as_bytes());
    let mut f = fs::File::create(path)?;
    f.write_all(&bytes)
}

pub fn submit_task(
    root: &Path,
    text: &str,
    short_name: &str,
    operator: &str,
    files: &[IncomingFile],
    date: Option<&str>,
) -> Result<Task, String> {
    let text = text.trim_start_matches('\u{feff}').trim();
    if text.is_empty() {
        return Err("请先填写需求".into());
    }
    let short_name = sanitize_segment(short_name);
    let operator = sanitize_segment(operator);
    if short_name.is_empty() {
        return Err("请填写项目简称".into());
    }
    if operator.is_empty() {
        return Err("请填写操作人".into());
    }
    let resolved = ensure_workstation(root)?;
    let input = resolved.join(INPUT_DIR);
    let mut existing = list_subdirs(&input);
    existing.extend(list_subdirs(&resolved.join(OUTPUT_DIR)));
    existing.extend(list_subdirs(&resolved.join(ARCHIVE_DIR)));
    let date = match date {
        Some(d) if d.len() == 8 && d.chars().all(|c| c.is_ascii_digit()) => d.to_string(),
        _ => format_date(),
    };
    let mut folder_name = next_task_folder_name(&existing, &short_name, &operator, &date)?;
    let staging_root = resolved.join(STAGING_DIR);
    fs::create_dir_all(&staging_root).map_err(|e| e.to_string())?;
    let staging = staging_root.join(Uuid::new_v4().to_string());
    fs::create_dir_all(&staging).map_err(|e| e.to_string())?;

    let cleanup_staging = |staging: &Path| {
        let _ = fs::remove_dir_all(staging);
    };

    if let Err(err) = write_demand(&staging.join(DEMAND_FILE), text) {
        cleanup_staging(&staging);
        return Err(err.to_string());
    }
    for file in files {
        if file.name.is_empty() || file.path.is_empty() {
            continue;
        }
        let dest_name = unique_file_name(&staging, &file.name);
        if let Err(err) = fs::copy(&file.path, staging.join(dest_name)) {
            cleanup_staging(&staging);
            return Err(format!("复制附件失败：{} ({err})", file.name));
        }
    }

    let mut dest = input.join(&folder_name);
    let mut published = false;
    for _ in 0..8 {
        if dest.exists() {
            existing = list_subdirs(&input);
            folder_name = next_task_folder_name(&existing, &short_name, &operator, &date)?;
            dest = input.join(&folder_name);
            continue;
        }
        match fs::rename(&staging, &dest) {
            Ok(()) => {
                published = true;
                break;
            }
            Err(err) if err.raw_os_error() == Some(18) || err.kind() == io::ErrorKind::AlreadyExists => {
                if dest.exists() {
                    existing = list_subdirs(&input);
                    folder_name = next_task_folder_name(&existing, &short_name, &operator, &date)?;
                    dest = input.join(&folder_name);
                    continue;
                }
                if let Err(copy_err) = copy_dir(&staging, &dest) {
                    cleanup_staging(&staging);
                    return Err(copy_err.to_string());
                }
                cleanup_staging(&staging);
                published = true;
                break;
            }
            Err(err) => {
                // EXDEV on unix is 18; try copy fallback
                if let Err(copy_err) = copy_dir(&staging, &dest) {
                    cleanup_staging(&staging);
                    return Err(format!("{err}; {copy_err}"));
                }
                cleanup_staging(&staging);
                published = true;
                break;
            }
        }
    }
    if !published {
        cleanup_staging(&staging);
        return Err("写入 INPUT 失败".into());
    }
    let _ = fs::remove_dir(&staging_root);
    list_tasks(&resolved)
        .into_iter()
        .find(|t| t.folder_name == folder_name)
        .ok_or_else(|| "任务已写入，但读取失败".into())
}

pub fn resolve_open_path(root: &Path, target: &OpenTarget) -> PathBuf {
    match target.kind.as_str() {
        "path" => PathBuf::from(target.path.clone().unwrap_or_default()),
        "input" => root.join(INPUT_DIR),
        "output" => root.join(OUTPUT_DIR),
        "archive" => root.join(ARCHIVE_DIR),
        "task-output" => {
            if let Some(name) = &target.folder_name {
                let out = root.join(OUTPUT_DIR).join(name);
                if out.exists() {
                    return out;
                }
                let arch = root.join(ARCHIVE_DIR).join(name);
                if arch.exists() {
                    return arch;
                }
                return root.join(OUTPUT_DIR);
            }
            root.join(OUTPUT_DIR)
        }
        _ => root.to_path_buf(),
    }
}

pub fn open_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("路径不存在：{}", path.display()));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn naming_plain_and_seq() {
        let first = next_task_folder_name(&[], "乐流泵房美化", "周雨琪", "20260910").unwrap();
        assert_eq!(first, "20260910_乐流泵房美化_周雨琪");
        let second = next_task_folder_name(&[first.clone()], "乐流泵房美化", "周雨琪", "20260910").unwrap();
        assert_eq!(second, "20260910_2_乐流泵房美化_周雨琪");
        let parsed = parse_task_folder_name("20260910_1_龚魁彦_示例项目").unwrap();
        assert_eq!(parsed.seq, Some(1));
        assert_eq!(parsed.short_name, "龚魁彦");
        assert_eq!(parsed.operator, "示例项目");
    }
}
