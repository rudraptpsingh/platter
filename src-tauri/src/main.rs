#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--mcp-stdio") {
        if let Err(e) = platter_lib::run_mcp_stdio() {
            eprintln!("platter mcp-stdio: {}", e);
            std::process::exit(1);
        }
        return;
    }
    platter_lib::run()
}
