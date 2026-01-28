import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
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
  imports: [CommonModule, HttpClientModule],
  templateUrl: './blog.html',
  styleUrl: './blog.scss',
})
export class Blog implements OnInit {
  private apiUrl = environment.apiUrl;
  blogPosts: BlogPost[] = [];
  loading = false;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // Prüfe ob Backend verfügbar ist, sonst direkt statische Posts laden
    this.loadStaticPosts();
    // Optional: Versuche Backend-Daten zu laden
    // this.loadPublishedPosts();
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
            image: post.image ? `${post.image}` : '/assets/gallery-1.svg',
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
        title: 'Keramikversiegelung für Ihr Auto: Der ultimative Lackschutz 2025',
        date: '15. Januar 2025',
        excerpt: 'Keramikversiegelung bietet bis zu 5 Jahre Schutz für Ihren Autolack. Erfahren Sie alles über Vorteile, Kosten und den Ablauf der professionellen Nanoversiegelung in Hattingen.',
        content: 'Keramikversiegelung ist die modernste Form des Lackschutzes und bietet zahlreiche Vorteile gegenüber herkömmlichen Wachsversiegelungen.',
        image: '/assets/blog-keramik.jpg',
        category: 'Lackpflege',
        slug: 'keramikversiegelung-auto-lackschutz'
      },
      {
        id: 2,
        title: 'Autopflege im Winter: Professionelle Tipps gegen Salz und Streugut',
        date: '10. Januar 2025',
        excerpt: 'Streusalz, Schnee und Frost setzen Ihrem Fahrzeug zu. Mit der richtigen Winterpflege schützen Sie Lack, Unterboden und Innenraum effektiv vor Korrosion und Schäden.',
        content: 'Die kalte Jahreszeit stellt besondere Anforderungen an die Autopflege. Streusalz ist besonders aggressiv und kann erhebliche Schäden verursachen.',
        image: '/assets/blog-winter.jpg',
        category: 'Saisonpflege',
        slug: 'autopflege-winter-tipps-salzschutz'
      },
      {
        id: 3,
        title: 'Innenraumaufbereitung: So erhöhen Sie den Wert Ihres Fahrzeugs',
        date: '5. Januar 2025',
        excerpt: 'Eine professionelle Innenraumaufbereitung steigert den Wiederverkaufswert um bis zu 15%. Erfahren Sie, wie Polsterreinigung, Lederaufbereitung und Geruchsneutralisation Ihr Auto transformieren.',
        content: 'Der Innenraum ist das Herzstück Ihres Fahrzeugs. Eine professionelle Aufbereitung macht nicht nur optisch einen Unterschied.',
        image: '/assets/blog-innenraum.jpg',
        category: 'Innenraumpflege',
        slug: 'innenraumaufbereitung-autowert-steigern'
      },
      {
        id: 4,
        title: 'Lackpolitur vs. Lackaufbereitung: Was braucht mein Auto wirklich?',
        date: '28. Dezember 2024',
        excerpt: 'Kratzer, Hologramme und matte Stellen im Lack? Wir erklären den Unterschied zwischen einfacher Politur und professioneller Lackaufbereitung. Mit Vorher-Nachher-Ergebnissen aus Hattingen.',
        content: 'Viele Autobesitzer sind unsicher, ob eine Politur ausreicht oder eine komplette Lackaufbereitung notwendig ist.',
        image: '/assets/blog-politur.jpg',
        category: 'Lackaufbereitung',
        slug: 'lackpolitur-lackaufbereitung-unterschied'
      },
      {
        id: 5,
        title: 'Fahrzeugaufbereitung vor dem Verkauf: Bis zu 3.000€ mehr erzielen',
        date: '20. Dezember 2024',
        excerpt: 'Studien belegen: Professionell aufbereitete Fahrzeuge erzielen beim Verkauf deutlich höhere Preise. Investieren Sie 300€ in die Aufbereitung und gewinnen Sie bis zu 3.000€ beim Verkauf.',
        content: 'Der erste Eindruck zählt - besonders beim Autoverkauf. Eine professionelle Fahrzeugaufbereitung zahlt sich mehrfach aus.',
        image: '/assets/blog-verkauf.jpg',
        category: 'Werterhalt',
        slug: 'fahrzeugaufbereitung-vor-verkauf-wert-steigern'
      },
      {
        id: 6,
        title: 'Scheinwerfer polieren: Mehr Sicherheit und bessere Optik',
        date: '15. Dezember 2024',
        excerpt: 'Blinde Scheinwerfer reduzieren die Lichtleistung um bis zu 50%. Mit professioneller Scheinwerferaufbereitung verbessern Sie Sicht, Sicherheit und die Optik Ihres Fahrzeugs erheblich.',
        content: 'UV-Strahlung und Witterung lassen Scheinwerfer mit der Zeit vergilben und matt werden. Das ist nicht nur ein optisches Problem.',
        image: '/assets/blog-scheinwerfer.jpg',
        category: 'Spezialservices',
        slug: 'scheinwerfer-polieren-aufbereitung'
      },
      {
        id: 7,
        title: 'Lederpflege im Auto: So bleibt Leder geschmeidig und rissefrei',
        date: '10. Dezember 2024',
        excerpt: 'Autoleder benötigt regelmäßige Pflege, um nicht spröde zu werden. Mit den richtigen Pflegemitteln und Techniken bleibt Ihr Leder jahrelang geschmeidig, weich und optisch ansprechend.',
        content: 'Leder ist ein Naturprodukt, das atmet und regelmäßige Pflege benötigt. Ohne richtige Behandlung wird es spröde und bekommt Risse.',
        image: '/assets/blog-leder.jpg',
        category: 'Innenraumpflege',
        slug: 'lederpflege-auto-tipps-anleitung'
      },
      {
        id: 8,
        title: 'Kratzer im Autolack entfernen: Smart Repair vs. Neulackierung',
        date: '5. Dezember 2024',
        excerpt: 'Kleine Kratzer müssen nicht teuer sein. Smart Repair ist die kostengünstige Alternative zur Neulackierung. Wir zeigen, wann welche Methode sinnvoll ist und was sie kostet.',
        content: 'Kratzer im Lack sind ärgerlich, aber in vielen Fällen lassen sie sich kostengünstig reparieren. Die Wahl der richtigen Methode spart Geld.',
        image: '/assets/blog-kratzer.jpg',
        category: 'Lackaufbereitung',
        slug: 'kratzer-autolack-entfernen-smart-repair'
      },
      {
        id: 9,
        title: 'Nanoversiegelung: Die Zukunft der Autopflege ist hier',
        date: '28. November 2024',
        excerpt: 'Nanoversiegelung schützt Lack, Felgen und Scheiben durch mikroskopisch kleine Partikel. Schmutz perlt ab, Reinigung wird zum Kinderspiel. Alles über die innovative Technologie.',
        content: 'Nanotechnologie revolutioniert die Autopflege. Die winzigen Partikel bilden eine unsichtbare Schutzschicht auf molekularer Ebene.',
        image: '/assets/blog-nano.jpg',
        category: 'Lackpflege',
        slug: 'nanoversiegelung-auto-vorteile-kosten'
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
