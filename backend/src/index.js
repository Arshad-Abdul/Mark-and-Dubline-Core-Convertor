import express from 'express';
import cors from 'cors';
import convertRouter from './routes/convert.js';
import previewRouter from './routes/preview.js';
import batchRouter from './routes/batch.js';
import scopusRouter from './routes/scopus.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ exposedHeaders: ['Content-Disposition', 'X-Record-Count', 'X-Warnings-Count', 'X-Warnings', 'X-File-Count'] }));
app.use('/api/convert/batch', batchRouter);
app.use('/api/convert', convertRouter);
app.use('/api/preview', previewRouter);
app.use('/api/scopus-to-dc', scopusRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`MARC Convertor backend listening on http://localhost:${PORT}`);
});
