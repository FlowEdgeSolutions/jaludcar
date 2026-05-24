# Hetzner Deployment

Diese Variante ersetzt Railway/Vercel durch einen Hetzner VPS:

- Nginx nimmt HTTP/HTTPS an.
- Angular SSR laeuft lokal auf Port 4000.
- Express API laeuft lokal auf Port 3000.
- PostgreSQL laeuft lokal auf dem Server.
- Uploads liegen ausserhalb des Git-Checkouts unter `/var/www/jalud/shared/uploads`.

## Server erstellen

In der Hetzner Console ist deine Auswahl aus dem Screenshot passend:

- CPX22 reicht fuer diese App aus.
- Ubuntu 26.04 ist okay.
- Fuege unbedingt deinen SSH-Key hinzu.
- Firewall: 22/tcp fuer SSH, 80/tcp fuer HTTP, 443/tcp fuer HTTPS.
- Backups sind optional, fuer Produktivbetrieb aber sinnvoll.

## DNS setzen

Setze beim Domain-Anbieter:

```text
jalud.de      A      <HETZNER_IPV4>
www.jalud.de  A      <HETZNER_IPV4>
```

Falls alte Clients noch `api.jalud.de` nutzen, kannst du zusaetzlich `api.jalud.de` auf dieselbe IP zeigen lassen und die Domain in `nginx.conf` sowie im Certbot-Befehl ergaenzen.

## Server vorbereiten

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git nginx postgresql postgresql-contrib certbot python3-certbot-nginx

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## Datenbank anlegen

```bash
openssl rand -base64 32
sudo -u postgres psql
```

In `psql`:

```sql
CREATE USER jalud WITH PASSWORD 'HIER_DAS_PASSWORT_EINTRAGEN';
CREATE DATABASE jalud OWNER jalud;
\q
```

## App installieren

```bash
sudo mkdir -p /var/www/jalud/shared/uploads
sudo chown -R "$USER":"$USER" /var/www/jalud

git clone <DEIN_GIT_REPO> /var/www/jalud/current
cd /var/www/jalud/current

cp deploy/hetzner/backend.env.example backend/.env
nano backend/.env

npm install
cd frontend && npm install && npm run build
cd ../backend && npm install --omit=dev
cd ..
```

In `backend/.env` muessen mindestens diese Werte korrekt sein:

```text
DATABASE_URL=postgresql://jalud:<PASSWORT>@127.0.0.1:5432/jalud
JWT_SECRET=<LANGES_RANDOM_SECRET>
ADMIN_EMAIL=<ADMIN_EMAIL>
ADMIN_PASSWORD=<ADMIN_PASSWORT>
RESEND_API_KEY=<RESEND_API_KEY>
RESEND_FROM=JALUD Premium Autopflege <info@jalud.de>
RESEND_TO=info@jalud.de
RESEND_REPLY_TO=
MISTRAL_API_KEY=<MISTRAL_API_KEY>
MISTRAL_MODEL=mistral-small-latest
MISTRAL_BASE_URL=https://api.mistral.ai/v1
```

Kopiere keine alten Vercel/Railway-Importdateien auf den Server. Fuer Hetzner ist `backend/.env` die einzige Runtime-Env-Datei.

## Prozesse starten

```bash
pm2 start deploy/hetzner/ecosystem.config.cjs
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME"
```

Teste intern:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:4000/
```

## Nginx und HTTPS

```bash
sudo cp deploy/hetzner/nginx.conf /etc/nginx/sites-available/jalud
sudo ln -s /etc/nginx/sites-available/jalud /etc/nginx/sites-enabled/jalud
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d jalud.de -d www.jalud.de
```

Danach pruefen:

```bash
curl https://jalud.de/health
curl https://jalud.de/api/blog/posts/published
```

## Updates deployen

```bash
cd /var/www/jalud/current
git pull
npm install
cd frontend && npm install && npm run build
cd ../backend && npm install --omit=dev
cd ..
pm2 restart jalud-api jalud-web
```

## Migration von Railway/Vercel

- Die App nutzt keine Vercel-Rewrites mehr.
- Das Frontend ruft die API unter `https://jalud.de/api` auf.
- Google Analytics wird erst nach Cookie-Zustimmung geladen.
- SEO bleibt ueber Angular SSR aktiv, weil Nginx normale Seiten an `jalud-web` auf Port 4000 weitergibt.
- Alte Uploads muessen nach `/var/www/jalud/shared/uploads` kopiert werden, wenn schon Blog-Bilder vorhanden sind.
