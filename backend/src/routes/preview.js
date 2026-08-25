import express from 'express';
import { promises as fs } from 'fs';
import { parseInput, detectFormatFromFilename, listTags } from '../lib/convert.js';
import { recordsToGrid } from '../lib/tabular.js';
import { validateRecords } from '../lib/validate.js';
import { upload } from './convert.js';

const router = express.Router();

const PREVIEW_LIMIT = 20;

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const inputFormat = detectFormatFromFilename(req.file.originalname);
    if (!inputFormat) {
      return res.status(400).json({ error: 'Could not detect input format from filename. Use .mrc, .mrk, .csv, .xlsx or .xml.' });
    }

    const fileBuffer = await fs.readFile(req.file.path);
    const records = await parseInput(fileBuffer, inputFormat);
    const warnings = validateRecords(records);
    const tags = listTags(records);
    const { header, labelRow, rows } = recordsToGrid(records.slice(0, PREVIEW_LIMIT));

    res.json({
      inputFormat,
      recordCount: records.length,
      previewCount: rows.length,
      tags,
      header,
      labelRow,
      rows,
      warnings: warnings.slice(0, 50),
      warningsCount: warnings.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Preview failed.' });
  } finally {
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(console.error);
    }
  }
});

export default router;
