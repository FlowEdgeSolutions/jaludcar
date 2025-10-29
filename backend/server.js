const express = require('express');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { AzureOpenAI } = require('openai');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Load config from environment variables or config.json
let config;
try {
  // For Vercel: Use environment variables
  if (process.env.MONGODB_URI) {
    config = {
      azureOpenAI: {
        endpoint: process.env.AZURE_OPENAI_ENDPOINT || '',
        apiKey: process.env.AZURE_OPENAI_API_KEY || '',
        deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4.1_jalud_blog',
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview'
      },
      blog: {
        imagesPath: 'public/images/blog',
        postsPath: 'backend/data/blog-posts.json'
      },
      email: {
        host: process.env.EMAIL_HOST || 'smtp.strato.de',
        port: parseInt(process.env.EMAIL_PORT || '465'),
        secure: process.env.EMAIL_SECURE === 'true',
        user: process.env.EMAIL_USER || '',
        password: process.env.EMAIL_PASSWORD || '',
        from: process.env.EMAIL_FROM || '',
        adminEmail: process.env.EMAIL_ADMIN || ''
      }
    };
  } else {
    // For local development: Use config.json
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
  }
} catch (error) {
  console.error('⚠️  Konfigurationsfehler:', error.message);
  config = {
    azureOpenAI: { endpoint: '', apiKey: '', deploymentName: 'gpt-4.1_jalud_blog', apiVersion: '2025-01-01-preview' },
    blog: { imagesPath: 'public/images/blog', postsPath: 'backend/data/blog-posts.json' },
    email: { host: '', port: 465, secure: true, user: '', password: '', from: '', adminEmail: '' }
  };
}

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

// MongoDB Connection
// Support both MONGODB_URI and jaludcar_MONGODB_URI (Vercel integration)
const MONGODB_URI = process.env.jaludcar_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/jalud-leads';

mongoose.connect(MONGODB_URI)
.then(() => console.log('✅ MongoDB verbunden'))
.catch(err => console.error('❌ MongoDB Verbindungsfehler:', err));

// Lead Schema
const leadSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  package: {
    type: String,
    required: true,
    enum: ['basic', 'premium', 'luxus', 'beratung']
  },
  message: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['neu', 'kontaktiert', 'abgeschlossen', 'abgelehnt'],
    default: 'neu'
  },
  notes: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update updatedAt on save
leadSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Lead = mongoose.model('Lead', leadSchema);

// Email Configuration
let emailTransporter = null;
if (config.email && config.email.user && config.email.password && config.email.password !== 'IHR_EMAIL_PASSWORT_HIER') {
  const transportConfig = config.email.service ? {
    service: config.email.service,
    auth: {
      user: config.email.user,
      pass: config.email.password
    }
  } : {
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
      user: config.email.user,
      pass: config.email.password
    }
  };
  
  emailTransporter = nodemailer.createTransport(transportConfig);
  console.log('✅ E-Mail-Service konfiguriert');
} else {
  console.log('⚠️  E-Mail-Service nicht konfiguriert. Bitte config.json aktualisieren.');
}

// Email Templates
function getCustomerEmailTemplate(lead) {
  const packageNames = {
    'basic': 'Basic-Package',
    'premium': 'Premium-Package',
    'luxus': 'Luxus-Package',
    'beratung': 'Individuelle Beratung'
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #000; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; background: #f9f9f9; }
    .footer { background: #000; color: white; padding: 20px; text-align: center; font-size: 12px; }
    .button { display: inline-block; padding: 12px 30px; background: #000; color: white; text-decoration: none; margin: 20px 0; }
    .info-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #000; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>JALUD Premium Autopflege</h1>
    </div>
    <div class="content">
      <h2>Vielen Dank für Ihre Anfrage!</h2>
      <p>Hallo ${lead.firstName} ${lead.lastName},</p>
      <p>vielen Dank für Ihr Interesse an unseren Premium-Autopflege-Leistungen. Wir haben Ihre Anfrage erhalten und werden uns in Kürze bei Ihnen melden.</p>
      
      <div class="info-box">
        <h3>Ihre Anfrage im Überblick:</h3>
        <p><strong>Paket:</strong> ${packageNames[lead.package]}</p>
        <p><strong>Name:</strong> ${lead.firstName} ${lead.lastName}</p>
        <p><strong>E-Mail:</strong> ${lead.email}</p>
        <p><strong>Telefon:</strong> ${lead.phone}</p>
        ${lead.message ? `<p><strong>Ihre Nachricht:</strong><br>${lead.message}</p>` : ''}
      </div>

      <p>Unser Team wird Ihre Anfrage prüfen und sich innerhalb von 24 Stunden bei Ihnen melden.</p>
      
      <p>Bei dringenden Fragen erreichen Sie uns unter:</p>
      <p><strong>📞 +49 155 636 538 36</strong><br>
         <strong>📧 info@jalud.de</strong></p>

      <p>Wir freuen uns darauf, Ihr Fahrzeug zum Strahlen zu bringen!</p>
      
      <p>Mit freundlichen Grüßen,<br>
         Ihr JALUD-Team</p>
    </div>
    <div class="footer">
      <p>JALUD Premium Autopflege<br>
         Auf dem Haidchen 45, 45527 Hattingen<br>
         Tel: +49 155 636 538 36 | E-Mail: info@jalud.de</p>
    </div>
  </div>
</body>
</html>
  `;
}

function getAdminEmailTemplate(lead) {
  const packageNames = {
    'basic': 'Basic-Package',
    'premium': 'Premium-Package',
    'luxus': 'Luxus-Package',
    'beratung': 'Individuelle Beratung'
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #000; color: white; padding: 20px; }
    .content { padding: 20px; background: #f9f9f9; }
    .lead-info { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #000; }
    .status-badge { display: inline-block; padding: 5px 15px; background: #4CAF50; color: white; border-radius: 3px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🔔 Neue Lead-Anfrage</h2>
    </div>
    <div class="content">
      <p><span class="status-badge">NEU</span></p>
      
      <div class="lead-info">
        <h3>Kontaktdaten:</h3>
        <p><strong>Name:</strong> ${lead.firstName} ${lead.lastName}</p>
        <p><strong>E-Mail:</strong> <a href="mailto:${lead.email}">${lead.email}</a></p>
        <p><strong>Telefon:</strong> <a href="tel:${lead.phone}">${lead.phone}</a></p>
        <p><strong>Gewünschtes Paket:</strong> ${packageNames[lead.package]}</p>
        ${lead.message ? `<p><strong>Nachricht:</strong><br>${lead.message}</p>` : '<p><em>Keine Nachricht hinterlassen</em></p>'}
        <p><strong>Eingegangen am:</strong> ${new Date(lead.createdAt).toLocaleString('de-DE')}</p>
      </div>

      <p><strong>Nächste Schritte:</strong></p>
      <ul>
        <li>Kunde innerhalb von 24 Stunden kontaktieren</li>
        <li>Lead im Admin-Dashboard bearbeiten</li>
        <li>Termin vereinbaren</li>
      </ul>

      <p><a href="http://localhost:4200/admin" style="display: inline-block; padding: 12px 30px; background: #000; color: white; text-decoration: none;">Zum Admin-Dashboard</a></p>
    </div>
  </div>
</body>
</html>
  `;
}

// Routes

// POST - Create new lead
app.post('/api/leads', async (req, res) => {
  try {
    const { firstName, lastName, phone, email, package: pkg, message } = req.body;
    
    // Validation
    if (!firstName || !lastName || !phone || !email || !pkg) {
      return res.status(400).json({ 
        success: false, 
        message: 'Alle Pflichtfelder müssen ausgefüllt werden' 
      });
    }

    const lead = new Lead({
      firstName,
      lastName,
      phone,
      email,
      package: pkg,
      message: message || ''
    });

    await lead.save();
    
    // Send emails if configured
    if (emailTransporter) {
      try {
        // 1. Confirmation email to customer
        await emailTransporter.sendMail({
          from: config.email.from,
          to: email,
          subject: 'Bestätigung Ihrer Anfrage - JALUD Premium Autopflege',
          html: getCustomerEmailTemplate(lead)
        });
        console.log(`✅ Bestätigungs-E-Mail an ${email} gesendet`);

        // 2. Notification email to admin
        await emailTransporter.sendMail({
          from: config.email.from,
          to: config.email.adminEmail,
          subject: `🔔 Neue Lead-Anfrage von ${firstName} ${lastName}`,
          html: getAdminEmailTemplate(lead)
        });
        console.log(`✅ Benachrichtigung an ${config.email.adminEmail} gesendet`);
      } catch (emailError) {
        console.error('⚠️  E-Mail-Fehler:', emailError);
        // Continue even if email fails
      }
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Anfrage erfolgreich gesendet!',
      leadId: lead._id
    });
  } catch (error) {
    console.error('Fehler beim Erstellen des Leads:', error);
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
    
    const filter = {};
    if (status) filter.status = status;
    
    const sortOrder = order === 'asc' ? 1 : -1;
    const leads = await Lead.find(filter).sort({ [sortBy]: sortOrder });
    
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
    const lead = await Lead.findById(req.params.id);
    
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
    
    const updateData = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    updateData.updatedAt = Date.now();
    
    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!lead) {
      return res.status(404).json({ 
        success: false, 
        message: 'Lead nicht gefunden' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Lead erfolgreich aktualisiert',
      lead 
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
    const lead = await Lead.findByIdAndDelete(req.params.id);
    
    if (!lead) {
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
app.get('/api/stats', async (req, res) => {
  try {
    const totalLeads = await Lead.countDocuments();
    const neuLeads = await Lead.countDocuments({ status: 'neu' });
    const kontaktiertLeads = await Lead.countDocuments({ status: 'kontaktiert' });
    const abgeschlossenLeads = await Lead.countDocuments({ status: 'abgeschlossen' });
    
    const packageStats = await Lead.aggregate([
      { $group: { _id: '$package', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      stats: {
        total: totalLeads,
        neu: neuLeads,
        kontaktiert: kontaktiertLeads,
        abgeschlossen: abgeschlossenLeads,
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

// ============================================
// BLOG POST ROUTES
// ============================================

// Blog Post Schema
const blogPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  excerpt: {
    type: String,
    required: true,
    maxlength: 300
  },
  content: {
    type: String,
    required: true
  },
  fullContent: {
    type: [String],
    default: []
  },
  image: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    required: true
  },
  metaTitle: {
    type: String,
    default: ''
  },
  metaDescription: {
    type: String,
    default: ''
  },
  keywords: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  aiGenerated: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

blogPostSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (!this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

const BlogPost = mongoose.model('BlogPost', blogPostSchema);

// Initialize Azure OpenAI Client
let azureOpenAI = null;
if (config.azureOpenAI.apiKey && config.azureOpenAI.apiKey !== 'YOUR_API_KEY_HERE') {
  azureOpenAI = new AzureOpenAI({
    apiKey: config.azureOpenAI.apiKey,
    endpoint: config.azureOpenAI.endpoint,
    apiVersion: config.azureOpenAI.apiVersion,
    deployment: config.azureOpenAI.deploymentName
  });
  console.log('✅ Azure OpenAI konfiguriert');
} else {
  console.log('⚠️  Azure OpenAI nicht konfiguriert. Bitte API-Key in config.json hinzufügen.');
}

// POST - Generate blog post with Azure OpenAI
app.post('/api/blog/generate', async (req, res) => {
  try {
    const { topic, keywords, category, tone = 'professional' } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        message: 'Thema ist erforderlich'
      });
    }
    
    if (!azureOpenAI) {
      return res.status(503).json({
        success: false,
        message: 'Azure OpenAI ist nicht konfiguriert. Bitte API-Key in config.json hinzufügen.'
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
    
    const completion = await azureOpenAI.chat.completions.create({
      model: config.azureOpenAI.deploymentName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    const generatedContent = JSON.parse(completion.choices[0].message.content);
    
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
    
    const blogPost = new BlogPost(postData);
    await blogPost.save();
    
    res.status(201).json({
      success: true,
      message: 'Blog-Beitrag erfolgreich erstellt',
      post: blogPost
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
    
    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    
    const sortOrder = order === 'asc' ? 1 : -1;
    const posts = await BlogPost.find(filter).sort({ [sortBy]: sortOrder });
    
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
    const posts = await BlogPost.find({ status: 'published' })
      .sort({ publishedAt: -1 })
      .select('-fullContent');
    
    res.json({
      success: true,
      posts: posts.map(post => ({
        id: post._id,
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
    const post = await BlogPost.findById(req.params.id);
    
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
    const post = await BlogPost.findOne({ 
      slug: req.params.slug,
      status: 'published'
    });
    
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
    console.error('Fehler:', error);
    res.status(500).json({
      success: false,
      message: 'Fehler beim Laden'
    });
  }
});

// PUT - Update blog post
app.put('/api/blog/posts/:id', async (req, res) => {
  try {
    const updateData = { ...req.body, updatedAt: Date.now() };
    
    if (updateData.status === 'published' && !updateData.publishedAt) {
      updateData.publishedAt = new Date();
    }
    
    const post = await BlogPost.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }
    
    res.json({
      success: true,
      message: 'Beitrag erfolgreich aktualisiert',
      post
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
    const post = await BlogPost.findByIdAndDelete(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Beitrag nicht gefunden'
      });
    }
    
    // Delete associated image if exists
    if (post.image && post.image.startsWith('/uploads/')) {
      const imagePath = path.join(__dirname, post.image);
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

// Start server only in development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`🚀 Server läuft auf Port ${PORT}`);
  });
}
