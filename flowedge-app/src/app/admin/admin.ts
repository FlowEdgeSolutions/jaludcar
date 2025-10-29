import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

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

interface BlogPost {
  _id?: string;
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  fullContent: string[];
  image: string;
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

@Component({
  selector: 'app-admin',
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin implements OnInit {
  private apiUrl = 'http://localhost:3000/api';
  
  // Tabs
  activeTab: 'leads' | 'blog' = 'leads';
  
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

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadLeads();
    this.loadStats();
    this.loadBlogPosts();
  }

  // ============================================
  // TAB SWITCHING
  // ============================================
  
  switchTab(tab: 'leads' | 'blog') {
    this.activeTab = tab;
    this.error = '';
    this.successMessage = '';
  }

  loadLeads() {
    this.loading = true;
    this.error = '';
    
    this.http.get<{ success: boolean; leads: Lead[] }>(`${this.apiUrl}/leads`)
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
    this.http.get<{ success: boolean; stats: Stats }>(`${this.apiUrl}/stats`)
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
      updateData
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
      `${this.apiUrl}/leads/${id}`
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
  // BLOG POST MANAGEMENT
  // ============================================

  loadBlogPosts() {
    this.loading = true;
    this.http.get<{ success: boolean; posts: BlogPost[] }>(`${this.apiUrl}/blog/posts`)
      .subscribe({
        next: (response) => {
          this.blogPosts = response.posts;
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
      fullContent: [],
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
    this.blogForm = { ...post };
    this.imagePreview = post.image ? `http://localhost:3000${post.image}` : '';
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

  saveBlogPost() {
    if (!this.blogForm.title || !this.blogForm.category || !this.blogForm.excerpt) {
      this.error = 'Bitte füllen Sie alle Pflichtfelder aus';
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
        formData
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

    this.http.request<{ success: boolean; message: string; post: BlogPost }>(
      method,
      url,
      { body: this.blogForm }
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
      `${this.apiUrl}/blog/posts/${id}`
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
      updateData
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
      }
    ).subscribe({
      next: (response) => {
        const content = response.content;
        this.blogForm.title = content.title;
        this.blogForm.excerpt = content.excerpt;
        this.blogForm.fullContent = content.paragraphs;
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
    this.blogForm.fullContent.push('');
  }

  removeParagraph(index: number) {
    this.blogForm.fullContent.splice(index, 1);
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
