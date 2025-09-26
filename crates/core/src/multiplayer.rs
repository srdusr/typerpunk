#[cfg(feature = "multiplayer")]
use tokio_tungstenite::tungstenite::Message;
#[cfg(feature = "multiplayer")]
use futures_util::{SinkExt, StreamExt};
use serde::{Serialize, Deserialize};
use std::net::SocketAddr;
use crate::{app::App, config::GameConfig, game::Platform};
use std::error::Error;

#[derive(Debug, Serialize, Deserialize)]
pub enum MultiplayerMessage {
    Join,
    Progress { progress: f32, wpm: f32 },
    Finish { wpm: f32, time: f32 },
}

#[derive(Debug)]
pub struct MultiplayerManager {
    config: GameConfig,
}

impl MultiplayerManager {
    pub fn new(config: GameConfig) -> Self {
        Self { config }
    }

    #[cfg(feature = "multiplayer")]
    pub async fn start_server(&self, addr: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        tokio::spawn(async move {
            let server = tokio::net::TcpListener::bind(addr).await?;
            while let Ok((stream, _)) = server.accept().await {
                let ws_stream = tokio_tungstenite::accept_async(stream).await?;
                let (write, read) = ws_stream.split();
                read.forward(write).await?;
            }
            Ok::<(), Box<dyn Error + Send + Sync>>(())
        });
        Ok(())
    }

    #[cfg(feature = "multiplayer")]
    pub async fn host_game(&mut self, addr: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        tokio::spawn(async move {
            let server = tokio::net::TcpListener::bind(addr).await?;
            while let Ok((stream, _)) = server.accept().await {
                let ws_stream = tokio_tungstenite::accept_async(stream).await?;
                let (write, read) = ws_stream.split();
                read.forward(write).await?;
            }
            Ok::<(), Box<dyn Error + Send + Sync>>(())
        });
        Ok(())
    }

    #[cfg(feature = "multiplayer")]
    pub async fn join_game(&mut self, url: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        let (ws_stream, _) = tokio_tungstenite::connect_async(url).await?;
        let (mut write, mut read) = ws_stream.split();

        // Send join message
        let join_msg = serde_json::to_string(&MultiplayerMessage::Join)?;
        write.send(Message::Text(join_msg)).await?;

        // Handle incoming messages
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        println!("Received: {}", text);
                    }
                    Err(e) => {
                        eprintln!("Error receiving message: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub fn send_progress(&self, _progress: f32, _wpm: f32) {
        #[cfg(feature = "multiplayer")]
        let _msg = MultiplayerMessage::Progress { progress: _progress, wpm: _wpm };
        // Send message implementation
    }

    pub fn send_finish(&self, _wpm: f32, _time: f32) {
        #[cfg(feature = "multiplayer")]
        let _msg = MultiplayerMessage::Finish { wpm: _wpm, time: _time };
        // Send message implementation
    }
}

#[cfg(target_arch = "wasm32")]
impl MultiplayerManager {
    pub async fn connect_web(&mut self, _room_id: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        // Connect to WebSocket server for web multiplayer
        Ok(())
    }
}

#[cfg(feature = "multiplayer")]
impl MultiplayerManager {
    pub async fn connect_to_server(&self, url: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        let (ws_stream, _) = tokio_tungstenite::connect_async(url).await?;
        let (mut write, mut read) = ws_stream.split();

        // Send join message
        let join_msg = serde_json::to_string(&MultiplayerMessage::Join)?;
        write.send(Message::Text(join_msg)).await?;

        // Handle incoming messages
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        println!("Received: {}", text);
                    }
                    Err(e) => {
                        eprintln!("Error receiving message: {}", e);
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }
} 