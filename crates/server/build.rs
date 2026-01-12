// sqlx::migrate! reads the migrations directory at compile time, but cargo
// only watches source files. Without this, adding a migration does not make
// cargo rebuild, so the new binary silently ships the old migration set and
// the schema change never runs.
fn main() {
    println!("cargo:rerun-if-changed=migrations");
}
