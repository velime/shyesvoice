//! Global hotkeys. RegisterHotKey needs a message queue, so one thread owns registration and pumps messages.
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::Duration;
use windows::Win32::UI::Input::KeyboardAndMouse::*;
use windows::Win32::UI::WindowsAndMessaging::{PeekMessageW, MSG, PM_REMOVE, WM_HOTKEY};

pub enum Cmd {
    /// Replace all registrations with (id, "Ctrl+Alt+Space") pairs.
    Set(Vec<(i32, String)>),
    Quit,
}

pub struct Hotkeys {
    tx: Sender<Cmd>,
    /// Ids of pressed hotkeys.
    pub pressed: Receiver<i32>,
    /// One error line per hotkey that could not be registered, sent after every `Set`.
    pub errors: Receiver<Vec<String>>,
}

impl Hotkeys {
    pub fn start(ctx: eframe::egui::Context) -> Self {
        let (tx, cmd_rx) = channel();
        let (pressed_tx, pressed) = channel();
        let (err_tx, errors) = channel();
        std::thread::Builder::new()
            .name("kava-hotkeys".into())
            .spawn(move || worker(cmd_rx, pressed_tx, err_tx, ctx))
            .expect("spawn hotkey thread");
        Self { tx, pressed, errors }
    }

    pub fn set(&self, list: Vec<(i32, String)>) {
        let _ = self.tx.send(Cmd::Set(list));
    }

    pub fn quit(&self) {
        let _ = self.tx.send(Cmd::Quit);
    }
}

fn worker(rx: Receiver<Cmd>, pressed: Sender<i32>, errors: Sender<Vec<String>>, ctx: eframe::egui::Context) {
    let mut registered: Vec<i32> = Vec::new();
    loop {
        while let Ok(cmd) = rx.try_recv() {
            match cmd {
                Cmd::Quit => {
                    for id in registered.drain(..) {
                        let _ = unsafe { UnregisterHotKey(None, id) };
                    }
                    return;
                }
                Cmd::Set(list) => {
                    for id in registered.drain(..) {
                        let _ = unsafe { UnregisterHotKey(None, id) };
                    }
                    let mut problems = Vec::new();
                    for (id, text) in list {
                        match parse(&text) {
                            Ok((mods, vk)) => {
                                let mods = HOT_KEY_MODIFIERS(mods | MOD_NOREPEAT.0);
                                match unsafe { RegisterHotKey(None, id, mods, vk) } {
                                    Ok(()) => registered.push(id),
                                    Err(_) => problems.push(format!("{text}: клавиши заняты другим приложением")),
                                }
                            }
                            Err(e) => problems.push(format!("{text}: {e}")),
                        }
                    }
                    let _ = errors.send(problems);
                    ctx.request_repaint();
                }
            }
        }

        let mut msg = MSG::default();
        while unsafe { PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE) }.as_bool() {
            if msg.message == WM_HOTKEY {
                let _ = pressed.send(msg.wParam.0 as i32);
                ctx.request_repaint();
            }
        }
        std::thread::sleep(Duration::from_millis(15));
    }
}

/// "Ctrl+Alt+Space" -> (modifier flags, virtual key). Plain letters and digits need a modifier,
/// otherwise the hotkey would swallow normal typing system-wide.
pub fn parse(text: &str) -> Result<(u32, u32), String> {
    let mut mods = 0u32;
    let mut key: Option<(u32, bool)> = None; // (vk, needs a modifier)
    for part in text.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= MOD_CONTROL.0,
            "alt" => mods |= MOD_ALT.0,
            "shift" => mods |= MOD_SHIFT.0,
            "win" | "windows" => mods |= MOD_WIN.0,
            other => {
                if key.is_some() {
                    return Err("можно назначить только одну основную клавишу".into());
                }
                key = Some(key_code(other).ok_or_else(|| format!("неизвестная клавиша «{part}»"))?);
            }
        }
    }
    let (vk, needs_mod) = key.ok_or("не выбрана клавиша")?;
    if needs_mod && mods == 0 {
        return Err("для буквы или цифры нужен Ctrl, Alt, Shift или Win".into());
    }
    Ok((mods, vk))
}

fn key_code(name: &str) -> Option<(u32, bool)> {
    let b = name.as_bytes();
    if b.len() == 1 && b[0].is_ascii_lowercase() {
        return Some((b[0].to_ascii_uppercase() as u32, true));
    }
    if b.len() == 1 && b[0].is_ascii_digit() {
        return Some((b[0] as u32, true));
    }
    if let Some(n) = name.strip_prefix('f').and_then(|n| n.parse::<u32>().ok()) {
        if (1..=24).contains(&n) {
            return Some((VK_F1.0 as u32 + n - 1, false));
        }
    }
    if let Some(n) = name.strip_prefix("num").and_then(|n| n.parse::<u32>().ok()) {
        if n <= 9 {
            return Some((VK_NUMPAD0.0 as u32 + n, false));
        }
    }
    let vk = match name {
        "space" => VK_SPACE,
        "enter" | "return" => VK_RETURN,
        "tab" => VK_TAB,
        "backspace" => VK_BACK,
        "insert" => VK_INSERT,
        "delete" => VK_DELETE,
        "home" => VK_HOME,
        "end" => VK_END,
        "pageup" => VK_PRIOR,
        "pagedown" => VK_NEXT,
        "up" => VK_UP,
        "down" => VK_DOWN,
        "left" => VK_LEFT,
        "right" => VK_RIGHT,
        _ => return None,
    };
    Some((vk.0 as u32, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_combos() {
        assert_eq!(parse("Ctrl+Alt+Space"), Ok((MOD_CONTROL.0 | MOD_ALT.0, VK_SPACE.0 as u32)));
        assert!(parse("A").is_err());
        assert!(parse("F5").is_ok());
        assert!(parse("Ctrl+A+B").is_err());
    }
}
