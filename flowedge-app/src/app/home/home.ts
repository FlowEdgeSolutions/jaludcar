import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  title = 'JALUD';
  private apiUrl = 'http://localhost:3000/api';
  
  @ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLIFrameElement>;
  videoPlaying = false;
  
  contactForm = {
    firstName: '',
    lastName: '',
    phone: '+49',
    email: '',
    package: '',
    message: ''
  };

  submitting = false;
  submitSuccess = false;
  submitError = '';

  constructor(private http: HttpClient) {}

  beforeAfterPosition = 50;
  private isDragging = false;
  private isMobile = false;

  galleryImages = [
    { src: '/images/gallery/jalud_bild1_Halle.jpg', alt: 'JALUD Autopflege Halle' },
    { src: '/images/gallery/jalud_bild1_Politur.jpg', alt: 'Professionelle Politur' },
    { src: '/images/gallery/jalud_bild1_Politur2.jpg', alt: 'Hochglanzpolitur' },
    { src: '/images/gallery/jalud_bild1_PoliturNahesBild.jpg', alt: 'Detailaufnahme Politur' },
    { src: '/images/gallery/jalud_bild1_waschen.jpg', alt: 'Fahrzeugwäsche' }
  ];

  // Desktop: Maus folgt automatisch
  onSliderMouseMove(event: MouseEvent) {
    if (!this.isMobile) {
      this.updateSliderPosition(event);
    }
  }
  
  onSliderMouseLeave() {
    // Optional: Zurück auf 50% wenn Maus rausgeht
    // this.beforeAfterPosition = 50;
  }

  // Mobile: Touch & Drag
  onSliderTouchStart(event: TouchEvent) {
    this.isMobile = true;
    this.isDragging = true;
    this.updateSliderPositionTouch(event);
  }
  
  onSliderTouchMove(event: TouchEvent) {
    if (this.isDragging) {
      this.updateSliderPositionTouch(event);
    }
  }
  
  onSliderTouchEnd() {
    this.isDragging = false;
  }
  
  private updateSliderPosition(event: MouseEvent) {
    event.preventDefault();
    const target = (event.currentTarget as HTMLElement).querySelector('.before-after-slider') as HTMLElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    this.beforeAfterPosition = Math.max(0, Math.min(100, percentage));
  }
  
  private updateSliderPositionTouch(event: TouchEvent) {
    event.preventDefault();
    const target = (event.currentTarget as HTMLElement).querySelector('.before-after-slider') as HTMLElement;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const x = event.touches[0].clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    this.beforeAfterPosition = Math.max(0, Math.min(100, percentage));
  }

  reviews = [
    {
      initial: 'D',
      name: 'Dean Kloß',
      stars: '★★★★★',
      date: 'vor 2 Monaten',
      text: 'Service wird hier groß geschrieben 👍! Super netter Kontakt und das Ergebnis lässt keine Wünsche offen 😁. Haben für unser BMW Cabrio das komplette Luxus Package...'
    },
    {
      initial: 'N',
      name: 'Nabil',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Ich bin begeistert vom Ergebnis! Der Lack glänzt wieder wie am ersten Tag, und der Innenraum ist makellos sauber. Alles wirkt sehr hochwertig und mit viel...'
    },
    {
      initial: 'M',
      name: 'Melih57 _',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Top-Service, absolut empfehlenswert! Mein Auto sah nach der Aufbereitung aus wie neu, innen und außen perfekt...'
    },
    {
      initial: 'F',
      name: 'Festim Sopjani',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: '10/10 Service! Super freundliches Team, professionelle Arbeit und ein Ergebnis, das wirklich überzeugt. Absolut empfehlenswert für alle, die ihr Auto lieben und schätzen.'
    },
    {
      initial: 'D',
      name: 'Dope Amin',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Ich wollte meinen Wagen nach dem Kauf grundlegend säubern und den Geruch neutralisieren. Ich machte sehr kurzfristig einen Termin und bekam schnell eine...'
    },
    {
      initial: 'S',
      name: 'S. B.',
      stars: '★★★★★',
      date: 'vor einem Monat',
      text: 'Wir hatten gestern unseren Camper auf Citroën Jumper Basis zur Innen- und Außenreinigung vor Ort. Sind sehr zufrieden. Eine Kleinigkeit war für uns nicht...'
    },
    {
      initial: 'M',
      name: 'Max G',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Top Service! Die Autoaufbereitung war bis ins kleinste Detail sauber und ordentlich – sogar die Lüftungsschlitze wurden nicht vergessen. Der Lack glänzt wieder...'
    },
    {
      initial: 'A',
      name: 'Azize Cetin',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Ich hätte nie gedacht, dass mein Auto wieder so aussehen kann! Alles blitzsauber, der Lack glänzt wie neu. Top Arbeit – 100 % Empfehlung!☀️'
    },
    {
      initial: 'J',
      name: 'Joel Banaschewski',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Einmal und immer wieder. Top Aufbereitung. Kann ich nur empfehlen. Fahre extra aus Marl dort hin, weil der Service und die Leistung stimmt. 👌🏼'
    },
    {
      initial: 'S',
      name: 'SILEZ',
      stars: '★★★★★',
      date: 'vor einem Monat',
      text: 'Mein Wagen sah total schlimm aus nach Jahren Autobahn. Sieht nach der Behandlung einfach wieder wie neu aus 🥳'
    },
    {
      initial: 'M',
      name: 'Mikail Demir',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Terminvereinbarung war einfach, alles lief entspannt und professionell. Preis passt auch für die Leistung. Kann ich echt nur empfehlen.👍ich komm auf jeden Fall wieder.'
    },
    {
      initial: 'T',
      name: 'T. Drewes',
      stars: '★★★★★',
      date: 'vor 3 Monaten',
      text: 'Mein Auto sieht wieder super aus. Viele kleine Kratzer wurden aus dem Lack entfernt und die Scheinwerfer sehen...'
    },
    {
      initial: 'A',
      name: 'Ar Turo',
      stars: '★★★★★',
      date: 'vor 3 Monaten',
      text: 'Vor ein einer Woche war ich bei einer Autoaufbereitung Jalud Cars in Hattingen. Ein sehr netter und freundlicher Mann hat mich empfangen. Der Termin um 10 Uhr...'
    },
    {
      initial: 'Y',
      name: 'Yaşar Vreş Özkan',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Ich bin sehr zufrieden mit der Arbeit und kann es nur jedem ans Herz legen, immer wieder zu kommem! Auch sehr sympathische Mitarbeiter, mit denen man sich sehr gerne auch unterhalten kann.'
    },
    {
      initial: 'E',
      name: 'Enes Gürleyen',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Sehr kompetente Beratung, man erreicht immer jemanden und das Ergebnis war wirklich fantastisch. Gerne wieder!'
    },
    {
      initial: 'A',
      name: 'A C',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Sehr zuverlässig, Auto wie neu! Kann ich nur weiter empfehlen sehr coole Leute.'
    },
    {
      initial: 'I',
      name: 'Irou',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Das Team versteht ihr Handwerk. 👍 Professionalität wird hier hoch geschrieben. Ich komme gerne wieder.'
    },
    {
      initial: 'F',
      name: 'Fabian Costa',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Sehr freundliches Personal, machen super Arbeit die Jungs!'
    },
    {
      initial: 'T',
      name: 'Tobey Rasheed',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Super Dienstleister, auf die man sich verlassen kann und die einem das bieten, was sie versprechen!'
    },
    {
      initial: 'M',
      name: 'Muhammed Özdemir',
      stars: '★★★★★',
      date: 'vor 4 Monaten',
      text: 'Einfach Top. Wow 🌹'
    }
  ];

  onSubmit() {
    // Validation
    if (!this.contactForm.firstName || !this.contactForm.lastName || 
        !this.contactForm.phone || !this.contactForm.email || 
        !this.contactForm.package) {
      this.submitError = 'Bitte füllen Sie alle Pflichtfelder aus';
      return;
    }

    this.submitting = true;
    this.submitError = '';
    this.submitSuccess = false;

    const leadData = {
      firstName: this.contactForm.firstName,
      lastName: this.contactForm.lastName,
      phone: this.contactForm.phone,
      email: this.contactForm.email,
      package: this.contactForm.package,
      message: this.contactForm.message || ''
    };

    this.http.post<{ success: boolean; message: string }>(
      `${this.apiUrl}/leads`,
      leadData
    ).subscribe({
      next: (response) => {
        this.submitSuccess = true;
        this.submitting = false;
        // Reset form
        this.contactForm = {
          firstName: '',
          lastName: '',
          phone: '+49',
          email: '',
          package: '',
          message: ''
        };
        // Hide success message after 5 seconds
        setTimeout(() => this.submitSuccess = false, 5000);
      },
      error: (err) => {
        this.submitError = 'Fehler beim Senden der Anfrage. Bitte versuchen Sie es später erneut.';
        this.submitting = false;
        console.error(err);
      }
    });
  }

  playVideo() {
    this.videoPlaying = true;
    // Vimeo API: Video automatisch abspielen
    if (this.videoPlayer && this.videoPlayer.nativeElement) {
      const iframe = this.videoPlayer.nativeElement;
      const player = new (window as any).Vimeo.Player(iframe);
      player.play();
    }
  }
}
