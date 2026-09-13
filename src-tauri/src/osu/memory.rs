use std::path::PathBuf;
use std::str::FromStr;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use rosu_mem::process::{Process, ProcessTraits};
use rosu_mem::signature::Signature;
use serde::Serialize;
use windows::Win32::Foundation::CloseHandle;

const PROCESS_NAME: &str = "osu!.exe";
const BASE_SIGNATURE: &str = "F8 01 74 04 83 65";
const EXCLUDE_WORDS: [&str; 2] = ["umu-run", "waitforexitandrun"];

const BEATMAP_PTR: i32 = 0xC;
const ARTIST: i32 = 0x18;
const TITLE: i32 = 0x24;
const FOLDER: i32 = 0x78;
const CREATOR: i32 = 0x7C;
const FILE: i32 = 0x90;
const DIFFICULTY: i32 = 0xAC;
const MAP_ID: i32 = 0xC8;
const SET_ID: i32 = 0xCC;

const STRING_LIMIT: usize = 300;
const SHORT_LIMIT: usize = 100;

/// Reading an attached process is a handful of `ReadProcessMemory` calls, so the
/// watcher can follow song select closely. Finding osu! again is far dearer,
/// hence the slower beat while nothing is attached.
pub const ATTACHED_INTERVAL: Duration = Duration::from_millis(500);
pub const IDLE_INTERVAL: Duration = Duration::from_millis(2000);

/// Resolving the base address walks every memory region in osu!. When that
/// fails the client is running but unreadable, and retrying it every beat would
/// keep a core busy for as long as it stayed that way.
const ATTACH_BACKOFF: Duration = Duration::from_secs(20);

const UNREADABLE: &str =
    "osu! is running but Cascade cannot read it. This usually means osu! updated its internals; \
     Cascade needs an update to follow it.";

const NOT_RUNNING: &str = "osu! is not running. Start it and pick a map first.";
const NO_MAP: &str = "osu! has no map selected yet.";

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SelectedMap {
    pub folder: String,
    pub file: String,
    pub artist: String,
    pub title: String,
    pub creator: String,
    pub difficulty: String,
    pub map_id: i32,
    pub set_id: i32,
    pub osu_root: Option<String>,
}

/// What the watcher last saw. `running` without `connected` means osu! is up but
/// Cascade cannot read it, which the UI reports differently from osu! being
/// closed.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Live {
    pub running: bool,
    pub connected: bool,
    pub map: Option<SelectedMap>,
    pub problem: Option<String>,
}

impl Live {
    fn connected(map: Option<SelectedMap>) -> Self {
        Self {
            running: true,
            connected: true,
            map,
            problem: None,
        }
    }

    fn unreadable() -> Self {
        Self {
            running: true,
            connected: false,
            map: None,
            problem: Some(UNREADABLE.to_string()),
        }
    }

    /// How long to wait before looking again.
    pub fn interval(&self) -> Duration {
        if self.connected {
            ATTACHED_INTERVAL
        } else {
            IDLE_INTERVAL
        }
    }
}

/// rosu-mem hands back an open process handle and never closes it, so every
/// attach leaks one without this guard.
struct Owned(Option<Process>);

impl Owned {
    fn find() -> Option<Self> {
        Process::find_process(PROCESS_NAME, &EXCLUDE_WORDS)
            .ok()
            .map(|process| Self(Some(process)))
    }

    fn get(&self) -> Option<&Process> {
        self.0.as_ref()
    }

    /// Collects the memory regions the signature scan searches. `read_regions`
    /// takes the process by value, so ownership moves into the returned guard and
    /// the old one drops without closing anything.
    fn scan_regions(mut self) -> Option<Self> {
        let process = self.0.take()?;
        process
            .read_regions()
            .ok()
            .map(|scanned| Self(Some(scanned)))
    }
}

impl Drop for Owned {
    fn drop(&mut self) {
        if let Some(process) = self.0.as_ref() {
            unsafe {
                let _ = CloseHandle(process.handle);
            }
        }
    }
}

struct Attached {
    owned: Owned,
    base: i32,
}

enum Reading {
    Map(SelectedMap),
    NoMap,
    /// The process stopped answering, so the attachment is stale.
    Lost,
}

/// Holds the attachment to osu! across calls. The previous reader re-found the
/// process and re-walked every memory region on each call, which cost hundreds
/// of milliseconds and leaked a process handle every time.
#[derive(Default)]
pub struct Watcher {
    state: Mutex<State>,
}

impl Watcher {
    /// Reads osu! once, reusing the existing attachment when there is one.
    pub fn poll(&self) -> Live {
        self.lock().read()
    }

    /// The map osu! sits on, or the reason there is not one.
    pub fn selected_map(&self) -> Result<SelectedMap, String> {
        let live = self.poll();
        if let Some(map) = live.map {
            return Ok(map);
        }
        Err(match (live.running, live.problem) {
            (_, Some(problem)) => problem,
            (true, None) => NO_MAP.to_string(),
            (false, None) => NOT_RUNNING.to_string(),
        })
    }

    /// Where the running client lives, used to locate an osu! that is neither in
    /// the registry nor the usual folder.
    pub fn running_root(&self) -> Option<PathBuf> {
        {
            let state = self.lock();
            let attached = state
                .attached
                .as_ref()
                .and_then(|attached| attached.owned.get())
                .and_then(|process| process.executable_dir.clone());
            if attached.is_some() {
                return attached;
            }
        }
        Owned::find().and_then(|owned| {
            owned
                .get()
                .and_then(|process| process.executable_dir.clone())
        })
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[derive(Default)]
struct State {
    attached: Option<Attached>,
    retry_after: Option<Instant>,
}

impl State {
    fn read(&mut self) -> Live {
        if self.attached.is_some() {
            match self.read_attached() {
                Reading::Map(map) => return Live::connected(Some(map)),
                Reading::NoMap => return Live::connected(None),
                Reading::Lost => self.attached = None,
            }
        }
        self.attach()
    }

    fn attach(&mut self) -> Live {
        if self.backing_off() {
            // Cheap liveness check that skips the region walk we are backing off
            // from, so a closed osu! still clears the problem promptly.
            return match Owned::find() {
                Some(_) => Live::unreadable(),
                None => {
                    self.retry_after = None;
                    Live::default()
                }
            };
        }

        let Some(found) = Owned::find() else {
            self.retry_after = None;
            return Live::default();
        };
        let Some(owned) = found.scan_regions() else {
            return self.hold_off();
        };
        let Ok(signature) = Signature::from_str(BASE_SIGNATURE) else {
            return self.hold_off();
        };
        let Some(process) = owned.get() else {
            return self.hold_off();
        };
        let Ok(base) = process.read_signature::<i32>(&signature) else {
            return self.hold_off();
        };

        self.retry_after = None;
        self.attached = Some(Attached { owned, base });

        match self.read_attached() {
            Reading::Map(map) => Live::connected(Some(map)),
            Reading::NoMap => Live::connected(None),
            Reading::Lost => {
                self.attached = None;
                self.hold_off()
            }
        }
    }

    fn read_attached(&self) -> Reading {
        let Some(attached) = self.attached.as_ref() else {
            return Reading::Lost;
        };
        let Some(process) = attached.owned.get() else {
            return Reading::Lost;
        };

        let Ok(pointer) = process.read_i32(attached.base - BEATMAP_PTR) else {
            return Reading::Lost;
        };
        if pointer == 0 {
            return Reading::NoMap;
        }
        let Ok(beatmap) = process.read_i32(pointer) else {
            return Reading::Lost;
        };
        if beatmap == 0 {
            return Reading::NoMap;
        }

        let file = text(process, beatmap + FILE, STRING_LIMIT);
        let folder = text(process, beatmap + FOLDER, STRING_LIMIT);

        // Song select leaves these blank between selections, and the client parks
        // on a non-beatmap entry in some screens.
        if file.is_empty() || folder.is_empty() {
            return Reading::NoMap;
        }
        if !file.to_ascii_lowercase().ends_with(".osu") {
            return Reading::NoMap;
        }

        Reading::Map(SelectedMap {
            folder,
            file,
            artist: text(process, beatmap + ARTIST, SHORT_LIMIT),
            title: text(process, beatmap + TITLE, STRING_LIMIT),
            creator: text(process, beatmap + CREATOR, SHORT_LIMIT),
            difficulty: text(process, beatmap + DIFFICULTY, SHORT_LIMIT),
            map_id: process.read_i32(beatmap + MAP_ID).unwrap_or(0),
            set_id: process.read_i32(beatmap + SET_ID).unwrap_or(0),
            osu_root: process
                .executable_dir
                .as_ref()
                .and_then(|dir| dir.to_str())
                .map(str::to_string),
        })
    }

    fn backing_off(&self) -> bool {
        self.retry_after.is_some_and(|retry| Instant::now() < retry)
    }

    fn hold_off(&mut self) -> Live {
        self.retry_after = Some(Instant::now() + ATTACH_BACKOFF);
        Live::unreadable()
    }
}

fn text(process: &Process, addr: i32, limit: usize) -> String {
    process
        .read_string_with_limit_from_ptr(addr, limit)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Probes the well-known playtime signature against a live client and
    /// reports whether the value actually advances. Temporary scaffolding.
    #[test]
    #[ignore]
    fn probe_playtime_signature() {
        const PLAYTIME: &str = "5E 5F 5D C3 A1 ?? ?? ?? ?? 89 ?? 04";

        let owned = Owned::find()
            .expect("osu! must be running")
            .scan_regions()
            .expect("regions");
        let process = owned.get().expect("process");

        let signature = Signature::from_str(PLAYTIME).expect("signature parses");
        let addr = process
            .read_signature::<i32>(&signature)
            .expect("playtime signature found");
        println!("playtime signature at {addr:#x}");

        let pointer = process.read_i32(addr + 0x5).expect("pointer read");
        println!("playtime pointer {pointer:#x}");

        let mut samples = Vec::new();
        for _ in 0..10 {
            samples.push(process.read_i32(pointer).unwrap_or(-1));
            std::thread::sleep(Duration::from_millis(400));
        }
        println!("playtime samples: {samples:?}");
        let moved = samples.windows(2).any(|w| w[0] != w[1]);
        println!("advancing: {moved}");
    }

    /// Reads a real osu! and reports which stage it got to. Ignored by default
    /// because it needs the client running; run it with
    /// `cargo test -- --ignored --nocapture` when the reader needs diagnosing,
    /// which is otherwise only visible through the UI.
    #[test]
    #[ignore]
    fn reads_the_running_client() {
        let watcher = Watcher::default();

        let started = Instant::now();
        let first = watcher.poll();
        println!("attach:  {:?} in {:?}", first, started.elapsed());
        assert!(first.running, "osu! must be running for this test");
        assert!(
            first.connected,
            "attached but unreadable: {:?}",
            first.problem
        );

        // The second read must reuse the attachment rather than scanning again.
        let started = Instant::now();
        let second = watcher.poll();
        let elapsed = started.elapsed();
        println!("cached:  {second:?} in {elapsed:?}");
        assert!(
            elapsed < Duration::from_millis(50),
            "cached read took {elapsed:?}, so the attachment is not being reused"
        );
    }
}
