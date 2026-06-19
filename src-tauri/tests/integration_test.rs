/// Build a minimal .sm file from header key-value pairs and optional note data.
fn make_sm(headers: &[(&str, &str)], notes: Option<&str>) -> String {
    let mut out = String::new();
    for (k, v) in headers {
        out.push_str(&format!("#{}:{};\n", k, v));
    }
    if let Some(n) = notes {
        out.push_str(n);
    }
    out
}

fn default_headers() -> Vec<(&'static str, &'static str)> {
    vec![
        ("TITLE", "Integration Test"),
        ("ARTIST", "Test Artist"),
        ("CREDIT", "TestMapper"),
        ("MUSIC", "song.ogg"),
        ("OFFSET", "0.000"),
        ("SAMPLESTART", "15.000"),
        ("BPMS", "0.000=120.000"),
        ("STOPS", ""),
    ]
}

fn four_key_hard_notes() -> &'static str {
    // Two measures: first has 4 taps, second has hold (col0:2 + col0:3 end)
    r#"#NOTES:
     dance-single:
     Hard:
     12:
     0.777,0.444,0.111,0.111,0.222:
1000
0100
0010
0001
,
2000
3000
0000
0000
;
"#
}

#[test]
fn integration_sm_parse_header_fields() {
    let content = make_sm(&default_headers(), None);
    // parse via the library
    let beatmap = henkan_lib::parse_sm(&content).unwrap();
    assert_eq!(beatmap.title, "Integration Test");
    assert_eq!(beatmap.artist, "Test Artist");
    assert_eq!(beatmap.creator, "TestMapper");
    assert_eq!(beatmap.audio_filename, "song.ogg");
    assert_eq!(beatmap.keys, 4);
    assert!((beatmap.preview_time - 15000.0).abs() < 0.01);
}

#[test]
fn integration_sm_parse_with_notes() {
    let content = make_sm(&default_headers(), Some(four_key_hard_notes()));
    let beatmap = henkan_lib::parse_sm(&content).unwrap();
    assert_eq!(beatmap.available_difficulties.len(), 1);
    assert_eq!(beatmap.difficulty_name, "Hard");
    // 4 taps in measure 0 + hold start (2000) + hold end (3000) in measure 1 = 5 notes
    assert_eq!(beatmap.notes.len(), 5);
    let holds: Vec<_> = beatmap.notes.iter().filter(|n| n.hold).collect();
    assert_eq!(holds.len(), 1);
    assert!(holds[0].hold_end_ms.unwrap() > holds[0].time_ms);
}

#[test]
fn integration_sm_with_negative_offset() {
    // Use headers directly, NOT default_headers (which already has OFFSET:0.000)
    let headers = vec![
        ("TITLE", "Negative Offset"),
        ("ARTIST", "Test"),
        ("MUSIC", "song.ogg"),
        ("OFFSET", "-0.500"),
        ("BPMS", "0.000=120.000"),
        ("STOPS", ""),
    ];
    let content = make_sm(&headers, Some(four_key_hard_notes()));
    let beatmap = henkan_lib::parse_sm(&content).unwrap();
    // Negative offset: timing point starts at -(-0.500) * 1000 = 500ms
    assert!((beatmap.timing_points[0].time_ms - 500.0).abs() < 1.0);
    // First note at beat 0 = 500ms (from offset compensation)
    assert!((beatmap.notes[0].time_ms - 500.0).abs() < 1.0, "first note at {}ms", beatmap.notes[0].time_ms);
}

#[test]
fn integration_sm_empty_song() {
    let content = make_sm(&[], Some(r#"#NOTES:
     dance-single:
     Beginner:
     1:
     0,0,0,0,0:
0000
;
"#));
    let beatmap = henkan_lib::parse_sm(&content).unwrap();
    // empty fields fall back to defaults
    assert_eq!(beatmap.title, "");
    assert_eq!(beatmap.keys, 4);
}
