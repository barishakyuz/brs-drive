require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mime = require('mime-types');
const { nanoid } = require('nanoid');
const db = require('./db');
// Dosya silme için SQL sorguları
const deleteFileOwned = db.prepare('DELETE FROM files WHERE id = ? AND user_id = ?');
const deleteFileAny   = db.prepare('DELETE FROM files WHERE id = ?');
const findFileByIdAny = db.prepare('SELECT * FROM files WHERE id = ?');

// Yüklenmesine izin verilen dosya türleri
const allowedMimes = new Set([
  'image/jpeg', 'image/png',                         // resimler
  'video/mp4',                                       // videolar
  'application/pdf',                                 // pdf
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // Excel
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/x-m4a'        // ses dosyaları
]);


const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false') === 'true';

// --- Security & basics ---
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "blob:", "data:"],
      "media-src": ["'self'", "blob:", "data:"],
      "connect-src": ["'self'"],
      "frame-src": ["'self'"]
    }
  }
}));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- DB prepared statements ---
const insertUser = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)');
const findUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const findUserById = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?');
const insertFile = db.prepare('INSERT INTO files (id, user_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)');
const listFilesByUser = db.prepare('SELECT id, original_name, stored_name, mime_type, size, created_at FROM files WHERE user_id = ? ORDER BY created_at DESC');
const findFileById = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?');

// --- Auth helpers ---
function signToken(user) {
  return jwt.sign({ uid: user.id }, JWT_SECRET, { expiresIn: '7d' });
}
function authRequired(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.uid;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// --- Multer storage & filters ---
const allowedMimes = new Set([
  'image/jpeg', 'image/png',
  'video/mp4',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // xlsx
]);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const userDir = path.join(__dirname, 'uploads', String(req.userId));
    fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: function (req, file, cb) {
    const ext = mime.extension(file.mimetype) || path.extname(file.originalname).slice(1) || 'bin';
    const id = nanoid(12);
    cb(null, `${id}.${ext}`);
  }
});

const upload = multer({
  storage,
fileFilter: (req, file, cb) => {
    if (allowedMimes.has(file.mimetype)) {
      cb(null, true); // izin verilen tip
    } else {
      cb(new Error('Bu dosya tipi desteklenmiyor!'), false); // reddet
    }
  }
});

// --- Routes ---
// Dosya silme endpointi
app.delete('/api/files/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  // Admin ise herhangi bir dosyayı silebilir
  const file = isAdmin(req) ? findFileByIdAny.get(id)
                            : findFileById.get(id, req.userId);

  if (!file) return res.status(404).json({ error: 'not found' });

  const ownerId = file.user_id;
  const filePath = path.join(__dirname, 'uploads', String(ownerId), file.stored_name);

  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // fiziksel dosyayı sil
  } catch {}

  if (isAdmin(req)) deleteFileAny.run(id);
  else              deleteFileOwned.run(id, req.userId);

  res.json({ ok: true });
});

app.post('/api/register', async (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const exists = findUserByEmail.get(email.toLowerCase());
    if (exists) return res.status(400).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const info = insertUser.run(email.toLowerCase(), name || null, hash);
    const user = findUserById.get(info.lastInsertRowid);
    const token = signToken(user);

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: 7 * 24 * 3600 * 1000
    });
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const user = findUserByEmail.get(email.toLowerCase());
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: 7 * 24 * 3600 * 1000
    });
    res.json({ user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', authRequired, (req, res) => {
  const user = findUserById.get(req.userId);
  res.json({ user });
});

app.post('/api/upload', authRequired, upload.single('file'), (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    const id = path.basename(file.filename, path.extname(file.filename));
    insertFile.run(id, req.userId, file.originalname, file.filename, file.mimetype, file.size);
    res.json({ id, original_name: file.originalname, mime_type: file.mimetype, size: file.size });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/api/files', authRequired, (req, res) => {
  const files = listFilesByUser.all(req.userId);
  res.json({ files });
});

// Download
app.get('/download/:id', authRequired, (req, res) => {
  const file = findFileById.get(req.params.id, req.userId);
  if (!file) return res.status(404).send('Not found');
  const filePath = path.join(__dirname, 'uploads', String(req.userId), file.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Missing file');

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
  fs.createReadStream(filePath).pipe(res);
});

// Inline preview
app.get('/preview/:id', authRequired, (req, res) => {
  const file = findFileById.get(req.params.id, req.userId);
  if (!file) return res.status(404).send('Not found');
  const filePath = path.join(__dirname, 'uploads', String(req.userId), file.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).send('Missing file');

  const inlineTypes = new Set([
    'image/jpeg', 'image/png', 'video/mp4', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]);
  if (!inlineTypes.has(file.mime_type)) return res.status(400).send('Preview not supported');

  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', 'inline');
  fs.createReadStream(filePath).pipe(res);
});

// SPA fallback
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Mini Drive listening at http://localhost:${PORT}`);
});
