import { Component, DestroyRef, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { CookieBanner } from './cookie-banner/cookie-banner';
import { Navbar } from './navbar/navbar';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CookieBanner, Navbar, NgIf],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  title = 'JALUD';
  showNavbar = true;

  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  constructor() {
    this.updateNavbarVisibility(this.router.url);
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => this.updateNavbarVisibility(event.urlAfterRedirects));
  }

  private updateNavbarVisibility(url: string) {
    this.showNavbar = !url.startsWith('/admin');
  }
}
