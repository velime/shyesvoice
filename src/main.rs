#![windows_subsystem = "windows"]

mod app;
mod hotkeys;
mod intonation;
mod settings;
mod theme;
mod tts;

fn main() -> eframe::Result {
    let always_on_top = settings::load().always_on_top;
    let mut viewport = eframe::egui::ViewportBuilder::default()
        .with_title("TTS Control")
        .with_inner_size([1180.0, 840.0])
        .with_min_inner_size([1000.0, 780.0]);
    if always_on_top {
        viewport = viewport.with_always_on_top();
    }
    let options = eframe::NativeOptions { viewport, ..Default::default() };
    eframe::run_native("TTS Control", options, Box::new(|cc| Ok(Box::new(app::App::new(cc)))))
}
