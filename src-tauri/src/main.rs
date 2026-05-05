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
    // First positional arg that isn't a flag is treated as a folder to open.
    let open_folder: Option<String> = args.iter().skip(1)
        .find(|a| !a.starts_with('-'))
        .map(|p| {
            // Resolve relative paths against cwd so the app always gets an absolute path.
            let path = std::path::Path::new(p);
            if path.is_absolute() {
                p.clone()
            } else {
                std::env::current_dir()
                    .map(|cwd| cwd.join(path).to_string_lossy().into_owned())
                    .unwrap_or_else(|_| p.clone())
            }
        });
    platter_lib::run(open_folder)
}
