use std::path::{Path, PathBuf};

/// What osu! accepts as a background image. The `[Events]` block also carries
/// video and storyboard entries in the same shape, so the extension is what
/// keeps a `.mp4` out of the banner.
const IMAGE_EXTENSIONS: [&str; 4] = ["jpg", "jpeg", "png", "bmp"];

/// A background far larger than this is not a beatmap background, and pushing it
/// through the IPC bridge would stall the window.
pub const MAX_IMAGE_BYTES: u64 = 16 * 1024 * 1024;

/// Pulls the background file out of a `.osu` file's `[Events]` block.
///
/// Events are `type,startTime,"file",x,y`. Backgrounds are type `0`, spelled
/// either as the number or as the word, and everything after the file name is
/// optional. Lines outside the block are ignored, so a storyboard that happens
/// to mention an image cannot win over the real background.
pub fn background_name(osu: &str) -> Option<String> {
    let mut in_events = false;
    for line in osu.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_events = line.eq_ignore_ascii_case("[Events]");
            continue;
        }
        if !in_events || line.is_empty() || line.starts_with("//") {
            continue;
        }

        let mut fields = line.split(',');
        let kind = match fields.next() {
            Some(kind) => kind.trim(),
            None => continue,
        };
        if kind != "0" && !kind.eq_ignore_ascii_case("Background") {
            continue;
        }
        let _start = fields.next();
        let name = match fields.next() {
            Some(name) => name.trim().trim_matches('"').trim(),
            None => continue,
        };
        if name.is_empty() || !is_image(name) {
            continue;
        }
        return Some(name.to_string());
    }
    None
}

fn is_image(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    IMAGE_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

/// Resolves a background reference against the map folder.
///
/// osu! writes these with Windows separators and they may point into a
/// storyboard subfolder, so the components are walked rather than joined blind:
/// anything that could climb out of the folder is refused here, before the
/// caller's canonicalised containment check ever sees it.
pub fn resolve(dir: &Path, name: &str) -> Option<PathBuf> {
    let name = name.trim();
    if name.is_empty() || name.contains(':') {
        return None;
    }

    let mut path = dir.to_path_buf();
    let mut segments = 0;
    for part in name.split(['/', '\\']) {
        let part = part.trim();
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." || part.chars().any(|c| c.is_control()) {
            return None;
        }
        path.push(part);
        segments += 1;
    }

    (segments > 0).then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    const MAP: &str = concat!(
        "osu file format v14\r\n",
        "\r\n",
        "[General]\r\n",
        "AudioFilename: audio.mp3\r\n",
        "\r\n",
        "[Events]\r\n",
        "//Background and Video events\r\n",
        "0,0,\"bg.jpg\",0,0\r\n",
        "//Break Periods\r\n",
        "2,1000,2000\r\n",
        "\r\n",
        "[TimingPoints]\r\n",
        "0,500,4,2,0,60,1,0\r\n",
    );

    #[test]
    fn reads_the_background_out_of_the_events_block() {
        assert_eq!(background_name(MAP), Some("bg.jpg".to_string()));
    }

    #[test]
    fn accepts_the_word_spelling_and_a_missing_offset() {
        assert_eq!(
            background_name("[Events]\nBackground,0,\"art.png\""),
            Some("art.png".to_string())
        );
    }

    #[test]
    fn skips_videos_and_takes_the_image_below_them() {
        let events = "[Events]\n1,0,\"intro.mp4\",0,0\n0,0,\"bg.jpeg\",0,0\n";
        assert_eq!(background_name(events), Some("bg.jpeg".to_string()));
    }

    #[test]
    fn ignores_images_named_outside_the_events_block() {
        let map = "[General]\n0,0,\"bg.jpg\",0,0\n\n[TimingPoints]\n0,0,\"other.jpg\",0,0\n";
        assert_eq!(background_name(map), None);
    }

    #[test]
    fn reports_nothing_when_the_map_has_no_background() {
        assert_eq!(
            background_name("[Events]\n//Background and Video events\n"),
            None
        );
        assert_eq!(background_name(""), None);
    }

    #[test]
    fn resolves_a_storyboard_subfolder_written_with_backslashes() {
        let dir = Path::new(r"C:\Songs\1 Map");
        assert_eq!(
            resolve(dir, r"SB\bg.jpg"),
            Some(dir.join("SB").join("bg.jpg"))
        );
    }

    #[test]
    fn refuses_references_that_climb_out_of_the_map_folder() {
        let dir = Path::new(r"C:\Songs\1 Map");
        assert_eq!(resolve(dir, r"..\..\Windows\win.ini"), None);
        assert_eq!(resolve(dir, r"C:\Windows\win.ini"), None);
        assert_eq!(resolve(dir, "  "), None);
    }
}
