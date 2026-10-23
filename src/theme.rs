//! Strict neutral grayscale: no tinted blacks, white is the only accent.
use eframe::egui::{self, Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, Stroke, TextStyle};
use std::sync::Arc;

pub const COAL: Color32 = Color32::from_rgb(0x0A, 0x0A, 0x0A);
pub const PANEL: Color32 = Color32::from_rgb(0x11, 0x11, 0x11);
pub const RAISED: Color32 = Color32::from_rgb(0x1A, 0x1A, 0x1A);
pub const HOVER: Color32 = Color32::from_rgb(0x24, 0x24, 0x24);
pub const BORDER: Color32 = Color32::from_rgb(0x2A, 0x2A, 0x2A);
pub const STRONG_BORDER: Color32 = Color32::from_rgb(0x4A, 0x4A, 0x4A);
pub const TEXT: Color32 = Color32::from_rgb(0xF5, 0xF5, 0xF5);
pub const MUTED: Color32 = Color32::from_rgb(0x8C, 0x8C, 0x8C);
pub const DIM: Color32 = Color32::from_rgb(0x5A, 0x5A, 0x5A);
pub const WHITE: Color32 = Color32::WHITE;

pub fn apply(ctx: &egui::Context) {
    install_fonts(ctx);
    ctx.set_theme(egui::Theme::Dark);

    ctx.global_style_mut(|style| {
        style.text_styles = [
            (TextStyle::Small, FontId::new(11.5, FontFamily::Proportional)),
            (TextStyle::Body, FontId::new(14.5, FontFamily::Proportional)),
            (TextStyle::Button, FontId::new(14.0, FontFamily::Proportional)),
            (TextStyle::Heading, FontId::new(20.0, FontFamily::Proportional)),
            (TextStyle::Monospace, FontId::new(13.5, FontFamily::Monospace)),
        ]
        .into();
        style.spacing.item_spacing = egui::vec2(10.0, 7.0);
        style.spacing.button_padding = egui::vec2(14.0, 8.0);
        style.spacing.interact_size.y = 30.0;
        style.spacing.combo_width = 120.0;
        style.spacing.slider_rail_height = 3.0;

        let v = &mut style.visuals;
        v.dark_mode = true;
        v.override_text_color = Some(TEXT);
        v.panel_fill = COAL;
        v.window_fill = PANEL;
        v.window_stroke = Stroke::new(1.0, BORDER);
        v.window_corner_radius = CornerRadius::same(14);
        v.menu_corner_radius = CornerRadius::same(8);
        v.extreme_bg_color = RAISED;
        v.faint_bg_color = PANEL;
        v.hyperlink_color = WHITE;
        v.selection.bg_fill = Color32::from_white_alpha(70);
        v.selection.stroke = Stroke::new(1.0, WHITE);
        v.popup_shadow = egui::Shadow::NONE;
        v.window_shadow = egui::Shadow { offset: [0, 8], blur: 28, spread: 0, color: Color32::from_black_alpha(160) };

        let radius = CornerRadius::same(8);
        v.widgets.noninteractive.bg_fill = PANEL;
        v.widgets.noninteractive.weak_bg_fill = PANEL;
        v.widgets.noninteractive.bg_stroke = Stroke::new(1.0, BORDER);
        v.widgets.noninteractive.fg_stroke = Stroke::new(1.0, TEXT);
        v.widgets.noninteractive.corner_radius = radius;

        v.widgets.inactive.bg_fill = RAISED;
        v.widgets.inactive.weak_bg_fill = RAISED;
        v.widgets.inactive.bg_stroke = Stroke::new(1.0, BORDER);
        v.widgets.inactive.fg_stroke = Stroke::new(1.0, TEXT);
        v.widgets.inactive.corner_radius = radius;

        v.widgets.hovered.bg_fill = HOVER;
        v.widgets.hovered.weak_bg_fill = HOVER;
        v.widgets.hovered.bg_stroke = Stroke::new(1.0, STRONG_BORDER);
        v.widgets.hovered.fg_stroke = Stroke::new(1.5, WHITE);
        v.widgets.hovered.corner_radius = radius;

        v.widgets.active.bg_fill = Color32::from_rgb(0x30, 0x30, 0x30);
        v.widgets.active.weak_bg_fill = Color32::from_rgb(0x30, 0x30, 0x30);
        v.widgets.active.bg_stroke = Stroke::new(1.0, WHITE);
        v.widgets.active.fg_stroke = Stroke::new(1.5, WHITE);
        v.widgets.active.corner_radius = radius;

        v.widgets.open = v.widgets.hovered;
    });
}

/// Segoe UI gives proper Cyrillic and symbols; egui's bundled fonts stay as the fallback.
fn install_fonts(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();
    let mut add = |name: &str, file: &str| {
        let path = std::path::Path::new(r"C:\Windows\Fonts").join(file);
        if let Ok(bytes) = std::fs::read(path) {
            fonts.font_data.insert(name.to_owned(), Arc::new(FontData::from_owned(bytes)));
            for family in [FontFamily::Proportional, FontFamily::Monospace] {
                fonts.families.entry(family).or_default().push(name.to_owned());
            }
            true
        } else {
            false
        }
    };
    let have_ui = add("segoe-ui", "segoeui.ttf");
    add("segoe-symbols", "seguisym.ttf");
    if have_ui {
        // Put Segoe UI first for proportional text.
        let list = fonts.families.entry(FontFamily::Proportional).or_default();
        list.retain(|n| n != "segoe-ui");
        list.insert(0, "segoe-ui".to_owned());
    }
    ctx.set_fonts(fonts);
}
