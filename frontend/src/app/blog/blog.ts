import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';
import { environment } from '../../environments/environment';

interface BlogPost {
  id: number | string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
  image: string;
  category: string;
  slug?: string;
  publishedAt?: Date;
}

@Component({
  selector: 'app-blog',
  imports: [CommonModule, HttpClientModule, RouterModule],
  templateUrl: './blog.html',
  styleUrl: './blog.scss',
})
export class Blog implements OnInit {
  private apiUrl = environment.apiUrl;
  private apiOrigin = this.apiUrl.replace(/\/api\/?$/, '');
  blogPosts: BlogPost[] = [];
  loading = false;
  error = '';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPublishedPosts();
  }

  private toPublicUrl(value: string): string {
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/uploads/')) {
      return `${this.apiOrigin}${value}`;
    }
    return value;
  }

  loadPublishedPosts() {
    this.loading = true;
    this.http.get<{ success: boolean; posts: any[] }>(`${this.apiUrl}/blog/posts/published`)
      .subscribe({
        next: (response) => {
          this.error = '';
          this.blogPosts = response.posts.map(post => ({
            id: post.id,
            title: post.title,
            slug: post.slug,
            date: this.formatDate(post.publishedAt),
            excerpt: post.excerpt,
            content: '',
            image: post.image ? this.toPublicUrl(post.image) : '/assets/gallery-1.svg',
            category: post.category
          }));
          this.loading = false;
        },
        error: (err) => {
          console.error('Fehler beim Laden der Blog-Beiträge:', err);
          this.error = 'Blog-Beiträge konnten aktuell nicht geladen werden.';
          this.blogPosts = [];
          this.loading = false;
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
