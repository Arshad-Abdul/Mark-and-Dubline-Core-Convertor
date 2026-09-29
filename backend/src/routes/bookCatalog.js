import express from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import { parse as parseCsv } from 'csv-parse/sync';
import { convertToBookCatalogCsv, BOOK_CATALOG_COLUMNS } from '../lib/bookCatalogMapper.js';
import { storage, fileFilter } from './convert.js';

const router = express.Router();
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 }, fileFilter });

const ALLOWED_EXTS = ['csv', 'tsv', 'txt', 'xlsx', 'xls', 'mrc', 'mrk', 'xml', 'marcxml'];

function parseJsonField(val, fallback = {}) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return res.status(400).json({
        error: 'Please upload a file in CSV, TSV, TXT, Excel (.xlsx, .xls), MARC21 (.mrc), MarcEdit (.mrk), or MARCXML (.xml) format.',
      });
    }

    const mapping = parseJsonField(req.body.mapping);
    const customDefaults = parseJsonField(req.body.customDefaults);
    const customOverrides = parseJsonField(req.body.customOverrides);
    const splitSubjects = req.body.splitSubjects !== 'false' && req.body.splitSubjects !== false;

    const fileBuffer = await fs.readFile(req.file.path);
    const {
      csv,
      recordCount,
      detectedColumns,
      columnLabels,
      effectiveMapping,
      targetColumns,
      hasMultipleSubjects,
    } = await convertToBookCatalogCsv(fileBuffer, {
      filename: req.file.originalname,
      mapping,
      customDefaults,
      customOverrides,
      splitSubjects,
    });

    const cleanCsv = csv.replace(/^\uFEFF/, '');
    const allRows = parseCsv(cleanCsv, { relax_column_count: true });
    const [header, ...rows] = allRows;

    res.json({
      recordCount,
      detectedColumns,
      columnLabels,
      effectiveMapping,
      targetColumns: targetColumns || header || BOOK_CATALOG_COLUMNS,
      hasMultipleSubjects,
      header: header || targetColumns || BOOK_CATALOG_COLUMNS,
      rows: rows.slice(0, 10),
      previewCount: Math.min(10, rows.length),
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

router.post('/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return res.status(400).json({
        error: 'Please upload a file in CSV, TSV, TXT, Excel (.xlsx, .xls), MARC21 (.mrc), MarcEdit (.mrk), or MARCXML (.xml) format.',
      });
    }

    const mapping = parseJsonField(req.body.mapping);
    const customDefaults = parseJsonField(req.body.customDefaults);
    const customOverrides = parseJsonField(req.body.customOverrides);
    const splitSubjects = req.body.splitSubjects !== 'false' && req.body.splitSubjects !== false;

    const fileBuffer = await fs.readFile(req.file.path);
    const { csv, recordCount, detectedColumns, effectiveMapping, targetColumns } = await convertToBookCatalogCsv(fileBuffer, {
      filename: req.file.originalname,
      mapping,
      customDefaults,
      customOverrides,
      splitSubjects,
    });
    const baseName = req.file.originalname.replace(/\.[^.]+$/, '');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}_standard_books.csv"`);
    res.setHeader('X-Record-Count', String(recordCount));
    res.setHeader('X-Detected-Columns', encodeURIComponent(JSON.stringify(detectedColumns)));
    res.setHeader('X-Effective-Mapping', encodeURIComponent(JSON.stringify(effectiveMapping)));
    res.setHeader('X-Target-Columns', encodeURIComponent(JSON.stringify(targetColumns || [])));
    res.send(Buffer.from('\uFEFF' + csv, 'utf-8'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Conversion failed.' });
  } finally {
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(console.error);
    }
  }
});

export default router;
