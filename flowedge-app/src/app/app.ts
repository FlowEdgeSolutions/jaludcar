import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CookieBanner } from './cookie-banner/cookie-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CookieBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  title = 'JALUD';
}
