// In-universe naming for TyperPunk's multiplayer race modes.

pub const APP_NAME: &str = "TyperPunk";

/// A player or bot in a race. "Runner" is our own term for a race participant.
pub const PARTICIPANT_LABEL: &str = "Runner";

pub mod modes {
    /// Terminal Duel: two runners' text execution shown side by side, like
    /// racing shells. Cheapest of the three to build well; on-brand.
    pub const TERMINAL_DUEL: &str = "Terminal Duel";

    /// Breach Protocol: each runner chips through a stack of defensive
    /// layers ("Wardens") with correct keystrokes; first to clear them wins.
    pub const BREACH_PROTOCOL: &str = "Breach Protocol";

    /// Signal Run: runners are pulses of light racing along a circuit trace
    /// toward a destination node. The animated, particle-heavy visual.
    pub const SIGNAL_RUN: &str = "Signal Run";
}

/// A single defensive layer in Breach Protocol. Renamed from the generic
/// "firewall layer" to keep the game's own vocabulary distinct.
pub const WARDEN_LABEL: &str = "Warden";
