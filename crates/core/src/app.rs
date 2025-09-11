use rand::Rng;
use crossterm::event::KeyEvent;
use crate::{
    config::Config,
    custom_text::{parse_custom_content, CustomText},
    stats::Stats,
    text::Text,
    words::{generate_words, word_count_for_duration},
};
use serde::Deserialize;
use std::time::Instant;

#[derive(Debug, Clone, PartialEq)]
pub enum State {
    MainMenu,
    CustomTextPrompt,
    TypingGame,
    PassiveMode,
    EndScreen,
    Login,
    Leaderboard,
    Friends,
    MultiplayerLobby,
    MultiplayerRace,
    MultiplayerResults,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LoginField {
    Username,
    Password,
}

// Requests the TUI binary's own network worker fulfils - kept as plain data
// here (no reqwest/tokio types) so typerpunk-core stays free of a hard
// networking dependency, since this crate also compiles to wasm for the web
// build.
#[derive(Debug, Clone)]
pub enum NetworkAction {
    Login { username: String, password: String },
    Register { username: String, password: String },
    FetchLeaderboard { mode: String },
    FetchFriends,
    SendFriendRequest { username: String },
    AcceptFriendRequest { id: String },
    RemoveFriendship { id: String },
    // Progress/Finish aren't here - those flow continuously once a race is
    // underway, not from a single keypress, so the tui binary's main loop
    // drives them directly every tick instead of through this one-shot
    // per-keypress queue. See MultiplayerRace's fields below.
    CreateMultiplayerRoom,
    JoinMultiplayerRoom { code: String },
    MultiplayerReady,
}

/// One entry in the multiplayer lobby/race player list. Plain data, not
/// typerpunk_core::multiplayer::PlayerInfo - that type only exists behind
/// the "multiplayer" cargo feature (unneeded for the wasm/web build this
/// crate also compiles to), and app.rs otherwise has no reason to depend on
/// it. The tui binary's network layer converts at the boundary.
#[derive(Debug, Clone)]
pub struct MpPlayer {
    pub id: String,
    pub name: String,
    pub ready: bool,
    pub progress: f32,
    pub wpm: f32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LeaderboardRow {
    pub username: String,
    pub wpm: f64,
    pub accuracy: f64,
    #[serde(default)]
    pub device_type: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FriendRow {
    pub friendship_id: String,
    pub username: String,
}

pub struct App {
    pub config: Config,
    pub texts: Vec<Text>,
    pub categories: Vec<String>,
    pub selected_category: Option<String>, // None = Random
    pub words_mode_selected: bool,
    pub word_count: usize,
    pub words_punctuation: bool,
    pub words_numbers: bool,
    pub time_mode_selected: bool,
    pub time_duration: u64,
    pub current_words: Option<Text>,
    pub stats: Stats,
    pub input: String,
    pub current_text_index: usize,
    pub should_exit: bool,
    pub state: State,
    pub wpm_history: Vec<u64>,

    pub custom_mode_selected: bool,
    pub custom_text: Option<CustomText>,
    pub custom_index: usize,
    pub using_custom: bool,
    pub current_custom: Option<Text>,
    pub path_input: String,
    pub path_error: Option<String>,

    pub passive_active_index: usize,
    pub passive_typed: String,
    pub passive_correct: u32,
    pub passive_total: u32,
    pub passive_start: Option<Instant>,
    pub passive_schedule: Vec<f64>,
    pub passive_done: bool,

    // Online: account, leaderboard, friends - see NetworkAction above for
    // how this crate hands network work off to the tui binary.
    pub auth_token: Option<String>,
    pub logged_in_username: Option<String>,
    pub login_register_mode: bool, // false = Login, true = Register
    pub login_field: LoginField,
    pub login_username: String,
    pub login_password: String,
    pub net_busy: bool,
    pub net_status: Option<String>,
    pub pending_network_action: Option<NetworkAction>,
    pub leaderboard_mode: String,
    pub leaderboard_entries: Vec<LeaderboardRow>,
    pub friends_list: Vec<FriendRow>,
    pub friends_incoming: Vec<FriendRow>,
    pub friends_outgoing: Vec<FriendRow>,
    pub friends_add_input: String,
    pub friends_selected: usize,

    // Multiplayer: lobby (create/join by code, ready check), the live race
    // itself, and results. current_text() prefers mp_race_text over every
    // other source while a race is active, so State::MultiplayerRace reuses
    // TypingGame's exact keystroke handling and rendering unchanged.
    pub mp_room_code_input: String,
    pub mp_own_room_code: Option<String>,
    pub mp_players: Vec<MpPlayer>,
    pub mp_local_player_id: Option<String>,
    pub mp_countdown: Option<u32>,
    pub mp_race_text: Option<Text>,
    pub mp_results: Vec<(String, String, f32, u32)>, // (player_id, name, wpm, place)
    pub mp_status: Option<String>,
    pub mp_finish_sent: bool,
}

impl App {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let config = Config::new();
        #[derive(Deserialize)]
        struct RawText { category: String, content: String, attribution: String }
        // texts.json is stored at repository root; this file is at crates/core/src/app.rs
        const RAW_TEXTS: &str = include_str!("../../../texts.json");
        let parsed: Vec<RawText> = serde_json::from_str(RAW_TEXTS)?;
        let texts: Vec<Text> = parsed
            .into_iter()
            .map(|t| Text {
                content: t.content,
                source: t.attribution,
                // Plain-language prose, not code - leave language empty so
                // highlight_classes() doesn't run its string-literal scan
                // over apostrophes in contractions and possessives.
                language: String::new(),
                category: t.category,
            })
            .collect();
        let stats = Stats::new();
        let input = String::new();
        let categories = {
            let mut set = std::collections::BTreeSet::new();
            for t in &texts { if !t.category.is_empty() { set.insert(t.category.clone()); } }
            set.into_iter().collect::<Vec<_>>()
        };
        let current_text_index = if texts.is_empty() { 0 } else { rand::thread_rng().gen_range(0..texts.len()) };
        let should_exit = false;
        let state = State::MainMenu;

        Ok(App {
            config,
            texts,
            categories,
            selected_category: None,
            words_mode_selected: false,
            word_count: 25,
            words_punctuation: false,
            words_numbers: false,
            time_mode_selected: false,
            time_duration: 30,
            current_words: None,
            stats,
            input,
            current_text_index,
            should_exit,
            state,
            wpm_history: Vec::new(),
            custom_mode_selected: false,
            custom_text: None,
            custom_index: 0,
            using_custom: false,
            current_custom: None,
            path_input: String::new(),
            path_error: None,
            passive_active_index: 0,
            passive_typed: String::new(),
            passive_correct: 0,
            passive_total: 0,
            passive_start: None,
            passive_schedule: Vec::new(),
            passive_done: false,
            auth_token: None,
            logged_in_username: None,
            login_register_mode: false,
            login_field: LoginField::Username,
            login_username: String::new(),
            login_password: String::new(),
            net_busy: false,
            net_status: None,
            pending_network_action: None,
            leaderboard_mode: "time-30".to_string(),
            leaderboard_entries: Vec::new(),
            friends_list: Vec::new(),
            friends_incoming: Vec::new(),
            friends_outgoing: Vec::new(),
            friends_add_input: String::new(),
            friends_selected: 0,
            mp_room_code_input: String::new(),
            mp_own_room_code: None,
            mp_players: Vec::new(),
            mp_local_player_id: None,
            mp_countdown: None,
            mp_race_text: None,
            mp_results: Vec::new(),
            mp_status: None,
            mp_finish_sent: false,
        })
    }

    // Called by the tui binary once its network worker restores a saved
    // token from the local config file at startup, so a returning user
    // doesn't have to log in again every session.
    pub fn restore_session(&mut self, token: String, username: String) {
        self.auth_token = Some(token);
        self.logged_in_username = Some(username);
    }

    pub fn set_net_busy(&mut self, busy: bool) {
        self.net_busy = busy;
    }

    pub fn set_net_error(&mut self, message: String) {
        self.net_busy = false;
        self.net_status = Some(message);
    }

    pub fn set_login_success(&mut self, username: String, token: Option<String>) {
        self.net_busy = false;
        self.logged_in_username = Some(username);
        if let Some(token) = token {
            self.auth_token = Some(token);
        }
        self.login_password.clear();
        self.net_status = Some("Signed in.".to_string());
        self.state = State::MainMenu;
    }

    pub fn set_leaderboard(&mut self, entries: Vec<LeaderboardRow>) {
        self.net_busy = false;
        self.net_status = None;
        self.leaderboard_entries = entries;
    }

    pub fn set_friends(&mut self, list: Vec<FriendRow>, incoming: Vec<FriendRow>, outgoing: Vec<FriendRow>) {
        self.net_busy = false;
        self.net_status = None;
        self.friends_list = list;
        self.friends_incoming = incoming;
        self.friends_outgoing = outgoing;
        self.friends_selected = 0;
    }

    pub fn set_mp_error(&mut self, message: String) {
        self.net_busy = false;
        self.mp_status = Some(message);
    }

    pub fn set_mp_room_created(&mut self, code: String) {
        self.net_busy = false;
        self.mp_own_room_code = Some(code);
        self.mp_status = None;
    }

    pub fn set_mp_joined(&mut self, player_id: String) {
        self.net_busy = false;
        self.mp_local_player_id = Some(player_id);
        self.mp_status = None;
    }

    pub fn set_mp_player_list(&mut self, players: Vec<MpPlayer>) {
        self.mp_players = players;
    }

    pub fn set_mp_countdown(&mut self, seconds: u32) {
        self.mp_countdown = Some(seconds);
    }

    /// The server hands every racer the identical passage (see
    /// crates/server's room lifecycle) - this is what makes current_text()
    /// pick it up for the race the same way TypingGame reads its own pool.
    pub fn set_mp_start(&mut self, text: String) {
        self.mp_countdown = None;
        self.mp_race_text = Some(Text { content: text, source: "Multiplayer".to_string(), language: String::new(), category: String::new() });
        self.mp_finish_sent = false;
        self.input.clear();
        self.stats = Stats::new();
        self.stats.start();
        self.state = State::MultiplayerRace;
    }

    pub fn set_mp_player_progress(&mut self, player_id: &str, percent: f32, wpm: f32) {
        if let Some(p) = self.mp_players.iter_mut().find(|p| p.id == player_id) {
            p.progress = percent;
            p.wpm = wpm;
        }
    }

    pub fn set_mp_player_finished(&mut self, player_id: &str, name_fallback: &str, wpm: f32, place: u32) {
        let name = self.mp_players.iter().find(|p| p.id == player_id).map(|p| p.name.clone()).unwrap_or_else(|| name_fallback.to_string());
        if let Some(p) = self.mp_players.iter_mut().find(|p| p.id == player_id) {
            p.progress = 100.0;
            p.wpm = wpm;
        }
        // Deduped by player id, not name - two unauthenticated players both
        // default to "Guest", and keying on name silently dropped the
        // second Guest's own finish as an apparent duplicate of the first's.
        if !self.mp_results.iter().any(|(id, _, _, _)| id == player_id) {
            self.mp_results.push((player_id.to_string(), name, wpm, place));
            self.mp_results.sort_by_key(|(_, _, _, place)| *place);
        }
        // Only the local player's own finish should leave the race screen --
        // the room may keep racing after we're done, and other players'
        // PlayerFinished messages arrive well before that happens.
        if self.mp_local_player_id.as_deref() == Some(player_id) {
            self.state = State::MultiplayerResults;
        }
    }

    pub fn set_mp_room_closed(&mut self, reason: String) {
        self.mp_status = Some(format!("Room closed: {reason}"));
        self.state = State::MainMenu;
    }

    pub fn reset_multiplayer(&mut self) {
        self.mp_room_code_input.clear();
        self.mp_own_room_code = None;
        self.mp_players.clear();
        self.mp_local_player_id = None;
        self.mp_countdown = None;
        self.mp_race_text = None;
        self.mp_results.clear();
        self.mp_status = None;
        self.mp_finish_sent = false;
        self.net_busy = false;
    }

    fn handle_backspace_with_rules(&mut self, ctrl: bool) {
        if self.input.is_empty() { return; }
        let current_text = self.current_text().content.clone();
        let current_text = &current_text;
        if ctrl {
            // Standard word-backward delete: skip any trailing whitespace
            // first (e.g. cursor sitting right after a space you just typed),
            // then skip back over the word before it.
            let chars: Vec<char> = self.input.chars().collect();
            let mut end = chars.len();
            while end > 0 && chars[end - 1].is_whitespace() {
                end -= 1;
            }
            let mut word_start = end;
            while word_start > 0 && !chars[word_start - 1].is_whitespace() {
                word_start -= 1;
            }
            if word_start < self.input.len() {
                self.input = chars[..word_start].iter().collect();
                self.update_stats();
            }
            return;
        }

        // Deleting one character. Only allow crossing into previous word if there are errors before.
        let target_pos = self.input.len().saturating_sub(1);
        let current_word_start = self.get_current_word_start();
        if target_pos < current_word_start {
            if !self.has_errors_before_position(current_text, current_word_start) {
                // No errors before; do not allow moving back into previous words
                return;
            }
        }
        self.input.pop();
        self.update_stats();
    }

    fn get_current_word_start(&self) -> usize {
        let mut word_start = 0;
        let mut in_word = false;
        for (i, c) in self.input.chars().enumerate() {
            if c.is_whitespace() {
                if in_word { word_start = i + 1; }
                in_word = false;
            } else {
                in_word = true;
            }
        }
        word_start
    }

    fn has_errors_before_position(&self, text: &str, position: usize) -> bool {
        let compare_len = self.input.len().min(text.len());
        for (i, (ic, tc)) in self.input.chars().zip(text.chars()).take(compare_len).enumerate() {
            if i >= position { break; }
            if ic != tc { return true; }
        }
        false
    }

    pub fn new_with_config(config: Config) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        #[derive(Deserialize)]
        struct RawText { category: String, content: String, attribution: String }
        const RAW_TEXTS: &str = include_str!("../../../texts.json");
        let parsed: Vec<RawText> = serde_json::from_str(RAW_TEXTS)?;
        let texts: Vec<Text> = parsed
            .into_iter()
            .map(|t| Text {
                content: t.content,
                source: t.attribution,
                // Plain-language prose, not code - leave language empty so
                // highlight_classes() doesn't run its string-literal scan
                // over apostrophes in contractions and possessives.
                language: String::new(),
                category: t.category,
            })
            .collect();
        let categories = {
            let mut set = std::collections::BTreeSet::new();
            for t in &texts { if !t.category.is_empty() { set.insert(t.category.clone()); } }
            set.into_iter().collect::<Vec<_>>()
        };
        let current_text_index = if texts.is_empty() { 0 } else { rand::thread_rng().gen_range(0..texts.len()) };
        Ok(Self {
            state: State::MainMenu,
            should_exit: false,
            input: String::new(),
            texts,
            categories,
            selected_category: None,
            words_mode_selected: false,
            word_count: 25,
            words_punctuation: false,
            words_numbers: false,
            time_mode_selected: false,
            time_duration: 30,
            current_words: None,
            current_text_index,
            stats: Stats::new(),
            config,
            wpm_history: Vec::new(),
            custom_mode_selected: false,
            custom_text: None,
            custom_index: 0,
            using_custom: false,
            current_custom: None,
            path_input: String::new(),
            path_error: None,
            passive_active_index: 0,
            passive_typed: String::new(),
            passive_correct: 0,
            passive_total: 0,
            passive_start: None,
            passive_schedule: Vec::new(),
            passive_done: false,
            auth_token: None,
            logged_in_username: None,
            login_register_mode: false,
            login_field: LoginField::Username,
            login_username: String::new(),
            login_password: String::new(),
            net_busy: false,
            net_status: None,
            pending_network_action: None,
            leaderboard_mode: "time-30".to_string(),
            leaderboard_entries: Vec::new(),
            friends_list: Vec::new(),
            friends_incoming: Vec::new(),
            friends_outgoing: Vec::new(),
            friends_add_input: String::new(),
            friends_selected: 0,
            mp_room_code_input: String::new(),
            mp_own_room_code: None,
            mp_players: Vec::new(),
            mp_local_player_id: None,
            mp_countdown: None,
            mp_race_text: None,
            mp_results: Vec::new(),
            mp_status: None,
            mp_finish_sent: false,
        })
    }

    pub fn reset(&mut self) {
        if self.using_custom {
            self.start_custom_chunk();
            return;
        }
        self.input.clear();
        self.stats.reset();
        self.wpm_history.clear();
        if self.words_mode_selected {
            let text = generate_words(self.word_count, self.words_punctuation, self.words_numbers);
            self.current_words = Some(Text::from_all(&text, "", "en", "words"));
        } else if self.time_mode_selected {
            let count = word_count_for_duration(self.time_duration);
            let text = generate_words(count, self.words_punctuation, self.words_numbers);
            self.current_words = Some(Text::from_all(&text, "", "en", "time"));
        } else {
            self.current_words = None;
            self.current_text_index = self.pick_random_index();
        }
    }

    const WORD_COUNTS: [usize; 4] = [10, 25, 50, 100];
    const TIME_DURATIONS: [u64; 4] = [15, 30, 60, 120];

    fn cycle_word_count(&mut self, forward: bool) {
        let pos = Self::WORD_COUNTS.iter().position(|&c| c == self.word_count).unwrap_or(1);
        let len = Self::WORD_COUNTS.len();
        let next = if forward { (pos + 1) % len } else { (pos + len - 1) % len };
        self.word_count = Self::WORD_COUNTS[next];
    }

    fn cycle_time_duration(&mut self, forward: bool) {
        let pos = Self::TIME_DURATIONS.iter().position(|&d| d == self.time_duration).unwrap_or(1);
        let len = Self::TIME_DURATIONS.len();
        let next = if forward { (pos + 1) % len } else { (pos + len - 1) % len };
        self.time_duration = Self::TIME_DURATIONS[next];
    }

    fn pick_random_index(&self) -> usize {
        if self.texts.is_empty() { return 0; }
        let pool: Vec<usize> = match &self.selected_category {
            Some(cat) => self.texts.iter().enumerate().filter(|(_, t)| &t.category == cat).map(|(i, _)| i).collect(),
            None => (0..self.texts.len()).collect(),
        };
        if pool.is_empty() { return 0; }
        let idx = rand::thread_rng().gen_range(0..pool.len());
        pool[idx]
    }

    /// Left/Right in the main menu cycle through: Random -> each category ->
    /// Custom -> back to Random. Custom is a distinct slot, not a category.
    /// Slot order matches the web menu: Random -> Words -> Time -> each
    /// category -> Custom -> back to Random.
    fn cycle_mode(&mut self, forward: bool) {
        let total = self.categories.len() + 4; // Random + Words + Time + categories + Custom
        let current_pos = if self.custom_mode_selected {
            total - 1
        } else if self.time_mode_selected {
            2
        } else if self.words_mode_selected {
            1
        } else {
            match &self.selected_category {
                None => 0,
                Some(cur) => self.categories.iter().position(|c| c == cur).map(|p| p + 3).unwrap_or(0),
            }
        };
        let next_pos = if forward {
            (current_pos + 1) % total
        } else {
            (current_pos + total - 1) % total
        };
        self.custom_mode_selected = false;
        self.words_mode_selected = false;
        self.time_mode_selected = false;
        self.selected_category = None;
        if next_pos == total - 1 {
            self.custom_mode_selected = true;
        } else if next_pos == 1 {
            self.words_mode_selected = true;
        } else if next_pos == 2 {
            self.time_mode_selected = true;
        } else if next_pos != 0 {
            self.selected_category = Some(self.categories[next_pos - 3].clone());
        }
    }

    fn start_custom_chunk(&mut self) {
        if let Some(ct) = &self.custom_text {
            if let Some(chunk) = ct.chunks.get(self.custom_index) {
                self.current_custom = Some(Text::from_all(
                    &chunk.content,
                    &ct.name,
                    ct.language.as_deref().unwrap_or(""),
                    "custom",
                ));
            }
        }
        self.input.clear();
        self.stats.reset();
        self.wpm_history.clear();
    }

    fn advance_custom_index(&mut self) -> bool {
        if let Some(ct) = &self.custom_text {
            if self.custom_index + 1 < ct.chunks.len() {
                self.custom_index += 1;
                return true;
            }
        }
        false
    }

    fn load_custom_text(&mut self) {
        let path = self.path_input.trim().to_string();
        if path.is_empty() {
            self.path_error = Some("Enter a file path.".to_string());
            return;
        }
        match std::fs::read_to_string(&path) {
            Ok(raw) => {
                let filename = std::path::Path::new(&path)
                    .file_name()
                    .and_then(|f| f.to_str())
                    .unwrap_or(&path)
                    .to_string();
                let ct = parse_custom_content(&raw, &filename);
                if ct.chunks.is_empty() {
                    self.path_error = Some("No typeable text found in that file.".to_string());
                } else {
                    self.custom_text = Some(ct);
                    self.custom_mode_selected = true;
                    self.path_error = None;
                    self.state = State::MainMenu;
                }
            }
            Err(e) => {
                self.path_error = Some(format!("Could not read file: {}", e));
            }
        }
    }

    fn start_passive(&mut self) {
        let Some(ct) = &self.custom_text else { return };
        self.passive_schedule = build_passive_schedule(&ct.chunks);
        self.passive_active_index = 0;
        self.passive_typed.clear();
        self.passive_correct = 0;
        self.passive_total = 0;
        self.passive_done = false;
        self.passive_start = Some(Instant::now());
        self.state = State::PassiveMode;
    }

    fn advance_passive_to(&mut self, target: usize) {
        if let Some(ct) = &self.custom_text {
            if let Some(chunk) = ct.chunks.get(self.passive_active_index) {
                let target_chars: Vec<char> = chunk.content.chars().collect();
                let typed_chars: Vec<char> = self.passive_typed.chars().collect();
                for (i, tc) in typed_chars.iter().enumerate() {
                    self.passive_total += 1;
                    if target_chars.get(i) == Some(tc) {
                        self.passive_correct += 1;
                    }
                }
            }
        }
        self.passive_active_index = target;
        self.passive_typed.clear();
    }

    fn update_passive(&mut self) {
        if self.passive_done {
            return;
        }
        let Some(start) = self.passive_start else { return };
        let elapsed = start.elapsed().as_secs_f64();

        let mut target = self.passive_active_index;
        while target + 1 < self.passive_schedule.len() && elapsed >= self.passive_schedule[target + 1] {
            target += 1;
        }
        if target != self.passive_active_index {
            self.advance_passive_to(target);
        }

        let total_duration = self.passive_schedule.last().copied().unwrap_or(0.0) + 4.0;
        if elapsed >= total_duration {
            self.passive_done = true;
        }
    }

    pub fn passive_accuracy(&self) -> f64 {
        if self.passive_total == 0 {
            100.0
        } else {
            (self.passive_correct as f64 / self.passive_total as f64) * 100.0
        }
    }

    pub fn handle_input(&mut self, key: KeyEvent) {
        match self.state {
            State::MainMenu => {
                match key.code {
                    crossterm::event::KeyCode::Enter => {
                        if self.custom_mode_selected {
                            if let Some(ct) = &self.custom_text {
                                if !ct.chunks.is_empty() {
                                    self.using_custom = true;
                                    self.custom_index = 0;
                                    self.state = State::TypingGame;
                                    self.start_custom_chunk();
                                }
                            } else {
                                self.state = State::CustomTextPrompt;
                                self.path_input.clear();
                                self.path_error = None;
                            }
                        } else {
                            self.using_custom = false;
                            self.current_custom = None;
                            self.state = State::TypingGame;
                            self.reset();
                        }
                    }
                    crossterm::event::KeyCode::Char('p') | crossterm::event::KeyCode::Char('P')
                        if self.custom_mode_selected =>
                    {
                        if let Some(ct) = &self.custom_text {
                            if ct.timed && !ct.chunks.is_empty() {
                                self.start_passive();
                            }
                        }
                    }
                    crossterm::event::KeyCode::Char('c') | crossterm::event::KeyCode::Char('C') => {
                        self.state = State::CustomTextPrompt;
                        self.path_input.clear();
                        self.path_error = None;
                    }
                    crossterm::event::KeyCode::Char('x') | crossterm::event::KeyCode::Char('X')
                        if self.custom_mode_selected =>
                    {
                        self.custom_text = None;
                        self.custom_mode_selected = false;
                    }
                    crossterm::event::KeyCode::Char('l') | crossterm::event::KeyCode::Char('L') => {
                        self.net_status = None;
                        self.state = State::Leaderboard;
                        self.net_busy = true;
                        self.pending_network_action = Some(NetworkAction::FetchLeaderboard { mode: self.leaderboard_mode.clone() });
                    }
                    crossterm::event::KeyCode::Char('a') | crossterm::event::KeyCode::Char('A') => {
                        self.net_status = None;
                        self.state = State::Login;
                    }
                    crossterm::event::KeyCode::Char('f') | crossterm::event::KeyCode::Char('F') => {
                        self.net_status = None;
                        self.state = State::Friends;
                        if self.logged_in_username.is_some() {
                            self.net_busy = true;
                            self.pending_network_action = Some(NetworkAction::FetchFriends);
                        }
                    }
                    crossterm::event::KeyCode::Char('m') | crossterm::event::KeyCode::Char('M') => {
                        self.reset_multiplayer();
                        self.state = State::MultiplayerLobby;
                    }
                    crossterm::event::KeyCode::Left => self.cycle_mode(false),
                    crossterm::event::KeyCode::Right => self.cycle_mode(true),
                    crossterm::event::KeyCode::Up if self.words_mode_selected => {
                        self.cycle_word_count(true)
                    }
                    crossterm::event::KeyCode::Down if self.words_mode_selected => {
                        self.cycle_word_count(false)
                    }
                    crossterm::event::KeyCode::Up if self.time_mode_selected => {
                        self.cycle_time_duration(true)
                    }
                    crossterm::event::KeyCode::Down if self.time_mode_selected => {
                        self.cycle_time_duration(false)
                    }
                    crossterm::event::KeyCode::Esc => {
                        self.should_exit = true;
                    }
                    _ => {}
                }
            }
            State::CustomTextPrompt => match key.code {
                crossterm::event::KeyCode::Enter => self.load_custom_text(),
                crossterm::event::KeyCode::Esc => {
                    self.state = State::MainMenu;
                }
                crossterm::event::KeyCode::Backspace => {
                    self.path_input.pop();
                }
                crossterm::event::KeyCode::Char(c) => {
                    self.path_input.push(c);
                }
                _ => {}
            },
            State::TypingGame => {
                match key.code {
                    crossterm::event::KeyCode::Char(c) => {
                        // Handle control-word delete (Ctrl+W, or Ctrl+H on terminals
                        // that send it in place of Ctrl+Backspace).
                        if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL)
                            && (c == 'w' || c == 'W' || c == 'h' || c == 'H')
                        {
                            self.handle_backspace_with_rules(true);
                            return;
                        }
                        // Don't insert invisible control chars; only insert when no CTRL/ALT (SHIFT ok)
                        if key.modifiers.intersects(crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT) {
                            return;
                        }
                        if !self.stats.is_running() { self.stats.start(); }
                        // Record keystroke correctness before mutating input
                        let was_correct = {
                            let pos = self.input.len();
                            let current_text = self.current_text().content.clone();
                            if pos < current_text.len() {
                                // Compare with target at this position
                                current_text.chars().nth(pos).map(|tc| tc == c).unwrap_or(false)
                            } else {
                                false // extra chars are considered incorrect
                            }
                        };
                        self.stats.note_keypress(was_correct);
                        self.input.push(c);
                        self.update_stats();
                    }
                    crossterm::event::KeyCode::Backspace => {
                        // Treat Ctrl or Alt modified Backspace as word delete for tmux/screen/terms
                        let ctrl_or_alt = key.modifiers.intersects(
                            crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT,
                        );
                        self.handle_backspace_with_rules(ctrl_or_alt);
                    }
                    crossterm::event::KeyCode::Tab => {
                        // Quick restart: abandon the current attempt and start
                        // a fresh one of the same mode, without leaving the
                        // typing screen.
                        self.reset();
                    }
                    crossterm::event::KeyCode::Esc => {
                        self.using_custom = false;
                        self.current_custom = None;
                        self.state = State::MainMenu;
                        self.reset();
                    }
                    _ => {}
                }
            }
            State::PassiveMode => match key.code {
                crossterm::event::KeyCode::Esc => {
                    self.state = State::MainMenu;
                }
                crossterm::event::KeyCode::Enter if self.passive_done => {
                    self.state = State::MainMenu;
                }
                crossterm::event::KeyCode::Backspace => {
                    self.passive_typed.pop();
                }
                crossterm::event::KeyCode::Char(c) if !self.passive_done => {
                    if !key.modifiers.intersects(crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT) {
                        self.passive_typed.push(c);
                    }
                }
                _ => {}
            },
            State::EndScreen => {
                match key.code {
                    // Tab is the keyboard-shortcut equivalent of Enter here --
                    // both play again / advance to the next custom segment.
                    crossterm::event::KeyCode::Enter | crossterm::event::KeyCode::Tab => {
                        if self.using_custom {
                            if self.advance_custom_index() {
                                self.state = State::TypingGame;
                                self.start_custom_chunk();
                            } else {
                                self.using_custom = false;
                                self.current_custom = None;
                                self.state = State::MainMenu;
                            }
                        } else {
                            self.state = State::TypingGame;
                            self.reset();
                        }
                    }
                    crossterm::event::KeyCode::Esc => {
                        self.using_custom = false;
                        self.current_custom = None;
                        self.state = State::MainMenu;
                        self.reset();
                    }
                    _ => {}
                }
            }
            State::Login => match key.code {
                crossterm::event::KeyCode::Esc => {
                    self.state = State::MainMenu;
                }
                crossterm::event::KeyCode::Tab => {
                    self.login_field = match self.login_field {
                        LoginField::Username => LoginField::Password,
                        LoginField::Password => LoginField::Username,
                    };
                }
                crossterm::event::KeyCode::Char('r') | crossterm::event::KeyCode::Char('R')
                    if key.modifiers.contains(crossterm::event::KeyModifiers::CONTROL) =>
                {
                    self.login_register_mode = !self.login_register_mode;
                }
                crossterm::event::KeyCode::Enter => {
                    if self.logged_in_username.is_some() {
                        // Already signed in - Enter here just backs out,
                        // there's no form to submit.
                        self.state = State::MainMenu;
                        return;
                    }
                    if self.login_username.is_empty() || self.login_password.is_empty() {
                        self.net_status = Some("Enter a username and password.".to_string());
                        return;
                    }
                    self.net_busy = true;
                    self.net_status = None;
                    let username = self.login_username.clone();
                    let password = self.login_password.clone();
                    self.pending_network_action = Some(if self.login_register_mode {
                        NetworkAction::Register { username, password }
                    } else {
                        NetworkAction::Login { username, password }
                    });
                }
                crossterm::event::KeyCode::Backspace => {
                    match self.login_field {
                        LoginField::Username => { self.login_username.pop(); }
                        LoginField::Password => { self.login_password.pop(); }
                    }
                }
                crossterm::event::KeyCode::Char(c) => {
                    if !key.modifiers.intersects(crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT) {
                        match self.login_field {
                            LoginField::Username => self.login_username.push(c),
                            LoginField::Password => self.login_password.push(c),
                        }
                    }
                }
                _ => {}
            },
            State::Leaderboard => match key.code {
                crossterm::event::KeyCode::Esc => {
                    self.state = State::MainMenu;
                }
                crossterm::event::KeyCode::Char('r') | crossterm::event::KeyCode::Char('R') => {
                    self.net_busy = true;
                    self.pending_network_action = Some(NetworkAction::FetchLeaderboard { mode: self.leaderboard_mode.clone() });
                }
                _ => {}
            },
            State::Friends => match key.code {
                crossterm::event::KeyCode::Esc => {
                    self.state = State::MainMenu;
                }
                crossterm::event::KeyCode::Up => {
                    if self.friends_selected > 0 { self.friends_selected -= 1; }
                }
                crossterm::event::KeyCode::Down => {
                    if self.friends_selected + 1 < self.friends_incoming.len() {
                        self.friends_selected += 1;
                    }
                }
                // Guarded on the add-username field being empty - otherwise
                // typing a 'y' or 'd' into a username (both letters are legal
                // in one, per validate_username) would get eaten as an
                // accept/decline instead of landing in the text field.
                crossterm::event::KeyCode::Char('y') | crossterm::event::KeyCode::Char('Y')
                    if self.friends_add_input.is_empty() =>
                {
                    if let Some(row) = self.friends_incoming.get(self.friends_selected) {
                        self.net_busy = true;
                        self.pending_network_action = Some(NetworkAction::AcceptFriendRequest { id: row.friendship_id.clone() });
                    }
                }
                crossterm::event::KeyCode::Char('d') | crossterm::event::KeyCode::Char('D')
                    if self.friends_add_input.is_empty() =>
                {
                    if let Some(row) = self.friends_incoming.get(self.friends_selected) {
                        self.net_busy = true;
                        self.pending_network_action = Some(NetworkAction::RemoveFriendship { id: row.friendship_id.clone() });
                    }
                }
                crossterm::event::KeyCode::Enter => {
                    if !self.friends_add_input.is_empty() {
                        self.net_busy = true;
                        self.net_status = None;
                        let username = self.friends_add_input.clone();
                        self.friends_add_input.clear();
                        self.pending_network_action = Some(NetworkAction::SendFriendRequest { username });
                    }
                }
                crossterm::event::KeyCode::Backspace => {
                    self.friends_add_input.pop();
                }
                crossterm::event::KeyCode::Char(c) => {
                    if !key.modifiers.intersects(crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT) {
                        self.friends_add_input.push(c);
                    }
                }
                _ => {}
            },
            State::MultiplayerLobby => match key.code {
                crossterm::event::KeyCode::Esc => {
                    self.reset_multiplayer();
                    self.state = State::MainMenu;
                }
                // Only before a room exists - once connected (own room
                // created, or joined and appearing in the player list),
                // 'c'/'r' below take over instead of these editing the
                // now-irrelevant join-code field.
                crossterm::event::KeyCode::Char('c') | crossterm::event::KeyCode::Char('C')
                    if self.mp_own_room_code.is_none() && self.mp_local_player_id.is_none() =>
                {
                    self.net_busy = true;
                    self.mp_status = None;
                    self.pending_network_action = Some(NetworkAction::CreateMultiplayerRoom);
                }
                crossterm::event::KeyCode::Char('r') | crossterm::event::KeyCode::Char('R')
                    if self.mp_local_player_id.is_some() =>
                {
                    self.net_busy = true;
                    self.pending_network_action = Some(NetworkAction::MultiplayerReady);
                }
                crossterm::event::KeyCode::Enter
                    if self.mp_local_player_id.is_none() && !self.mp_room_code_input.trim().is_empty() =>
                {
                    self.net_busy = true;
                    self.mp_status = None;
                    let code = self.mp_room_code_input.trim().to_uppercase();
                    self.pending_network_action = Some(NetworkAction::JoinMultiplayerRoom { code });
                }
                crossterm::event::KeyCode::Backspace if self.mp_local_player_id.is_none() => {
                    self.mp_room_code_input.pop();
                }
                crossterm::event::KeyCode::Char(c) if self.mp_local_player_id.is_none() => {
                    if !key.modifiers.intersects(crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT) {
                        self.mp_room_code_input.push(c);
                    }
                }
                _ => {}
            },
            State::MultiplayerRace => match key.code {
                crossterm::event::KeyCode::Char(c) => {
                    if key.modifiers.intersects(crossterm::event::KeyModifiers::CONTROL | crossterm::event::KeyModifiers::ALT) {
                        return;
                    }
                    if !self.stats.is_running() { self.stats.start(); }
                    let was_correct = {
                        let pos = self.input.len();
                        let current_text = self.current_text().content.clone();
                        pos < current_text.len() && current_text.chars().nth(pos).map(|tc| tc == c).unwrap_or(false)
                    };
                    self.stats.note_keypress(was_correct);
                    self.input.push(c);
                    self.update_stats();
                }
                crossterm::event::KeyCode::Backspace => {
                    if !self.input.is_empty() {
                        self.input.pop();
                        self.update_stats();
                    }
                }
                crossterm::event::KeyCode::Esc => {
                    self.reset_multiplayer();
                    self.state = State::MainMenu;
                }
                _ => {}
            },
            State::MultiplayerResults => match key.code {
                crossterm::event::KeyCode::Enter | crossterm::event::KeyCode::Esc => {
                    self.reset_multiplayer();
                    self.state = State::MainMenu;
                }
                _ => {}
            },
        }

        // Check if the current text is finished
        if self.state == State::TypingGame && self.is_finished() {
            self.state = State::EndScreen;
            self.stats.stop();
        }
        // Multiplayer doesn't jump to a results screen the instant typing
        // finishes - the tui binary's main loop notices is_finished() here,
        // sends Finish over the connection, and set_mp_player_finished (see
        // above) is what actually transitions to MultiplayerResults, once
        // the server confirms it rather than the client assuming it.
        if self.state == State::MultiplayerRace && self.is_finished() && self.stats.is_running() {
            self.stats.stop();
        }
    }

    pub fn update_stats(&mut self) {
        if self.state == State::TypingGame || self.state == State::MultiplayerRace {
            let current_text = self.current_text().content.clone();
            self.stats.update(&self.input, &current_text);
        }
    }

    // Length-only, matching the web engine's game.rs - an uncorrected
    // mistake anywhere in the input must still let the test end once you've
    // typed as many characters as the text has. An exact-match requirement
    // meant one uncorrected typo anywhere (not just the last character) made
    // the test unfinishable, since nothing here caps input at the text's
    // length the way the web frontend does.
    pub fn is_finished(&self) -> bool {
        !self.input.is_empty() && self.input.len() >= self.current_text().content.len()
    }

    pub fn current_text(&self) -> &Text {
        self.mp_race_text.as_ref()
            .or(self.current_custom.as_ref())
            .or(self.current_words.as_ref())
            .unwrap_or(&self.texts[self.current_text_index])
    }

    pub fn get_input(&self) -> &str {
        self.input.as_str()
    }

    pub fn handle_backspace(&mut self) {
        if self.state == State::TypingGame && !self.input.is_empty() {
            self.input.pop();
            self.update_stats();
        }
    }

    pub fn handle_enter(&mut self) {
        match self.state {
            State::MainMenu => {
                self.state = State::TypingGame;
                self.reset();
            }
            State::EndScreen => {
                self.state = State::TypingGame;
                self.reset();
            }
            _ => {}
        }
    }

    pub fn handle_escape(&mut self) {
        match self.state {
            State::TypingGame => {
                self.using_custom = false;
                self.current_custom = None;
                self.state = State::MainMenu;
                self.reset();
            }
            State::EndScreen => {
                self.using_custom = false;
                self.current_custom = None;
                self.state = State::MainMenu;
                self.reset();
            }
            State::CustomTextPrompt | State::PassiveMode | State::Login | State::Leaderboard | State::Friends => {
                self.state = State::MainMenu;
            }
            State::MultiplayerLobby | State::MultiplayerRace | State::MultiplayerResults => {
                self.reset_multiplayer();
                self.state = State::MainMenu;
            }
            State::MainMenu => {
                self.should_exit = true;
            }
        }
    }

    pub fn get_progress(&self) -> f64 {
        if self.input.is_empty() {
            0.0
        } else {
            let total_chars = self.current_text().content.chars().count();
            let current_chars = self.input.chars().count();
            (current_chars as f64 / total_chars as f64) * 100.0
        }
    }

    pub fn update(&mut self) {
        if self.state == State::TypingGame {
            self.update_stats();
            // Time mode ends on the clock rather than at the end of the
            // text, so it needs its own check here - is_finished() only
            // fires from a keystroke, and the clock keeps running even if
            // the typist pauses.
            if self.time_mode_selected
                && self.stats.is_running()
                && self.stats.elapsed_time().as_secs_f64() >= self.time_duration as f64
            {
                self.state = State::EndScreen;
                self.stats.stop();
            }
            // Sample WPM once per elapsed second to build a compact sparkline
            let secs = self.stats.elapsed_time().as_secs() as usize;
            while self.wpm_history.len() < secs {
                self.wpm_history.push(self.stats.wpm().round() as u64);
            }
        } else if self.state == State::PassiveMode {
            self.update_passive();
        } else if self.state == State::MultiplayerRace {
            self.update_stats();
        }
    }
}

const PASSIVE_PACE_WPM: f64 = 130.0;
const PASSIVE_LINE_GAP_SECONDS: f64 = 0.6;

fn build_passive_schedule(chunks: &[crate::custom_text::CustomChunk]) -> Vec<f64> {
    let all_timed = chunks.iter().all(|c| c.time.is_some());
    if all_timed && !chunks.is_empty() {
        let base = chunks[0].time.unwrap_or(0.0);
        return chunks.iter().map(|c| c.time.unwrap_or(base) - base).collect();
    }
    let mut t = 0.0;
    let mut offsets = Vec::with_capacity(chunks.len());
    for c in chunks {
        offsets.push(t);
        let duration = (c.content.chars().count() as f64 / 5.0) / (PASSIVE_PACE_WPM / 60.0);
        t += duration + PASSIVE_LINE_GAP_SECONDS;
    }
    offsets
} 