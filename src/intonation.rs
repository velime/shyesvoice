#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Style {
    Normal,
    Shout,
    Sad,
    Whisper,
    Question,
    Cheerful,
}

impl Style {
    pub fn label(self) -> &'static str {
        match self {
            Style::Shout => "Крик",
            Style::Sad => "Грусть",
            Style::Whisper => "Тихо",
            Style::Question => "Вопрос",
            Style::Cheerful => "Бодро",
            Style::Normal => "Обычная подача",
        }
    }
}

pub fn detect(text: &str) -> Style {
    let v = text.trim_end();
    if v.is_empty() {
        return Style::Normal;
    }
    // More specific endings win over their single-character variants.
    if v.ends_with("...") || v.ends_with('…') {
        Style::Whisper
    } else if v.ends_with("?!") || v.ends_with("!?") {
        Style::Shout
    } else if v.ends_with('(') {
        Style::Sad
    } else if v.ends_with(')') {
        Style::Cheerful
    } else if v.ends_with('!') || mostly_upper(v) {
        Style::Shout
    } else if v.ends_with('?') {
        Style::Question
    } else {
        Style::Normal
    }
}

fn mostly_upper(text: &str) -> bool {
    let letters = text.chars().filter(|c| c.is_alphabetic()).count();
    let upper = text.chars().filter(|c| c.is_uppercase()).count();
    letters >= 4 && upper as f64 >= (letters as f64 * 0.72).ceil()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_endings() {
        assert_eq!(detect("привет!"), Style::Shout);
        assert_eq!(detect("привет..."), Style::Whisper);
        assert_eq!(detect("привет?"), Style::Question);
        assert_eq!(detect("ПРИВЕТ ВСЕМ"), Style::Shout);
        assert_eq!(detect("привет"), Style::Normal);
    }
}
