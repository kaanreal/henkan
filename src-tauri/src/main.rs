#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Known CLI subcommands that trigger CLI/TUI mode instead of GUI.
const CLI_COMMANDS: &[&str] = &[
    "quick", "convert", "export", "parse", "help",
    "results", "open", "clear", "settings", "set", "reset",
    "exit", "quit",
];

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // If a known CLI subcommand is passed, run CLI/TUI mode
    if args.len() > 1 {
        let first = &args[1];
        if CLI_COMMANDS.contains(&first.as_str()) || matches!(first.as_str(), "-h" | "--help") {
            let _ = henkan_lib::cli_tui::run(&args);
            return;
        }
        // File paths dragged onto the app → process headlessly
        let files: Vec<String> = args[1..]
            .iter()
            .filter(|a| {
                let lower = a.to_lowercase();
                lower.ends_with(".osu") || lower.ends_with(".osz") || lower.ends_with(".sm")
            })
            .cloned()
            .collect();
        if !files.is_empty() {
            henkan_lib::headless_process(&files);
            return;
        }
    }

    // No args / unrecognized: check if running from a terminal
    // (on non-Windows, the app binary can be invoked directly from
    //  the command line — launch the interactive TUI in that case)
    #[cfg(not(windows))]
    {
        use crossterm::tty::IsTty;
        if std::io::stdout().is_tty() && args.len() == 1 {
            let _ = henkan_lib::cli_tui::run(&args);
            return;
        }
    }

    // Otherwise launch the GUI
    henkan_lib::run()
}
