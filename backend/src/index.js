import express from 'express';
import cors from 'cors';
import convertRouter from './routes/convert.js';
import previewRouter from './routes/preview.js';
import batchRouter from './routes/batch.js';
import scopusRouter from './routes/scopus.js';
import wosRouter from './routes/wos.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ exposedHeaders: ['Content-Disposition', 'X-Record-Count', 'X-Warnings-Count', 'X-Warnings', 'X-File-Count', 'X-Detected-Columns'] }));
app.use('/api/convert/batch', batchRouter);
app.use('/api/convert', convertRouter);
app.use('/api/preview', previewRouter);
app.use('/api/scopus-to-dc', scopusRouter);
app.use('/api/wos-to-dc', wosRouter);
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Global JSON error handler — catches multer and other middleware errors that
// would otherwise fall through to Express's default HTML response.
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(err.status || err.statusCode || 500).json({ error: err.message || 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`MARC Convertor backend listening on http://localhost:${PORT}`);
});
