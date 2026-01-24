import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CookieBanner } from './cookie-banner/cookie-banner';
import { Navbar } from './navbar/navbar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CookieBanner, Navbar],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  title = 'JALUD';
}
