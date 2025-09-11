use bevy::prelude::*;

pub mod breach;
pub mod signal;
pub mod terminal;

/// Which race visualization is currently on screen. Switchable at runtime
/// (keys 1/2/3 in the demo) so all three can be compared side by side
/// during development instead of committing to one before they're built.
#[derive(States, Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum RaceVisual {
    #[default]
    TerminalDuel,
    BreachProtocol,
    SignalRun,
}
