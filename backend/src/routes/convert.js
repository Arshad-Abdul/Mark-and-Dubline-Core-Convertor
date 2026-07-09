import express from 'express';
import multer from 'multer';
import { convert, detectFormatFromFilename, SUPPORTED_FORMATS } from '../lib/convert.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

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
    const { output, recordCount, warnings } = await convert(req.file.buffer, inputFormat, outputFormat, options);

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
  }
});

export { upload, parseConvertOptions, MIME_TYPES, EXTENSIONS };
export default router;
