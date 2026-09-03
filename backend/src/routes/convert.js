import express from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { convert, detectFormatFromFilename, SUPPORTED_FORMATS } from '../lib/convert.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: os.tmpdir(),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const forbiddenMimes = [
    'application/x-msdownload', 'application/x-sh', 'application/x-bat', 
    'application/x-dosexec'
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Basic security check to prevent executable uploads
  if (forbiddenMimes.includes(file.mimetype) || ['.exe', '.bat', '.sh', '.cmd', '.msi'].includes(ext)) {
    return cb(new Error('Invalid file type uploaded. Executables are not allowed.'));
  }
  
  cb(null, true);
};

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024, files: 50 }, fileFilter });

const MIME_TYPES = {
  mrc: 'application/marc',
  mrk: 'text/plain',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  marcxml: 'application/xml',
};

const EXTENSIONS = { mrc: 'mrc', mrk: 'mrk', csv: 'csv', xlsx: 'xlsx', marcxml: 'xml' };

function parseConvertOptions(body) {
  const options = {};
  if (body.includeLabels !== undefined) options.includeLabels = body.includeLabels !== 'false';
  if (body.includeTags) {
    const tags = String(body.includeTags).split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length > 0) options.includeTags = tags;
  }
  return options;
}

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const outputFormat = String(req.body.outputFormat || '').toLowerCase();
    if (!SUPPORTED_FORMATS.includes(outputFormat)) {
      return res.status(400).json({ error: `Unsupported output format: ${outputFormat}` });
    }

    const inputFormat = detectFormatFromFilename(req.file.originalname);
    if (!inputFormat) {
      return res.status(400).json({ error: 'Could not detect input format from filename. Use .mrc, .mrk, .csv, .xlsx or .xml.' });
    }

    const options = parseConvertOptions(req.body);
    const fileBuffer = await fs.readFile(req.file.path);
    const { output, recordCount, warnings } = await convert(fileBuffer, inputFormat, outputFormat, options);

    const baseName = req.file.originalname.replace(/\.[^.]+$/, '');
    const outName = `${baseName}.${EXTENSIONS[outputFormat]}`;

    res.setHeader('Content-Type', MIME_TYPES[outputFormat]);
    res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
    res.setHeader('X-Record-Count', String(recordCount));
    res.setHeader('X-Warnings-Count', String(warnings.length));
    res.setHeader('X-Warnings', encodeURIComponent(JSON.stringify(warnings.slice(0, 50))));
    res.send(output);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Conversion failed.' });
  } finally {
    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(console.error);
    }
  }
});

export { upload, parseConvertOptions, MIME_TYPES, EXTENSIONS, storage, fileFilter };
export default router;

