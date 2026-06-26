#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();

    // If file paths were passed (dragged onto the .exe), process headlessly
    if args.len() > 1 {
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

    henkan_lib::run()
}
