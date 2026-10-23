use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Same file and field names as the C# build, so existing settings keep working.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "PascalCase", default)]
pub struct Settings {
    pub voice_id: Option<String>,
    pub output_device_id: Option<String>,
    pub monitor_device_id: Option<String>,
    pub monitor_enabled: bool,
    pub volume: i32,
    pub rate: i32,
    pub pitch: i32,
    pub clear_after_speak: bool,
    pub always_on_top: bool,
    pub smart_intonation: bool,
    pub focus_hotkey: String,
    pub repeat_hotkey: String,
    pub history: Vec<String>,
    pub phrase_bindings: Vec<PhraseBinding>,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "PascalCase", default)]
pub struct PhraseBinding {
    pub id: String,
    pub text: String,
    pub hotkey: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            voice_id: None,
            output_device_id: None,
            monitor_device_id: None,
            monitor_enabled: false,
            volume: 100,
            rate: 0,
            pitch: 0,
            clear_after_speak: true,
            always_on_top: false,
            smart_intonation: true,
            focus_hotkey: "Ctrl+Alt+Space".into(),
            repeat_hotkey: "Ctrl+Alt+R".into(),
            history: Vec::new(),
            phrase_bindings: Vec::new(),
        }
    }
}

impl Default for PhraseBinding {
    fn default() -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        Self { id: format!("{nanos:x}"), text: String::new(), hotkey: String::new() }
    }
}

fn path() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("KavaTts").join("settings.json")
}

pub fn load() -> Settings {
    let mut s: Settings = std::fs::read_to_string(path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default();
    s.volume = s.volume.clamp(0, 100);
    s.rate = s.rate.clamp(-10, 10);
    s.pitch = s.pitch.clamp(-10, 10);
    s
}

pub fn save(s: &Settings) -> Result<(), String> {
    let p = path();
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &p).map_err(|e| e.to_string())
}
