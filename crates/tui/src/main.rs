use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    Terminal,
};
use std::{io, error::Error as StdError};
use typerpunk_core::{
    app::App,
    input::InputHandler,
    ui::draw,
};

fn main() -> Result<(), Box<dyn StdError>> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app and run it
    let app = match App::new() {
        Ok(app) => app,
        Err(e) => {
            cleanup_terminal(&mut terminal)?;
            return Err(e);
        }
    };

    let mut input_handler = InputHandler::new(app);
    let res = run_app(&mut terminal, &mut input_handler);

    // Restore terminal
    cleanup_terminal(&mut terminal)?;

    if let Err(err) = res {
        println!("Error: {:?}", err);
    }

    Ok(())
}

fn cleanup_terminal<B: ratatui::backend::Backend + std::io::Write>(terminal: &mut Terminal<B>) -> io::Result<()> {
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;
    Ok(())
}

fn run_app<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    input_handler: &mut InputHandler,
) -> io::Result<()> {
    let mut last_render = std::time::Instant::now();
    let render_interval = std::time::Duration::from_millis(16); // ~60 FPS

    loop {
        // Update app state to refresh timers and stats
        input_handler.app.update();
        terminal.draw(|f| draw(f, &input_handler.app))?;

        if event::poll(std::time::Duration::from_millis(0))? {
            if let Event::Key(key) = event::read()? {
                input_handler.app.handle_input(key);
                if input_handler.app.should_exit {
                    return Ok(());
                }
            }
        }

        // Limit render rate
        let now = std::time::Instant::now();
        if now.duration_since(last_render) < render_interval {
            std::thread::sleep(render_interval - now.duration_since(last_render));
        }
        last_render = now;

        if input_handler.app.should_exit {
            return Ok(());
        }
    }
} 