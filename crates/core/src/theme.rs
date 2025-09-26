#[cfg(feature = "tui")]
use ratatui::style::Color;

#[cfg(feature = "tui")]
pub struct Theme {
    pub background: Color,
    pub foreground: Color,
    pub accent: Color,
    pub error: Color,
    pub success: Color,
}

#[cfg(feature = "tui")]
impl Default for Theme {
    fn default() -> Self {
        Self {
            background: Color::Black,
            foreground: Color::White,
            accent: Color::Cyan,
            error: Color::Red,
            success: Color::Green,
        }
    }
} 