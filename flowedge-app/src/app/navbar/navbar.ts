import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface NavLink {
  label: string;
  link: string;
  fragment?: string;
}

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar {
  isMenuOpen = false;

  readonly navLinks: NavLink[] = [
    { label: 'Über JALUD', link: '/', fragment: 'ueber-jalud' },
    { label: 'Unsere Leistungen', link: '/', fragment: 'leistungen' },
    { label: 'Preise', link: '/', fragment: 'preise' },
    { label: 'Blog', link: '/blog' },
    { label: 'Kontakt', link: '/', fragment: 'kontakt' },
    { label: 'Impressum', link: '/impressum' },
    { label: 'Datenschutz', link: '/datenschutz' },
    { label: 'AGB', link: '/agb' }
  ];

  toggleMenu() {
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu() {
    this.isMenuOpen = false;
  }
}
