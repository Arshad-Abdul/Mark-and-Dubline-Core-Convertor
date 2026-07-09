# MARC Convertor

Convert library catalog records between **.mrc** (MARC21 binary / ISO 2709), **.mrk** (MARC mnemonic/breaker text), **CSV**, **Excel (.xlsx)**, and **MARCXML (.xml)** — in the browser, with a drag-and-drop UI.

## Structure

- `backend/` — Express API. Parses the uploaded file into a canonical record model and re-serializes it into the requested format. All conversion logic lives in `backend/src/lib/`:
  - `marcBinary.js` — ISO 2709 (.mrc) reader/writer
  - `marcMnemonic.js` — .mrk reader/writer (record boundaries are driven by `=LDR`, not blank lines)
  - `marcXml.js` — MARCXML reader/writer
  - `tabular.js` — record ⇄ grid mapping (one column per tag/subfield, with optional human-readable labels), plus CSV/XLSX reader/writer
  - `marcDictionary.js` — MARC21 field/subfield label lookup used for readable headers
  - `validate.js` — sanity checks (missing leader/title, duplicate control numbers, malformed tags) surfaced as warnings
  - `convert.js` — orchestrator: format detection, field filtering, warnings
  - `routes/convert.js` — single-file conversion; `routes/preview.js` — preview + tag list without downloading; `routes/batch.js` — multi-file conversion zipped together
- `frontend/` — Vite + React + TypeScript + Tailwind UI. Drag-and-drop (multi-file) upload, live preview with a tag/field checklist, output format picker, readable-header toggle, warnings panel, and locally-persisted conversion history/settings (no accounts, no server-side storage).

## Running locally

From the project root:

```bash
npm run install:all   # installs backend + frontend dependencies
npm run dev            # starts backend (:4000) and frontend (:5173) together
```

Then open http://localhost:5173 — Vite proxies `/api` requests to the backend.

To expose the frontend on your local network (e.g. to test from a phone), use `npm run dev:host` instead.

If you'd rather run them in separate terminals: `npm run dev --prefix backend` and `npm run dev --prefix frontend`.

## Features

- **Single or batch conversion** — drop one file for a direct download, or several files at once for a zip (with a bundled `conversion-report.json`).
- **Live preview** — for single-file conversions, see the first 20 records as a table before downloading, plus the full list of fields detected with counts.
- **Field filtering** — uncheck any tag in the preview to exclude it from the output (applies to every output format, not just CSV/Excel).
- **Readable headers** — toggle whether CSV/Excel column headers include MARC field/subfield names (e.g. `245$a Title`) or stay as plain tags (e.g. `245$a`) for cleaner round-tripping.
- **Validation warnings** — missing leader/title, duplicate control numbers, and malformed tags are flagged without blocking the conversion.
- **Conversion history & settings** — your last-used output format, header preference, and recent conversions persist locally between visits.

## Notes on the CSV/Excel representation

Each row is one MARC record; each column is one control field or one (tag, subfield code) pair, e.g. `245$a`, `245$b`, `264$c`, sorted in tag order. Cell values are plain text — no `$` or indicator placeholders embedded in the data. Repeated subfields/fields are joined with ` | ` within a cell and reconstructed positionally when converting back to `.mrc`/`.mrk`/`.xml`. Indicators are not preserved through the tabular formats (they default to blank on the way back); direct `.mrc` ↔ `.mrk` ↔ `.xml` conversion is unaffected and fully lossless, including indicators.

`.xls` uploads are accepted and treated as `.xlsx` (legacy binary `.xls` writing isn't supported).

## Known limitations

- Very large files (50MB+ or tens of thousands of records) are processed entirely in memory rather than streamed — fine for typical exports, but not optimized for huge batch jobs.
- Field/subfield labels cover the ~150 most common MARC21 bibliographic tags; uncommon or local/custom tags will show without a label.
