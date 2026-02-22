import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';

interface BlogPostData {
  id: string;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
  fullContent: string[];
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

  private loadPost(slug: string) {
    this.loading = true;
    this.error = '';
    this.post = null;

    this.http.get<{ success: boolean; post: any }>(`${this.apiUrl}/blog/posts/slug/${encodeURIComponent(slug)}`)
      .subscribe({
        next: (response) => {
          const apiPost = response.post || {};
          const paragraphs = Array.isArray(apiPost.fullContent) && apiPost.fullContent.length > 0
            ? apiPost.fullContent
            : (apiPost.content ? String(apiPost.content).split(/\n\s*\n/).filter(p => p.trim()) : []);

          this.post = {
            id: apiPost._id || apiPost.id || slug,
            slug: apiPost.slug || slug,
            title: apiPost.title || '',
            date: this.formatDate(apiPost.publishedAt || apiPost.createdAt || new Date().toISOString()),
            excerpt: apiPost.excerpt || '',
            content: apiPost.content || '',
            fullContent: paragraphs,
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
