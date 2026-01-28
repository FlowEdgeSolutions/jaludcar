import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cookie-banner',
  imports: [CommonModule, FormsModule],
  templateUrl: './cookie-banner.html',
  styleUrl: './cookie-banner.scss'
})
export class CookieBanner implements OnInit {
  showBanner = false;
  showSettings = false;
  analyticsEnabled = false;
  marketingEnabled = false;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const consent = localStorage.getItem('cookieConsent');
      if (!consent) {
        this.showBanner = true;
      }
    }
  }

  acceptAll() {
    this.analyticsEnabled = true;
    this.marketingEnabled = true;
    this.saveConsent();
  }

  acceptEssential() {
    this.analyticsEnabled = false;
    this.marketingEnabled = false;
    this.saveConsent();
  }

  openSettings() {
    this.showSettings = true;
  }

  closeSettings() {
    this.showSettings = false;
  }

  saveSettings() {
    this.saveConsent();
    this.closeSettings();
  }

  private saveConsent() {
    if (isPlatformBrowser(this.platformId)) {
      const consent = {
        essential: true,
        analytics: this.analyticsEnabled,
        marketing: this.marketingEnabled,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('cookieConsent', JSON.stringify(consent));
      this.showBanner = false;
    }
  }
}
