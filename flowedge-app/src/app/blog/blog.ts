import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';

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
  imports: [CommonModule, HttpClientModule],
  templateUrl: './blog.html',
  styleUrl: './blog.scss',
})
export class Blog implements OnInit {
  private apiUrl = 'http://localhost:3000/api';
  blogPosts: BlogPost[] = [];
  loading = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadPublishedPosts();
  }

  loadPublishedPosts() {
    this.loading = true;
    this.http.get<{ success: boolean; posts: any[] }>(`${this.apiUrl}/blog/posts/published`)
      .subscribe({
        next: (response) => {
          this.blogPosts = response.posts.map(post => ({
            id: post.id,
            title: post.title,
            slug: post.slug,
            date: this.formatDate(post.publishedAt),
            excerpt: post.excerpt,
            content: '',
            image: post.image ? `http://localhost:3000${post.image}` : '/assets/gallery-1.svg',
            category: post.category
          }));
          this.loading = false;
        },
        error: (err) => {
          console.error('Fehler beim Laden der Blog-Beiträge:', err);
          // Fallback auf statische Daten
          this.loadStaticPosts();
          this.loading = false;
        }
      });
  }

  loadStaticPosts() {
    this.blogPosts = [
      {
        id: 1,
        title: 'Die perfekte Autopflege im Winter',
        date: '15. Januar 2025',
        excerpt: 'Winterliche Bedingungen stellen besondere Herausforderungen für Ihr Fahrzeug dar. Erfahren Sie, wie Sie Ihr Auto optimal schützen.',
        content: 'Der Winter mit Streusalz, Schnee und Kälte beansprucht Lack und Interieur besonders stark. Eine professionelle Winterpflege ist essentiell.',
        image: '/assets/gallery-1.svg',
        category: 'Winterpflege'
      },
      {
        id: 2,
        title: 'Lackversiegelung: Warum sie so wichtig ist',
        date: '8. Januar 2025',
        excerpt: 'Eine hochwertige Lackversiegelung schützt Ihr Fahrzeug langfristig vor Umwelteinflüssen und erhält den Glanz.',
        content: 'Moderne Lackversiegelungen bieten Schutz für bis zu 12 Monate und machen die Reinigung deutlich einfacher.',
        image: '/assets/gallery-2.svg',
        category: 'Lackpflege'
      },
      {
        id: 3,
        title: '5 Tipps für makellose Felgen',
        date: '2. Januar 2025',
        excerpt: 'Felgen sind das Aushängeschild Ihres Fahrzeugs. Mit diesen 5 Profi-Tipps bleiben sie dauerhaft sauber.',
        content: 'Regelmäßige Felgenreinigung verhindert Bremsstaub-Ablagerungen und erhält den Wert Ihres Fahrzeugs.',
        image: '/assets/gallery-3.svg',
        category: 'Felgenpflege'
      },
      {
        id: 4,
        title: 'Innenraumaufbereitung: Frische für Ihr Auto',
        date: '28. Dezember 2024',
        excerpt: 'Ein gepflegter Innenraum steigert nicht nur den Wohlfühlfaktor, sondern auch den Wiederverkaufswert.',
        content: 'Professionelle Polsterreinigung, Lederaufbereitung und Geruchsneutralisierung für ein neuwertiges Gefühl.',
        image: '/assets/gallery-4.svg',
        category: 'Innenraumpflege'
      },
      {
        id: 5,
        title: 'Keramikversiegelung vs. Wachsversiegelung',
        date: '20. Dezember 2024',
        excerpt: 'Welche Versiegelung ist die richtige für Ihr Fahrzeug? Wir klären die Unterschiede auf.',
        content: 'Keramikversiegelungen bieten längeren Schutz, während Wachsversiegelungen einen warmen Glanz erzeugen.',
        image: '/assets/gallery-1.svg',
        category: 'Lackpflege'
      },
      {
        id: 6,
        title: 'So bereiten Sie Ihr Auto auf den Frühling vor',
        date: '15. Dezember 2024',
        excerpt: 'Nach dem Winter benötigt Ihr Fahrzeug besondere Aufmerksamkeit. Unsere Checkliste hilft.',
        content: 'Gründliche Unterbodenwäsche, Lackpolitur und Innenraumreinigung für den perfekten Start in die Saison.',
        image: '/assets/gallery-2.svg',
        category: 'Saisonpflege'
      },
      {
        id: 7,
        title: 'Kratzer im Lack? Diese Optionen haben Sie',
        date: '10. Dezember 2024',
        excerpt: 'Kleine Kratzer müssen kein Schönheitsfehler bleiben. Wir zeigen professionelle Lösungen.',
        content: 'Von Politur über Smart Repair bis zur Teillackierung - für jeden Kratzer gibt es die passende Lösung.',
        image: '/assets/gallery-3.svg',
        category: 'Lackaufbereitung'
      },
      {
        id: 8,
        title: 'Premium-Autopflege: Was macht den Unterschied?',
        date: '5. Dezember 2024',
        excerpt: 'Erfahren Sie, warum professionelle Autopflege sich von der SB-Waschanlage unterscheidet.',
        content: 'Hochwertige Produkte, geschultes Personal und moderne Technik garantieren perfekte Ergebnisse.',
        image: '/assets/gallery-4.svg',
        category: 'Premium Service'
      },
      {
        id: 9,
        title: 'Lederpflege: So bleibt es geschmeidig',
        date: '28. November 2024',
        excerpt: 'Leder benötigt regelmäßige Pflege, um nicht spröde zu werden. Unsere Profi-Tipps.',
        content: 'Spezielle Lederpflegemittel reinigen schonend und halten das Material elastisch und geschmeidig.',
        image: '/assets/gallery-1.svg',
        category: 'Innenraumpflege'
      },
      {
        id: 10,
        title: 'Warum regelmäßige Autopflege Geld spart',
        date: '20. November 2024',
        excerpt: 'Investieren Sie in die Pflege Ihres Fahrzeugs und profitieren Sie langfristig beim Wiederverkauf.',
        content: 'Werterhalt durch professionelle Pflege kann beim Verkauf mehrere tausend Euro ausmachen.',
        image: '/assets/gallery-2.svg',
        category: 'Werterhalt'
      }
    ];
  }

  formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
