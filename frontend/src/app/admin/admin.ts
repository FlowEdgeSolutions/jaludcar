import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { timeout } from 'rxjs';

interface Lead {
  _id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  package: string;
  message?: string;
  status: 'neu' | 'kontaktiert' | 'abgeschlossen' | 'abgelehnt';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Stats {
  total: number;
  neu: number;
  kontaktiert: number;
  abgeschlossen: number;
  packages: { _id: string; count: number }[];
}

interface BlogSection {
  id: string;
  html: string;
  image: string;
  imageUrl?: string;
  alt: string;
}

interface BlogPost {
  _id?: string;
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  fullContent: BlogSection[];
  image: string;
  imageUrl?: string;
  category: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  status: 'draft' | 'published' | 'archived';
  aiGenerated?: boolean;
  publishedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

interface AIGeneratedContent {
  title: string;
  excerpt: string;
  paragraphs: string[];
  metaTitle: string;
  metaDescription: string;
  suggestedKeywords: string[];
}

type AdminTab = 'websiteLeads' | 'googlePlaces' | 'hunter' | 'blog';
type ProspectSource = 'google_places' | 'hunter';
type ProspectStatus = 'neu' | 'geprueft' | 'kontaktiert' | 'angebot' | 'gewonnen' | 'abgelehnt';
type ProspectViewMode = 'kanban' | 'list';

interface ProspectEmail {
  value: string;
  type?: string;
  confidence?: number | null;
  firstName?: string;
  lastName?: string;
  position?: string;
  phoneNumber?: string;
  verificationStatus?: string;
}

interface ProspectLead {
  _id: string;
  source: ProspectSource;
  externalId?: string;
  companyName: string;
  category?: string;
  query?: string;
  city?: string;
  address?: string;
  phone?: string;
  website?: string;
  domain?: string;
  email?: string;
  emails?: ProspectEmail[];
  status: ProspectStatus;
  notes?: string;
  distanceMeters?: number | null;
  lat?: number | null;
  lng?: number | null;
  metadata?: Record<string, any>;
  rawData?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastImportedAt?: Date;
}

interface ProspectImportSummary {
  fetched: number;
  imported: number;
  created: number;
  updated: number;
  importable?: number;
  emailLookups?: number;
  emailsLoaded?: number;
  emailLookupFailed?: number;
  skippedOutsideRadius?: number;
  skippedWithoutLocation?: number;
  skippedWithoutDomain?: number;
  query?: string;
}

interface HunterPreviewCompany {
  id: string;
  companyName: string;
  organization?: string;
  name?: string;
  domain: string;
  website: string;
  emailsCount?: number | null;
  emails_count?: number | null;
  industry: string;
  city: string;
  countryCode: string;
  query: string;
  importable: boolean;
  selected: boolean;
}

interface HunterPreviewSummary {
  query: string;
  fetched: number;
  importable: number;
  skippedWithoutDomain: number;
}

@Component({
  selector: 'app-admin',
  imports: [CommonModule, FormsModule, HttpClientModule, DragDropModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin implements OnInit, OnDestroy {
  private apiUrl = environment.apiUrl;
  private apiOrigin = this.apiUrl.replace(/\/api\/?$/, '');
  private readonly authRequestTimeoutMs = 15000;
  private readonly sessionVerifyTimeoutMs = 4000;
  authEmail = '';
  authPassword = '';
  isAuthenticated = false;
  authLoading = false;
  authReady = true;
  authRestoring = false;
  authError = '';
  
  // Tabs
  activeTab: AdminTab = 'websiteLeads';
  
  // Leads
  leads: Lead[] = [];
  filteredLeads: Lead[] = [];
  stats: Stats = {
    total: 0,
    neu: 0,
    kontaktiert: 0,
    abgeschlossen: 0,
    packages: []
  };
  selectedLead: Lead | null = null;
  filterStatus: string = 'all';
  searchTerm: string = '';

  // Prospect Lead Generation
  readonly prospectStatuses: { id: ProspectStatus; label: string }[] = [
    { id: 'neu', label: 'Neu' },
    { id: 'kontaktiert', label: 'Kontaktiert' },
    { id: 'angebot', label: 'Angebot' },
    { id: 'gewonnen', label: 'Gewonnen' },
    { id: 'abgelehnt', label: 'Abgelehnt' }
  ];
  private readonly validProspectStatuses: ProspectStatus[] = ['neu', 'geprueft', 'kontaktiert', 'angebot', 'gewonnen', 'abgelehnt'];
  googleCategories: string[] = [];
  selectedGoogleCategory = '';
  googleRadiusMeters = 15000;
  googleCenterAddress = 'Auf dem Haidchen 45, 45527 Hattingen';
  prospectViewMode: ProspectViewMode = 'kanban';
  googleLeads: ProspectLead[] = [];
  filteredGoogleLeads: ProspectLead[] = [];
  googleSearchTerm = '';
  googleLoading = false;
  googleImporting = false;
  googleImportSummary: ProspectImportSummary | null = null;
  hunterLeads: ProspectLead[] = [];
  filteredHunterLeads: ProspectLead[] = [];
  readonly customHunterIndustryOption = '__custom__';
  hunterIndustry = '';
  hunterCustomIndustry = '';
  hunterCity = 'Hattingen';
  hunterCountryCode = 'DE';
  hunterSearchTerm = '';
  hunterSearching = false;
  hunterLoading = false;
  hunterImporting = false;
  hunterImportSummary: ProspectImportSummary | null = null;
  hunterPreviewSummary: HunterPreviewSummary | null = null;
  hunterPreviewCompanies: HunterPreviewCompany[] = [];
  hunterSearchElapsedSeconds = 0;
  selectedProspectLead: ProspectLead | null = null;
  private hunterSearchTimer: ReturnType<typeof setInterval> | null = null;
  
  // Blog
  blogPosts: BlogPost[] = [];
  filteredPosts: BlogPost[] = [];
  selectedPost: BlogPost | null = null;
  showBlogEditor = false;
  blogFilterStatus: string = 'all';
  blogSearchTerm: string = '';
  
  // Blog Editor Form
  blogForm: BlogPost = {
    title: '',
    excerpt: '',
    content: '',
    fullContent: [],
    image: '',
    category: '',
    metaTitle: '',
    metaDescription: '',
    keywords: [],
    status: 'draft'
  };
  selectedImage: File | null = null;
  imagePreview: string = '';
  
  // AI Generation
  showAIGenerator = false;
  aiTopic: string = '';
  aiKeywords: string = '';
  aiCategory: string = '';
  aiTone: 'professional' | 'casual' = 'professional';
  generatingAI = false;
  
  // Global
  loading = false;
  error = '';
  successMessage = '';

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      this.authReady = true;
      return;
    }

    this.initAuth();
  }

  ngOnDestroy() {
    this.stopHunterSearchTimer();
  }

  private toPublicUrl(value: string): string {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;

    // Uploaded images are served by the backend under `/uploads/...`.
    if (value.startsWith('/uploads/')) {
      return `${this.apiOrigin}${value}`;
    }

    return value;
  }

  private createBlogSection(html = '', image = '', alt = ''): BlogSection {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `section-${Date.now()}-${Math.round(Math.random() * 100000)}`;

    return {
      id,
      html,
      image,
      imageUrl: image ? this.toPublicUrl(image) : '',
      alt
    };
  }

  private escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private textToSectionHtml(value = '') {
    return this.escapeHtml(value).replace(/\n/g, '<br>');
  }

  private stripHtml(value = '') {
    return String(value)
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private normalizeBlogSections(value: unknown, fallbackContent = ''): BlogSection[] {
    const rawSections = Array.isArray(value) && value.length > 0
      ? value
      : (fallbackContent ? String(fallbackContent).split(/\n\s*\n/).filter(item => item.trim()) : []);

    const sections = rawSections.map(section => {
      if (typeof section === 'string') {
        return this.createBlogSection(this.textToSectionHtml(section));
      }

      const item = section as Partial<BlogSection> & { text?: string; content?: string };
      const html = item.html || item.text || item.content || '';
      const image = item.image || '';
      return {
        id: item.id || this.createBlogSection().id,
        html,
        image,
        imageUrl: image ? this.toPublicUrl(image) : (item.imageUrl || ''),
        alt: item.alt || ''
      };
    });

    return sections.length > 0 ? sections : [this.createBlogSection()];
  }

  private syncBlogContentFromParagraphs() {
    const sections = this.normalizeBlogSections(this.blogForm.fullContent);
    const normalized = sections
      .map(section => ({
        ...section,
        html: (section.html || '').trim(),
        alt: (section.alt || '').trim()
      }))
      .filter(section => this.stripHtml(section.html).length > 0 || Boolean(section.image));

    this.blogForm.fullContent = normalized.length > 0 ? normalized : [this.createBlogSection()];
    this.blogForm.content = this.blogForm.fullContent
      .map(section => this.stripHtml(section.html))
      .filter(Boolean)
      .join('\n\n');
  }

  private initAuth() {
    const saved = this.getStoredToken();
    if (!saved) {
      this.authReady = true;
      return;
    }

    if (this.isTokenExpired(saved)) {
      this.clearStoredToken();
      this.authReady = true;
      this.authError = 'Bitte einloggen';
      return;
    }

    this.isAuthenticated = true;
    this.authReady = true;
    this.authRestoring = true;
    this.loadAdminData();
    this.verifyToken(false);
  }

  private loadAdminData() {
    this.loadLeads();
    this.loadStats();
    this.loadGoogleCategories();
    this.loadProspectLeads('google_places');
    this.loadProspectLeads('hunter');
    this.loadBlogPosts();
  }

  private getStoredToken() {
    if (!isPlatformBrowser(this.platformId)) {
      return '';
    }

    return localStorage.getItem('jalud_admin_token') || '';
  }

  private clearStoredToken() {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('jalud_admin_token');
    }
  }

  private isTokenExpired(token: string) {
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) {
        return true;
      }

      const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
      const payload = JSON.parse(atob(padded));
      const expiresAtMs = Number(payload?.exp || 0) * 1000;
      return !expiresAtMs || expiresAtMs <= Date.now();
    } catch {
      return true;
    }
  }

  private getAuthOptions() {
    const token = this.getStoredToken();
    return token ? { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) } : {};
  }

  login() {
    if (this.authLoading) {
      return;
    }

    const email = this.authEmail.trim().toLowerCase();
    const password = this.authPassword;

    if (!email || !password) {
      this.authError = 'Bitte Email und Passwort eingeben';
      return;
    }
    this.authError = '';
    this.authLoading = true;
    this.http.post<{ success: boolean; token: string }>(
      `${this.apiUrl}/admin/login`,
      { email, password }
    ).pipe(
      timeout(this.authRequestTimeoutMs)
    ).subscribe({
      next: (response) => {
        if (isPlatformBrowser(this.platformId)) {
          localStorage.setItem('jalud_admin_token', response.token);
        }
        this.isAuthenticated = true;
        this.authReady = true;
        this.authLoading = false;
        this.authEmail = email;
        this.authPassword = '';
        this.loadAdminData();
      },
      error: (err) => {
        this.authLoading = false;
        this.authReady = true;
        this.authError = this.getAuthErrorMessage(err);
      }
    });
  }

  logout() {
    this.clearStoredToken();
    this.isAuthenticated = false;
    this.authReady = true;
    this.authRestoring = false;
    this.authEmail = '';
    this.authPassword = '';
    this.leads = [];
    this.filteredLeads = [];
    this.googleLeads = [];
    this.filteredGoogleLeads = [];
    this.hunterLeads = [];
    this.filteredHunterLeads = [];
    this.selectedProspectLead = null;
    this.blogPosts = [];
    this.filteredPosts = [];
    this.stats = { total: 0, neu: 0, kontaktiert: 0, abgeschlossen: 0, packages: [] };
  }

  private verifyToken(blocking = true) {
    this.authLoading = blocking;
    this.authRestoring = true;
    this.authReady = true;
    this.http.get<{ success: boolean }>(`${this.apiUrl}/admin/me`, this.getAuthOptions())
      .pipe(timeout(blocking ? this.authRequestTimeoutMs : this.sessionVerifyTimeoutMs))
      .subscribe({
      next: () => {
        this.isAuthenticated = true;
        this.authLoading = false;
        this.authRestoring = false;
        this.authReady = true;
        if (blocking) {
          this.loadAdminData();
        }
      },
      error: (err) => {
        this.authLoading = false;
        this.authRestoring = false;
        this.authReady = true;
        if (err?.status === 401 || err?.status === 403) {
          this.clearStoredToken();
          this.isAuthenticated = false;
          this.authError = 'Bitte einloggen';
          return;
        }

        if (blocking) {
          this.isAuthenticated = false;
          this.authError = this.getSessionRestoreErrorMessage(err);
        }
      }
    });
  }

  private getSessionRestoreErrorMessage(err: any) {
    if (err?.name === 'TimeoutError' || err?.status === 0) {
      return 'Session konnte nicht geprüft werden. Bitte erneut versuchen.';
    }

    return 'Bitte einloggen';
  }

  private getAuthErrorMessage(err: any) {
    if (err?.name === 'TimeoutError') {
      return 'Server antwortet nicht. Bitte Backend und Datenbank prüfen.';
    }

    if (err?.status === 0) {
      return 'Backend ist nicht erreichbar.';
    }

    return err?.error?.message || 'Ungültige Zugangsdaten';
  }

  // ============================================
  // TAB SWITCHING
  // ============================================
  
  switchTab(tab: AdminTab) {
    this.activeTab = tab;
    this.error = '';
    this.successMessage = '';
  }

  loadLeads() {
    if (!this.isAuthenticated) return;
    this.loading = true;
    this.error = '';
    
    this.http.get<{ success: boolean; leads: Lead[] }>(`${this.apiUrl}/leads`, this.getAuthOptions())
      .subscribe({
        next: (response) => {
          this.leads = response.leads;
          this.applyFilters();
          this.loading = false;
        },
        error: (err) => {
          this.error = 'Fehler beim Laden der Leads';
          this.loading = false;
          console.error(err);
        }
      });
  }

  loadStats() {
    if (!this.isAuthenticated) return;
    this.http.get<{ success: boolean; stats: Stats }>(`${this.apiUrl}/stats`, this.getAuthOptions())
      .subscribe({
        next: (response) => {
          this.stats = response.stats;
        },
        error: (err) => {
          console.error('Fehler beim Laden der Statistiken:', err);
        }
      });
  }

  applyFilters() {
    let filtered = [...this.leads];
    
    // Status Filter
    if (this.filterStatus !== 'all') {
      filtered = filtered.filter(lead => lead.status === this.filterStatus);
    }
    
    // Search Filter
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(lead => 
        lead.firstName.toLowerCase().includes(term) ||
        lead.lastName.toLowerCase().includes(term) ||
        lead.email.toLowerCase().includes(term) ||
        lead.phone.includes(term)
      );
    }
    
    this.filteredLeads = filtered;
  }

  onFilterChange() {
    this.applyFilters();
  }

  selectLead(lead: Lead) {
    this.selectedLead = { ...lead };
  }

  closeModal() {
    this.selectedLead = null;
  }

  updateLead() {
    if (!this.selectedLead) return;
    
    this.loading = true;
    this.error = '';
    this.successMessage = '';
    
    const updateData = {
      status: this.selectedLead.status,
      notes: this.selectedLead.notes
    };
    
    this.http.put<{ success: boolean; message: string; lead: Lead }>(
      `${this.apiUrl}/leads/${this.selectedLead._id}`,
      updateData,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.successMessage = response.message;
        this.loadLeads();
        this.loadStats();
        this.loading = false;
        setTimeout(() => {
          this.closeModal();
          this.successMessage = '';
        }, 1500);
      },
      error: (err) => {
        this.error = 'Fehler beim Aktualisieren';
        this.loading = false;
        console.error(err);
      }
    });
  }

  deleteLead(id: string) {
    if (!confirm('Lead wirklich löschen?')) return;
    
    this.loading = true;
    this.error = '';
    
    this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/leads/${id}`,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.successMessage = response.message;
        this.loadLeads();
        this.loadStats();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err) => {
        this.error = 'Fehler beim Löschen';
        this.loading = false;
        console.error(err);
      }
    });
  }

  getPackageName(pkg: string): string {
    const packages: { [key: string]: string } = {
      'basic': 'Basic (€149)',
      'premium': 'Premium (€349)',
      'luxus': 'Luxus (€499)',
      'beratung': 'Individuelle Beratung'
    };
    return packages[pkg] || pkg;
  }

  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'neu': '#fbbf24',
      'kontaktiert': '#3b82f6',
      'abgeschlossen': '#10b981',
      'abgelehnt': '#ef4444'
    };
    return colors[status] || '#6b7280';
  }

  formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // ============================================
  // PROSPECT LEAD GENERATION
  // ============================================

  loadGoogleCategories() {
    if (!this.isAuthenticated) return;

    this.http.get<{
      success: boolean;
      categories: string[];
      radiusMeters?: number;
      center?: { address?: string };
    }>(
      `${this.apiUrl}/google-places/categories`,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.googleCategories = response.categories || [];
        this.googleRadiusMeters = response.radiusMeters || this.googleRadiusMeters;
        this.googleCenterAddress = response.center?.address || this.googleCenterAddress;
        if (!this.selectedGoogleCategory && this.googleCategories.length > 0) {
          this.selectedGoogleCategory = this.googleCategories[0];
        }
      },
      error: (err) => {
        console.error('Fehler beim Laden der Google-Places-Kategorien:', err);
      }
    });
  }

  loadProspectLeads(source: ProspectSource) {
    if (!this.isAuthenticated) return;
    this.setProspectLoading(source, true);

    this.http.get<{ success: boolean; leads: ProspectLead[] }>(
      `${this.apiUrl}/prospect-leads?source=${source}`,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        if (source === 'google_places') {
          this.googleLeads = response.leads || [];
          this.applyGoogleFilters();
        } else {
          this.hunterLeads = response.leads || [];
          this.applyHunterFilters();
        }
        this.setProspectLoading(source, false);
      },
      error: (err) => {
        this.error = 'Fehler beim Laden der Akquise-Leads';
        this.setProspectLoading(source, false);
        console.error(err);
      }
    });
  }

  private setProspectLoading(source: ProspectSource, value: boolean) {
    if (source === 'google_places') {
      this.googleLoading = value;
    } else {
      this.hunterLoading = value;
    }
  }

  get isCustomHunterIndustry() {
    return this.hunterIndustry === this.customHunterIndustryOption;
  }

  get effectiveHunterIndustry() {
    return this.isCustomHunterIndustry
      ? this.hunterCustomIndustry.trim()
      : this.hunterIndustry.trim();
  }

  get hunterSearchEtaLabel() {
    if (this.hunterSearchElapsedSeconds < 20) {
      return 'ca. 20-45 Sekunden';
    }
    if (this.hunterSearchElapsedSeconds < 45) {
      return 'noch einen Moment';
    }
    return 'die Suche braucht gerade länger als üblich';
  }

  get selectedHunterPreviewCount() {
    return this.hunterPreviewCompanies.filter(company => company.importable && company.selected).length;
  }

  get importableHunterPreviewCount() {
    return this.hunterPreviewCompanies.filter(company => company.importable).length;
  }

  get areAllHunterPreviewCompaniesSelected() {
    const importable = this.hunterPreviewCompanies.filter(company => company.importable);
    return importable.length > 0 && importable.every(company => company.selected);
  }

  private startHunterSearchTimer() {
    this.stopHunterSearchTimer();
    this.hunterSearchElapsedSeconds = 0;
    this.hunterSearchTimer = setInterval(() => {
      this.hunterSearchElapsedSeconds += 1;
    }, 1000);
  }

  private stopHunterSearchTimer() {
    if (this.hunterSearchTimer) {
      clearInterval(this.hunterSearchTimer);
      this.hunterSearchTimer = null;
    }
  }

  importGooglePlaces() {
    if (!this.selectedGoogleCategory) {
      this.error = 'Bitte eine Kategorie wählen';
      return;
    }

    this.googleImporting = true;
    this.error = '';
    this.successMessage = '';
    this.googleImportSummary = null;

    this.http.post<{ success: boolean; message: string; summary: ProspectImportSummary }>(
      `${this.apiUrl}/google-places/import`,
      { category: this.selectedGoogleCategory },
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.googleImportSummary = response.summary;
        this.successMessage = response.message;
        this.googleImporting = false;
        this.loadProspectLeads('google_places');
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Fehler beim Google-Places-Import';
        this.googleImporting = false;
        console.error(err);
      }
    });
  }

  searchHunterCompanies() {
    const industry = this.effectiveHunterIndustry;

    if (!industry || !this.hunterCity.trim()) {
      this.error = 'Bitte Branche und Stadt eingeben';
      return;
    }

    this.hunterSearching = true;
    this.error = '';
    this.successMessage = '';
    this.hunterImportSummary = null;
    this.hunterPreviewSummary = null;
    this.hunterPreviewCompanies = [];
    this.startHunterSearchTimer();

    this.http.post<{
      success: boolean;
      message: string;
      summary: HunterPreviewSummary;
      companies: HunterPreviewCompany[];
    }>(
      `${this.apiUrl}/hunter/preview`,
      {
        industry,
        city: this.hunterCity.trim(),
        countryCode: this.hunterCountryCode.trim() || 'DE'
      },
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.hunterPreviewSummary = response.summary;
        this.hunterPreviewCompanies = (response.companies || []).map(company => ({
          ...company,
          selected: company.importable
        }));
        this.successMessage = response.message;
        this.hunterSearching = false;
        this.stopHunterSearchTimer();
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Fehler bei der Firmensuche';
        this.hunterSearching = false;
        this.stopHunterSearchTimer();
        console.error(err);
      }
    });
  }

  toggleAllHunterPreviewCompanies(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.hunterPreviewCompanies = this.hunterPreviewCompanies.map(company => ({
      ...company,
      selected: company.importable ? checked : false
    }));
  }

  selectAllHunterPreviewCompanies() {
    this.hunterPreviewCompanies = this.hunterPreviewCompanies.map(company => ({
      ...company,
      selected: company.importable
    }));
  }

  clearHunterPreviewSelection() {
    this.hunterPreviewCompanies = this.hunterPreviewCompanies.map(company => ({
      ...company,
      selected: false
    }));
  }

  importSingleHunterCompany(company: HunterPreviewCompany) {
    this.importHunterCompanies([company]);
  }

  importSelectedHunterCompanies(mode: 'selected' | 'all' = 'selected') {
    const companies = mode === 'all'
      ? this.hunterPreviewCompanies.filter(company => company.importable)
      : this.hunterPreviewCompanies.filter(company => company.importable && company.selected);

    this.importHunterCompanies(companies);
  }

  private importHunterCompanies(companies: HunterPreviewCompany[]) {
    const industry = this.effectiveHunterIndustry;

    if (!industry || !this.hunterCity.trim()) {
      this.error = 'Bitte Branche und Stadt eingeben';
      return;
    }

    if (companies.length === 0) {
      this.error = 'Bitte mindestens eine Firma auswählen';
      return;
    }

    this.hunterImporting = true;
    this.error = '';
    this.successMessage = '';
    this.hunterImportSummary = null;

    const selectedIds = new Set(companies.map(company => company.id));
    const payloadCompanies = companies.map(({ selected, ...company }) => company);

    this.http.post<{ success: boolean; message: string; summary: ProspectImportSummary }>(
      `${this.apiUrl}/hunter/import`,
      {
        industry,
        city: this.hunterCity.trim(),
        countryCode: this.hunterCountryCode.trim() || 'DE',
        companies: payloadCompanies
      },
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.hunterImportSummary = response.summary;
        this.successMessage = response.message;
        this.hunterImporting = false;
        this.hunterPreviewCompanies = this.hunterPreviewCompanies.filter(company => !selectedIds.has(company.id));
        if (this.hunterPreviewCompanies.length === 0) {
          this.hunterPreviewSummary = null;
        }
        this.loadProspectLeads('hunter');
        setTimeout(() => this.successMessage = '', 4000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Fehler beim Übernehmen der Firmen';
        this.hunterImporting = false;
        console.error(err);
      }
    });
  }

  applyGoogleFilters() {
    this.filteredGoogleLeads = this.filterProspectLeads(this.googleLeads, this.googleSearchTerm);
  }

  applyHunterFilters() {
    this.filteredHunterLeads = this.filterProspectLeads(this.hunterLeads, this.hunterSearchTerm);
  }

  openProspectDetails(lead: ProspectLead) {
    this.selectedProspectLead = lead;
  }

  closeProspectDetails() {
    this.selectedProspectLead = null;
  }

  private filterProspectLeads(leads: ProspectLead[], term: string) {
    const normalized = term.trim().toLowerCase();
    if (!normalized) {
      return [...leads];
    }

    return leads.filter(lead => [
      lead.companyName,
      lead.category,
      lead.city,
      lead.address,
      lead.phone,
      lead.website,
      lead.domain,
      lead.email
    ].some(value => (value || '').toLowerCase().includes(normalized)));
  }

  getProspectLeadsByStatus(source: ProspectSource, status: ProspectStatus) {
    const leads = source === 'google_places' ? this.filteredGoogleLeads : this.filteredHunterLeads;
    if (status === 'neu') {
      return leads.filter(lead => lead.status === 'neu' || lead.status === 'geprueft');
    }
    return leads.filter(lead => lead.status === status);
  }

  getProspectListLeads(source: ProspectSource) {
    return source === 'google_places' ? this.filteredGoogleLeads : this.filteredHunterLeads;
  }

  setProspectViewMode(mode: ProspectViewMode) {
    this.prospectViewMode = mode;
  }

  getProspectDropListId(source: ProspectSource, status: ProspectStatus) {
    return `${source}-${status}`;
  }

  getProspectDropListIds(source: ProspectSource) {
    return this.prospectStatuses.map(status => this.getProspectDropListId(source, status.id));
  }

  onProspectDrop(event: CdkDragDrop<ProspectLead[]>, source: ProspectSource, status: ProspectStatus) {
    const lead = event.item.data as ProspectLead;
    if (!lead || lead.status === status) {
      return;
    }

    const previousStatus = lead.status;
    lead.status = status;
    this.applyProspectFiltersForSource(source);
    this.updateProspectLead(lead, { status }, () => {
      lead.status = previousStatus;
      this.applyProspectFiltersForSource(source);
    });
  }

  changeProspectStatus(lead: ProspectLead, status: string) {
    if (!this.validProspectStatuses.includes(status as ProspectStatus)) {
      return;
    }

    const nextStatus = status as ProspectStatus;
    if (lead.status === nextStatus) {
      return;
    }

    const previousStatus = lead.status;
    lead.status = nextStatus;
    this.applyProspectFiltersForSource(lead.source);
    this.updateProspectLead(lead, { status: nextStatus }, () => {
      lead.status = previousStatus;
      this.applyProspectFiltersForSource(lead.source);
    });
  }

  saveProspectNotes(lead: ProspectLead) {
    this.updateProspectLead(lead, { notes: lead.notes || '' });
  }

  private updateProspectLead(
    lead: ProspectLead,
    update: Partial<Pick<ProspectLead, 'status' | 'notes'>>,
    onError?: () => void
  ) {
    this.http.patch<{ success: boolean; lead: ProspectLead }>(
      `${this.apiUrl}/prospect-leads/${lead._id}`,
      update,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.replaceProspectLead(response.lead);
      },
      error: (err) => {
        this.error = err.error?.message || 'Fehler beim Aktualisieren des Akquise-Leads';
        onError?.();
        console.error(err);
      }
    });
  }

  deleteProspectLead(lead: ProspectLead) {
    if (!confirm('Akquise-Lead wirklich löschen?')) return;

    this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/prospect-leads/${lead._id}`,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.successMessage = response.message;
        if (lead.source === 'google_places') {
          this.googleLeads = this.googleLeads.filter(item => item._id !== lead._id);
          this.applyGoogleFilters();
        } else {
          this.hunterLeads = this.hunterLeads.filter(item => item._id !== lead._id);
          this.applyHunterFilters();
        }
        if (this.selectedProspectLead?._id === lead._id) {
          this.selectedProspectLead = null;
        }
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Fehler beim Löschen';
        console.error(err);
      }
    });
  }

  private replaceProspectLead(updated: ProspectLead) {
    const target = updated.source === 'google_places' ? this.googleLeads : this.hunterLeads;
    const index = target.findIndex(lead => lead._id === updated._id);
    if (index >= 0) {
      target[index] = updated;
    } else {
      target.unshift(updated);
    }
    if (this.selectedProspectLead?._id === updated._id) {
      this.selectedProspectLead = updated;
    }
    this.applyProspectFiltersForSource(updated.source);
  }

  private applyProspectFiltersForSource(source: ProspectSource) {
    if (source === 'google_places') {
      this.applyGoogleFilters();
    } else {
      this.applyHunterFilters();
    }
  }

  getProspectStatusLabel(status: string) {
    if (status === 'geprueft') {
      return 'Neu';
    }
    return this.prospectStatuses.find(item => item.id === status)?.label || status;
  }

  getProspectStatusColor(status: string) {
    const colors: { [key: string]: string } = {
      neu: '#f59e0b',
      geprueft: '#6366f1',
      kontaktiert: '#2563eb',
      angebot: '#7c3aed',
      gewonnen: '#059669',
      abgelehnt: '#dc2626'
    };
    return colors[status] || '#6b7280';
  }

  formatDistance(meters?: number | null) {
    if (meters === null || meters === undefined) {
      return '-';
    }
    if (meters < 1000) {
      return `${meters} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  getPrimaryProspectEmail(lead: ProspectLead) {
    return lead.email || lead.emails?.find(email => email.value)?.value || '';
  }

  getHunterEmailCount(lead: ProspectLead) {
    return lead.emails?.length || lead.metadata?.['emailsCount']?.total || 0;
  }

  getProspectEmails(lead: ProspectLead | null) {
    if (!lead) {
      return [];
    }
    const emails = [...(lead.emails || [])];
    if (lead.email && !emails.some(email => email.value === lead.email)) {
      emails.unshift({ value: lead.email });
    }
    return emails.filter(email => email.value);
  }

  getProspectDetailRows(lead: ProspectLead | null) {
    if (!lead) {
      return [];
    }

    const rows = [
      { label: 'Branche', value: lead.category || '' },
      { label: 'Stadt', value: lead.city || '' },
      { label: 'Adresse', value: lead.address || '' },
      { label: 'Telefon', value: lead.phone || '' },
      { label: 'Domain', value: lead.domain || '' },
      { label: 'Status', value: this.getProspectStatusLabel(lead.status) },
      { label: 'Distanz', value: lead.distanceMeters !== null && lead.distanceMeters !== undefined ? this.formatDistance(lead.distanceMeters) : '' },
      { label: 'Radius', value: lead.source === 'google_places' ? this.formatDistance(this.googleRadiusMeters) : '' },
      { label: 'Suchabfrage', value: lead.query || '' }
    ];

    return rows.filter(row => row.value);
  }

  // ============================================
  // BLOG POST MANAGEMENT
  // ============================================

  loadBlogPosts() {
    if (!this.isAuthenticated) return;
    this.loading = true;
    this.http.get<{ success: boolean; posts: BlogPost[] }>(`${this.apiUrl}/blog/posts`, this.getAuthOptions())
      .subscribe({
        next: (response) => {
          this.blogPosts = (response.posts || []).map(post => ({
            ...post,
            fullContent: this.normalizeBlogSections(post.fullContent, post.content),
            imageUrl: this.toPublicUrl(post.image)
          }));
          this.applyBlogFilters();
          this.loading = false;
        },
        error: (err) => {
          this.error = 'Fehler beim Laden der Blog-Beiträge';
          this.loading = false;
          console.error(err);
        }
      });
  }

  applyBlogFilters() {
    let filtered = [...this.blogPosts];
    
    if (this.blogFilterStatus !== 'all') {
      filtered = filtered.filter(post => post.status === this.blogFilterStatus);
    }
    
    if (this.blogSearchTerm) {
      const term = this.blogSearchTerm.toLowerCase();
      filtered = filtered.filter(post =>
        post.title.toLowerCase().includes(term) ||
        post.category.toLowerCase().includes(term) ||
        post.excerpt.toLowerCase().includes(term)
      );
    }
    
    this.filteredPosts = filtered;
  }

  onBlogFilterChange() {
    this.applyBlogFilters();
  }

  newBlogPost() {
    this.blogForm = {
      title: '',
      excerpt: '',
      content: '',
      fullContent: [this.createBlogSection()],
      image: '',
      category: '',
      metaTitle: '',
      metaDescription: '',
      keywords: [],
      status: 'draft'
    };
    this.selectedImage = null;
    this.imagePreview = '';
    this.showBlogEditor = true;
  }

  editBlogPost(post: BlogPost) {
    const fullContent = this.normalizeBlogSections(post.fullContent, post.content);

    this.blogForm = { ...post, fullContent };
    this.blogForm.content = (this.blogForm.content || fullContent.map(section => this.stripHtml(section.html)).join('\n\n')).trim();
    this.imagePreview = post.image ? this.toPublicUrl(post.image) : '';
    this.showBlogEditor = true;
  }

  closeBlogEditor() {
    this.showBlogEditor = false;
    this.showAIGenerator = false;
  }

  onImageSelect(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedImage = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  onBlogSectionInput(index: number, event: Event) {
    const target = event.target as HTMLElement;
    if (!this.blogForm.fullContent[index]) {
      return;
    }
    this.blogForm.fullContent[index].html = target.innerHTML;
  }

  formatBlogSection(command: string, value?: string) {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    document.execCommand(command, false, value);
  }

  onBlogSectionImageSelect(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.blogForm.fullContent[index]) {
      return;
    }

    const formData = new FormData();
    formData.append('image', file);
    this.loading = true;
    this.error = '';

    this.http.post<{ success: boolean; imageUrl: string }>(
      `${this.apiUrl}/blog/upload-image`,
      formData,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        const section = this.blogForm.fullContent[index];
        section.image = response.imageUrl;
        section.imageUrl = this.toPublicUrl(response.imageUrl);
        if (!section.alt) {
          section.alt = this.blogForm.title || 'Blog Bild';
        }
        this.loading = false;
        input.value = '';
      },
      error: (err) => {
        this.error = 'Fehler beim Abschnittsbild-Upload';
        this.loading = false;
        input.value = '';
        console.error(err);
      }
    });
  }

  removeBlogSectionImage(index: number) {
    const section = this.blogForm.fullContent[index];
    if (!section) {
      return;
    }
    section.image = '';
    section.imageUrl = '';
    section.alt = '';
  }

  saveBlogPost() {
    this.syncBlogContentFromParagraphs();
    if (!this.blogForm.title || !this.blogForm.category || !this.blogForm.excerpt) {
      this.error = 'Bitte füllen Sie alle Pflichtfelder aus';
      return;
    }
    if (!this.blogForm.content) {
      this.error = 'Bitte fügen Sie mindestens einen Absatz Inhalt hinzu';
      return;
    }

    this.loading = true;
    this.error = '';

    // Upload image first if selected
    if (this.selectedImage) {
      const formData = new FormData();
      formData.append('image', this.selectedImage);

      this.http.post<{ success: boolean; imageUrl: string }>(
        `${this.apiUrl}/blog/upload-image`,
        formData,
        this.getAuthOptions()
      ).subscribe({
        next: (response) => {
          this.blogForm.image = response.imageUrl;
          this.saveBlogPostData();
        },
        error: (err) => {
          this.error = 'Fehler beim Bild-Upload';
          this.loading = false;
          console.error(err);
        }
      });
    } else {
      this.saveBlogPostData();
    }
  }

  private saveBlogPostData() {
    const method = this.blogForm._id ? 'put' : 'post';
    const url = this.blogForm._id 
      ? `${this.apiUrl}/blog/posts/${this.blogForm._id}`
      : `${this.apiUrl}/blog/posts`;

    const requestOptions = { body: this.blogForm, ...this.getAuthOptions() };
    this.http.request<{ success: boolean; message: string; post: BlogPost }>(
      method,
      url,
      requestOptions
    ).subscribe({
      next: (response) => {
        this.successMessage = response.message;
        this.loadBlogPosts();
        this.loading = false;
        setTimeout(() => {
          this.closeBlogEditor();
          this.successMessage = '';
        }, 1500);
      },
      error: (err) => {
        this.error = 'Fehler beim Speichern';
        this.loading = false;
        console.error(err);
      }
    });
  }

  deleteBlogPost(id: string) {
    if (!confirm('Beitrag wirklich löschen?')) return;

    this.loading = true;
    this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/blog/posts/${id}`,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.successMessage = response.message;
        this.loadBlogPosts();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err) => {
        this.error = 'Fehler beim Löschen';
        this.loading = false;
        console.error(err);
      }
    });
  }

  publishBlogPost(post: BlogPost) {
    if (!post._id) return;

    this.loading = true;
    const updateData = { ...post, status: 'published', publishedAt: new Date() };

    this.http.put<{ success: boolean; message: string }>(
      `${this.apiUrl}/blog/posts/${post._id}`,
      updateData,
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        this.successMessage = 'Beitrag veröffentlicht!';
        this.loadBlogPosts();
        this.loading = false;
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err) => {
        this.error = 'Fehler beim Veröffentlichen';
        this.loading = false;
        console.error(err);
      }
    });
  }

  // ============================================
  // AI GENERATION
  // ============================================

  openAIGenerator() {
    this.showAIGenerator = true;
    this.aiTopic = '';
    this.aiKeywords = '';
    this.aiCategory = this.blogForm.category || '';
  }

  generateWithAI() {
    if (!this.aiTopic) {
      this.error = 'Bitte geben Sie ein Thema ein';
      return;
    }

    this.generatingAI = true;
    this.error = '';

    const keywords = this.aiKeywords.split(',').map(k => k.trim()).filter(k => k);

    this.http.post<{ success: boolean; content: AIGeneratedContent }>(
      `${this.apiUrl}/blog/generate`,
      {
        topic: this.aiTopic,
        keywords: keywords,
        category: this.aiCategory,
        tone: this.aiTone
      },
      this.getAuthOptions()
    ).subscribe({
      next: (response) => {
        const content = response.content;
        this.blogForm.title = content.title;
        this.blogForm.excerpt = content.excerpt;
        this.blogForm.fullContent = content.paragraphs.map(paragraph => this.createBlogSection(this.textToSectionHtml(paragraph)));
        this.blogForm.content = content.paragraphs.join('\n\n');
        this.blogForm.metaTitle = content.metaTitle;
        this.blogForm.metaDescription = content.metaDescription;
        this.blogForm.keywords = content.suggestedKeywords;
        this.blogForm.category = this.aiCategory;
        this.blogForm.aiGenerated = true;

        this.generatingAI = false;
        this.showAIGenerator = false;
        this.successMessage = 'Inhalt erfolgreich generiert! Überprüfen und anpassen Sie den Text.';
        setTimeout(() => this.successMessage = '', 5000);
      },
      error: (err) => {
        this.error = err.error?.message || 'Fehler bei der AI-Generierung';
        this.generatingAI = false;
        console.error(err);
      }
    });
  }

  addParagraph() {
    if (!this.blogForm.fullContent) {
      this.blogForm.fullContent = [];
    }
    this.blogForm.fullContent.push(this.createBlogSection());
  }

  removeParagraph(index: number) {
    this.blogForm.fullContent.splice(index, 1);
    if (this.blogForm.fullContent.length === 0) {
      this.blogForm.fullContent.push(this.createBlogSection());
    }
  }

  getPostStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'draft': '#9ca3af',
      'published': '#10b981',
      'archived': '#ef4444'
    };
    return colors[status] || '#6b7280';
  }

  onKeywordsChange(value: string) {
    this.blogForm.keywords = value.split(',').map(k => k.trim()).filter(k => k);
  }
}
