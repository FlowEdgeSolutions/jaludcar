import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';

type ConsentSettings = {
  analytics?: boolean;
  marketing?: boolean;
};

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

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
  private analyticsLoaded = false;
  private readonly googleAnalyticsId = environment.googleAnalyticsId;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const consent = localStorage.getItem('cookieConsent');
      if (!consent) {
        this.showBanner = true;
        return;
      }

      const settings = this.parseConsent(consent);
      this.analyticsEnabled = Boolean(settings.analytics);
      this.marketingEnabled = Boolean(settings.marketing);

      if (this.analyticsEnabled) {
        this.loadAnalytics();
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
      if (this.analyticsEnabled) {
        this.loadAnalytics();
      }
      this.showBanner = false;
    }
  }

  private parseConsent(value: string): ConsentSettings {
    try {
      return JSON.parse(value) as ConsentSettings;
    } catch {
      return {};
    }
  }

  private loadAnalytics() {
    if (!this.googleAnalyticsId || this.analyticsLoaded || !isPlatformBrowser(this.platformId)) {
      return;
    }

    const analyticsWindow = window as AnalyticsWindow;
    analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
    analyticsWindow.gtag =
      analyticsWindow.gtag ||
      ((...args: unknown[]) => {
        analyticsWindow.dataLayer?.push(args);
      });

    if (!document.querySelector(`script[data-ga-id="${this.googleAnalyticsId}"]`)) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${this.googleAnalyticsId}`;
      script.dataset['gaId'] = this.googleAnalyticsId;
      document.head.appendChild(script);
    }

    analyticsWindow.gtag('js', new Date());
    analyticsWindow.gtag('config', this.googleAnalyticsId, { anonymize_ip: true });
    this.analyticsLoaded = true;
  }
}
