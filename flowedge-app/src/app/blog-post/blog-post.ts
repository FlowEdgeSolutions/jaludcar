import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

interface BlogPostData {
  id: number;
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
  imports: [CommonModule],
  templateUrl: './blog-post.html',
  styleUrl: './blog-post.scss',
})
export class BlogPost implements OnInit {
  post: BlogPostData | undefined;
  
  blogPosts: BlogPostData[] = [
    {
      id: 1,
      title: 'Die perfekte Autopflege im Winter',
      date: '15. Januar 2025',
      excerpt: 'Winterliche Bedingungen stellen besondere Herausforderungen für Ihr Fahrzeug dar. Erfahren Sie, wie Sie Ihr Auto optimal schützen.',
      content: 'Der Winter mit Streusalz, Schnee und Kälte beansprucht Lack und Interieur besonders stark. Eine professionelle Winterpflege ist essentiell.',
      image: '/assets/gallery-1.svg',
      category: 'Winterpflege',
      fullContent: [
        'Der Winter stellt besondere Herausforderungen für Ihr Fahrzeug dar. Streusalz, Schnee, Kälte und ständige Feuchtigkeit greifen Lack, Unterboden und Innenraum massiv an. Eine regelmäßige und professionelle Winterpflege ist daher unerlässlich, um Ihr Fahrzeug langfristig zu schützen und den Wert zu erhalten.',
        'Streusalz ist der größte Feind Ihres Fahrzeugs im Winter. Es setzt sich nicht nur auf dem Lack ab, sondern auch im Unterboden, in Radhäusern und an schwer zugänglichen Stellen. Dort kann es Korrosion verursachen, die häufig erst spät bemerkt wird. Regelmäßige Unterbodenwäschen sind daher im Winter besonders wichtig.',
        'Unser Winter-Service umfasst eine gründliche Außenreinigung mit speziellen Reinigungsmitteln, die Salzrückstände effektiv entfernen. Anschließend tragen wir eine Schutzversiegelung auf, die Ihren Lack vor weiteren Umwelteinflüssen schützt und die Reinigung in den nächsten Wochen erleichtert.',
        'Auch der Innenraum leidet im Winter: Feuchtigkeit, Schmutz und Streusalzrückstände werden täglich ins Auto getragen. Eine professionelle Innenraumreinigung mit Textilimprägnierung schützt Ihre Polster und Teppiche nachhaltig.',
        'Investieren Sie in regelmäßige Winterpflege und Ihr Fahrzeug wird es Ihnen mit langer Lebensdauer und Werterhalt danken. Vereinbaren Sie jetzt einen Termin bei JALUD!'
      ]
    },
    {
      id: 2,
      title: 'Lackversiegelung: Warum sie so wichtig ist',
      date: '8. Januar 2025',
      excerpt: 'Eine hochwertige Lackversiegelung schützt Ihr Fahrzeug langfristig vor Umwelteinflüssen und erhält den Glanz.',
      content: 'Moderne Lackversiegelungen bieten Schutz für bis zu 12 Monate und machen die Reinigung deutlich einfacher.',
      image: '/assets/gallery-2.svg',
      category: 'Lackpflege',
      fullContent: [
        'Eine professionelle Lackversiegelung ist eine der besten Investitionen in den Werterhalt Ihres Fahrzeugs. Sie bildet eine unsichtbare Schutzschicht über dem Lack, die vor UV-Strahlung, saurem Regen, Vogelkot, Insektenrückständen und mechanischen Einflüssen schützt.',
        'Während herkömmliche Wachse nach wenigen Wochen ihre Wirkung verlieren, hält eine moderne Keramikversiegelung bis zu 12 Monate oder länger. Sie verbindet sich chemisch mit dem Lack und bildet eine extrem harte, glatte Oberfläche.',
        'Der große Vorteil: Schmutz und Wasser perlen einfach ab (Lotus-Effekt). Das macht die regelmäßige Reinigung deutlich einfacher und schneller. Zudem erhält die Versiegelung den tiefen Glanz Ihres Lacks dauerhaft.',
        'Bei JALUD verwenden wir nur hochwertige Versiegelungssysteme, die wir nach gründlicher Lackvorbereitung auftragen. Dazu gehören Lackreinigung, Politur und Entfettung. Nur so kann die Versiegelung optimal haften und ihre volle Wirkung entfalten.',
        'Eine Lackversiegelung ist keine Kostenstelle, sondern eine Investition: Sie spart langfristig Zeit bei der Reinigung, schützt vor teuren Lackschäden und erhält den Wiederverkaufswert Ihres Fahrzeugs. Lassen Sie sich jetzt bei JALUD beraten!'
      ]
    },
    {
      id: 3,
      title: '5 Tipps für makellose Felgen',
      date: '2. Januar 2025',
      excerpt: 'Felgen sind das Aushängeschild Ihres Fahrzeugs. Mit diesen 5 Profi-Tipps bleiben sie dauerhaft sauber.',
      content: 'Regelmäßige Felgenreinigung verhindert Bremsstaub-Ablagerungen und erhält den Wert Ihres Fahrzeugs.',
      image: '/assets/gallery-3.svg',
      category: 'Felgenpflege',
      fullContent: [
        'Felgen ziehen Blicke auf sich und sind ein wichtiges Designelement jedes Fahrzeugs. Doch gerade sie sind ständig starken Belastungen ausgesetzt: Bremsstaub, Streusalz, Schmutz und Hitze setzen ihnen zu. Mit diesen 5 Profi-Tipps halten Sie Ihre Felgen dauerhaft in Top-Zustand.',
        'Tipp 1: Regelmäßige Reinigung ist das A und O. Bremsstaub brennt sich bei Hitze in die Felgenoberfläche ein und lässt sich dann nur noch schwer entfernen. Reinigen Sie Ihre Felgen daher mindestens alle 2 Wochen mit einem speziellen Felgenreiniger.',
        'Tipp 2: Verwenden Sie die richtigen Werkzeuge. Weiche Felgenbürsten mit unterschiedlichen Größen erreichen auch schwer zugängliche Stellen wie Speicheninnenseiten. Harte Bürsten oder aggressive Schwämme können die Oberfläche beschädigen.',
        'Tipp 3: Felgenversiegelung nicht vergessen! Nach der gründlichen Reinigung schützt eine spezielle Felgenversiegelung vor erneuter Verschmutzung. Bremsstaub kann sich dann nicht mehr so leicht festsetzen und die nächste Reinigung geht deutlich schneller.',
        'Tipp 4: Vorsicht bei aggressiven Reinigern! Zu scharfe säurehaltige Produkte können Aluminium- und Chromfelgen angreifen. Verwenden Sie pH-neutrale Spezialreiniger, die für Ihr Felgenmaterial geeignet sind.',
        'Tipp 5: Lassen Sie Ihre Felgen regelmäßig professionell aufbereiten. Bei JALUD reinigen wir Ihre Felgen gründlich, polieren sie bei Bedarf und versiegeln sie langanhaltend. So bleiben sie dauerhaft schön und Sie sparen langfristig Zeit und Geld!'
      ]
    }
  ];

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    this.route.params.subscribe(params => {
      const id = +params['id'];
      this.post = this.blogPosts.find(p => p.id === id);
    });
  }
}
