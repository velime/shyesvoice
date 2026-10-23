//! SAPI 5 engine. All COM objects live on one dedicated STA thread; the UI talks to it over channels.
use crate::intonation::Style;
use std::sync::mpsc::{channel, Receiver, Sender};
use windows::core::{w, Interface, PCWSTR, PWSTR};
use windows::Win32::Media::Speech::*;
use windows::Win32::System::Com::*;

const SPF_ASYNC: u32 = 1;
const SPF_PURGE_BEFORE_SPEAK: u32 = 2;
const SPF_IS_XML: u32 = 8;
const VOICES_CATEGORY: PCWSTR = w!("HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices");
const OUTPUT_CATEGORY: PCWSTR = w!("HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\AudioOutput");

#[derive(Clone, PartialEq)]
pub struct VoiceInfo {
    pub id: String,
    pub name: String,
    pub language: String,
}

#[derive(Clone, PartialEq)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
}

pub struct SpeechRequest {
    pub text: String,
    pub voice_id: Option<String>,
    pub output_id: Option<String>,
    pub monitor_id: Option<String>,
    pub volume: i32,
    pub rate: i32,
    pub pitch: i32,
    pub style: Style,
}

pub enum Cmd {
    Refresh,
    Speak(SpeechRequest),
    Stop,
    /// Recreate the SAPI objects, e.g. after Windows Audio was restarted.
    Reset,
    Quit,
}

pub enum Evt {
    Voices(Vec<VoiceInfo>),
    Outputs(Vec<DeviceInfo>),
    Error(String),
}

pub struct Tts {
    tx: Sender<Cmd>,
    pub rx: Receiver<Evt>,
}

impl Tts {
    pub fn start(ctx: eframe::egui::Context) -> Self {
        let (tx, cmd_rx) = channel();
        let (evt_tx, rx) = channel();
        std::thread::Builder::new()
            .name("kava-sapi".into())
            .spawn(move || worker(cmd_rx, evt_tx, ctx))
            .expect("spawn SAPI thread");
        Self { tx, rx }
    }

    pub fn send(&self, cmd: Cmd) {
        let _ = self.tx.send(cmd);
    }
}

#[derive(Default, Clone, PartialEq)]
struct Applied {
    voice: Option<String>,
    output: Option<String>,
}

struct Engine {
    primary: ISpVoice,
    monitor: ISpVoice,
    voices: Vec<(String, ISpObjectToken)>,
    outputs: Vec<(String, ISpObjectToken)>,
    primary_applied: Applied,
    monitor_applied: Applied,
}

fn worker(rx: Receiver<Cmd>, tx: Sender<Evt>, ctx: eframe::egui::Context) {
    let send = |evt: Evt| {
        if let Evt::Error(message) = &evt {
            log_error(message);
        }
        let _ = tx.send(evt);
        ctx.request_repaint();
    };
    unsafe {
        if let Err(e) = CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok() {
            send(Evt::Error(format!("COM: {e}")));
            return;
        }
    }
    let mut engine = match Engine::new() {
        Ok(e) => Some(e),
        Err(e) => {
            send(Evt::Error(format!("SAPI: {e}")));
            None
        }
    };

    for cmd in rx {
        // A panic or SAPI error must never kill the worker: report it and keep serving commands.
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<(), String> {
            match cmd {
                Cmd::Quit => return Err(String::new()),
                Cmd::Reset => {
                    engine = None;
                    engine = Some(Engine::new().map_err(|e| e.to_string())?);
                    refresh(engine.as_mut().unwrap(), &send);
                }
                other => {
                    if engine.is_none() {
                        // Startup failed earlier (e.g. SAPI not ready yet): try again on demand.
                        let mut fresh = Engine::new().map_err(|e| e.to_string())?;
                        refresh(&mut fresh, &send);
                        engine = Some(fresh);
                    }
                    let e = engine.as_mut().unwrap();
                    match other {
                        Cmd::Refresh => refresh(e, &send),
                        Cmd::Speak(req) => {
                            if let Err(err) = e.speak(&req) {
                                e.primary_applied = Applied::default();
                                e.monitor_applied = Applied::default();
                                return Err(err);
                            }
                        }
                        Cmd::Stop => e.stop(),
                        Cmd::Reset | Cmd::Quit => {}
                    }
                }
            }
            Ok(())
        }));
        match result {
            Ok(Ok(())) => {}
            Ok(Err(msg)) if msg.is_empty() => break,
            Ok(Err(msg)) => send(Evt::Error(format!("SAPI: {msg}"))),
            Err(_) => send(Evt::Error("SAPI: внутренняя ошибка движка".into())),
        }
    }
    if let Some(e) = engine.as_ref() {
        e.stop();
    }
    drop(engine);
    unsafe { CoUninitialize() };
}

/// Appends to %LOCALAPPDATA%\KavaTts\error.log so a failure can be reported with its exact code.
fn log_error(message: &str) {
    use std::io::Write;
    let Some(base) = std::env::var_os("LOCALAPPDATA") else { return };
    let dir = std::path::Path::new(&base).join("KavaTts");
    let _ = std::fs::create_dir_all(&dir);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(dir.join("error.log")) {
        let secs = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let _ = writeln!(f, "[{secs}] {message}");
    }
}

fn refresh(engine: &mut Engine, send: &impl Fn(Evt)) {
    match enum_tokens(VOICES_CATEGORY) {
        Ok(list) => {
            let infos = list
                .iter()
                .map(|(id, name, lang, _)| VoiceInfo { id: id.clone(), name: name.clone(), language: lang.clone() })
                .collect();
            engine.voices = list.into_iter().map(|(id, _, _, t)| (id, t)).collect();
            send(Evt::Voices(infos));
        }
        Err(e) => send(Evt::Error(format!("SAPI voices: {e}"))),
    }
    match enum_tokens(OUTPUT_CATEGORY) {
        Ok(list) => {
            let infos = list.iter().map(|(id, name, _, _)| DeviceInfo { id: id.clone(), name: name.clone() }).collect();
            engine.outputs = list.into_iter().map(|(id, _, _, t)| (id, t)).collect();
            send(Evt::Outputs(infos));
        }
        Err(e) => send(Evt::Error(format!("SAPI outputs: {e}"))),
    }
}

fn pwstr_to_string(p: PWSTR) -> String {
    if p.is_null() {
        return String::new();
    }
    let s = unsafe { p.to_string().unwrap_or_default() };
    unsafe { CoTaskMemFree(Some(p.0 as _)) };
    s
}

fn string_value(token: &ISpObjectToken, name: PCWSTR) -> String {
    unsafe { token.GetStringValue(name) }.map(pwstr_to_string).unwrap_or_default()
}

fn language_of(token: &ISpObjectToken) -> String {
    let Ok(attrs) = (unsafe { token.OpenKey(w!("Attributes")) }) else { return String::new() };
    let raw = unsafe { attrs.GetStringValue(w!("Language")) }.map(pwstr_to_string).unwrap_or_default();
    // "419" or "409;9": the first hex LCID, low 10 bits are the primary language.
    let lcid = raw.split(';').next().and_then(|h| u32::from_str_radix(h.trim(), 16).ok());
    match lcid.map(|l| l & 0x3ff) {
        Some(0x19) => "ru-RU".into(),
        Some(0x09) => "en-US".into(),
        _ => raw,
    }
}

type TokenEntry = (String, String, String, ISpObjectToken);

fn enum_tokens(category_id: PCWSTR) -> windows::core::Result<Vec<TokenEntry>> {
    unsafe {
        let category: ISpObjectTokenCategory = CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_ALL)?;
        category.SetId(category_id, false)?;
        let tokens = category.EnumTokens(PCWSTR::null(), PCWSTR::null())?;
        let mut count = 0u32;
        tokens.GetCount(&mut count)?;
        let mut result = Vec::new();
        for i in 0..count {
            let token = tokens.Item(i)?;
            let id = token.GetId().map(pwstr_to_string)?;
            let mut name = string_value(&token, PCWSTR::null());
            if name.is_empty() {
                name = id.rsplit('\\').next().unwrap_or(&id).to_string();
            }
            let language = language_of(&token);
            result.push((id, name, language, token));
        }
        Ok(result)
    }
}

/// "SetVoice: Класс не зарегистрирован (0x80040154)": which SAPI call failed and with what code.
fn step(name: &str, e: &windows::core::Error) -> String {
    format!("{name}: {} (0x{:08X})", e.message().trim(), e.code().0 as u32)
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Drops characters that are illegal in XML 1.0 (control chars, noncharacters).
/// Rust strings can't hold lone surrogates, so only the control range needs filtering.
fn sanitize(text: &str) -> String {
    text.chars()
        .filter(|&c| matches!(c, '\t' | '\n' | '\r') || (c >= ' ' && c != '\u{FFFE}' && c != '\u{FFFF}'))
        .collect::<String>()
        .trim()
        .to_string()
}

fn escape_xml(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

fn signed(v: i32) -> String {
    if v > 0 { format!("+{v}") } else { v.to_string() }
}

/// Returns the text to speak and the extra SAPI flags.
fn build_speech(text: &str, style: Style, base_pitch: i32) -> (String, u32) {
    let base_pitch = base_pitch.clamp(-10, 10);
    if style == Style::Normal && base_pitch == 0 {
        return (text.to_string(), 0);
    }
    let (offset, range, rate, volume, emph) = match style {
        Style::Shout => (4, 2, 2, 100, true),
        Style::Sad => (-4, -2, -2, 78, false),
        Style::Whisper => (-1, -5, -3, 42, false),
        Style::Question => (2, 3, 0, 100, false),
        Style::Cheerful => (3, 2, 1, 95, false),
        Style::Normal => (0, 0, 0, 100, false),
    };
    let pitch = (base_pitch + offset).clamp(-10, 10);
    let escaped = escape_xml(text);
    let content = if emph { format!("<emph>{escaped}</emph>") } else { escaped };
    let xml = format!(
        "<pitch middle='{}' range='{}'><rate speed='{}'><volume level='{volume}'>{content}</volume></rate></pitch>",
        signed(pitch),
        signed(range),
        signed(rate)
    );
    (xml, SPF_IS_XML)
}

impl Engine {
    fn new() -> windows::core::Result<Self> {
        let mut engine = unsafe {
            Self {
                primary: CoCreateInstance(&SpVoice, None, CLSCTX_ALL)?,
                monitor: CoCreateInstance(&SpVoice, None, CLSCTX_ALL)?,
                voices: Vec::new(),
                outputs: Vec::new(),
                primary_applied: Applied::default(),
                monitor_applied: Applied::default(),
            }
        };
        // Tokens must be known before the first Speak.
        engine.voices = enum_tokens(VOICES_CATEGORY)?.into_iter().map(|(i, _, _, t)| (i, t)).collect();
        engine.outputs = enum_tokens(OUTPUT_CATEGORY)?.into_iter().map(|(i, _, _, t)| (i, t)).collect();
        Ok(engine)
    }

    fn speak(&mut self, req: &SpeechRequest) -> Result<(), String> {
        let text = sanitize(&req.text);
        if text.is_empty() {
            return Ok(());
        }
        // Stop playback before touching tokens: swapping the voice engine under a running
        // async utterance is what made IVONA fall over at high pitch.
        purge(&self.primary);
        purge(&self.monitor);

        let (speech, flags) = build_speech(&text, req.style, req.pitch);
        let speech = wide(&speech);

        configure(
            &self.primary,
            &mut self.primary_applied,
            &self.voices,
            &self.outputs,
            req.voice_id.as_deref(),
            req.output_id.as_deref(),
            req.volume,
            req.rate,
        )?;
        unsafe {
            self.primary
                .Speak(PCWSTR(speech.as_ptr()), SPF_ASYNC | SPF_PURGE_BEFORE_SPEAK | flags, None)
                .map_err(|e| step("Speak", &e))?;
        }

        if let Some(m) = req.monitor_id.as_deref().filter(|m| !m.is_empty() && Some(*m) != req.output_id.as_deref()) {
            configure(
                &self.monitor,
                &mut self.monitor_applied,
                &self.voices,
                &self.outputs,
                req.voice_id.as_deref(),
                Some(m),
                req.volume,
                req.rate,
            )?;
            unsafe {
                self.monitor
                    .Speak(PCWSTR(speech.as_ptr()), SPF_ASYNC | SPF_PURGE_BEFORE_SPEAK | flags, None)
                    .map_err(|e| step("Speak", &e))?;
            }
        }
        Ok(())
    }

    fn stop(&self) {
        purge(&self.primary);
        purge(&self.monitor);
    }
}

fn purge(voice: &ISpVoice) {
    // SAPI can reject an empty stream while shutting down; nothing to do about it.
    let _ = unsafe { voice.Speak(w!(""), SPF_ASYNC | SPF_PURGE_BEFORE_SPEAK, None) };
}

#[allow(clippy::too_many_arguments)]
fn configure(
    voice: &ISpVoice,
    applied: &mut Applied,
    voices: &[(String, ISpObjectToken)],
    outputs: &[(String, ISpObjectToken)],
    voice_id: Option<&str>,
    output_id: Option<&str>,
    volume: i32,
    rate: i32,
) -> Result<(), String> {
    unsafe {
        voice.SetVolume(volume.clamp(0, 100) as u16).map_err(|e| step("SetVolume", &e))?;
        voice.SetRate(rate.clamp(-10, 10)).map_err(|e| step("SetRate", &e))?;

        // Re-selecting a token reloads the engine; only do it when it actually changed.
        if let Some(id) = voice_id.filter(|id| applied.voice.as_deref() != Some(*id)) {
            applied.voice = None;
            if let Some((_, token)) = voices.iter().find(|(i, _)| i.eq_ignore_ascii_case(id)) {
                voice.SetVoice(token).map_err(|e| step("SetVoice", &e))?;
                applied.voice = Some(id.to_string());
            }
        }
        if let Some(id) = output_id.filter(|id| applied.output.as_deref() != Some(*id)) {
            applied.output = None;
            if let Some((_, token)) = outputs.iter().find(|(i, _)| i.eq_ignore_ascii_case(id)) {
                let unknown: windows::core::IUnknown = token.cast().map_err(|e| step("Output token", &e))?;
                voice.SetOutput(&unknown, true).map_err(|e| step("SetOutput", &e))?;
                applied.output = Some(id.to_string());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn speech_xml_is_escaped_and_clamped() {
        let (xml, flags) = build_speech("a<b & c", Style::Shout, 10);
        assert_eq!(flags, SPF_IS_XML);
        assert!(xml.contains("a&lt;b &amp; c"));
        assert!(xml.contains("middle='+10'"));
        assert_eq!(build_speech("hi", Style::Normal, 0), ("hi".to_string(), 0));
    }

    #[test]
    fn sanitize_strips_control_chars() {
        assert_eq!(sanitize("a\u{1}b\u{7}c "), "abc");
    }

    /// Every installed voice on every output device, silent. Prints what fails.
    #[test]
    #[ignore]
    fn all_voices_on_all_outputs() {
        use std::time::{Duration, Instant};
        let tts = Tts::start(eframe::egui::Context::default());
        tts.send(Cmd::Refresh);
        let (mut voices, mut outputs) = (Vec::new(), Vec::new());
        let deadline = Instant::now() + Duration::from_secs(10);
        while (voices.is_empty() || outputs.is_empty()) && Instant::now() < deadline {
            match tts.rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Evt::Voices(v)) => voices = v,
                Ok(Evt::Outputs(o)) => outputs = o,
                _ => {}
            }
        }
        for v in &voices {
            for o in &outputs {
                println!("{} -> {}", v.name, o.name);
                tts.send(Cmd::Speak(SpeechRequest {
                    text: "тест".into(),
                    voice_id: Some(v.id.clone()),
                    output_id: Some(o.id.clone()),
                    monitor_id: None,
                    volume: 0,
                    rate: 0,
                    pitch: 5,
                    style: Style::Normal,
                }));
                std::thread::sleep(Duration::from_millis(300));
                for e in tts.rx.try_iter() {
                    if let Evt::Error(m) = e {
                        println!("   ERROR: {m}");
                    }
                }
            }
        }
        tts.send(Cmd::Quit);
    }

    /// Needs a real SAPI voice; run with `cargo test -- --ignored`. Volume 0, so it is silent.
    #[test]
    #[ignore]
    fn rapid_high_pitch_speech_does_not_fail() {
        use std::time::{Duration, Instant};
        let tts = Tts::start(eframe::egui::Context::default());
        tts.send(Cmd::Refresh);
        let mut voice = None;
        let mut output = None;
        let deadline = Instant::now() + Duration::from_secs(10);
        while (voice.is_none() || output.is_none()) && Instant::now() < deadline {
            match tts.rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Evt::Voices(v)) => voice = v.first().map(|v| v.id.clone()),
                Ok(Evt::Outputs(o)) => output = o.first().map(|d| d.id.clone()),
                Ok(Evt::Error(e)) => panic!("{e}"),
                Err(_) => {}
            }
        }
        let voice = voice.expect("no SAPI voice installed");
        let output = output.expect("no audio output");
        let styles = [Style::Normal, Style::Shout, Style::Sad, Style::Whisper, Style::Question, Style::Cheerful];
        for i in 0..60i32 {
            tts.send(Cmd::Speak(SpeechRequest {
                text: format!("Привет <мир> & \u{1}тест {i}!"),
                voice_id: Some(voice.clone()),
                output_id: Some(output.clone()),
                monitor_id: Some(output.clone()),
                volume: 0,
                rate: (i % 21) - 10,
                pitch: 10,
                style: styles[i as usize % styles.len()],
            }));
        }
        tts.send(Cmd::Stop);
        tts.send(Cmd::Reset);
        std::thread::sleep(Duration::from_secs(2));
        let errors: Vec<String> =
            tts.rx.try_iter().filter_map(|e| if let Evt::Error(m) = e { Some(m) } else { None }).collect();
        assert!(errors.is_empty(), "{errors:?}");
        tts.send(Cmd::Quit);
    }
}
