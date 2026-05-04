use super::bus::SharedBus;
use super::protocol::{dispatch, JsonRpcRequest};
use anyhow::Result;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::thread;

pub fn socket_path() -> PathBuf {
    let base = dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("platter").join("mcp.sock")
}

/// Run the GUI-side socket listener. Each connecting client gets its own
/// thread that proxies JSON-RPC messages to the review bus. Returns a
/// handle on the listener thread.
pub fn spawn_listener(bus: SharedBus) -> Result<()> {
    let path = socket_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    // Remove stale socket if present
    let _ = std::fs::remove_file(&path);

    let listener = UnixListener::bind(&path)?;
    eprintln!("[platter] mcp socket listening at {}", path.display());

    thread::spawn(move || {
        for incoming in listener.incoming() {
            match incoming {
                Ok(stream) => {
                    let bus = bus.clone();
                    thread::spawn(move || {
                        if let Err(e) = handle_client(stream, bus) {
                            eprintln!("[platter] mcp client error: {e}");
                        }
                    });
                }
                Err(e) => {
                    eprintln!("[platter] accept error: {e}");
                }
            }
        }
    });
    Ok(())
}

fn handle_client(mut stream: UnixStream, bus: SharedBus) -> Result<()> {
    let read_stream = stream.try_clone()?;
    let mut reader = BufReader::new(read_stream);

    let mut line = String::new();
    loop {
        line.clear();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            break; // peer closed
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Each MCP request is its own thread because tools/call BLOCKS
        // waiting for a human. We can't process the next request until
        // this one finishes if we serialize.
        let bus_for_thread = bus.clone();
        let mut stream_for_thread = match stream.try_clone() {
            Ok(s) => s,
            Err(_) => break,
        };
        let line_clone = trimmed.to_string();

        thread::spawn(move || {
            let response = match serde_json::from_str::<JsonRpcRequest>(&line_clone) {
                Ok(req) => dispatch(req, &bus_for_thread),
                Err(e) => Some(super::protocol::err(
                    serde_json::Value::Null,
                    -32700,
                    &format!("parse error: {}", e),
                )),
            };
            if let Some(resp) = response {
                if let Ok(text) = serde_json::to_string(&resp) {
                    let _ = writeln!(&mut stream_for_thread, "{}", text);
                }
            }
        });
    }
    Ok(())
}

/// Connect from a stdio child to the running GUI's socket. Returns the
/// stream, ready for line-based JSON-RPC.
pub fn connect_to_gui() -> Result<UnixStream> {
    let path = socket_path();
    UnixStream::connect(&path).map_err(|e| {
        anyhow::anyhow!(
            "Could not connect to platter socket at {}: {}\n\nIs the platter app running? Start it with `npm run tauri dev` or by opening platter.app.",
            path.display(),
            e
        )
    })
}
