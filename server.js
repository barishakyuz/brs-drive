require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const mime = require('mime-types');
const { nanoid } = require('nanoid');

const db = require('./db');

/* =========================
   ENV & SABİTLER
========================= */
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || 'false') === 'true';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''; // admin kontrolü için

// Yüklenmesine izin verilen dosya türleri (TEK TANIM!)
const allowedMimes = new Set([
  // resimler
  'image/jpeg', 'image/png',
  // video
  'video/mp4',
  // pdf
  'application/pdf',
  // office (docx / xlsx)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // ses
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/x-m4a'
]);

/* =========================
   GÜVENLİK & TEMEL ORTAK KATLAR
========================= */
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      "style-src":  ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src":   ["'self'", "https://fonts.gstatic.com"],
      "img-src":    ["'self'", "data:"]
    }
  }
}));

app.use(rateLimit({ windowMs: 60 * 1000, max: 120 })); // dakikada 120 istek
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// public klasörü statik servis
app.use(express.static(path.join(__dirname, 'public')));
// uploads klasörünü de statik ver (indirme linkleri için)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* =========================
   YARDIMCI FONKSİYONLAR
========================= */
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authRequired(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function isAdminReq(req) {
  return ADMIN_EMAIL && req.userEmail && req.userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

/* =========================
   MULTER (YÜKLEME) AYARI
========================= */
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const userDir = path.join(__dirname, 'uploads', String(req.userId));
      await fsp.mkdir(userDir, { recursive: true });
      cb(null, userDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const extFromMime = mime.extension(file.mimetype);
    const extFromName = path.extname(file.originalname).replace('.', '');
    const ext = extFromMime || extFromName || 'bin';
    const id = nanoid(12);
    cb(null, `${id}.${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (allowedMimes.has(file.mimetype)) return cb(null, true);
    cb(new Error('Bu dosya tipi desteklenmiyor!'), false);
  },
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB
});

/* =========================
   SQL HAZIR SORGULAR
========================= */
// kullanıcılar: users(id, email, password_hash, name)
// dosyalar: files(id, user_id, original_name, stored_name, mime, size, created_at)
const insertUser = db.prepare(`INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)`);
const findUserByEmail = db.prepare(`SELECT * FROM users WHERE email = ?`);
const findUserById = db.prepare(`SELECT * FROM users WHERE id = ?`);

const insertFile = db.prepare(`
  INSERT INTO files (user_id, original_name, stored_name, mime, size, created_at)
  VALUES (?, ?, ?, ?, ?, DATETIME('now'))
`);

const listFilesByUser = db.prepare(`
  SELECT id, original_name, stored_name, mime, size, created_at
  FROM files WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
`);

const findFileById = db.prepare(`SELECT * FROM files WHERE id = ?`);
const deleteFileOwned = db.prepare(`DELETE FROM files WHERE id = ? AND user_id = ?`);
const deleteFileAny = db.prepare(`DELETE FROM files WHERE id = ?`);

/* =========================
   ROUTES – AUTH
========================= */
app.post('/api/register', async (req, res) => {
  try {
    const { email, name, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const exists = findUserByEmail.get(email);
    if (exists) return res.status(409).json({ error: 'Email already used' });

    const hash = await bcrypt.hash(password, 10);
    const info = insertUser.run(email, hash, name || '');
    const user = findUserById.get(info.lastInsertRowid);

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'register failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = findUserByEmail.get(email);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'login failed' });
  }
});

app.get('/api/me', authRequired, (req, res) => {
  const u = findUserById.get(req.userId);
  if (!u) return res.status(404).json({ error: 'user not found' });
  res.json({ id: u.id, email: u.email, name: u.name, isAdmin: isAdminReq(req) });
});

/* =========================
   ROUTES – DOSYA
========================= */
// yükleme
app.post('/api/upload', authRequired, upload.single('file'), (req, res) => {
  try {
    // multer başarılıysa req.file doludur
    if (!req.file) return res.status(400).json({ error: 'no file' });

    insertFile.run(
      req.userId,
      req.file.originalname,
      req.file.filename,
      req.file.mimetype,
      req.file.size
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'upload failed' });
  }
});

// listeleme (kullanıcının kendi dosyaları)
app.get('/api/files', authRequired, (req, res) => {
  try {
    const rows = listFilesByUser.all(req.userId);
    // client için indirilebilir URL
    const mapped = rows.map(r => ({
      ...r,
      url: `/uploads/${req.userId}/${r.stored_name}`
    }));
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'list failed' });
  }
});

// silme (sahibi silebilir; admin herkesinkini silebilir)
app.delete('/api/files/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const file = findFileById.get(id);
    if (!file) return res.status(404).json({ error: 'not found' });

    if (!isAdminReq(req) && file.user_id !== req.userId) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const ownerId = file.user_id;
    const filePath = path.join(__dirname, 'uploads', String(ownerId), file.stored_name);

    // önce fiziksel dosyayı sil
    try {
      if (fs.existsSync(filePath)) await fsp.unlink(filePath);
    } catch (e) {
      console.warn('fs unlink warning:', e.message);
    }

    // sonra DB kaydını sil
    if (isAdminReq(req)) deleteFileAny.run(id);
    else deleteFileOwned.run(id, req.userId);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'delete failed' });
  }
});

/* =========================
   SERVE INDEX
========================= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* =========================
   START
========================= */
app.listen(PORT, () => {
  console.log(`Mini Drive listening at http://localhost:${PORT}`);
});
