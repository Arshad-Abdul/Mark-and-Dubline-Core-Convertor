import express from 'express';
import multer from 'multer';
import { scopusCsvToDublinCoreCsv } from '../lib/scopusDublinCore.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    if (ext !== 'csv') {
      return res.status(400).json({ error: 'Please upload a Scopus CSV export file (.csv).' });
    }

    const maxAuthors = parseInt(req.body.maxAuthors || '0', 10) || 0;
    const collectionHandle = String(req.body.collectionHandle || '').trim();
    const { csv, recordCount, detectedColumns } = scopusCsvToDublinCoreCsv(req.file.buffer, { maxAuthors, collectionHandle });
    const baseName = req.file.originalname.replace(/\.[^.]+$/, '');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}_dublin_core.csv"`);
    res.setHeader('X-Record-Count', String(recordCount));
    res.setHeader('X-Detected-Columns', encodeURIComponent(JSON.stringify(detectedColumns)));
    res.send(Buffer.from(csv, 'utf-8'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Conversion failed.' });
  }
});

export default router;
