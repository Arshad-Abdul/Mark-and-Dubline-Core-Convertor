import express from 'express';
import JSZip from 'jszip';
import { promises as fs } from 'fs';
import { convert, detectFormatFromFilename, SUPPORTED_FORMATS } from '../lib/convert.js';
import { upload, parseConvertOptions, EXTENSIONS } from './convert.js';

const router = express.Router();

router.post('/', upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const outputFormat = String(req.body.outputFormat || '').toLowerCase();
    if (!SUPPORTED_FORMATS.includes(outputFormat)) {
      return res.status(400).json({ error: `Unsupported output format: ${outputFormat}` });
    }

    const options = parseConvertOptions(req.body);
    const zip = new JSZip();
    const report = [];

    for (const file of req.files) {
      const inputFormat = detectFormatFromFilename(file.originalname);
      if (!inputFormat) {
        report.push({ file: file.originalname, status: 'skipped', reason: 'Unrecognized format.' });
        continue;
      }

      try {
        const fileBuffer = await fs.readFile(file.path);
        const { output, recordCount, warnings } = await convert(fileBuffer, inputFormat, outputFormat, options);
        const baseName = file.originalname.replace(/\.[^.]+$/, '');
        const outName = `${baseName}.${EXTENSIONS[outputFormat]}`;
        zip.file(outName, output);
        report.push({ file: file.originalname, status: 'converted', outputFile: outName, recordCount, warnings });
      } catch (err) {
        report.push({ file: file.originalname, status: 'failed', reason: err.message });
      }
    }

    zip.file('conversion-report.json', JSON.stringify(report, null, 2));

    const totalRecords = report.reduce((sum, r) => sum + (r.recordCount || 0), 0);
    const totalWarnings = report.reduce((sum, r) => sum + (r.warnings?.length || 0), 0);
    const convertedCount = report.filter((r) => r.status === 'converted').length;

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="converted-files.zip"');
    res.setHeader('X-File-Count', String(convertedCount));
    res.setHeader('X-Record-Count', String(totalRecords));
    res.setHeader('X-Warnings-Count', String(totalWarnings));
    res.send(zipBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Batch conversion failed.' });
  } finally {
    if (req.files) {
      for (const file of req.files) {
        await fs.unlink(file.path).catch(console.error);
      }
    }
  }
});

export default router;
