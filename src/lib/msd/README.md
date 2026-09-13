# Web MSD

`minacalc.wasm` is Etterna MinaCalc version 515, the same calculator used by
the native path. It is loaded once inside `msdWorker.ts`, which keeps the web
converter responsive while ratings are calculated for 4K, 6K, and 7K charts.

The artifact matches the one in the local Cascade checkout byte-for-byte. The
Etterna license is kept in `LICENSE.etterna`.
