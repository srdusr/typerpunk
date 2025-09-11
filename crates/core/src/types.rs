use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Platform {
    Desktop,
    Web,
    Mobile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameMode {
    Normal,
    Programming,
    Security,
    Multiplayer,
    Zen,
    Time(u64),
    Words(usize),
    Quote,
}

impl Default for GameMode {
    fn default() -> Self {
        GameMode::Normal
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Difficulty {
    Basic,
    Intermediate,
    Advanced,
    Easy,
    Medium,
    Hard,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Topic {
    General,
    Programming,
    Security,
    DataStructures,
    Algorithms,
    RedTeam,
    BlueTeam,
    Gaming,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameConfig {
    pub mode: GameMode,
    pub difficulty: Difficulty,
    pub topic: Topic,
    pub time_limit: Option<u64>,
    pub word_count: Option<usize>,
    pub custom_text: Option<String>,
    pub multiplayer: bool,
    pub quote_length: usize,
    pub theme: Theme,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            mode: GameMode::default(),
            difficulty: Difficulty::Basic,
            topic: Topic::General,
            time_limit: None,
            word_count: None,
            custom_text: None,
            multiplayer: false,
            quote_length: 1,
            theme: Theme::default(),
        }
    }
}

pub trait GameModeTrait {
    fn get_mode(&self) -> GameMode;
    fn get_difficulty(&self) -> Difficulty;
    fn get_topic(&self) -> Topic;
    fn get_time_limit(&self) -> Option<u64>;
    fn get_word_count(&self) -> Option<usize>;
    fn get_custom_text(&self) -> Option<&str>;
    fn is_multiplayer(&self) -> bool;
    fn get_quote_length(&self) -> usize;
    fn get_theme(&self) -> &Theme;
}

impl GameModeTrait for GameConfig {
    fn get_mode(&self) -> GameMode {
        self.mode
    }

    fn get_difficulty(&self) -> Difficulty {
        self.difficulty
    }

    fn get_topic(&self) -> Topic {
        self.topic
    }

    fn get_time_limit(&self) -> Option<u64> {
        self.time_limit
    }

    fn get_word_count(&self) -> Option<usize> {
        self.word_count
    }

    fn get_custom_text(&self) -> Option<&str> {
        self.custom_text.as_deref()
    }

    fn is_multiplayer(&self) -> bool {
        self.multiplayer
    }

    fn get_quote_length(&self) -> usize {
        self.quote_length
    }

    fn get_theme(&self) -> &Theme {
        &self.theme
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Theme {
    Light,
    Dark,
}

impl Default for Theme {
    fn default() -> Self {
        Theme::Dark
    }
}

impl std::fmt::Display for Theme {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Theme::Light => write!(f, "light"),
            Theme::Dark => write!(f, "dark"),
        }
    }
} 