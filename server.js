const express      = require('express');
const multer       = require('multer');
const archiver     = require('archiver');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const cookieParser = require('cookie-parser');

const app  = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR      = path.join(__dirname, 'data');
const PORTRAITS_DIR = path.join(__dirname, 'data', 'portraits');
const WEB_DIR       = path.join(__dirname, 'web');

fs.mkdirSync(DATA_DIR,      { recursive: true });
fs.mkdirSync(PORTRAITS_DIR, { recursive: true });

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

const requireAuth = (req, res, next) => {
  const pwd          = process.env.EDIT_PASSWORD || '123';
  const expectedHash = crypto.createHash('sha256').update(pwd).digest('hex');
  if (req.cookies.edit_session === expectedHash) return next();
  res.status(401).json({ error: 'Neznámé nebo chybějící heslo.' });
};

app.use('/portraits', express.static(PORTRAITS_DIR));
app.use('/maps',      express.static(path.join(DATA_DIR, 'maps')));
app.use(express.static(WEB_DIR));

function _imageFilter(_req, file, cb) {
  cb(null, file.mimetype.startsWith('image/'));
}

const flatStorage = multer.diskStorage({
  destination: PORTRAITS_DIR,
  filename: (_req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext;
    cb(null, name);
  },
});

const charStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const charId = (req.params.charId || '').replace(/[^a-z0-9_\-]/gi, '_').substring(0, 60);
    const dir    = path.join(PORTRAITS_DIR, charId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, 'portrait' + ext);
  },
});

const uploadFlat = multer({ storage: flatStorage, limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: _imageFilter });
const uploadChar = multer({ storage: charStorage, limits: { fileSize: 20 * 1024 * 1024 }, fileFilter: _imageFilter });

function _dataHash() {
  try {
    let combinedSize = 0;
    let maxMtime     = 0;
    fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).forEach(f => {
      const stat = fs.statSync(path.join(DATA_DIR, f));
      combinedSize += stat.size;
      if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
    });
    return `${maxMtime}-${combinedSize}`;
  } catch {
    return 'none';
  }
}

function getFile(type) {
  const safeType = (type || '').replace(/[^a-z0-9_]/gi, '');
  return path.join(DATA_DIR, safeType + '.json');
}

app.get('/api/data', (_req, res) => {
  try {
    const types    = ['characters', 'relationships', 'locations', 'events', 'mysteries', 'mapPins', 'factions', 'deletedDefaults'];
    const campaign = {};
    let foundAny   = false;
    for (const t of types) {
      const p = getFile(t);
      if (fs.existsSync(p)) {
        campaign[t] = JSON.parse(fs.readFileSync(p, 'utf8'));
        foundAny    = true;
      }
    }
    if (!foundAny) return res.json(null);
    res.type('application/json').send(JSON.stringify(campaign));
  } catch (e) {
    console.error('GET /api/data:', e);
    res.status(500).json({ error: 'Read error' });
  }
});

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const pwd = process.env.EDIT_PASSWORD || '123';
  if (password === pwd) {
    const token = crypto.createHash('sha256').update(pwd).digest('hex');
    res.cookie('edit_session', token, { httpOnly: true, path: '/' });
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Špatné heslo' });
  }
});

app.get('/api/auth', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/data', requireAuth, (req, res) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Invalid data' });
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'object') fs.writeFileSync(getFile(key), JSON.stringify(value, null, 2), 'utf8');
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/data:', e);
    res.status(500).json({ error: 'Write error' });
  }
});

app.patch('/api/data', requireAuth, (req, res) => {
  try {
    const { type, action, payload } = req.body;
    const p = getFile(type);
    let container = type === 'factions' ? {} : [];
    if (fs.existsSync(p)) container = JSON.parse(fs.readFileSync(p, 'utf8'));

    if (action === 'save') {
      if (Array.isArray(container)) {
        if (type === 'relationships') {
          const k   = r => `${r.source}||${r.target}||${r.type}`;
          const idx = container.findIndex(r => k(r) === k(payload));
          if (idx >= 0) container[idx] = payload; else container.push(payload);
        } else {
          const idx = container.findIndex(x => x.id === payload.id);
          if (idx >= 0) container[idx] = payload; else container.push(payload);
        }
      } else {
        container[payload.id] = payload.data;
      }
    } else if (action === 'delete') {
      if (Array.isArray(container)) {
        if (type === 'relationships') {
          container = container.filter(r => !(r.source === payload.source && r.target === payload.target && r.type === payload.type));
        } else {
          container = container.filter(x => x.id !== payload.id);
          if (type === 'characters') {
            const relP = getFile('relationships');
            if (fs.existsSync(relP)) {
              let rels = JSON.parse(fs.readFileSync(relP, 'utf8'));
              rels = rels.filter(r => r.source !== payload.id && r.target !== payload.id);
              fs.writeFileSync(relP, JSON.stringify(rels, null, 2), 'utf8');
            }
          }
        }
      } else {
        delete container[payload.id];
      }
    }

    fs.writeFileSync(p, JSON.stringify(container, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/data:', e);
    res.status(500).json({ error: 'Patch error' });
  }
});

app.get('/api/version', (_req, res) => {
  res.json({ hash: _dataHash() });
});

app.post('/api/portrait', requireAuth, uploadFlat.single('portrait'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image received' });
  res.json({ url: `/portraits/${req.file.filename}` });
});

app.post('/api/portrait/:charId', requireAuth, uploadChar.single('portrait'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image received' });
  const charId  = (req.params.charId || '').replace(/[^a-z0-9_\-]/gi, '_').substring(0, 60);
  const charDir = path.join(PORTRAITS_DIR, charId);
  const newFile = req.file.filename;
  try {
    fs.readdirSync(charDir)
      .filter(f => f !== newFile && /^portrait\./i.test(f))
      .forEach(f => fs.unlinkSync(path.join(charDir, f)));
  } catch (_) {}
  res.json({ url: `/portraits/${charId}/${req.file.filename}` });
});

app.delete('/api/portrait/:identifier', requireAuth, (req, res) => {
  const identifier = (req.params.identifier || '').replace(/[^a-z0-9_\-\.]/gi, '_');
  const target     = path.join(PORTRAITS_DIR, identifier);
  try {
    if (!fs.existsSync(target)) return res.json({ ok: true });
    const stat = fs.statSync(target);
    if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
    else fs.unlinkSync(target);
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/portrait:', e);
    res.status(500).json({ error: 'Delete error' });
  }
});

// ── Full data/ backup as zip ──────────────────────────────────
app.get('/api/backup', requireAuth, (_req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename  = `backup-${timestamp}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', err => {
    console.error('Backup archive error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Backup failed' });
  });
  archive.pipe(res);
  archive.directory(DATA_DIR, 'data');
  archive.finalize();
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Tiamat running on http://localhost:${PORT}`);
});
