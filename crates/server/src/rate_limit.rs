use dashmap::DashMap;
use std::hash::Hash;
use std::sync::Arc;
use std::time::{Duration, Instant};

// Fixed-window limiter, generic over whatever key makes sense for the
// endpoint (client IP for unauthenticated auth attempts, user id for an
// authenticated endpoint like stats submission). Good enough to blunt
// brute force / scripted abuse against a single-instance deployment without
// pulling in a separate crate; a multi-instance deployment would need this
// backed by a shared store (e.g. the DB or Redis) instead.
#[derive(Clone)]
pub struct RateLimiter<K: Eq + Hash + Clone + Send + Sync + 'static = std::net::IpAddr> {
    hits: Arc<DashMap<K, (Instant, u32)>>,
    max_attempts: u32,
    window: Duration,
}

impl<K: Eq + Hash + Clone + Send + Sync + 'static> RateLimiter<K> {
    pub fn new(max_attempts: u32, window: Duration) -> Self {
        Self { hits: Arc::new(DashMap::new()), max_attempts, window }
    }

    /// Returns true if this key is still within its allowance and records the attempt.
    pub fn check(&self, key: K) -> bool {
        let now = Instant::now();
        let mut entry = self.hits.entry(key).or_insert((now, 0));
        if now.duration_since(entry.0) > self.window {
            *entry = (now, 0);
        }
        entry.1 += 1;
        entry.1 <= self.max_attempts
    }
}
