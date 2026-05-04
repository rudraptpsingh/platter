use super::socket::connect_to_gui;
use anyhow::Result;
use std::io::{BufRead, BufReader, Write};
use std::sync::Arc;
use std::thread;

/// Run the stdio MCP proxy. Reads JSON-RPC lines from stdin, forwards to the
/// running GUI over a Unix socket, and pipes responses back to stdout.
///
/// This is the entry point when platter is invoked with `--mcp-stdio`.
pub fn run() -> Result<()> {
    let stream = connect_to_gui()?;
    let stream = Arc::new(parking_lot::Mutex::new(stream));

    // Thread A: stdin → socket
    let stream_in = stream.clone();
    let in_handle = thread::spawn(move || -> Result<()> {
        let stdin = std::io::stdin();
        let mut reader = stdin.lock();
        let mut line = String::new();
        loop {
            line.clear();
            let n = reader.read_line(&mut line)?;
            if n == 0 {
                break;
            }
            let mut s = stream_in.lock();
            s.write_all(line.as_bytes())?;
            s.flush()?;
        }
        Ok(())
    });

    // Thread B: socket → stdout
    let stream_out = stream.clone();
    let out_handle = thread::spawn(move || -> Result<()> {
        // We can't share the BufReader across the mutex, so clone the underlying
        // stream and read from it directly. UnixStream is bidirectional and
        // try_clone() shares the same underlying file descriptor.
        let read_stream = {
            let s = stream_out.lock();
            s.try_clone()?
        };
        let mut reader = BufReader::new(read_stream);
        let mut line = String::new();
        let stdout = std::io::stdout();
        loop {
            line.clear();
            let n = reader.read_line(&mut line)?;
            if n == 0 {
                break;
            }
            let mut out = stdout.lock();
            out.write_all(line.as_bytes())?;
            out.flush()?;
        }
        Ok(())
    });

    // Wait for either side to terminate (Claude closes stdin, or GUI dies)
    let _ = in_handle.join();
    let _ = out_handle.join();
    Ok(())
}
