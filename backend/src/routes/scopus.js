import express from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import { scopusCsvToDublinCoreCsv } from '../lib/scopusDublinCore.js';
import { storage, fileFilter } from './convert.js';

const router = express.Router();
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 }, fileFilter }); // 500 MB — Scopus exports with abstracts can be large

const ALLOWED_EXTS = ['csv', 'tsv', 'txt', 'xlsx', 'xls'];

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return res.status(400).json({
        error: 'Please upload a Scopus export file (.csv, .tsv, .txt, .xlsx, or .xls).',
      });
    }

    const maxAuthors = parseInt(req.body.maxAuthors || '0', 10) || 0;
    const collectionHandle = String(req.body.collectionHandle || '').trim();
    const fileBuffer = await fs.readFile(req.file.path);
    const { csv, recordCount, detectedColumns } = await scopusCsvToDublinCoreCsv(fileBuffer, {
      filename: req.file.originalname,
      maxAuthors,
      collectionHandle,
    });
    const baseName = req.file.originalname.replace(/\.[^.]+$/, '');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}_dublin_core.csv"`);
    res.setHeader('X-Record-Count', String(recordCount));
    res.setHeader('X-Detected-Columns', encodeURIComponent(JSON.stringify(detectedColumns)));
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
