const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { GoogleGenAI } = require('@google/genai');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const defaultConfig = {
  gemini: {
    apiKey: '',
    model: 'gemini-3-flash-preview'
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
      gemini: {
        ...defaultConfig.gemini,
        ...(localConfig.gemini || {})
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

config.gemini.apiKey = process.env.GEMINI_API_KEY || config.gemini.apiKey;
config.gemini.model = process.env.GEMINI_MODEL || config.gemini.model;
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

const geminiApiKey = config.gemini.apiKey;
const geminiModel = config.gemini.model || defaultConfig.gemini.model;
let geminiClient = null;
if (geminiApiKey) {
  try {
    geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
    console.log('✅ Gemini API konfiguriert');
  } catch (e) {
    console.log('⚠️  Gemini API konnte nicht initialisiert werden:', e.message);
  }
} else {
  console.log('⚠️  Gemini API nicht konfiguriert (nur für Blog-Generierung benötigt).');
}

// Helpers for file-based lead storage
const leadsFilePath = path.join(__dirname, 'data', 'leads.json');

async function ensureLeadsFile() {
  const dir = path.dirname(leadsFilePath);
  await fs.promises.mkdir(dir, { recursive: true });
  try {
    await fs.promises.access(leadsFilePath);
  } catch (err) {
    await fs.promises.writeFile(leadsFilePath, '[]', 'utf8');
  }
}

async function readLeads() {
  await ensureLeadsFile();
  const raw = await fs.promises.readFile(leadsFilePath, 'utf8');
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeLeads(leads) {
  await ensureLeadsFile();
  await fs.promises.writeFile(leadsFilePath, JSON.stringify(leads, null, 2), 'utf8');
}

// Helpers for file-based blog storage
const blogPostsFilePath = path.join(__dirname, 'data', 'blog-posts.json');

async function ensureBlogPostsFile() {
  const dir = path.dirname(blogPostsFilePath);
  await fs.promises.mkdir(dir, { recursive: true });
  try {
    await fs.promises.access(blogPostsFilePath);
  } catch (err) {
    await fs.promises.writeFile(blogPostsFilePath, '[]', 'utf8');
  }
}

async function readBlogPosts() {
  await ensureBlogPostsFile();
  const raw = await fs.promises.readFile(blogPostsFilePath, 'utf8');
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeBlogPosts(posts) {
  await ensureBlogPostsFile();
  await fs.promises.writeFile(blogPostsFilePath, JSON.stringify(posts, null, 2), 'utf8');
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

function ensureUniqueSlug(baseSlug, posts, excludeId) {
  let candidate = baseSlug || `post-${Date.now()}`;
  while (posts.some(p => p.slug === candidate && p.id !== excludeId)) {
    candidate = `${candidate}-${Math.floor(Math.random() * 1000)}`;
  }
  return candidate;
}

const BLOG_STATUSES = ['draft', 'published', 'archived'];


// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer configuration for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads', 'blog');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
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

    const leads = await readLeads();
    const newLead = {
      id: randomUUID(),
      firstName,
      lastName,
      phone,
      email,
      package: pkg,
      message: message || '',
      status: 'neu',
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    leads.push(newLead);
    await writeLeads(leads);
    
    console.log('✅ Lead gespeichert:', newLead.id);
    
    res.status(201).json({ 
      success: true, 
      message: 'Anfrage erfolgreich gesendet!',
      leadId: newLead.id
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
app.get('/api/leads', async (req, res) => {
  try {
    const { status, sortBy = 'createdAt', order = 'desc' } = req.query;
    
    let leads = await readLeads();
    if (status && status !== 'all') {
      leads = leads.filter(lead => lead.status === status);
    }

    leads.sort((a, b) => {
      if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
        const dateA = new Date(a[sortBy]);
        const dateB = new Date(b[sortBy]);
        return order === 'asc' ? dateA - dateB : dateB - dateA;
      }
      const valueA = `${a[sortBy] || ''}`.toLowerCase();
      const valueB = `${b[sortBy] || ''}`.toLowerCase();
      if (valueA < valueB) return order === 'asc' ? -1 : 1;
      if (valueA > valueB) return order === 'asc' ? 1 : -1;
      return 0;
    });
    
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
app.get('/api/leads/:id', async (req, res) => {
  try {
    const leads = await readLeads();
    const lead = leads.find(l => l.id === req.params.id);
    
    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead nicht gefunden' 
      });
    }
    
    res.json({ 
      success: true, 
      lead 
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
app.put('/api/leads/:id', async (req, res) => {
  try {
    const { status, notes } = req.body;
    
    const leads = await readLeads();
    const leadIndex = leads.findIndex(l => l.id === req.params.id);
    if (leadIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead nicht gefunden' 
      });
    }

    if (status) leads[leadIndex].status = status;
    if (notes !== undefined) leads[leadIndex].notes = notes;
    leads[leadIndex].updatedAt = new Date().toISOString();

    await writeLeads(leads);
    
    res.json({ 
      success: true, 
      message: 'Lead erfolgreich aktualisiert',
      lead: leads[leadIndex]
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
app.delete('/api/leads/:id', async (req, res) => {
  try {
    const leads = await readLeads();
    const filtered = leads.filter(l => l.id !== req.params.id);
    
    if (filtered.length === leads.length) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead nicht gefunden' 
      });
    }

    await writeLeads(filtered);
    
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
app.get('/api/stats', async (req, res) => {
  try {
    const leads = await readLeads();
    const total = leads.length;
    const neu = leads.filter(l => l.status === 'neu').length;
    const kontaktiert = leads.filter(l => l.status === 'kontaktiert').length;
    const abgeschlossen = leads.filter(l => l.status === 'abgeschlossen').length;
    const packageStats = Object.entries(
      leads.reduce((acc, lead) => {
        acc[lead.package] = (acc[lead.package] || 0) + 1;
        return acc;
      }, {})
    ).map(([key, value]) => ({ _id: key, count: value }));
    
    res.json({
      success: true,
      stats: {
        total,
        neu,
        kontaktiert,
        abgeschlossen,
        packages: packageStats
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

// POST - Generate blog post with Gemini
app.post('/api/blog/generate', async (req, res) => {
  try {
    const { topic, keywords, category, tone = 'professional' } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        message: 'Thema ist erforderlich'
      });
    }
    
    if (!geminiClient) {
      return res.status(503).json({
        success: false,
        message: 'Gemini API ist nicht konfiguriert. Bitte GEMINI_API_KEY setzen.'
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
    
    const response = await geminiClient.models.generateContent({
      model: geminiModel,
      contents: [systemPrompt, userPrompt],
      config: {
        thinkingConfig: { thinkingLevel: 'MEDIUM' },
        temperature: 0.7
      }
    });
    
    const generatedContent = JSON.parse(response.text);
    
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
app.post('/api/blog/upload-image', upload.single('image'), (req, res) => {
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
app.post('/api/blog/posts', async (req, res) => {
  try {
    const postData = req.body;

    if (!postData.title || !postData.excerpt || !postData.content || !postData.category) {
      return res.status(400).json({
        success: false,
        message: 'Titel, Auszug, Inhalt und Kategorie sind erforderlich'
      });
    }

    const posts = await readBlogPosts();
    const baseSlug = postData.slug ? slugify(postData.slug) : slugify(postData.title);
    const slug = ensureUniqueSlug(baseSlug, posts);

    const now = new Date().toISOString();
    const newPost = {
      id: randomUUID(),
      title: postData.title,
      slug,
      excerpt: postData.excerpt,
      content: postData.content,
      fullContent: Array.isArray(postData.fullContent) ? postData.fullContent : (postData.fullContent ? [postData.fullContent] : []),
      image: postData.image || '',
      category: postData.category,
      metaTitle: postData.metaTitle || '',
      metaDescription: postData.metaDescription || '',
      keywords: Array.isArray(postData.keywords) ? postData.keywords : [],
      status: BLOG_STATUSES.includes(postData.status) ? postData.status : 'draft',
      aiGenerated: Boolean(postData.aiGenerated),
      publishedAt: postData.status === 'published' ? (postData.publishedAt || now) : null,
      createdAt: now,
      updatedAt: now
    };

    posts.push(newPost);
    await writeBlogPosts(posts);

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
app.get('/api/blog/posts', async (req, res) => {
  try {
    const { status, category, sortBy = 'createdAt', order = 'desc' } = req.query;
    let posts = await readBlogPosts();

    if (status && status !== 'all') {
      posts = posts.filter(post => post.status === status);
    }
    if (category) {
      posts = posts.filter(post => post.category === category);
    }

    const sortMultiplier = order === 'asc' ? 1 : -1;
    posts.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];
      if (sortBy === 'createdAt' || sortBy === 'updatedAt' || sortBy === 'publishedAt') {
        return sortMultiplier * (new Date(bValue || 0) - new Date(aValue || 0));
      }
      const valA = `${aValue || ''}`.toLowerCase();
      const valB = `${bValue || ''}`.toLowerCase();
      if (valA < valB) return -1 * sortMultiplier;
      if (valA > valB) return sortMultiplier;
      return 0;
    });

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
    const posts = (await readBlogPosts())
      .filter(post => post.status === 'published')
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));

    res.json({
      success: true,
      posts: posts.map(post => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        image: post.image,
        category: post.category,
        publishedAt: post.publishedAt
      }))
    });
  } catch (error) {
    console.error('Fehler beim Abrufen veröffentlichter Beiträge:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden'
    });
  }
});

// GET - Get single blog post by ID
app.get('/api/blog/posts/:id', async (req, res) => {
  try {
    const posts = await readBlogPosts();
    const post = posts.find(p => p.id === req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }

    res.json({
      success: true,
      post
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des Beitrags:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden'
    });
  }
});

// GET - Get blog post by slug (for frontend)
app.get('/api/blog/posts/slug/:slug', async (req, res) => {
  try {
    const posts = await readBlogPosts();
    const post = posts.find(p => p.slug === req.params.slug && p.status === 'published');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }

    res.json({
      success: true,
      post
    });
  } catch (error) {
    console.error('Fehler beim Laden:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden'
    });
  }
});

// PUT - Update blog post
app.put('/api/blog/posts/:id', async (req, res) => {
  try {
    const updates = req.body;
    const posts = await readBlogPosts();
    const index = posts.findIndex(p => p.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }

    const existing = posts[index];
    const updated = { ...existing };

    const fields = ['title', 'excerpt', 'content', 'fullContent', 'image', 'category', 'metaTitle', 'metaDescription', 'aiGenerated'];
    fields.forEach(field => {
      if (updates[field] !== undefined) {
        updated[field] = updates[field];
      }
    });

    if (updates.keywords) {
      updated.keywords = Array.isArray(updates.keywords) ? updates.keywords : [];
    }

    if (updates.slug) {
      const slugCandidate = slugify(updates.slug);
      updated.slug = ensureUniqueSlug(slugCandidate, posts, updated.id);
    } else if (updates.title && !updates.slug) {
      const slugCandidate = slugify(updates.title) || `post-${Date.now()}`;
      updated.slug = ensureUniqueSlug(slugCandidate, posts, updated.id);
    }

    if (updates.status && BLOG_STATUSES.includes(updates.status)) {
      updated.status = updates.status;
      if (updates.status === 'published' && !updated.publishedAt) {
        updated.publishedAt = new Date().toISOString();
      }
    }

    updated.updatedAt = new Date().toISOString();

    posts[index] = updated;
    await writeBlogPosts(posts);

    res.json({
      success: true,
      message: 'Beitrag erfolgreich aktualisiert',
      post: updated
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
app.delete('/api/blog/posts/:id', async (req, res) => {
  try {
    const posts = await readBlogPosts();
    const index = posts.findIndex(p => p.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }

    const [deleted] = posts.splice(index, 1);
    await writeBlogPosts(posts);

    if (deleted.image && deleted.image.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, deleted.image);
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

// Start server only in development and when not in Vercel environment
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
  });
}
