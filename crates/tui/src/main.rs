mod config_file;
mod multiplayer_net;
mod net;

use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use multiplayer_net::{LocalUpdate, MultiplayerConnection, NetEvent as MpNetEvent};
use net::{NetClient, NetResponse};
use ratatui::{
    backend::CrosstermBackend,
    Terminal,
};
use std::{io, error::Error as StdError};
use typerpunk_core::{
    app::{App, MpPlayer, NetworkAction, State},
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
    let mut app = match App::new() {
        Ok(app) => app,
        Err(e) => {
            cleanup_terminal(&mut terminal)?;
            return Err(e);
        }
    };

    // A saved token means a returning user doesn't have to log in again --
    // restored eagerly so the main menu's account line reflects it from the
    // very first frame.
    let saved_auth = config_file::load();
    if let (Some(token), Some(username)) = (saved_auth.token, saved_auth.username) {
        app.restore_session(token, username);
    }

    let net_client = NetClient::spawn();

    let mut input_handler = InputHandler::new(app);
    let res = run_app(&mut terminal, &mut input_handler, &net_client);

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

fn apply_net_response(app: &mut App, response: NetResponse) {
    match response {
        NetResponse::LoginOk { username, token } => {
            app.set_login_success(username.clone(), token.clone());
            // Only a real login/register issues a fresh token - persist it
            // so the next launch starts already signed in.
            if let Some(token) = token {
                config_file::save(&config_file::AuthConfig { token: Some(token), username: Some(username) });
            }
        }
        NetResponse::Error(message) => app.set_net_error(message),
        NetResponse::Leaderboard(entries) => app.set_leaderboard(entries),
        NetResponse::Friends { list, incoming, outgoing } => app.set_friends(list, incoming, outgoing),
    }
}

// PlayerList arrives every time someone joins/readies/leaves, not just
// once - resetting progress/wpm to zero on every refresh would erase a
// mid-race player's visible position each time the roster is re-sent, so
// existing entries carry theirs forward instead of being rebuilt from
// scratch.
fn merge_player_list(existing: &[MpPlayer], incoming: Vec<typerpunk_core::multiplayer::PlayerInfo>) -> Vec<MpPlayer> {
    incoming
        .into_iter()
        .map(|p| {
            let (progress, wpm) = existing.iter().find(|e| e.id == p.id).map(|e| (e.progress, e.wpm)).unwrap_or((0.0, 0.0));
            MpPlayer { id: p.id, name: p.name, ready: p.ready, progress, wpm }
        })
        .collect()
}

fn apply_mp_event(app: &mut App, event: MpNetEvent) {
    match event {
        MpNetEvent::Ignored => {}
        MpNetEvent::RoomCreated { code } => app.set_mp_room_created(code),
        MpNetEvent::Joined { player_id } => app.set_mp_joined(player_id),
        MpNetEvent::PlayerList(players) => {
            let merged = merge_player_list(&app.mp_players, players);
            app.set_mp_player_list(merged);
        }
        MpNetEvent::Countdown(seconds) => app.set_mp_countdown(seconds),
        MpNetEvent::Start(text) => app.set_mp_start(text),
        MpNetEvent::PlayerProgress { player_id, percent, wpm } => app.set_mp_player_progress(&player_id, percent, wpm),
        MpNetEvent::PlayerFinished { player_id, wpm, place } => app.set_mp_player_finished(&player_id, "opponent", wpm, place),
        MpNetEvent::RoomClosed(reason) => app.set_mp_room_closed(reason),
        MpNetEvent::Error(message) => app.set_mp_error(message),
    }
}

fn run_app<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    input_handler: &mut InputHandler,
    net_client: &NetClient,
) -> io::Result<()> {
    let mut last_render = std::time::Instant::now();
    let render_interval = std::time::Duration::from_millis(16); // ~60 FPS
    let mut mp_connection: Option<MultiplayerConnection> = None;

    loop {
        // Update app state to refresh timers and stats
        input_handler.app.update();

        // Drain whatever the network workers have finished since last frame
        // - never blocks, since try_recv() only returns what's already
        // there.
        while let Some(response) = net_client.try_recv() {
            apply_net_response(&mut input_handler.app, response);
        }
        if let Some(conn) = &mp_connection {
            while let Some(event) = conn.try_recv() {
                apply_mp_event(&mut input_handler.app, event);
            }
        }

        // Leaving multiplayer entirely (Esc from lobby/race/results resets
        // this on the app side) drops the connection here too, so the
        // background thread notices its channels are gone and closes the
        // socket instead of lingering for the rest of the process.
        let in_multiplayer = matches!(
            input_handler.app.state,
            State::MultiplayerLobby | State::MultiplayerRace | State::MultiplayerResults
        );
        if !in_multiplayer && mp_connection.is_some() {
            mp_connection = None;
        }

        // A race that's finished typing (is_finished(), handled inside
        // app.rs's own tick) but hasn't yet heard the server confirm it via
        // PlayerFinished still needs its Finish message actually sent --
        // driven here every frame rather than per-keypress, since finishing
        // is a state the typist arrives at continuously, not a discrete key.
        if input_handler.app.state == State::MultiplayerRace && !input_handler.app.mp_finish_sent {
            if input_handler.app.is_finished() {
                if let Some(conn) = &mp_connection {
                    conn.send(LocalUpdate::Finish {
                        wpm: input_handler.app.stats.wpm() as f32,
                        accuracy: input_handler.app.stats.accuracy() as f32,
                        time: input_handler.app.stats.elapsed_time().as_secs_f32(),
                    });
                }
                input_handler.app.mp_finish_sent = true;
            } else if let Some(conn) = &mp_connection {
                let percent = input_handler.app.get_progress() as f32;
                let wpm = input_handler.app.stats.wpm() as f32;
                conn.send(LocalUpdate::Progress { percent, wpm });
            }
        }

        terminal.draw(|f| draw(f, &input_handler.app))?;

        if event::poll(std::time::Duration::from_millis(0))? {
            if let Event::Key(key) = event::read()? {
                input_handler.app.handle_input(key);
                if let Some(action) = input_handler.app.pending_network_action.take() {
                    match action {
                        NetworkAction::CreateMultiplayerRoom => {
                            let name = input_handler.app.logged_in_username.clone().unwrap_or_else(|| "Guest".to_string());
                            mp_connection = Some(MultiplayerConnection::spawn(config_file::server_url(), config_file::server_ws_url(), None, name));
                        }
                        NetworkAction::JoinMultiplayerRoom { code } => {
                            let name = input_handler.app.logged_in_username.clone().unwrap_or_else(|| "Guest".to_string());
                            mp_connection = Some(MultiplayerConnection::spawn(config_file::server_url(), config_file::server_ws_url(), Some(code), name));
                        }
                        NetworkAction::MultiplayerReady => {
                            if let Some(conn) = &mp_connection {
                                conn.send(LocalUpdate::Ready);
                            }
                            input_handler.app.net_busy = false;
                        }
                        other => net_client.send(other, input_handler.app.auth_token.clone()),
                    }
                }
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