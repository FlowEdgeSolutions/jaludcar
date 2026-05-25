import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';

interface BlogSection {
  html: string;
  image: string;
  imageUrl?: string;
  alt: string;
}

interface BlogPostData {
  id: string;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
  fullContent: BlogSection[];
  image: string;
  category: string;
}

@Component({
  selector: 'app-blog-post',
  imports: [CommonModule, HttpClientModule, RouterModule],
  templateUrl: './blog-post.html',
  styleUrl: './blog-post.scss',
})
export class BlogPost implements OnInit {
  readonly currentYear = new Date().getFullYear();
  private apiUrl = environment.apiUrl;
  private apiOrigin = this.apiUrl.replace(/\/api\/?$/, '');

  post: BlogPostData | null = null;
  loading = false;
  error = '';

  constructor(private route: ActivatedRoute, private http: HttpClient) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      const slug = params['slug'] || params['id'];
      if (!slug) {
        this.post = null;
        return;
      }
      this.loadPost(String(slug));
    });
  }

  private toPublicUrl(value: string): string {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/uploads/')) {
      return `${this.apiOrigin}${value}`;
    }
    return value;
  }

  private escapeHtml(value = '') {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/\n/g, '<br>');
  }

  private normalizeSections(value: unknown, fallbackContent = ''): BlogSection[] {
    const rawSections = Array.isArray(value) && value.length > 0
      ? value
      : (fallbackContent ? String(fallbackContent).split(/\n\s*\n/).filter(item => item.trim()) : []);

    return rawSections.map(section => {
      if (typeof section === 'string') {
        return {
          html: this.escapeHtml(section),
          image: '',
          imageUrl: '',
          alt: ''
        };
      }

      const item = section as Partial<BlogSection> & { text?: string; content?: string };
      const image = item.image || '';
      return {
        html: item.html || item.text || item.content || '',
        image,
        imageUrl: image ? this.toPublicUrl(image) : (item.imageUrl || ''),
        alt: item.alt || ''
      };
    });
  }

  private loadPost(slug: string) {
    this.loading = true;
    this.error = '';
    this.post = null;

    this.http.get<{ success: boolean; post: any }>(`${this.apiUrl}/blog/posts/slug/${encodeURIComponent(slug)}`)
      .subscribe({
        next: (response) => {
          const apiPost = response.post || {};
          const sections = this.normalizeSections(apiPost.fullContent, apiPost.content);

          this.post = {
            id: apiPost._id || apiPost.id || slug,
            slug: apiPost.slug || slug,
            title: apiPost.title || '',
            date: this.formatDate(apiPost.publishedAt || apiPost.createdAt || new Date().toISOString()),
            excerpt: apiPost.excerpt || '',
            content: apiPost.content || '',
            fullContent: sections,
            image: apiPost.image ? this.toPublicUrl(apiPost.image) : '/assets/gallery-1.svg',
            category: apiPost.category || ''
          };
          this.loading = false;
        },
        error: (err) => {
          // 404 is handled by the "not found" section in the template.
          if (err.status && err.status !== 404) {
            this.error = err.error?.message || 'Fehler beim Laden des Beitrags';
          }
          this.loading = false;
          this.post = null;
          console.error(err);
        }
      });
  }

  formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
