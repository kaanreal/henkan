use crate::models::beatmap::{Beatmap, Note};
use minacalc_rs::{Calc, Note as MinaNote};

thread_local! {
    static CALC: std::cell::RefCell<Option<Calc>> = const { std::cell::RefCell::new(None) };
}

fn with_calc<T>(f: impl FnOnce(&Calc) -> T) -> Option<T> {
    CALC.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if borrow.is_none() {
            *borrow = Calc::new().ok();
        }
        borrow.as_ref().map(f)
    })
}

/// Compute the MSD (overall) for a beatmap at 1.0x rate.
/// Returns `None` if the chart has no notes or calculation fails.
pub fn compute_msd(beatmap: &Beatmap) -> Option<f64> {
    if beatmap.notes.is_empty() {
        return None;
    }
    let mina_notes = to_mina_notes(&beatmap.notes);
    with_calc(|calc| {
        calc.calc_all_rates(&mina_notes, false)
            .ok()
            .and_then(|r| r.msds.get(3).map(|s| s.overall as f64))
    })?
}

/// Compute MSD for a slice of notes (for use during pack conversion
/// where we have notes but haven't built a full Beatmap yet).
pub fn compute_msd_from_notes(notes: &[Note]) -> Option<f64> {
    if notes.is_empty() {
        return None;
    }
    let mina_notes = to_mina_notes(notes);
    with_calc(|calc| {
        calc.calc_all_rates(&mina_notes, false)
            .ok()
            .and_then(|r| r.msds.get(3).map(|s| s.overall as f64))
    })?
}

/// Compute MSD for multiple note slices, reusing the same Calc instance.
/// Returns a Vec of Option<f64> in the same order as the input.
pub fn compute_msd_batch(note_slices: &[&[Note]]) -> Vec<Option<f64>> {
    with_calc(|calc| {
        note_slices
            .iter()
            .map(|notes| {
                if notes.is_empty() {
                    return None;
                }
                let mina_notes = to_mina_notes(notes);
                calc.calc_all_rates(&mina_notes, false)
                    .ok()
                    .and_then(|r| r.msds.get(3).map(|s| s.overall as f64))
            })
            .collect()
    })
    .unwrap_or_else(|| note_slices.iter().map(|_| None).collect())
}

/// Convert henkan Notes to minacalc Notes by grouping simultaneous taps
/// into single rows (OR-ing column bitmasks at the same timestamp).
///
/// henkan uses column indices (0, 1, 2, 3 for 4K) but minacalc expects
/// a bitmask where each column is a single bit (1, 2, 4, 8 for 4K).
fn to_mina_notes(notes: &[Note]) -> Vec<MinaNote> {
    if notes.is_empty() {
        return Vec::new();
    }

    let mut sorted = notes.to_vec();
    sorted.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap_or(std::cmp::Ordering::Equal));

    let mut rows: Vec<MinaNote> = Vec::new();

    for note in &sorted {
        let row_time = (note.time_ms / 1000.0) as f32;
        let bitmask = 1u32 << note.column;

        if let Some(last) = rows.last_mut() {
            if (last.row_time - row_time).abs() < 0.001 {
                last.notes |= bitmask;
                continue;
            }
        }

        rows.push(MinaNote {
            notes: bitmask,
            row_time,
        });
    }

    rows
}
