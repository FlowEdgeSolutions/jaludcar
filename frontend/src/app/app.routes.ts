import { Routes } from '@angular/router';
import { Blog } from './blog/blog';
import { Home } from './home/home';
import { Impressum } from './impressum/impressum';
import { Datenschutz } from './datenschutz/datenschutz';
import { Agb } from './agb/agb';
import { BlogPost } from './blog-post/blog-post';
import { Admin } from './admin/admin';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'blog', component: Blog },
  { path: 'blog/:id', component: BlogPost },
  { path: 'admin', component: Admin },
  { path: 'impressum', component: Impressum },
  { path: 'datenschutz', component: Datenschutz },
  { path: 'agb', component: Agb }
];
