# TyperPunk Project Checklist

## Directory Structure
```
typerpunk/
├── Cargo.toml                 # Main workspace configuration
├── Cargo.lock                 # Dependency lock file
├── install.sh                 # Installation script
├── README.md                  # Project documentation
├── LICENSE                    # License file
├── .gitignore                 # Git ignore rules
├── .gitattributes            # Git attributes
├── texts.txt                  # Sample typing texts
├── sentences.txt             # Sample sentences
├── config.json               # Configuration file
├── crates/                   # Crate modules
│   ├── core/                # Core functionality
│   │   ├── Cargo.toml      # Core crate configuration
│   │   └── src/            # Core source code
│   │       ├── app.rs      # Application state management
│   │       ├── config.rs   # Configuration management
│   │       ├── input.rs    # Input handling
│   │       ├── stats.rs    # Statistics tracking
│   │       ├── text.rs     # Text management
│   │       ├── theme.rs    # Theme management
│   │       └── ui.rs       # User interface
│   └── tui/                 # Terminal UI
│       ├── Cargo.toml      # TUI crate configuration
│       └── src/            # TUI source code
│           └── main.rs     # TUI entry point
├── target/                   # Build output directory
├── web/                     # web interface for typerpunk.com
└── original_working_tui_code/ # Reference implementation
```

## Project Status

### Core Features
- [x] Basic typing test functionality
- [x] WPM calculation
- [x] Accuracy tracking
- [x] Time tracking
- [x] Error highlighting
- [x] Multiple text support
- [x] Theme system
- [x] Configuration management

### Game Modes
- [x] Normal mode (singe player)
- [ ] Programming mode
- [ ] Security mode
- [ ] Multiplayer mode

### tui
- [x] Normal mode
- [x] stats
- [] 
- [] 
- [] 

### web
- [] normal mode
- [ ] Programming mode
- [ ] Security mode
- [ ] Multiplayer mode
- [] stats
- [ ] 
- [ ]

### UI/UX
- [x] Terminal UI
- [ ] Web interface
- [x] Theme customization
- [x] Responsive design
- [x] Keyboard shortcuts
- [x] Progress indicators
- [x] Statistics display

### Multiplayer
- [ ] Real-time competition
- [ ] Leaderboards
- [ ] User profiles
- [ ] Matchmaking
- [ ] Chat system

### Configuration
- [x] User preferences
- [x] Theme settings
- [ ] Game mode settings
- [ ] Multiplayer settings
- [ ] Key bindings

### Build & Deployment
- [x] Cross-platform support
- [ ] WebAssembly build
- [x] Installation script
- [ ] CI/CD pipeline
- [x] Documentation

### Testing
- [ ] Unit tests
- [ ] Integration tests
- [ ] Performance tests
- [ ] UI tests
- [ ] Multiplayer tests

## Common Core Features
- [x] Basic typing mechanics
- [x] Text loading and management
- [x] Statistics tracking
  - [x] WPM calculation
  - [x] Accuracy tracking
  - [x] Error counting
- [x] Theme management
- [x] Configuration system
- [x] Basic game modes
  - [x] Normal mode


## TUI Features (Keep Simple)
- [x] Terminal-based interface
- [x] Real-time typing feedback
- [x] Color-coded character matching
- [x] Basic statistics display
  - [x] Current WPM
  - [x] Time elapsed
  - [x] Accuracy
- [x] Simple menu system
- [x] Local configuration
- [x] Original UI layout
- [x] Stats updating without input

## Future Web Features (Separate Development)
- [ ] Web interface
- [ ] WebSocket-based multiplayer
- [ ] Real-time opponent tracking
- [ ] Web-based configuration
- [ ] Custom themes
- [ ] Advanced game modes
  - [ ] Programming mode
  - [ ] Security mode
  - [ ] Custom mode
  - [ ] Multiplayer mode
- [ ] Quote mode with different lengths
- [ ] Topic-based challenges
- [ ] Difficulty levels
- [ ] Guest mode support

## Dependencies

### Common Dependencies (Current)
- [x] serde = "1.0"
- [x] serde_json = "1.0"
- [x] anyhow = "1.0"
- [x] thiserror = "1.0"
- [x] config = "0.13"
- [x] dirs = "5.0"
- [x] rlua = "0.19"
- [x] rand = "0.8"

### TUI Dependencies (Current)
- [x] crossterm = "0.27"
- [x] ratatui = "0.24"

### Web Dependencies (Future)
- [ ] wasm-bindgen = "0.2"
- [ ] web-sys = "0.3"
- [ ] js-sys = "0.3"
- [ ] tokio-tungstenite = "0.20"
- [ ] futures-util = "0.3"

## Build Instructions

### Current
- [x] Install Rust
- [x] Build TUI version
- [x] Basic install script

### Future
- [ ] Web build setup
- [ ] Development server
- [ ] Production deployment
- [ ] Cross-platform installers 

# TyperPunk Fix Checklist

## Text Display and Cursor Issues
- [x] Fix cursor making characters invisible/overwriting them
- [x] Fix cursor not following properly to next lines
- [x] Fix text wrapping problems causing words to shift up unexpectedly
- [x] Fix space handling logic for incorrect inputs

## End Screen Problems
- [x] Remove unwanted green backgrounds from stats
- [x] Add hover functionality to graph to show WPM/raw values
- [x] Fix stats and content fitting on one screen
- [x] Add TyperPunk logo to top left
- [x] Fix time not restarting when clicking "Play Again"

## Layout and Styling Issues
- [ ] Remove unnecessary border from theme toggle button
- [ ] Fix time stat sometimes being out of view
- [ ] Remove unwanted scrollbar
- [ ] Improve mobile responsiveness
- [x] Move WPM and ACC stats to extreme sides in game state
- [x] Fix end screen stats layout:
  - [x] Keep WPM in same position as game state
  - [x] Replace ACC with errors in same position
  - [x] Center graph between stats
  - [x] Keep time in same position
- [x] Fix raw WPM calculation to show peak typing speed
- [x] Fix text display issues:
  - [x] Prevent word breaking across lines
  - [x] Fix left alignment
  - [x] Center text container properly in x-axis

## Implementation Notes

### Text Display and Cursor Issues
- Cursor visibility is controlled by CSS in `.text-display span.current::after`
- Text wrapping is handled in `.text-display` class with `white-space: pre-wrap`
- Space handling logic is in `TypingGame.tsx` renderText function

### End Screen Improvements
- Stats styling is in `.end-screen-stat` classes
- Graph hover functionality needs to be added to `.graph-container`
- Layout is controlled by `.end-screen` and `.end-screen-stats` classes
- Logo placement is in `.logo` class

### Layout and Styling
- Theme toggle styling is in `.theme-toggle` class
- Time stat positioning is in `.time-stat` class
- Scrollbar and mobile responsiveness are in media queries

### Stats Layout
- WPM and ACC stats should be at extreme edges of the screen
- End screen should maintain same positions as game state
- Graph should be centered between stats

### Raw WPM Calculation
- Should show peak typing speed
- Graph should show speed variations over time
- Current implementation incorrectly uses total chars instead of peak speed

### Text Display
- Words should not break across lines
- Text container needs proper x-axis centering
- Left alignment needs adjustment

## Progress Tracking
- [x] Phase 1: Text Display and Cursor Issues
- [ ] Phase 2: End Screen Problems
- [ ] Phase 3: Layout and Styling Issues 

## UI/Gameplay Improvements
- [ ] Prevent backspace on correct characters (except for ctrl+backspace for word deletion)
- [ ] Fix/prevent reset accuracy to 100% when correcting misspellings
- [ ] Other theme toggle button in top right corner
- [ ] Reposition text/typing paragraph to north position
- [ ] Add empty space below typing area for future game modes
- [ ] In endscreen:
  - [ ] Replace empty space with graph
  - [ ] Keep text visible at top
  - [ ] Position WPM on left side of graph
  - [ ] Position errors on right side of graph
  - [ ] Position time at bottom
  - [ ] Add graph axes with:
    - [ ] 0 in bottom left corner
    - [ ] WPM on y-axis
    - [ ] Time in whole seconds on x-axis
- [ ] Fix raw WPM calculation (different from regular WPM)
- [ ] Update end screen buttons to match main menu button style (border/colors) 