use std::io;

fn main() -> io::Result<()> {
    let args: Vec<String> = std::env::args().collect();
    henkan_lib::cli_tui::run(&args)
}
