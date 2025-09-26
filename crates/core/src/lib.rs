pub mod config;
pub mod game;
pub mod stats;
pub mod text;
pub mod types;

#[cfg(feature = "tui")]
pub mod app;
#[cfg(feature = "tui")]
pub mod input;
#[cfg(feature = "tui")]
pub mod ui;
#[cfg(feature = "tui")]
pub mod theme;

#[cfg(feature = "multiplayer")]
pub mod multiplayer;

#[cfg(feature = "wasm")]
pub mod wasm;

#[cfg(target_arch = "wasm32")]
pub use wasm::TyperPunkGame;