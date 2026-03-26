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
  openai: {
    apiKey: '',
    model: 'gpt-4o-mini'
  },
  blog: {
    imagesPath: 'public/images/blog',
    postsPath: 'backend/data/blog-posts.json'
  },
  email: {
    host: '',
    port: 465,
    secure: true,
    user: '',
    password: '',
    from: '',
    adminEmail: ''
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
      openai: {
        ...defaultConfig.openai,
        ...(localConfig.openai || {})
      },
      blog: {
        ...defaultConfig.blog,
        ...(localConfig.blog || {})
      },
      email: {
        ...defaultConfig.email,
        ...(localConfig.email || {})
      }
    };
  }
} catch (error) {
  console.error('⚠️  Konfigurationsfehler:', error.message);
  config = { ...defaultConfig };
}

config.openai.apiKey = process.env.OPENAI_API_KEY || config.openai.apiKey;
config.openai.model = process.env.OPENAI_MODEL || config.openai.model;
config.blog.imagesPath = config.blog.imagesPath || defaultConfig.blog.imagesPath;
config.blog.postsPath = config.blog.postsPath || defaultConfig.blog.postsPath;
config.email = {
  host: process.env.EMAIL_HOST || config.email.host,
  port: parseInt(process.env.EMAIL_PORT || `${config.email.port}`, 10),
  secure: process.env.EMAIL_SECURE ? process.env.EMAIL_SECURE === 'true' : config.email.secure,
  user: process.env.EMAIL_USER || config.email.user,
  password: process.env.EMAIL_PASSWORD || config.email.password,
  from: process.env.EMAIL_FROM || config.email.from,
  adminEmail: process.env.EMAIL_ADMIN || config.email.adminEmail
};

const openaiApiKey = config.openai.apiKey;
const openaiModel = config.openai.model || defaultConfig.openai.model;
const openaiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
if (openaiApiKey) {
  console.log('✅ OpenAI API konfiguriert');
} else {
  console.log('⚠️  OpenAI API nicht konfiguriert (nur für Blog-Generierung benötigt).');
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
    { expiresIn: '12h' }
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
const shouldUseSSL = process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production';
const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: shouldUseSSL ? { rejectUnauthorized: false } : undefined
    })
  : null;

let dbInitPromise = null;

async function initDb() {
  if (!pool) {
    throw new Error('DATABASE_URL ist nicht gesetzt. Bitte in Railway oder .env konfigurieren.');
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
  return dbInitPromise;
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
    return res.status(500).json({ success: false, message: 'Serverfehler' });
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

// POST - Generate blog post with OpenAI
app.post('/api/blog/generate', requireAdmin, async (req, res) => {
  try {
    const { topic, keywords, category, tone = 'professional' } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        message: 'Thema ist erforderlich'
      });
    }
    
    if (!openaiApiKey) {
      return res.status(503).json({
        success: false,
        message: 'OpenAI API ist nicht konfiguriert. Bitte OPENAI_API_KEY setzen.'
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
    
    const openaiPayload = {
      model: openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    };

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`
    };

    let openaiResponse = await fetch(`${openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(openaiPayload)
    });

    let openaiData = await openaiResponse.json().catch(() => null);

    // Some models/routers don't support response_format; retry without it.
    if (
      !openaiResponse.ok &&
      openaiResponse.status === 400 &&
      openaiData?.error?.message &&
      /response_format/i.test(openaiData.error.message)
    ) {
      const retryPayload = { ...openaiPayload };
      delete retryPayload.response_format;

      openaiResponse = await fetch(`${openaiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(retryPayload)
      });
      openaiData = await openaiResponse.json().catch(() => null);
    }

    if (!openaiResponse.ok) {
      const msg =
        openaiData?.error?.message ||
        `OpenAI API request failed (${openaiResponse.status})`;
      throw new Error(msg);
    }

    const contentText = openaiData?.choices?.[0]?.message?.content;
    if (!contentText) {
      throw new Error('OpenAI API: Leere Antwort');
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
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server läuft' });
});

// Export for Vercel Serverless
module.exports = app;

// Start server when not running as Vercel serverless
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
  });
}











