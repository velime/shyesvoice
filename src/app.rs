use crate::hotkeys::{self, Hotkeys};
use crate::intonation::{self, Style};
use crate::settings::{self, PhraseBinding, Settings};
use crate::theme::*;
use crate::tts::{Cmd, DeviceInfo, Evt, SpeechRequest, Tts, VoiceInfo};
use eframe::egui::{
    self, Align, Button, Frame, Id, Key, Layout, Margin, Modifiers, RichText, Sense, Slider, Stroke, TextEdit, Ui,
};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, Instant};

const FOCUS_ID: i32 = 1;
const REPEAT_ID: i32 = 2;
const PHRASE_BASE_ID: i32 = 100;
const INPUT_ID: &str = "tts-input";
const MAXIM_PAGE: &str = "https://harposoftware.com/en/voices-speech2go/122-s2g-en-maxim.html";

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Starting,
    Ready,
    Speaking,
    Error,
}

struct Status {
    kind: Kind,
    title: String,
    detail: String,
}

struct BindDialog {
    editing: Option<String>,
    text: String,
    hotkey: String,
    capturing: bool,
    error: String,
}

enum Action {
    Speak(String, bool),
    Repeat,
    Stop,
    OpenBind(Option<String>, String),
    DeleteBind(String),
    RestartAudio,
    Rehotkey,
    ClearHistory,
}

pub struct App {
    s: Settings,
    tts: Tts,
    hk: Hotkeys,
    voices: Vec<VoiceInfo>,
    outputs: Vec<DeviceInfo>,
    input: String,
    status: Status,
    hk_errors: Vec<String>,
    dirty_since: Option<Instant>,
    focus_input: bool,
    bind_dialog: Option<BindDialog>,
    audio_restart: Option<Receiver<Result<(), String>>>,
    shown_on_top: bool,
}

impl App {
    pub fn new(cc: &eframe::CreationContext<'_>) -> Self {
        apply_theme(&cc.egui_ctx);
        let s = settings::load();
        let tts = Tts::start(cc.egui_ctx.clone());
        let hk = Hotkeys::start(cc.egui_ctx.clone());
        tts.send(Cmd::Refresh);
        let mut app = Self {
            shown_on_top: s.always_on_top,
            s,
            tts,
            hk,
            voices: Vec::new(),
            outputs: Vec::new(),
            input: String::new(),
            status: Status { kind: Kind::Starting, title: "Запуск".into(), detail: "Ищу SAPI-голоса…".into() },
            hk_errors: Vec::new(),
            dirty_since: None,
            focus_input: true,
            bind_dialog: None,
            audio_restart: None,
        };
        app.register_hotkeys();
        app
    }

    fn dirty(&mut self) {
        if self.dirty_since.is_none() {
            self.dirty_since = Some(Instant::now());
        }
    }

    fn save_now(&mut self) {
        self.dirty_since = None;
        if let Err(e) = settings::save(&self.s) {
            self.set_error(format!("Настройки не сохранены: {e}"));
        }
    }

    fn set_error(&mut self, message: String) {
        self.status = Status { kind: Kind::Error, title: "Ошибка".into(), detail: message };
    }

    fn set_ready(&mut self) {
        let detail = self.voice_name().unwrap_or_else(|| "Локальный SAPI".into());
        self.status = if self.voices.is_empty() {
            Status { kind: Kind::Error, title: "Нет голосов".into(), detail: "SAPI-голоса не найдены".into() }
        } else {
            Status { kind: Kind::Ready, title: "Голос готов".into(), detail }
        };
    }

    fn voice_name(&self) -> Option<String> {
        let id = self.s.voice_id.as_deref()?;
        self.voices.iter().find(|v| v.id == id).map(|v| v.name.clone())
    }

    fn register_hotkeys(&mut self) {
        let mut list = vec![(FOCUS_ID, self.s.focus_hotkey.trim().to_string()), (REPEAT_ID, self.s.repeat_hotkey.trim().to_string())];
        for (i, b) in self.s.phrase_bindings.iter().enumerate() {
            list.push((PHRASE_BASE_ID + i as i32, b.hotkey.clone()));
        }
        self.hk.set(list);
    }

    // ---- events from the worker threads -------------------------------------------------

    fn poll(&mut self, ctx: &egui::Context) {
        while let Ok(evt) = self.tts.rx.try_recv() {
            match evt {
                Evt::Voices(list) => {
                    self.voices = list;
                    let current = self.s.voice_id.clone();
                    let valid = current.as_deref().is_some_and(|id| self.voices.iter().any(|v| v.id == id));
                    if !valid {
                        let pick = self
                            .voices
                            .iter()
                            .find(|v| v.name.to_lowercase().contains("ivona") && v.name.to_lowercase().contains("maxim"))
                            .or_else(|| self.voices.iter().find(|v| v.name.to_lowercase().contains("maxim")))
                            .or_else(|| self.voices.iter().find(|v| v.language.starts_with("ru")))
                            .or_else(|| self.voices.first());
                        self.s.voice_id = pick.map(|v| v.id.clone());
                        self.dirty();
                    }
                    self.set_ready();
                }
                Evt::Outputs(list) => {
                    self.outputs = list;
                    let out = restore_device(&self.outputs, self.s.output_device_id.as_deref(), &["cable input", "vb-audio"]);
                    let mon = restore_device(&self.outputs, self.s.monitor_device_id.as_deref(), &["headphones", "наушники"]);
                    if out != self.s.output_device_id || mon != self.s.monitor_device_id {
                        self.s.output_device_id = out;
                        self.s.monitor_device_id = mon;
                        self.dirty();
                    }
                }
                Evt::Error(message) => self.set_error(message),
            }
        }

        while let Ok(errors) = self.hk.errors.try_recv() {
            self.hk_errors = errors;
        }
        while let Ok(id) = self.hk.pressed.try_recv() {
            match id {
                FOCUS_ID => {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(false));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
                    self.focus_input = true;
                }
                REPEAT_ID => self.repeat_last(),
                id if id >= PHRASE_BASE_ID => {
                    if let Some(text) = self.s.phrase_bindings.get((id - PHRASE_BASE_ID) as usize).map(|b| b.text.clone()) {
                        self.speak(&text, false);
                    }
                }
                _ => {}
            }
        }

        if let Some(rx) = &self.audio_restart {
            match rx.try_recv() {
                Ok(result) => {
                    self.audio_restart = None;
                    self.tts.send(Cmd::Reset);
                    match result {
                        Ok(()) => {
                            self.set_ready();
                            self.status.detail = "Windows Audio перезапущен".into();
                        }
                        Err(e) => self.set_error(e),
                    }
                }
                Err(std::sync::mpsc::TryRecvError::Empty) => ctx.request_repaint_after(Duration::from_millis(200)),
                Err(_) => self.audio_restart = None,
            }
        }
    }

    // ---- actions -----------------------------------------------------------------------

    fn speak(&mut self, text: &str, clear_composer: bool) {
        let text = text.trim();
        if text.is_empty() {
            return;
        }
        let Some(voice_id) = self.s.voice_id.clone() else {
            self.set_error("В системе нет SAPI-голоса. Выберите голос справа.".into());
            return;
        };
        let style = if self.s.smart_intonation { intonation::detect(text) } else { Style::Normal };
        self.tts.send(Cmd::Speak(SpeechRequest {
            text: text.to_string(),
            voice_id: Some(voice_id),
            output_id: self.s.output_device_id.clone(),
            monitor_id: if self.s.monitor_enabled { self.s.monitor_device_id.clone() } else { None },
            volume: self.s.volume,
            rate: self.s.rate,
            pitch: self.s.pitch,
            style,
        }));

        self.s.history.retain(|h| h != text);
        self.s.history.insert(0, text.to_string());
        self.s.history.truncate(20);

        let preview: String = text.chars().take(28).collect();
        let ellipsis = if text.chars().count() > 28 { "…" } else { "" };
        self.status = Status { kind: Kind::Speaking, title: "В эфире".into(), detail: format!("{} · {preview}{ellipsis}", style.label()) };
        if clear_composer && self.s.clear_after_speak {
            self.input.clear();
        }
        self.dirty();
    }

    fn repeat_last(&mut self) {
        if let Some(last) = self.s.history.first().cloned() {
            self.speak(&last, false);
        }
    }

    fn restart_windows_audio(&mut self, ctx: &egui::Context) {
        if self.audio_restart.is_some() {
            return;
        }
        self.tts.send(Cmd::Stop);
        self.status = Status { kind: Kind::Starting, title: "Перезапуск Windows Audio…".into(), detail: "Подтвердите запрос UAC".into() };
        let (tx, rx) = channel();
        self.audio_restart = Some(rx);
        let ctx = ctx.clone();
        std::thread::spawn(move || {
            let _ = tx.send(run_audio_restart());
            ctx.request_repaint();
        });
    }

    fn do_action(&mut self, ctx: &egui::Context, action: Action) {
        match action {
            Action::Speak(text, clear) => self.speak(&text, clear),
            Action::Repeat => self.repeat_last(),
            Action::Stop => {
                self.tts.send(Cmd::Stop);
                self.set_ready();
                self.focus_input = true;
            }
            Action::OpenBind(editing, text) => {
                let hotkey = editing
                    .as_ref()
                    .and_then(|id| self.s.phrase_bindings.iter().find(|b| &b.id == id))
                    .map(|b| b.hotkey.clone())
                    .unwrap_or_default();
                self.bind_dialog = Some(BindDialog { editing, text, hotkey, capturing: false, error: String::new() });
            }
            Action::DeleteBind(id) => {
                self.s.phrase_bindings.retain(|b| b.id != id);
                self.register_hotkeys();
                self.dirty();
            }
            Action::RestartAudio => self.restart_windows_audio(ctx),
            Action::Rehotkey => {
                self.register_hotkeys();
                self.dirty();
            }
            Action::ClearHistory => {
                self.s.history.clear();
                self.dirty();
            }
        }
    }

    // ---- layout ------------------------------------------------------------------------

    fn header(&self, ui: &mut Ui) {
        ui.horizontal(|ui| {
            let (rect, _) = ui.allocate_exact_size(egui::vec2(42.0, 42.0), Sense::hover());
            ui.painter().rect_filled(rect, 12.0, TEXT);
            ui.painter().text(rect.center(), egui::Align2::CENTER_CENTER, "K", egui::FontId::proportional(22.0), COAL);
            ui.add_space(6.0);
            ui.vertical(|ui| {
                ui.spacing_mut().item_spacing.y = 1.0;
                ui.label(RichText::new("TTS Control").size(20.0).strong());
                ui.label(RichText::new(self.route_text()).size(12.0).color(MUTED));
            });
        });
    }

    fn route_text(&self) -> String {
        let name = |id: &Option<String>| id.as_deref().and_then(|id| self.outputs.iter().find(|d| d.id == id)).map(|d| d.name.clone());
        let output = name(&self.s.output_device_id).unwrap_or_else(|| "выход не выбран".into());
        match (self.s.monitor_enabled, name(&self.s.monitor_device_id)) {
            (true, Some(m)) => format!("{output}  ·  {m}"),
            _ => output,
        }
    }

    fn footer(&self, ui: &mut Ui) {
        ui.horizontal_centered(|ui| {
            let (rect, _) = ui.allocate_exact_size(egui::vec2(8.0, 8.0), Sense::hover());
            let color = match self.status.kind {
                Kind::Ready | Kind::Speaking => WHITE,
                Kind::Starting => MUTED,
                Kind::Error => egui::Color32::from_gray(0xC8),
            };
            if self.status.kind == Kind::Error {
                ui.painter().rect_stroke(rect, 4.0, Stroke::new(1.5, color), egui::StrokeKind::Inside);
            } else {
                ui.painter().circle_filled(rect.center(), 3.5, color);
            }
            ui.label(RichText::new(&self.status.title).size(12.0).color(color));
            ui.label(RichText::new("·").size(12.0).color(DIM));
            ui.label(RichText::new(&self.status.detail).size(12.0).color(MUTED));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.label(RichText::new("Windows Audio  ·  TTS Control v2.0").size(12.0).color(DIM));
            });
        });
    }

    fn main_column(&mut self, ui: &mut Ui, actions: &mut Vec<Action>) {
        // Composer
        card(ui, "ТЕКСТ В РЕЧЬ", |ui| {
            let edit = TextEdit::multiline(&mut self.input)
                .id(Id::new(INPUT_ID))
                .hint_text(RichText::new("Введите сообщение…  Enter — отправить, Shift+Enter — новая строка").color(DIM))
                .font(egui::FontId::proportional(21.0))
                .frame(Frame::NONE)
                .desired_rows(2)
                .desired_width(f32::INFINITY);
            let response = ui.add(edit);
            if self.focus_input {
                response.request_focus();
                self.focus_input = false;
            }
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label(RichText::new(self.input.chars().count().to_string()).size(12.0).color(MUTED));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if primary_button(ui, "Отправить  ↵").clicked() {
                        actions.push(Action::Speak(self.input.clone(), true));
                    }
                    if ui.add(Button::new("+  Создать бинд").min_size(egui::vec2(0.0, 36.0))).clicked() {
                        actions.push(Action::OpenBind(None, self.input.trim().to_string()));
                    }
                });
            });
        });

        ui.add_space(12.0);

        card(ui, "УПРАВЛЕНИЕ", |ui| {
            ui.columns(2, |cols| {
                if wide_button(&mut cols[0], "↻  Повторить").clicked() {
                    actions.push(Action::Repeat);
                }
                if wide_button(&mut cols[1], "■  Остановить").clicked() {
                    actions.push(Action::Stop);
                }
            });

            let rate_text = signed(self.s.rate);
            if slider_row(ui, "Скорость речи", &mut self.s.rate, -10..=10, rate_text) {
                self.dirty();
            }
            ui.horizontal(|ui| {
                let width = (ui.available_width() - 4.0 * ui.spacing().item_spacing.x) / 5.0;
                for (label, value) in [("−5", -5), ("−2", -2), ("0", 0), ("+2", 2), ("+5", 5)] {
                    let text = RichText::new(label).size(12.0).color(MUTED);
                    if ui.add(Button::new(text).min_size(egui::vec2(width, 28.0))).clicked() {
                        self.s.rate = value;
                        self.dirty();
                    }
                }
            });

            let volume_text = format!("{}%", self.s.volume);
            if slider_row(ui, "Громкость", &mut self.s.volume, 0..=100, volume_text) {
                self.dirty();
            }
            let pitch_text = signed(self.s.pitch);
            if slider_row(ui, "Тон", &mut self.s.pitch, -10..=10, pitch_text) {
                self.dirty();
            }

            ui.add_space(2.0);
            ui.horizontal_wrapped(|ui| {
                if ui.checkbox(&mut self.s.clear_after_speak, "Очищать после отправки").changed() {
                    self.dirty();
                }
                if ui.checkbox(&mut self.s.always_on_top, "Поверх остальных окон").changed() {
                    self.dirty();
                }
                let smart = ui
                    .checkbox(&mut self.s.smart_intonation, "Интонация по знакам")
                    .on_hover_text("! или КАПС — крик · ( — грусть · ... — тихо · ? — вопрос · ) — бодро");
                if smart.changed() {
                    self.dirty();
                }
            });
        });

        ui.add_space(12.0);

        let remaining = 200.0_f32;
        card(ui, "ИСТОРИЯ", |ui| {
            ui.set_min_height(remaining - 30.0);
            ui.horizontal(|ui| {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if self.s.history.is_empty() {
                        return;
                    }
                    if ui.add(Button::new(RichText::new("Очистить").size(12.0)).min_size(egui::vec2(0.0, 26.0))).clicked() {
                        actions.push(Action::ClearHistory);
                    }
                });
            });
            if self.s.history.is_empty() {
                ui.label(RichText::new("Здесь появятся последние фразы.").size(12.5).color(MUTED));
            }
            egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| {
                for text in &self.s.history {
                    let label = format!("▶   {text}");
                    let button = Button::new(RichText::new(truncate(&label, 90)).size(13.5))
                        .min_size(egui::vec2(ui.available_width(), 30.0))
                        .fill(egui::Color32::TRANSPARENT);
                    if ui.add(button).on_hover_text("Произнести снова").clicked() {
                        actions.push(Action::Speak(text.clone(), false));
                    }
                }
            });
        });
    }

    fn side_column(&mut self, ui: &mut Ui, actions: &mut Vec<Action>) {
        // Voice switcher
        card(ui, "ГОЛОС", |ui| {
            let items: Vec<(String, String)> = self.voices.iter().map(|v| (v.id.clone(), v.name.clone())).collect();
            if items.is_empty() {
                ui.label(RichText::new("SAPI-голоса не найдены").size(13.0).color(MUTED));
            } else if combo(ui, "voice-combo", &mut self.s.voice_id, &items) {
                self.dirty();
                self.set_ready();
            }
            let has_maxim = self.voices.iter().any(|v| v.name.to_lowercase().contains("maxim"));
            if !has_maxim {
                ui.horizontal(|ui| {
                    ui.label(RichText::new("IVONA Maxim не установлен").size(12.0).color(MUTED));
                    if ui.link(RichText::new("Установить").size(12.0)).clicked() {
                        ui.ctx().open_url(egui::OpenUrl::new_tab(MAXIM_PAGE));
                    }
                });
            }
        });

        ui.add_space(12.0);

        card(ui, "ВЫВОД ЗВУКА", |ui| {
            let items: Vec<(String, String)> = self.outputs.iter().map(|d| (d.id.clone(), d.name.clone())).collect();
            if combo(ui, "output-combo", &mut self.s.output_device_id, &items) {
                self.dirty();
            }

            let busy = self.audio_restart.is_some();
            let label = if busy { "Перезапускаю…" } else { "↻  Перезапустить Windows Audio" };
            let button = Button::new(label).min_size(egui::vec2(ui.available_width(), 36.0));
            if ui
                .add_enabled(!busy, button)
                .on_hover_text("Перезапускает службы Audiosrv и AudioEndpointBuilder. Нужны права администратора (запрос UAC).")
                .clicked()
            {
                actions.push(Action::RestartAudio);
            }

            if ui.checkbox(&mut self.s.monitor_enabled, "Слышать в наушниках").changed() {
                self.dirty();
            }
            ui.add_enabled_ui(self.s.monitor_enabled, |ui| {
                if combo(ui, "monitor-combo", &mut self.s.monitor_device_id, &items) {
                    self.dirty();
                }
            });
        });

        ui.add_space(12.0);

        card(ui, &format!("БИНДЫ  {}", self.s.phrase_bindings.len()), |ui| {
            ui.horizontal(|ui| {
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui.add(Button::new("+").min_size(egui::vec2(30.0, 28.0))).on_hover_text("Добавить бинд").clicked() {
                        actions.push(Action::OpenBind(None, String::new()));
                    }
                });
            });
            if self.s.phrase_bindings.is_empty() {
                ui.label(RichText::new("Создайте фразу и назначьте ей клавишу.").size(12.5).color(MUTED));
            }
            egui::ScrollArea::vertical().id_salt("binds").max_height(190.0).auto_shrink([false, true]).show(ui, |ui| {
                for b in &self.s.phrase_bindings {
                    Frame::new()
                        .fill(RAISED)
                        .stroke(Stroke::new(1.0, BORDER))
                        .corner_radius(10.0)
                        .inner_margin(Margin::symmetric(10, 8))
                        .show(ui, |ui| {
                            ui.set_width(ui.available_width());
                            ui.horizontal(|ui| {
                                ui.vertical(|ui| {
                                    ui.spacing_mut().item_spacing.y = 3.0;
                                    ui.label(RichText::new(&b.hotkey).size(11.5).strong().color(WHITE));
                                    ui.label(RichText::new(truncate(&b.text, 24)).size(12.5));
                                });
                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                    if ui.small_button("×").on_hover_text("Удалить").clicked() {
                                        actions.push(Action::DeleteBind(b.id.clone()));
                                    }
                                    if ui.small_button("✎").on_hover_text("Изменить").clicked() {
                                        actions.push(Action::OpenBind(Some(b.id.clone()), b.text.clone()));
                                    }
                                    if ui.small_button("▶").on_hover_text("Воспроизвести").clicked() {
                                        actions.push(Action::Speak(b.text.clone(), false));
                                    }
                                });
                            });
                        });
                    ui.add_space(2.0);
                }
            });
        });

        ui.add_space(12.0);

        card(ui, "ГОРЯЧИЕ КЛАВИШИ", |ui| {
            ui.columns(2, |cols| {
                cols[0].label(RichText::new("Фокус").size(12.0).color(MUTED));
                let a = cols[0].add(TextEdit::singleline(&mut self.s.focus_hotkey).desired_width(f32::INFINITY).margin(Margin::symmetric(9, 7)));
                cols[1].label(RichText::new("Повтор").size(12.0).color(MUTED));
                let b = cols[1].add(TextEdit::singleline(&mut self.s.repeat_hotkey).desired_width(f32::INFINITY).margin(Margin::symmetric(9, 7)));
                if a.lost_focus() || b.lost_focus() {
                    actions.push(Action::Rehotkey);
                }
            });
            for error in &self.hk_errors {
                ui.label(RichText::new(error).size(11.0).color(egui::Color32::from_gray(0xC8)));
            }
        });
    }

    fn bind_window(&mut self, ctx: &egui::Context) {
        let Some(mut dialog) = self.bind_dialog.take() else { return };
        let mut keep = true;
        let mut save = false;

        if dialog.capturing {
            let events = ctx.input(|i| i.events.clone());
            for event in events {
                if let egui::Event::Key { key, pressed: true, modifiers, .. } = event {
                    if key == Key::Escape {
                        dialog.capturing = false;
                        break;
                    }
                    if let Some(name) = key_name(key) {
                        let mut parts = Vec::new();
                        if modifiers.ctrl {
                            parts.push("Ctrl".to_string());
                        }
                        if modifiers.alt {
                            parts.push("Alt".to_string());
                        }
                        if modifiers.shift {
                            parts.push("Shift".to_string());
                        }
                        parts.push(name);
                        let combo = parts.join("+");
                        match hotkeys::parse(&combo) {
                            Ok(_) => {
                                dialog.hotkey = combo;
                                dialog.error.clear();
                            }
                            Err(e) => dialog.error = e,
                        }
                        dialog.capturing = false;
                        break;
                    }
                }
            }
        }

        let title = if dialog.editing.is_some() { "Изменить бинд" } else { "Новый бинд" };
        egui::Window::new(title)
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .fixed_size([460.0, 0.0])
            .frame(Frame::window(&ctx.global_style()).inner_margin(Margin::same(22)).corner_radius(14.0))
            .show(ctx, |ui| {
                ui.label(RichText::new("Эта фраза будет работать глобально, даже поверх игры.").size(12.5).color(MUTED));
                ui.add_space(6.0);
                ui.label(RichText::new("Фраза").size(12.0).color(MUTED));
                ui.add(
                    TextEdit::multiline(&mut dialog.text)
                        .desired_rows(4)
                        .desired_width(f32::INFINITY)
                        .font(egui::FontId::proportional(17.0))
                        .margin(Margin::symmetric(12, 10)),
                );
                ui.label(RichText::new("Клавиши").size(12.0).color(MUTED));
                let caption = if dialog.capturing {
                    "Нажмите сочетание…  (Esc — отмена)".to_string()
                } else if dialog.hotkey.is_empty() {
                    "Нажмите, чтобы записать".to_string()
                } else {
                    dialog.hotkey.clone()
                };
                if ui.add(Button::new(RichText::new(caption).size(15.0)).min_size(egui::vec2(ui.available_width(), 40.0))).clicked() {
                    dialog.capturing = true;
                    dialog.error.clear();
                }
                if !dialog.error.is_empty() {
                    ui.label(RichText::new(&dialog.error).size(12.0).color(egui::Color32::from_gray(0xC8)));
                }
                ui.add_space(8.0);
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if primary_button(ui, "Сохранить бинд").clicked() {
                        save = true;
                    }
                    if ui.add(Button::new("Отмена").min_size(egui::vec2(0.0, 36.0))).clicked() {
                        keep = false;
                    }
                });
            });

        if save {
            match self.validate_bind(&dialog) {
                Ok(()) => {
                    match &dialog.editing {
                        Some(id) => {
                            if let Some(b) = self.s.phrase_bindings.iter_mut().find(|b| &b.id == id) {
                                b.text = dialog.text.trim().to_string();
                                b.hotkey = dialog.hotkey.clone();
                            }
                        }
                        None => self.s.phrase_bindings.push(PhraseBinding {
                            text: dialog.text.trim().to_string(),
                            hotkey: dialog.hotkey.clone(),
                            ..Default::default()
                        }),
                    }
                    self.register_hotkeys();
                    self.dirty();
                    self.set_ready();
                    keep = false;
                }
                Err(e) => dialog.error = e,
            }
        }
        if keep {
            self.bind_dialog = Some(dialog);
        }
    }

    fn validate_bind(&self, dialog: &BindDialog) -> Result<(), String> {
        if dialog.text.trim().is_empty() {
            return Err("Введите фразу".into());
        }
        if dialog.hotkey.is_empty() {
            return Err("Запишите сочетание клавиш".into());
        }
        hotkeys::parse(&dialog.hotkey)?;
        let same = |other: &str| other.trim().eq_ignore_ascii_case(&dialog.hotkey);
        let used = same(&self.s.focus_hotkey)
            || same(&self.s.repeat_hotkey)
            || self.s.phrase_bindings.iter().any(|b| Some(&b.id) != dialog.editing.as_ref() && same(&b.hotkey));
        if used {
            return Err(format!("Клавиши {} уже используются", dialog.hotkey));
        }
        Ok(())
    }
}

impl eframe::App for App {
    fn ui(&mut self, ui: &mut Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        let ctx = &ctx;
        self.poll(ctx);

        if self.s.always_on_top != self.shown_on_top {
            self.shown_on_top = self.s.always_on_top;
            let level = if self.shown_on_top { egui::WindowLevel::AlwaysOnTop } else { egui::WindowLevel::Normal };
            ctx.send_viewport_cmd(egui::ViewportCommand::WindowLevel(level));
        }

        // Enter sends, Shift+Enter inserts a new line. Consume it before the text box sees it.
        let mut actions = Vec::new();
        let input_focused = ctx.memory(|m| m.has_focus(Id::new(INPUT_ID)));
        if input_focused && self.bind_dialog.is_none() && ctx.input_mut(|i| i.consume_key(Modifiers::NONE, Key::Enter)) {
            actions.push(Action::Speak(self.input.clone(), true));
        }

        egui::Panel::top("header")
            .frame(Frame::new().fill(COAL).inner_margin(Margin::symmetric(40, 18)))
            .show(ui, |ui| self.header(ui));
        egui::Panel::bottom("footer")
            .exact_size(36.0)
            .frame(Frame::new().fill(COAL).inner_margin(Margin::symmetric(40, 0)))
            .show(ui, |ui| self.footer(ui));
        egui::Panel::right("side")
            .exact_size(360.0)
            .resizable(false)
            .frame(Frame::new().fill(COAL).inner_margin(Margin { left: 0, right: 40, top: 4, bottom: 8 }))
            .show(ui, |ui| {
                egui::ScrollArea::vertical().auto_shrink([false, false]).show(ui, |ui| self.side_column(ui, &mut actions));
            });
        egui::CentralPanel::default()
            .frame(Frame::new().fill(COAL).inner_margin(Margin { left: 40, right: 18, top: 4, bottom: 8 }))
            .show(ui, |ui| {
                egui::ScrollArea::vertical().id_salt("main").auto_shrink([false, false]).show(ui, |ui| self.main_column(ui, &mut actions));
            });

        self.bind_window(ctx);

        for action in actions {
            self.do_action(ctx, action);
        }

        if let Some(since) = self.dirty_since {
            if since.elapsed() >= Duration::from_millis(400) {
                self.save_now();
            } else {
                ctx.request_repaint_after(Duration::from_millis(420));
            }
        }
    }

    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        self.save_now();
        self.tts.send(Cmd::Stop);
        self.tts.send(Cmd::Quit);
        self.hk.quit();
    }
}

// ---- helpers ---------------------------------------------------------------------------

fn apply_theme(ctx: &egui::Context) {
    crate::theme::apply(ctx);
}

fn card<R>(ui: &mut Ui, title: &str, add: impl FnOnce(&mut Ui) -> R) -> R {
    Frame::new()
        .fill(PANEL)
        .stroke(Stroke::new(1.0, BORDER))
        .corner_radius(14.0)
        .inner_margin(Margin::same(18))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(RichText::new(title).size(11.5).strong().color(MUTED));
            ui.add_space(2.0);
            add(ui)
        })
        .inner
}

fn primary_button(ui: &mut Ui, text: &str) -> egui::Response {
    ui.add(
        Button::new(RichText::new(text).color(COAL).strong())
            .fill(TEXT)
            .stroke(Stroke::NONE)
            .min_size(egui::vec2(0.0, 36.0)),
    )
}

fn wide_button(ui: &mut Ui, text: &str) -> egui::Response {
    ui.add(Button::new(text).min_size(egui::vec2(ui.available_width(), 38.0)))
}

fn slider_row(ui: &mut Ui, label: &str, value: &mut i32, range: std::ops::RangeInclusive<i32>, shown: String) -> bool {
    ui.horizontal(|ui| {
        ui.label(label);
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            ui.label(RichText::new(shown).size(12.0).color(MUTED));
        });
    });
    ui.spacing_mut().slider_width = (ui.available_width() - 12.0).max(80.0);
    ui.scope(|ui| {
        // Brighter rail and fill than the global theme, scoped so text selection keeps its dim color.
        let v = ui.visuals_mut();
        v.widgets.inactive.bg_fill = egui::Color32::from_gray(0x3A);
        v.widgets.inactive.fg_stroke = Stroke::new(1.0, WHITE);
        v.selection.bg_fill = egui::Color32::from_gray(0xE8);
        ui.add(Slider::new(value, range).show_value(false).trailing_fill(true)).changed()
    })
    .inner
}

fn combo(ui: &mut Ui, salt: &str, selected: &mut Option<String>, items: &[(String, String)]) -> bool {
    let current = selected
        .as_deref()
        .and_then(|id| items.iter().find(|(i, _)| i == id))
        .map(|(_, n)| n.clone())
        .unwrap_or_else(|| "—".into());
    let mut changed = false;
    egui::ComboBox::from_id_salt(salt)
        .width(ui.available_width())
        .selected_text(truncate(&current, 38))
        .show_ui(ui, |ui| {
            for (id, name) in items {
                let is_selected = selected.as_deref() == Some(id.as_str());
                if ui.selectable_label(is_selected, name).clicked() && !is_selected {
                    *selected = Some(id.clone());
                    changed = true;
                }
            }
        });
    changed
}

fn restore_device(devices: &[DeviceInfo], saved: Option<&str>, preferred: &[&str]) -> Option<String> {
    let by_id = saved.and_then(|id| devices.iter().find(|d| d.id.eq_ignore_ascii_case(id)));
    let by_name = || devices.iter().find(|d| preferred.iter().any(|p| d.name.to_lowercase().contains(p)));
    by_id.or_else(by_name).or_else(|| devices.first()).map(|d| d.id.clone())
}

fn signed(v: i32) -> String {
    if v > 0 { format!("+{v}") } else { v.to_string() }
}

fn truncate(text: &str, max: usize) -> String {
    let flat: String = text.chars().map(|c| if c == '\n' { ' ' } else { c }).collect();
    if flat.chars().count() <= max {
        flat
    } else {
        format!("{}…", flat.chars().take(max).collect::<String>())
    }
}

fn key_name(key: Key) -> Option<String> {
    let name = format!("{key:?}");
    Some(match name.as_str() {
        "Escape" => return None,
        "ArrowUp" => "Up".into(),
        "ArrowDown" => "Down".into(),
        "ArrowLeft" => "Left".into(),
        "ArrowRight" => "Right".into(),
        // egui reports digits as Num0..Num9
        n if n.len() == 4 && n.starts_with("Num") => n[3..].to_string(),
        n => n.to_string(),
    })
}

/// Restarts Windows audio services through an elevated helper (UAC prompt), then waits for it.
fn run_audio_restart() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let script = "Start-Process -FilePath cmd.exe -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList \
        '/c net stop Audiosrv /y & net stop AudioEndpointBuilder /y & net start AudioEndpointBuilder & net start Audiosrv'";
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("Не удалось запустить PowerShell: {e}"))?;
    if !status.success() {
        return Err("Перезапуск отменён (нужны права администратора)".into());
    }
    std::thread::sleep(Duration::from_millis(1500));
    Ok(())
}
