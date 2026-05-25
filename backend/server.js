const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

const defaultConfig = {
  mistral: {
    apiKey: '',
    model: 'mistral-small-latest',
    baseUrl: 'https://api.mistral.ai/v1'
  },
  blog: {
    imagesPath: 'public/images/blog',
    postsPath: 'backend/data/blog-posts.json'
  },
  resend: {
    apiKey: '',
    from: 'JALUD Premium Autopflege <info@jalud.de>',
    to: 'info@jalud.de',
    replyTo: ''
  }
};

// Load config from config.json if present
let config = { ...defaultConfig };
try {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    const localConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    config = {
      ...defaultConfig,
      ...localConfig,
      mistral: {
        ...defaultConfig.mistral,
        ...(localConfig.mistral || {})
      },
      blog: {
        ...defaultConfig.blog,
        ...(localConfig.blog || {})
      },
      resend: {
        ...defaultConfig.resend,
        ...(localConfig.resend || {})
      }
    };
  }
} catch (error) {
  console.error('⚠️  Konfigurationsfehler:', error.message);
  config = { ...defaultConfig };
}

config.mistral.apiKey = process.env.MISTRAL_API_KEY || config.mistral.apiKey;
config.mistral.model = process.env.MISTRAL_MODEL || config.mistral.model;
config.mistral.baseUrl = process.env.MISTRAL_BASE_URL || config.mistral.baseUrl;
config.blog.imagesPath = config.blog.imagesPath || defaultConfig.blog.imagesPath;
config.blog.postsPath = config.blog.postsPath || defaultConfig.blog.postsPath;
config.resend = {
  apiKey: process.env.RESEND_API_KEY || config.resend.apiKey,
  from: process.env.RESEND_FROM || config.resend.from,
  to: process.env.RESEND_TO || config.resend.to,
  replyTo: process.env.RESEND_REPLY_TO || config.resend.replyTo
};

const mistralApiKey = config.mistral.apiKey;
const mistralModel = config.mistral.model || defaultConfig.mistral.model;
const mistralBaseUrl = (config.mistral.baseUrl || defaultConfig.mistral.baseUrl).replace(/\/$/, '');
if (mistralApiKey) {
  console.log('✅ Mistral API konfiguriert');
} else {
  console.log('⚠️  Mistral API nicht konfiguriert (nur für Blog-Generierung benötigt).');
}

const resendConfig = config.resend;
const resendEnabled = Boolean(resendConfig.apiKey && resendConfig.from && resendConfig.to);
if (resendEnabled) {
  console.log('✅ Resend E-Mail Versand konfiguriert');
} else {
  console.log('⚠️  Resend E-Mail Versand nicht konfiguriert (Lead-Speicherung funktioniert trotzdem).');
}

const googlePlacesApiKey = process.env.GOOGLE_PLACES_API_KEY || '';
const hunterApiKey = process.env.HUNTER_API_KEY || '';
const jaludLeadCenter = {
  lat: Number(process.env.JALUD_LEAD_CENTER_LAT || 51.41109),
  lng: Number(process.env.JALUD_LEAD_CENTER_LNG || 7.19951)
};
const jaludLeadRadiusMeters = Number(process.env.JALUD_LEAD_RADIUS_METERS || 15000);

if (googlePlacesApiKey) {
  console.log('Google Places API konfiguriert');
} else {
  console.log('Google Places API nicht konfiguriert (nur fuer Akquise-Import benoetigt).');
}

if (hunterApiKey) {
  console.log('Firmensuche konfiguriert');
} else {
  console.log('Firmensuche nicht konfiguriert (nur fuer Firmen-Suche benoetigt).');
}

const jwtSecret = process.env.JWT_SECRET || '';
const adminSeedEmail = process.env.ADMIN_EMAIL || '';
const adminSeedPassword = process.env.ADMIN_PASSWORD || '';

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return '';
}

function signAdminToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    jwtSecret,
    { expiresIn: '7d' }
  );
}

function requireAdmin(req, res, next) {
  if (!jwtSecret) {
    return res.status(503).json({
      success: false,
      message: 'JWT_SECRET ist nicht konfiguriert'
    });
  }
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Nicht autorisiert'
    });
  }
  try {
    const payload = jwt.verify(token, jwtSecret);
    req.admin = {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    };
    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Nicht autorisiert'
    });
  }
}

// Database (PostgreSQL)
const databaseUrl = process.env.DATABASE_URL;
const dbSslSetting = String(process.env.DB_SSL || '').toLowerCase();
const shouldUseSSL = dbSslSetting
  ? dbSslSetting === 'true'
  : process.env.NODE_ENV === 'production';
function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const dbConnectionTimeoutMs = parsePositiveInteger(process.env.DB_CONNECTION_TIMEOUT_MS, 10000);
const dbQueryTimeoutMs = parsePositiveInteger(process.env.DB_QUERY_TIMEOUT_MS, 15000);
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: shouldUseSSL ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: dbConnectionTimeoutMs,
      query_timeout: dbQueryTimeoutMs,
      statement_timeout: dbQueryTimeoutMs
    })
  : null;

let dbInitPromise = null;

async function initDb() {
  if (!pool) {
    throw new Error('DATABASE_URL ist nicht gesetzt. Bitte in backend/.env oder im Prozessmanager konfigurieren.');
  }
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS leads (
          id UUID PRIMARY KEY,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          phone TEXT NOT NULL,
          email TEXT NOT NULL,
          package TEXT NOT NULL,
          message TEXT,
          status TEXT NOT NULL DEFAULT 'neu',
          notes TEXT,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS blog_posts (
          id UUID PRIMARY KEY,
          title TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          excerpt TEXT NOT NULL,
          content TEXT NOT NULL,
          full_content JSONB NOT NULL DEFAULT '[]'::jsonb,
          image TEXT,
          category TEXT NOT NULL,
          meta_title TEXT,
          meta_description TEXT,
          keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL DEFAULT 'draft',
          ai_generated BOOLEAN NOT NULL DEFAULT false,
          published_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS prospect_leads (
          id UUID PRIMARY KEY,
          source TEXT NOT NULL,
          external_id TEXT,
          company_name TEXT NOT NULL,
          category TEXT,
          query TEXT,
          city TEXT,
          address TEXT,
          phone TEXT,
          website TEXT,
          domain TEXT,
          email TEXT,
          emails JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL DEFAULT 'neu',
          notes TEXT NOT NULL DEFAULT '',
          distance_meters INTEGER,
          lat DOUBLE PRECISION,
          lng DOUBLE PRECISION,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          last_imported_at TIMESTAMPTZ
        );
      `);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS prospect_leads_source_external_id_unique
        ON prospect_leads (source, external_id)
        WHERE external_id IS NOT NULL;
      `);
      await pool.query(`DROP INDEX IF EXISTS prospect_leads_source_domain_unique;`);
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS prospect_leads_source_domain_unique
        ON prospect_leads (source, domain)
        WHERE source = 'hunter' AND domain IS NOT NULL;
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_users (
          id UUID PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'staff',
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          last_login TIMESTAMPTZ
        );
      `);
      await seedAdminUser();
    })();
  }
  try {
    return await dbInitPromise;
  } catch (error) {
    dbInitPromise = null;
    throw error;
  }
}

async function dbQuery(text, params) {
  await initDb();
  return pool.query(text, params);
}

async function seedAdminUser() {
  if (!adminSeedEmail || !adminSeedPassword) {
    return;
  }
  const email = adminSeedEmail.toLowerCase();
  const existing = await pool.query('SELECT id FROM admin_users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    return;
  }
  const now = new Date().toISOString();
  const passwordHash = await bcrypt.hash(adminSeedPassword, 12);
  await pool.query(
    `INSERT INTO admin_users (id, email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), email, passwordHash, 'admin', now, now]
  );
  console.log('? Admin-User angelegt:', email);
}
function mapLeadRow(row) {
  return {
    _id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    email: row.email,
    package: row.package,
    message: row.message || '',
    status: row.status,
    notes: row.notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapBlogRow(row) {
  return {
    _id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    fullContent: row.full_content || [],
    image: row.image || '',
    category: row.category,
    metaTitle: row.meta_title || '',
    metaDescription: row.meta_description || '',
    keywords: row.keywords || [],
    status: row.status,
    aiGenerated: row.ai_generated,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProspectLeadRow(row) {
  return {
    _id: row.id,
    source: row.source,
    externalId: row.external_id || '',
    companyName: row.company_name,
    category: row.category || '',
    query: row.query || '',
    city: row.city || '',
    address: row.address || '',
    phone: row.phone || '',
    website: row.website || '',
    domain: row.domain || '',
    email: row.email || '',
    emails: row.emails || [],
    status: row.status,
    notes: row.notes || '',
    distanceMeters: row.distance_meters,
    lat: row.lat,
    lng: row.lng,
    metadata: row.metadata || {},
    rawData: row.raw_data || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastImportedAt: row.last_imported_at
  };
}

function slugify(text = '') {
  return text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function slugExists(slug, excludeId) {
  const result = await dbQuery(
    `SELECT 1 FROM blog_posts WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2) LIMIT 1`,
    [slug, excludeId || null]
  );
  return result.rowCount > 0;
}

async function ensureUniqueSlug(baseSlug, excludeId) {
  let candidate = baseSlug || `post-${Date.now()}`;
  while (await slugExists(candidate, excludeId)) {
    candidate = `${candidate}-${Math.floor(Math.random() * 1000)}`;
  }
  return candidate;
}

const BLOG_STATUSES = ['draft', 'published', 'archived'];
const PROSPECT_STATUSES = ['neu', 'geprueft', 'kontaktiert', 'angebot', 'gewonnen', 'abgelehnt'];
const PROSPECT_SOURCES = ['google_places', 'hunter'];
const GOOGLE_PLACE_CATEGORIES = [
  'Heizung Sanitär',
  'Malerbetriebe',
  'Garten und Landschaftsbau',
  'Bauunternehmer/Bauleiter',
  'Autovermietung',
  'Fahrschulen',
  'Taxiunternehmen',
  'Behinderten Transport',
  'Schülertransport',
  'Bestattungsunternehmen',
  'Sicherheitsdienste',
  'KFZ Sachverständiger',
  'KFZ Gutachter',
  'Speditionen',
  'Pflegedienste',
  'Reiterhöfe/Pferdeanhänger'
];

const GOOGLE_PLACE_QUERY_MAP = {
  'Heizung Sanitär': 'Heizung Sanitär Betrieb',
  'Malerbetriebe': 'Malerbetrieb',
  'Garten und Landschaftsbau': 'Garten Landschaftsbau',
  'Bauunternehmer/Bauleiter': 'Bauunternehmen Bauleiter',
  'Autovermietung': 'Autovermietung',
  'Fahrschulen': 'Fahrschule',
  'Taxiunternehmen': 'Taxiunternehmen',
  'Behinderten Transport': 'Behindertentransport Fahrdienst',
  'Schülertransport': 'Schülertransport Fahrdienst',
  'Bestattungsunternehmen': 'Bestattungsunternehmen',
  'Sicherheitsdienste': 'Sicherheitsdienst',
  'KFZ Sachverständiger': 'KFZ Sachverständiger',
  'KFZ Gutachter': 'KFZ Gutachter',
  'Speditionen': 'Spedition',
  'Pflegedienste': 'Pflegedienst',
  'Reiterhöfe/Pferdeanhänger': 'Reiterhof Pferdeanhänger'
};

function normalizeDomain(value = '') {
  const input = String(value || '').trim();
  if (!input) {
    return '';
  }

  try {
    const url = input.startsWith('http://') || input.startsWith('https://')
      ? new URL(input)
      : new URL(`https://${input}`);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch (error) {
    return input
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .trim()
      .toLowerCase();
  }
}

function haversineDistanceMeters(a, b) {
  if (!Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) {
    return null;
  }

  const earthRadiusMeters = 6371000;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

function buildSearchBounds(center, radiusMeters) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180));
  return {
    low: {
      latitude: center.lat - latDelta,
      longitude: center.lng - lngDelta
    },
    high: {
      latitude: center.lat + latDelta,
      longitude: center.lng + lngDelta
    }
  };
}

function getHunterErrorMessage(status, data) {
  const firstError = Array.isArray(data?.errors) ? data.errors[0] : null;
  if (firstError?.id === 'no_discover_access' || firstError?.details?.includes('Discover')) {
    return 'Die Firmen-Suche ist fuer diesen API-Key oder Tarif nicht freigeschaltet.';
  }
  if (status === 401) {
    return 'API-Key fuer die Firmen-Suche ist ungueltig oder fehlt.';
  }
  if (status === 403 || status === 429) {
    return 'Limit der Firmen-Suche erreicht oder Zugriff verweigert. Bitte Tarif und Limits pruefen.';
  }
  return firstError?.details || data?.message || `Fehler bei der Firmen-Suche (${status})`;
}


// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const uploadsBaseDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'uploads');
const blogUploadDir = path.join(uploadsBaseDir, 'blog');
fs.mkdirSync(blogUploadDir, { recursive: true });

app.use('/uploads', express.static(uploadsBaseDir));

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitEmailList(value = '') {
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getPackageLabel(value = '') {
  const labels = {
    basis: 'Basis Paket',
    premium: 'Premium Paket',
    luxus: 'Luxus Paket',
    individual: 'Individuelles Paket'
  };

  return labels[value] || value;
}

async function sendResendEmail({ subject, html, text, replyTo }) {
  if (!resendEnabled) {
    return;
  }

  const payload = {
    from: resendConfig.from,
    to: splitEmailList(resendConfig.to),
    subject,
    html,
    text
  };

  const replyToAddress = replyTo || resendConfig.replyTo;
  if (replyToAddress) {
    payload.reply_to = replyToAddress;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendConfig.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || data?.error?.message || `Resend request failed (${response.status})`;
    throw new Error(message);
  }
}

async function sendLeadNotification(lead) {
  const fullName = `${lead.firstName} ${lead.lastName}`.trim();
  const packageLabel = getPackageLabel(lead.package);
  const submittedAt = new Date(lead.createdAt).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin'
  });

  const html = `
    <h2>Neue Anfrage ueber jalud.de</h2>
    <table cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
      <tr><td><strong>Name</strong></td><td>${escapeHtml(fullName)}</td></tr>
      <tr><td><strong>Telefon</strong></td><td>${escapeHtml(lead.phone)}</td></tr>
      <tr><td><strong>E-Mail</strong></td><td>${escapeHtml(lead.email)}</td></tr>
      <tr><td><strong>Paket</strong></td><td>${escapeHtml(packageLabel)}</td></tr>
      <tr><td><strong>Zeitpunkt</strong></td><td>${escapeHtml(submittedAt)}</td></tr>
      <tr><td><strong>Nachricht</strong></td><td>${escapeHtml(lead.message || '-')}</td></tr>
    </table>
  `;

  const text = [
    'Neue Anfrage ueber jalud.de',
    `Name: ${fullName}`,
    `Telefon: ${lead.phone}`,
    `E-Mail: ${lead.email}`,
    `Paket: ${packageLabel}`,
    `Zeitpunkt: ${submittedAt}`,
    `Nachricht: ${lead.message || '-'}`
  ].join('\n');

  await sendResendEmail({
    subject: `Neue Anfrage von ${fullName || 'jalud.de'}`,
    html,
    text,
    replyTo: lead.email
  });
}

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, blogUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Nur Bilder (JPEG, PNG, WebP) sind erlaubt'));
    }
  }
});

app.post('/api/admin/login', async (req, res) => {
  try {
    if (!jwtSecret) {
      return res.status(503).json({
        success: false,
        message: 'JWT_SECRET ist nicht konfiguriert'
      });
    }
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email und Passwort sind erforderlich'
      });
    }
    const result = await dbQuery('SELECT * FROM admin_users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: 'Ungültige Zugangsdaten' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Ungültige Zugangsdaten' });
    }
    const now = new Date().toISOString();
    await dbQuery('UPDATE admin_users SET last_login = $1 WHERE id = $2', [now, user.id]);
    const token = signAdminToken({ id: user.id, email: user.email, role: user.role });
    return res.json({
      success: true,
      token,
      user: { email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Fehler beim Admin-Login:', error);
    return res.status(500).json({
      success: false,
      message: 'Login aktuell nicht möglich. Bitte Server-Konfiguration prüfen.'
    });
  }
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ success: true, user: req.admin });
});

// Routes

// POST - Create new lead
app.post('/api/leads', async (req, res) => {
  try {
    const { firstName, lastName, phone, email, package: pkg, message } = req.body;
    
    if (!firstName || !lastName || !phone || !email || !pkg) {
      return res.status(400).json({ 
        success: false, 
        message: 'Alle Pflichtfelder müssen ausgefüllt werden' 
      });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await dbQuery(
      `INSERT INTO leads
        (id, first_name, last_name, phone, email, package, message, status, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id,
        firstName,
        lastName,
        phone,
        email,
        pkg,
        message || '',
        'neu',
        '',
        now,
        now
      ]
    );
    
    console.log('✅ Lead gespeichert:', id);

    try {
      await sendLeadNotification({
        id,
        firstName,
        lastName,
        phone,
        email,
        package: pkg,
        message: message || '',
        createdAt: now
      });
    } catch (emailError) {
      console.error('Fehler beim Versand der Lead-Benachrichtigung:', emailError);
    }

    res.status(201).json({ 
      success: true, 
      message: 'Anfrage erfolgreich gesendet!',
      leadId: id
    });
  } catch (error) {
    console.error('❌ Fehler beim Erstellen des Leads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Serverfehler beim Speichern der Anfrage'
    });
  }
});

// GET - Get all leads (Admin)
app.get('/api/leads', requireAdmin, async (req, res) => {
  try {
    const { status, sortBy = 'createdAt', order = 'desc' } = req.query;
    
    const sortMap = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      firstName: 'first_name',
      lastName: 'last_name',
      status: 'status',
      package: 'package'
    };
    const sortColumn = sortMap[sortBy] || 'created_at';
    const sortDirection = order === 'asc' ? 'ASC' : 'DESC';
    const statusFilter = status && status !== 'all' ? status : null;

    const result = await dbQuery(
      `SELECT * FROM leads
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY ${sortColumn} ${sortDirection}`,
      [statusFilter]
    );
    const leads = result.rows.map(mapLeadRow);
    
    res.json({ 
      success: true, 
      count: leads.length,
      leads
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Leads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Laden der Leads' 
    });
  }
});

// GET - Get single lead
app.get('/api/leads/:id', requireAdmin, async (req, res) => {
  try {
    const result = await dbQuery(`SELECT * FROM leads WHERE id = $1`, [req.params.id]);
    const lead = result.rows[0];
    
    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead nicht gefunden' 
      });
    }
    
    res.json({ 
      success: true, 
      lead: mapLeadRow(lead)
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Leads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Laden des Leads' 
    });
  }
});

// PUT - Update lead
app.put('/api/leads/:id', requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const now = new Date().toISOString();

    const result = await dbQuery(
      `UPDATE leads
       SET status = COALESCE($1, status),
           notes = COALESCE($2, notes),
           updated_at = $3
       WHERE id = $4
       RETURNING *`,
      [status || null, notes ?? null, now, req.params.id]
    );

    const updated = result.rows[0];
    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead nicht gefunden' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Lead erfolgreich aktualisiert',
      lead: mapLeadRow(updated)
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Leads:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Fehler beim Aktualisieren des Leads' 
    });
  }
});

// DELETE - Delete lead
app.delete('/api/leads/:id', requireAdmin, async (req, res) => {
  try {
    const result = await dbQuery(`DELETE FROM leads WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Lead nicht gefunden'
      });
    }

    res.json({
      success: true,
      message: 'Lead erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Fehler beim Löschen des Leads:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen des Leads'
    });
  }
});

// GET - Statistics
app.get('/api/stats', requireAdmin, async (req, res) => {
  try {
    const totalsResult = await dbQuery(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'neu')::int AS neu,
         COUNT(*) FILTER (WHERE status = 'kontaktiert')::int AS kontaktiert,
         COUNT(*) FILTER (WHERE status = 'abgeschlossen')::int AS abgeschlossen
       FROM leads`
    );

    const packagesResult = await dbQuery(
      `SELECT package AS _id, COUNT(*)::int AS count
       FROM leads
       GROUP BY package
       ORDER BY count DESC`
    );

    const totals = totalsResult.rows[0] || { total: 0, neu: 0, kontaktiert: 0, abgeschlossen: 0 };

    res.json({
      success: true,
      stats: {
        total: totals.total,
        neu: totals.neu,
        kontaktiert: totals.kontaktiert,
        abgeschlossen: totals.abgeschlossen,
        packages: packagesResult.rows
      }
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Statistiken:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Statistiken'
    });
  }
});

async function upsertGoogleProspectLead({ place, category, query, distanceMeters }) {
  const now = new Date().toISOString();
  const location = place.location || {};
  const website = place.websiteUri || '';
  const domain = normalizeDomain(website);
  const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || '';
  const companyName = place.displayName?.text || place.name || 'Unbekannter Google-Places-Treffer';
  const metadata = {
    googleMapsUri: place.googleMapsUri || '',
    businessStatus: place.businessStatus || '',
    placeResourceName: place.name || '',
    sourceQuery: query
  };

  const result = await dbQuery(
    `INSERT INTO prospect_leads (
      id, source, external_id, company_name, category, query, city, address,
      phone, website, domain, email, emails, status, notes, distance_meters,
      lat, lng, metadata, raw_data, created_at, updated_at, last_imported_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
    )
    ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL
    DO UPDATE SET
      company_name = EXCLUDED.company_name,
      category = EXCLUDED.category,
      query = EXCLUDED.query,
      city = EXCLUDED.city,
      address = EXCLUDED.address,
      phone = EXCLUDED.phone,
      website = EXCLUDED.website,
      domain = EXCLUDED.domain,
      distance_meters = EXCLUDED.distance_meters,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      metadata = EXCLUDED.metadata,
      raw_data = EXCLUDED.raw_data,
      updated_at = EXCLUDED.updated_at,
      last_imported_at = EXCLUDED.last_imported_at
    RETURNING (xmax = 0) AS inserted, *`,
    [
      randomUUID(),
      'google_places',
      place.id,
      companyName,
      category,
      query,
      'Hattingen',
      place.formattedAddress || '',
      phone,
      website,
      domain,
      '',
      JSON.stringify([]),
      'neu',
      '',
      distanceMeters,
      location.latitude ?? null,
      location.longitude ?? null,
      JSON.stringify(metadata),
      JSON.stringify(place),
      now,
      now,
      now
    ]
  );

  return {
    inserted: Boolean(result.rows[0]?.inserted),
    lead: mapProspectLeadRow(result.rows[0])
  };
}

async function importGooglePlacesCategory(category) {
  const queryTerm = GOOGLE_PLACE_QUERY_MAP[category] || category;
  const textQuery = `${queryTerm} in Hattingen und Umgebung`;
  const baseBody = {
    textQuery,
    pageSize: 20,
    languageCode: 'de',
    regionCode: 'DE',
    rankPreference: 'DISTANCE',
    locationRestriction: {
      rectangle: buildSearchBounds(jaludLeadCenter, jaludLeadRadiusMeters)
    }
  };
  const fieldMask = [
    'places.id',
    'places.name',
    'places.displayName',
    'places.formattedAddress',
    'places.location',
    'places.nationalPhoneNumber',
    'places.internationalPhoneNumber',
    'places.websiteUri',
    'places.googleMapsUri',
    'places.businessStatus',
    'nextPageToken'
  ].join(',');

  const allPlaces = [];
  let nextPageToken = '';

  do {
    const body = nextPageToken ? { ...baseBody, pageToken: nextPageToken } : baseBody;
    const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': googlePlacesApiKey,
        'X-Goog-FieldMask': fieldMask
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data?.error?.message || `Google Places API Fehler (${response.status})`;
      throw new Error(message);
    }

    allPlaces.push(...(data?.places || []));
    nextPageToken = allPlaces.length < 60 ? (data?.nextPageToken || '') : '';
  } while (nextPageToken);

  const seenPlaceIds = new Set();
  const imported = [];
  let skippedOutsideRadius = 0;
  let skippedWithoutLocation = 0;

  for (const place of allPlaces.slice(0, 60)) {
    if (!place?.id || seenPlaceIds.has(place.id)) {
      continue;
    }
    seenPlaceIds.add(place.id);

    const location = place.location || {};
    const placePoint = {
      lat: Number(location.latitude),
      lng: Number(location.longitude)
    };
    const distanceMeters = haversineDistanceMeters(jaludLeadCenter, placePoint);

    if (distanceMeters === null) {
      skippedWithoutLocation += 1;
      continue;
    }
    if (distanceMeters > jaludLeadRadiusMeters) {
      skippedOutsideRadius += 1;
      continue;
    }

    imported.push(await upsertGoogleProspectLead({ place, category, query: textQuery, distanceMeters }));
  }

  return {
    category,
    query: textQuery,
    fetched: allPlaces.length,
    imported: imported.length,
    created: imported.filter(item => item.inserted).length,
    updated: imported.filter(item => !item.inserted).length,
    skippedOutsideRadius,
    skippedWithoutLocation,
    leads: imported.map(item => item.lead)
  };
}

async function upsertHunterProspectLead({ company, industry, city, countryCode, query }) {
  const now = new Date().toISOString();
  const domain = normalizeDomain(company.domain || '');
  const companyName = company.companyName || company.organization || company.name || domain || 'Unbekannte Firma';
  const emailsCount = company.emails_count ?? company.emailsCount ?? null;
  const metadata = {
    emailsCount,
    countryCode,
    sourceQuery: query
  };

  const result = await dbQuery(
    `INSERT INTO prospect_leads (
      id, source, external_id, company_name, category, query, city, address,
      phone, website, domain, email, emails, status, notes, distance_meters,
      lat, lng, metadata, raw_data, created_at, updated_at, last_imported_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
    )
    ON CONFLICT (source, domain) WHERE source = 'hunter' AND domain IS NOT NULL
    DO UPDATE SET
      company_name = EXCLUDED.company_name,
      category = EXCLUDED.category,
      query = EXCLUDED.query,
      city = EXCLUDED.city,
      website = EXCLUDED.website,
      metadata = EXCLUDED.metadata,
      raw_data = EXCLUDED.raw_data,
      updated_at = EXCLUDED.updated_at,
      last_imported_at = EXCLUDED.last_imported_at
    RETURNING (xmax = 0) AS inserted, *`,
    [
      randomUUID(),
      'hunter',
      null,
      companyName,
      industry,
      query,
      city,
      '',
      '',
      domain ? `https://${domain}` : '',
      domain,
      '',
      JSON.stringify([]),
      'neu',
      '',
      null,
      null,
      null,
      JSON.stringify(metadata),
      JSON.stringify(company),
      now,
      now,
      now
    ]
  );

  return {
    inserted: Boolean(result.rows[0]?.inserted),
    lead: mapProspectLeadRow(result.rows[0])
  };
}

function countryNameFromCode(countryCode = 'DE') {
  const normalized = String(countryCode || 'DE').trim().toUpperCase();
  const names = {
    DE: 'Germany',
    AT: 'Austria',
    CH: 'Switzerland',
    NL: 'Netherlands',
    BE: 'Belgium',
    FR: 'France'
  };
  return names[normalized] || normalized;
}

function buildHunterDiscoveryContext({ industry, city, countryCode = 'DE' }) {
  const normalizedCountryCode = String(countryCode || 'DE').trim().toUpperCase();
  const query = `${industry} companies in ${city}, ${countryNameFromCode(normalizedCountryCode)}`;
  return { normalizedCountryCode, query };
}

async function fetchHunterCompanies({ industry, city, countryCode = 'DE' }) {
  const { normalizedCountryCode, query } = buildHunterDiscoveryContext({ industry, city, countryCode });
  const response = await fetch(`https://api.hunter.io/v2/discover?api_key=${encodeURIComponent(hunterApiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(getHunterErrorMessage(response.status, data));
    error.statusCode = response.status === 403 ? 403 : 502;
    throw error;
  }

  const companies = Array.isArray(data?.data) ? data.data : [];
  return {
    query,
    countryCode: normalizedCountryCode,
    companies,
    meta: data?.meta || {}
  };
}

function mapHunterPreviewCompany(company, index, { industry, city, countryCode, query }) {
  const domain = normalizeDomain(company?.domain || '');
  const companyName = company?.organization || company?.name || domain || 'Unbekannte Firma';
  const emailsCount = company?.emails_count ?? company?.emailsCount ?? null;

  return {
    id: `${domain || companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'hunter'}-${index}`,
    companyName,
    organization: company?.organization || companyName,
    name: company?.name || companyName,
    domain,
    website: domain ? `https://${domain}` : '',
    emailsCount,
    emails_count: emailsCount,
    industry,
    city,
    countryCode,
    query,
    importable: Boolean(domain)
  };
}

async function previewHunterCompanies({ industry, city, countryCode = 'DE' }) {
  const search = await fetchHunterCompanies({ industry, city, countryCode });
  const companies = search.companies.map((company, index) => mapHunterPreviewCompany(company, index, {
    industry,
    city,
    countryCode: search.countryCode,
    query: search.query
  }));

  return {
    query: search.query,
    fetched: companies.length,
    importable: companies.filter(company => company.importable).length,
    skippedWithoutDomain: companies.filter(company => !company.importable).length,
    companies,
    meta: search.meta
  };
}

async function importHunterCompanies({ industry, city, countryCode = 'DE', companies }) {
  const { normalizedCountryCode, query: fallbackQuery } = buildHunterDiscoveryContext({ industry, city, countryCode });
  let sourceCompanies = Array.isArray(companies) ? companies : null;
  let query = sourceCompanies?.find(company => company?.query)?.query || fallbackQuery;
  let meta = {};

  if (!sourceCompanies) {
    const search = await fetchHunterCompanies({ industry, city, countryCode });
    sourceCompanies = search.companies;
    query = search.query;
    meta = search.meta;
  }

  const imported = [];
  let skippedWithoutDomain = 0;
  let emailLookups = 0;
  let emailsLoaded = 0;
  let emailLookupFailed = 0;

  for (const company of sourceCompanies) {
    if (!normalizeDomain(company?.domain || '')) {
      skippedWithoutDomain += 1;
      continue;
    }
    const importedItem = await upsertHunterProspectLead({
      company,
      industry: company.industry || industry,
      city: company.city || city,
      countryCode: company.countryCode || normalizedCountryCode,
      query: company.query || query
    });

    emailLookups += 1;
    try {
      const leadWithEmails = await updateHunterLeadEmailsById(
        importedItem.lead._id,
        importedItem.lead.domain || importedItem.lead.website || company.domain
      );
      emailsLoaded += getLeadEmailCount(leadWithEmails);
      importedItem.lead = leadWithEmails;
    } catch (error) {
      emailLookupFailed += 1;
      console.error('Fehler beim automatischen Laden der Firmen-E-Mails:', error);
    }

    imported.push(importedItem);
  }

  return {
    query,
    fetched: sourceCompanies.length,
    imported: imported.length,
    created: imported.filter(item => item.inserted).length,
    updated: imported.filter(item => !item.inserted).length,
    skippedWithoutDomain,
    emailLookups,
    emailsLoaded,
    emailLookupFailed,
    leads: imported.map(item => item.lead),
    meta
  };
}

function mapHunterEmail(email) {
  return {
    value: email.value || '',
    type: email.type || '',
    confidence: email.confidence ?? null,
    firstName: email.first_name || '',
    lastName: email.last_name || '',
    position: email.position || '',
    phoneNumber: email.phone_number || '',
    verificationStatus: email.verification?.status || email.verification_status || ''
  };
}

function pickPrimaryEmail(emails) {
  const candidates = [...emails].filter(email => email.value);
  candidates.sort((a, b) => {
    if (a.type === 'generic' && b.type !== 'generic') return -1;
    if (a.type !== 'generic' && b.type === 'generic') return 1;
    return (b.confidence || 0) - (a.confidence || 0);
  });
  return candidates[0]?.value || '';
}

function getLeadEmailCount(lead) {
  if (!lead) {
    return 0;
  }
  return (lead.emails || []).filter(email => email?.value).length || (lead.email ? 1 : 0);
}

async function fetchHunterDomainEmails(domain) {
  const normalizedDomain = normalizeDomain(domain || '');
  if (!normalizedDomain) {
    throw new Error('Dieser Firmen-Lead hat keine Domain');
  }

  const url = new URL('https://api.hunter.io/v2/domain-search');
  url.searchParams.set('domain', normalizedDomain);
  url.searchParams.set('limit', '10');
  url.searchParams.set('api_key', hunterApiKey);

  const response = await fetch(url.toString());
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getHunterErrorMessage(response.status, data));
  }

  const emails = (data?.data?.emails || []).map(mapHunterEmail).filter(email => email.value);
  const primaryEmail = pickPrimaryEmail(emails);
  const now = new Date().toISOString();
  const metadataUpdate = {
    hunterDomainSearch: {
      domain: normalizedDomain,
      organization: data?.data?.organization || '',
      pattern: data?.data?.pattern || '',
      emailsFound: emails.length,
      checkedAt: now
    }
  };

  return {
    domain: normalizedDomain,
    emails,
    primaryEmail,
    metadataUpdate,
    rawData: data,
    checkedAt: now
  };
}

async function updateHunterLeadEmailsById(leadId, domain) {
  const emailData = await fetchHunterDomainEmails(domain);

  const updated = await dbQuery(
    `UPDATE prospect_leads
     SET emails = $1,
         email = $2,
         domain = $3,
         website = COALESCE(NULLIF(website, ''), $4),
         metadata = metadata || $5::jsonb,
         raw_data = $6::jsonb,
         updated_at = $7
     WHERE id = $8
     RETURNING *`,
    [
      JSON.stringify(emailData.emails),
      emailData.primaryEmail,
      emailData.domain,
      `https://${emailData.domain}`,
      JSON.stringify(emailData.metadataUpdate),
      JSON.stringify(emailData.rawData),
      emailData.checkedAt,
      leadId
    ]
  );

  return mapProspectLeadRow(updated.rows[0]);
}

// GET - Prospect leads for Google Places / company search Kanban
app.get('/api/prospect-leads', requireAdmin, async (req, res) => {
  try {
    const source = req.query.source ? String(req.query.source) : null;
    if (source && !PROSPECT_SOURCES.includes(source)) {
      return res.status(400).json({
        success: false,
        message: 'Ungueltige Lead-Quelle'
      });
    }

    const result = await dbQuery(
      `SELECT * FROM prospect_leads
       WHERE ($1::text IS NULL OR source = $1)
       ORDER BY updated_at DESC, created_at DESC`,
      [source]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      leads: result.rows.map(mapProspectLeadRow)
    });
  } catch (error) {
    console.error('Fehler beim Laden der Akquise-Leads:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Akquise-Leads'
    });
  }
});

// PATCH - Update prospect lead status/notes
app.patch('/api/prospect-leads/:id', requireAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body || {};
    if (status && !PROSPECT_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Ungueltiger Status'
      });
    }

    const now = new Date().toISOString();
    const result = await dbQuery(
      `UPDATE prospect_leads
       SET status = COALESCE($1, status),
           notes = COALESCE($2, notes),
           updated_at = $3
       WHERE id = $4
       RETURNING *`,
      [status || null, notes ?? null, now, req.params.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Akquise-Lead nicht gefunden'
      });
    }

    return res.json({
      success: true,
      message: 'Akquise-Lead aktualisiert',
      lead: mapProspectLeadRow(result.rows[0])
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren des Akquise-Leads:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Aktualisieren'
    });
  }
});

// DELETE - Delete prospect lead
app.delete('/api/prospect-leads/:id', requireAdmin, async (req, res) => {
  try {
    const result = await dbQuery(`DELETE FROM prospect_leads WHERE id = $1 RETURNING id`, [req.params.id]);
    if (!result.rows[0]) {
      return res.status(404).json({
        success: false,
        message: 'Akquise-Lead nicht gefunden'
      });
    }

    return res.json({
      success: true,
      message: 'Akquise-Lead geloescht'
    });
  } catch (error) {
    console.error('Fehler beim Loeschen des Akquise-Leads:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Loeschen'
    });
  }
});

app.get('/api/google-places/categories', requireAdmin, (req, res) => {
  res.json({
    success: true,
    radiusMeters: jaludLeadRadiusMeters,
    center: {
      ...jaludLeadCenter,
      address: 'Auf dem Haidchen 45, 45527 Hattingen'
    },
    categories: GOOGLE_PLACE_CATEGORIES
  });
});

app.post('/api/google-places/import', requireAdmin, async (req, res) => {
  try {
    const { category } = req.body || {};
    if (!category || !GOOGLE_PLACE_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Bitte eine gueltige Google-Places-Kategorie waehlen'
      });
    }

    if (!googlePlacesApiKey) {
      return res.status(503).json({
        success: false,
        message: 'Google Places API ist nicht konfiguriert. Bitte GOOGLE_PLACES_API_KEY setzen.'
      });
    }

    const summary = await importGooglePlacesCategory(category);
    return res.json({
      success: true,
      message: `${summary.imported} Google-Places-Leads importiert`,
      summary
    });
  } catch (error) {
    console.error('Fehler beim Google-Places-Import:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Google-Places-Import: ' + error.message
    });
  }
});

app.post('/api/hunter/preview', requireAdmin, async (req, res) => {
  try {
    const { industry, city, countryCode = 'DE' } = req.body || {};
    if (!industry || !city) {
      return res.status(400).json({
        success: false,
        message: 'Branche und Stadt sind erforderlich'
      });
    }

    if (!hunterApiKey) {
      return res.status(503).json({
        success: false,
        message: 'Firmensuche ist nicht konfiguriert. Bitte HUNTER_API_KEY setzen.'
      });
    }

    const summary = await previewHunterCompanies({ industry, city, countryCode });
    return res.json({
      success: true,
      message: `${summary.importable} Firmen mit Domain gefunden`,
      summary,
      companies: summary.companies
    });
  } catch (error) {
    console.error('Fehler bei der Firmen-Vorschau:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: 'Fehler bei der Firmensuche: ' + error.message
    });
  }
});

app.post('/api/hunter/import', requireAdmin, async (req, res) => {
  try {
    const { industry, city, countryCode = 'DE', companies } = req.body || {};
    if (!industry || !city) {
      return res.status(400).json({
        success: false,
        message: 'Branche und Stadt sind erforderlich'
      });
    }

    if (!hunterApiKey) {
      return res.status(503).json({
        success: false,
        message: 'Firmensuche ist nicht konfiguriert. Bitte HUNTER_API_KEY setzen.'
      });
    }

    const summary = await importHunterCompanies({ industry, city, countryCode, companies });
    const failedSuffix = summary.emailLookupFailed
      ? `, ${summary.emailLookupFailed} E-Mail-Abfragen fehlgeschlagen`
      : '';
    return res.json({
      success: true,
      message: `${summary.imported} Firmen übernommen, ${summary.emailsLoaded} E-Mail-Adressen geladen${failedSuffix}`,
      summary
    });
  } catch (error) {
    console.error('Fehler beim Firmen-Import:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: 'Fehler beim Firmen-Import: ' + error.message
    });
  }
});

app.post('/api/hunter/leads/:id/emails', requireAdmin, async (req, res) => {
  try {
    if (!hunterApiKey) {
      return res.status(503).json({
        success: false,
        message: 'Firmensuche ist nicht konfiguriert. Bitte HUNTER_API_KEY setzen.'
      });
    }

    const leadResult = await dbQuery(
      `SELECT * FROM prospect_leads WHERE id = $1 AND source = 'hunter'`,
      [req.params.id]
    );
    const lead = leadResult.rows[0];
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Firmen-Lead nicht gefunden'
      });
    }

    const domain = normalizeDomain(lead.domain || lead.website || '');
    if (!domain) {
      return res.status(400).json({
        success: false,
        message: 'Dieser Firmen-Lead hat keine Domain'
      });
    }

    const leadWithEmails = await updateHunterLeadEmailsById(req.params.id, domain);

    return res.json({
      success: true,
      message: `${getLeadEmailCount(leadWithEmails)} E-Mail-Adressen geladen`,
      lead: leadWithEmails
    });
  } catch (error) {
    console.error('Fehler beim Laden der Firmen-E-Mails:', error);
    return res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Firmen-E-Mails: ' + error.message
    });
  }
});

// POST - Generate blog post with Mistral
app.post('/api/blog/generate', requireAdmin, async (req, res) => {
  try {
    const { topic, keywords, category, tone = 'professional' } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        message: 'Thema ist erforderlich'
      });
    }
    
    if (!mistralApiKey) {
      return res.status(503).json({
        success: false,
        message: 'Mistral API ist nicht konfiguriert. Bitte MISTRAL_API_KEY setzen.'
      });
    }
    
    const keywordsList = keywords ? keywords.join(', ') : '';
    
    const systemPrompt = `Du bist ein SEO-Experte und professioneller Content-Writer für JALUD Premium Autopflege.
    
Deine Aufgabe:
- Erstelle SEO-optimierte Blog-Beiträge über Autopflege-Themen
- Verwende eine ${tone === 'casual' ? 'lockere, freundliche' : 'professionelle, vertrauenswürdige'} Tonalität
- Integriere Keywords natürlich in den Text
- Schreibe für Menschen, nicht nur für Suchmaschinen
- Verwende kurze Absätze (3-5 Sätze) für bessere Lesbarkeit
- Füge praktische Tipps und Handlungsempfehlungen hinzu
- Beantworte W-Fragen (Was, Wie, Warum, Wann)
- Verwende Struktur: Einleitung, Hauptteil (3-5 Absätze), Schluss mit Call-to-Action`;
    
    const userPrompt = `Erstelle einen informativen Blog-Beitrag zum Thema: "${topic}"
${keywordsList ? `\nZielkeywords: ${keywordsList}` : ''}
${category ? `\nKategorie: ${category}` : ''}

Der Beitrag soll:
1. Einen einprägsamen, SEO-optimierten Titel haben (max. 60 Zeichen)
2. Eine kurze Zusammenfassung (Excerpt) mit 150-200 Zeichen
3. 5-7 ausführliche Absätze Haupttext
4. Praktische Tipps für JALUD-Kunden enthalten
5. Mit einer Handlungsaufforderung enden

Format als JSON:
{
  "title": "SEO-Titel",
  "excerpt": "Kurze Zusammenfassung",
  "paragraphs": ["Absatz 1", "Absatz 2", ...],
  "metaTitle": "SEO Meta-Titel (55-60 Zeichen)",
  "metaDescription": "SEO Meta-Beschreibung (150-160 Zeichen)",
  "suggestedKeywords": ["keyword1", "keyword2", ...]
}`;
    
    const mistralPayload = {
      model: mistralModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${mistralApiKey}`
    };

    let mistralResponse = await fetch(`${mistralBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(mistralPayload)
    });

    let mistralData = await mistralResponse.json().catch(() => null);

    // Some models/routers don't support response_format; retry without it.
    if (
      !mistralResponse.ok &&
      mistralResponse.status === 400 &&
      mistralData?.error?.message &&
      /response_format/i.test(mistralData.error.message)
    ) {
      const retryPayload = { ...mistralPayload };
      delete retryPayload.response_format;

      mistralResponse = await fetch(`${mistralBaseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(retryPayload)
      });
      mistralData = await mistralResponse.json().catch(() => null);
    }

    if (!mistralResponse.ok) {
      const msg =
        mistralData?.error?.message ||
        `Mistral API request failed (${mistralResponse.status})`;
      throw new Error(msg);
    }

    const contentText = mistralData?.choices?.[0]?.message?.content;
    if (!contentText) {
      throw new Error('Mistral API: Leere Antwort');
    }

    let generatedContent;
    try {
      generatedContent = JSON.parse(contentText);
    } catch (parseError) {
      // Fallback in case the model returns extra text around the JSON.
      const start = contentText.indexOf('{');
      const end = contentText.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        generatedContent = JSON.parse(contentText.slice(start, end + 1));
      } else {
        throw parseError;
      }
    }
    
    res.json({
      success: true,
      content: generatedContent
    });
  } catch (error) {
    console.error('Fehler bei der AI-Generierung:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler bei der AI-Generierung: ' + error.message
    });
  }
});
// POST - Upload blog image
app.post('/api/blog/upload-image', requireAdmin, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Keine Datei hochgeladen'
      });
    }
    
    const imageUrl = `/uploads/blog/${req.file.filename}`;
    
    res.json({
      success: true,
      imageUrl: imageUrl,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Fehler beim Bild-Upload:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Bild-Upload'
    });
  }
});

// POST - Create blog post
app.post('/api/blog/posts', requireAdmin, async (req, res) => {
  try {
    const postData = req.body;

    if (!postData.title || !postData.excerpt || !postData.content || !postData.category) {
      return res.status(400).json({
        success: false,
        message: 'Titel, Auszug, Inhalt und Kategorie sind erforderlich'
      });
    }

    const baseSlug = postData.slug ? slugify(postData.slug) : slugify(postData.title);
    const slug = await ensureUniqueSlug(baseSlug);

    const now = new Date().toISOString();
    const status = BLOG_STATUSES.includes(postData.status) ? postData.status : 'draft';
    const publishedAt = status === 'published' ? (postData.publishedAt || now) : null;
    const fullContent = Array.isArray(postData.fullContent)
      ? postData.fullContent
      : (postData.fullContent ? [postData.fullContent] : []);
    const keywords = Array.isArray(postData.keywords) ? postData.keywords : [];

    const result = await dbQuery(
      `INSERT INTO blog_posts (
        id, title, slug, excerpt, content, full_content, image, category,
        meta_title, meta_description, keywords, status, ai_generated,
        published_at, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      )
      RETURNING *`,
      [
        randomUUID(),
        postData.title,
        slug,
        postData.excerpt,
        postData.content,
        JSON.stringify(fullContent),
        postData.image || '',
        postData.category,
        postData.metaTitle || '',
        postData.metaDescription || '',
        JSON.stringify(keywords),
        status,
        Boolean(postData.aiGenerated),
        publishedAt,
        now,
        now
      ]
    );

    const newPost = mapBlogRow(result.rows[0]);

    res.status(201).json({
      success: true,
      message: 'Blog-Beitrag erfolgreich erstellt',
      post: newPost
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Blog-Beitrags:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Erstellen: ' + error.message
    });
  }
});

// GET - Get all blog posts
app.get('/api/blog/posts', requireAdmin, async (req, res) => {
  try {
    const { status, category, sortBy = 'createdAt', order = 'desc' } = req.query;

    const sortMap = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      publishedAt: 'published_at',
      title: 'title',
      category: 'category',
      status: 'status'
    };
    const sortColumn = sortMap[sortBy] || 'created_at';
    const sortDirection = order === 'asc' ? 'ASC' : 'DESC';
    const statusFilter = status && status !== 'all' ? status : null;
    const categoryFilter = category || null;

    const result = await dbQuery(
      `SELECT * FROM blog_posts
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR category = $2)
       ORDER BY ${sortColumn} ${sortDirection}`,
      [statusFilter, categoryFilter]
    );

    const posts = result.rows.map(mapBlogRow);

    res.json({
      success: true,
      count: posts.length,
      posts
    });
  } catch (error) {
    console.error('Fehler beim Abrufen der Blog-Beiträge:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden der Beiträge'
    });
  }
});

// GET - Get published blog posts (for frontend)
app.get('/api/blog/posts/published', async (req, res) => {
  try {
    const result = await dbQuery(
      `SELECT id, title, slug, excerpt, image, category, published_at
       FROM blog_posts
       WHERE status = 'published'
       ORDER BY published_at DESC NULLS LAST, created_at DESC`
    );

    const posts = result.rows.map(post => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      image: post.image || '',
      category: post.category,
      publishedAt: post.published_at
    }));

    res.json({
      success: true,
      posts
    });
  } catch (error) {
    console.error('Fehler beim Abrufen veröffentlichter Beiträge:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden'
    });
  }
});

// GET - Get blog post by slug (for frontend)
app.get('/api/blog/posts/slug/:slug', async (req, res) => {
  try {
    const result = await dbQuery(
      `SELECT * FROM blog_posts WHERE slug = $1 AND status = 'published' LIMIT 1`,
      [req.params.slug]
    );
    const post = result.rows[0];

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }

    res.json({
      success: true,
      post: mapBlogRow(post)
    });
  } catch (error) {
    console.error('Fehler beim Laden:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden'
    });
  }
});

// GET - Get single blog post by ID
app.get('/api/blog/posts/:id', requireAdmin, async (req, res) => {
  try {
    const result = await dbQuery(`SELECT * FROM blog_posts WHERE id = $1`, [req.params.id]);
    const post = result.rows[0];

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }

    res.json({
      success: true,
      post: mapBlogRow(post)
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Beitrags:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden'
    });
  }
});

// PUT - Update blog post
app.put('/api/blog/posts/:id', requireAdmin, async (req, res) => {
  try {
    const updates = req.body;
    const existingResult = await dbQuery(`SELECT * FROM blog_posts WHERE id = $1`, [req.params.id]);
    const existing = existingResult.rows[0];

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }

    let slug = existing.slug;
    if (updates.slug) {
      const slugCandidate = slugify(updates.slug);
      slug = await ensureUniqueSlug(slugCandidate, req.params.id);
    } else if (updates.title && !updates.slug) {
      const slugCandidate = slugify(updates.title) || `post-${Date.now()}`;
      slug = await ensureUniqueSlug(slugCandidate, req.params.id);
    }

    let status = existing.status;
    let publishedAt = existing.published_at;
    if (updates.status && BLOG_STATUSES.includes(updates.status)) {
      status = updates.status;
      if (status === 'published' && !publishedAt) {
        publishedAt = new Date().toISOString();
      }
    }
    if (updates.publishedAt !== undefined) {
      publishedAt = updates.publishedAt;
    }

    const fullContent = updates.fullContent !== undefined
      ? (Array.isArray(updates.fullContent)
        ? updates.fullContent
        : (updates.fullContent ? [updates.fullContent] : []))
      : existing.full_content;
    const keywords = updates.keywords !== undefined
      ? (Array.isArray(updates.keywords) ? updates.keywords : [])
      : existing.keywords;

    const now = new Date().toISOString();

    const result = await dbQuery(
      `UPDATE blog_posts
       SET title = $1,
           slug = $2,
           excerpt = $3,
           content = $4,
           full_content = $5,
           image = $6,
           category = $7,
           meta_title = $8,
           meta_description = $9,
           keywords = $10,
           status = $11,
           ai_generated = $12,
           published_at = $13,
           updated_at = $14
       WHERE id = $15
       RETURNING *`,
      [
        updates.title ?? existing.title,
        slug,
        updates.excerpt ?? existing.excerpt,
        updates.content ?? existing.content,
        JSON.stringify(fullContent),
        updates.image ?? existing.image,
        updates.category ?? existing.category,
        updates.metaTitle ?? existing.meta_title,
        updates.metaDescription ?? existing.meta_description,
        JSON.stringify(keywords),
        status,
        updates.aiGenerated !== undefined ? Boolean(updates.aiGenerated) : existing.ai_generated,
        publishedAt,
        now,
        req.params.id
      ]
    );

    res.json({
      success: true,
      message: 'Beitrag erfolgreich aktualisiert',
      post: mapBlogRow(result.rows[0])
    });
  } catch (error) {
    console.error('Fehler beim Aktualisieren:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Aktualisieren: ' + error.message
    });
  }
});

// DELETE - Delete blog post
app.delete('/api/blog/posts/:id', requireAdmin, async (req, res) => {
  try {
    const result = await dbQuery(`DELETE FROM blog_posts WHERE id = $1 RETURNING *`, [req.params.id]);
    const deleted = result.rows[0];

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }

    if (deleted.image && deleted.image.startsWith('/uploads/')) {
      const relativePath = deleted.image.replace(/^\/uploads\//, '');
      const imagePath = path.join(uploadsBaseDir, relativePath);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    res.json({
      success: true,
      message: 'Beitrag erfolgreich gelöscht'
    });
  } catch (error) {
    console.error('Fehler beim Löschen:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Löschen'
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'JALUD API',
    message: 'Backend ist erreichbar',
    endpoints: {
      health: '/health',
      leads: '/api/leads',
      prospects: '/api/prospect-leads',
      blog: '/api/blog/posts/published'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server läuft' });
});

// Export the app for tests and alternative process managers.
module.exports = app;

// Start the HTTP server when this file is executed directly.
let server = null;

async function shutdown(signal) {
  console.log(`Shutdown signal empfangen: ${signal}`);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    if (pool) {
      await pool.end();
    }

    process.exit(0);
  } catch (error) {
    console.error('Fehler beim Herunterfahren:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}











