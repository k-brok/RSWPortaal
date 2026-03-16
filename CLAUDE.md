# CLAUDE.md — RSW Portaal

> Regionale Scouting Wedstrijden — Regio De Langstraat  
> Ontwikkeld door **CHUNKK**  
> Laatste update: 2026

---

## 1. Projectoverzicht

**RSW Portaal** is een webapplicatie voor het beheren van de jaarlijkse Regionale Scouting Wedstrijden (RSW) in regio De Langstraat. Het systeem ondersteunt inschrijvingen van scoutinggroepen en vrijwilligers, de voorbereiding door organisatoren (inclusief plattegrond en veldjesindeling), live jurering via categorieën/criteria en het publiceren van uitslagen.

---

## 2. Technische Stack

| Onderdeel         | Keuze                              |
|-------------------|------------------------------------|
| Frontend          | Vanilla JavaScript (ES Modules)    |
| Backend           | Node.js + Express                  |
| Database          | MySQL / MariaDB                    |
| E-mail            | Microsoft Graph API                |
| Auth              | JWT (access + refresh tokens)      |
| Styling           | Eigen CSS — MudBlazor-geïnspireerd |
| Theme             | Dark mode standaard                |
| Taal interface    | Nederlands                         |
| Containerisatie   | Docker + Kubernetes                |
| Hosting test      | Eigen Kubernetes-cluster           |
| Hosting productie | Azure (AKS)                        |
| Versiebeheer      | Git + Git Flow                     |

---

## 3. Architectuur

### 3.1 Frontend structuur

```
/public
  index.html              ← Enige HTML-pagina (SPA shell)
  /css
    main.css              ← Globale stijlen, CSS-variabelen, dark theme
    components.css        ← Herbruikbare UI-componenten
  /js
    app.js                ← Router, init, globale state
    /pages                ← Per pagina één JS-bestand
    /components           ← Header, footer, sidebar, modals etc.
    /services             ← API-calls, auth, mail etc.
    /utils                ← Helpers, validators, formatters
  /assets
    /icons
    /images
```

### 3.2 Backend structuur

```
/src
  app.js                      ← Express setup, middleware
  /routes                     ← Per domein een routebestand
  /controllers                ← Business logic per domein
  /middleware                 ← Auth, roles, validation
  /models                     ← DB-queries (geen ORM, raw SQL)
  /services
    mail.service.js           ← Microsoft Graph integratie
    auth.service.js           ← JWT, hashing, tokens
    plattegrond.service.js    ← Automatische plaatsingslogica
    score.service.js          ← Normalisatie en wegingsberekening
    qr.service.js             ← QR-code generatie en validatie
  /config
    db.js                     ← MySQL connectie
    graph.js                  ← MS Graph config
  /utils
```

### 3.3 Database

- MySQL / MariaDB
- Geen ORM — raw SQL via `mysql2` package
- Migraties beheerd via versienummers in `/db/migrations/`
- Seed-data in `/db/seeds/`

### 3.4 SPA Routering

- Geen framework-router — eigen lichtgewicht hash-router (`#/pagina`)
- Elke pagina is een JS-module met `render()` en optioneel `onMount()` / `onDestroy()`
- Layout (header, sidebar, footer) blijft staan; alleen `<main id="content">` wordt vervangen
- Pagina's die afwijken van het standaard layout worden **altijd in overleg** besloten en gedocumenteerd in sectie 10

---

## 4. UI / Styling

### 4.1 Design principes
- Geïnspireerd op **MudBlazor** (Material Design, kaarten, elevation, ripple)
- Dark mode als standaard; CSS-variabelen maken theme-switching mogelijk
- Volledig **responsive** (mobile-first)
- Geen CSS-framework — eigen utility classes + component CSS

### 4.2 Layout
```
┌─────────────────────────────────────┐
│              HEADER                 │
├──────────┬──────────────────────────┤
│          │                          │
│ SIDEBAR  │       CONTENT            │
│(collapse)│                          │
│          │                          │
├──────────┴──────────────────────────┤
│              FOOTER                 │
│        Developed by CHUNKK          │
└─────────────────────────────────────┘
```

- **Header**: logo, app naam "RSW Portaal", gebruikersmenu, notificatie-icoon
- **Sidebar**: navigatiemenu, collapsable (icoon-only modus op mobiel)
- **Content**: dynamisch geladen pagina-inhoud
- **Footer**: copyright + "Developed by CHUNKK"

### 4.3 CSS-variabelen (dark theme)
```css
:root {
  --color-bg:           #1a1a2e;
  --color-surface:      #16213e;
  --color-surface-alt:  #0f3460;
  --color-primary:      #e94560;
  --color-primary-dark: #c73652;
  --color-text:         #eaeaea;
  --color-text-muted:   #9e9e9e;
  --color-border:       #2a2a4a;
  --color-success:      #4caf50;
  --color-warning:      #ff9800;
  --color-error:        #f44336;
  --color-info:         #2196f3;
  --radius-sm:          4px;
  --radius-md:          8px;
  --radius-lg:          16px;
  --shadow-sm:          0 2px 4px rgba(0,0,0,0.3);
  --shadow-md:          0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg:          0 8px 24px rgba(0,0,0,0.5);
}
```

---

## 5. Authenticatie & Autorisatie

### 5.1 Login systeem
- Eigen e-mail + wachtwoord (geen SSO)
- Wachtwoorden gehasht met **bcrypt** (rounds: 12)
- JWT: access token (15 min) + refresh token (7 dagen, opgeslagen in httpOnly cookie)
- E-mailverificatie verplicht bij registratie (token via Microsoft Graph)
- Wachtwoord reset via e-maillink (token geldig 1 uur)

### 5.2 Rollen & rechten

| Rol            | Code             | Omschrijving                                                            |
|----------------|------------------|-------------------------------------------------------------------------|
| Admin          | `admin`          | Volledige toegang, beheert gebruikers, verenigingen, groepen, edities   |
| Organisator    | `organisator`    | Beheert editie-instellingen, plattegrond, jury-indeling, publicatie     |
| Leiding        | `leiding`        | Schrijft patrouilles in namens een groep (gekoppeld door admin)         |
| Vrijwilliger   | `vrijwilliger`   | Schrijft zichzelf in, geeft taakvorkeur op                              |
| Jury           | `jury`           | Voert scores in voor toegewezen subkamp + categorie                     |
| Spelbegeleider | `spelbegeleider` | Beheert een categorie, ziet alle scores van alle patrouilles daarin     |
| Bezoeker       | `bezoeker`       | Geen login vereist — ziet publieke pagina's                             |

- Rollen worden opgeslagen per gebruiker in de database
- Middleware `requireRole(...roles)` beschermt routes
- Frontend verbergt UI-elementen op basis van rol (maar backend valideert altijd)
- Admin koppelt gebruiker aan een groep (voor leiding-rol)
- Organisator wijst spelbegeleider toe aan een categorie per editie

---

## 6. Microsoft Graph — E-mail

### 6.1 Configuratie
- App Registration in Azure Portal (client credentials flow)
- Variabelen in `.env`: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_SENDER_EMAIL`
- Verzending via `/v1.0/users/{sender}/sendMail`

### 6.2 E-mail triggers

| Trigger                               | Ontvanger              |
|---------------------------------------|------------------------|
| Registratie verificatie               | Nieuwe gebruiker       |
| Wachtwoord reset                      | Gebruiker              |
| Bevestiging groepsinschrijving        | Leiding                |
| Bevestiging vrijwilliger inschrijving | Vrijwilliger           |
| Wijziging inschrijving                | Leiding / vrijwilliger |
| Herinnering evenement                 | Alle ingeschrevenen    |
| Uitslagen beschikbaar                 | Alle ingeschrevenen    |

### 6.3 E-mail templates
- HTML-templates in `/src/templates/mail/`
- Nederlandse tekst, RSW-huisstijl
- Variabelen via template literals

---

## 7. Domeinmodel & Datastructuur

### 7.1 Kernentiteiten

```
Editie (jaarlijks evenement)
  ├── Plattegrond (grid tot 30x30, vrije vorm)
  │     ├── GridCellen (type: onbruikbaar | wedstrijd | HQ)
  │     └── Subkampen
  │           ├── HQ-cel (exact 1 per subkamp)
  │           ├── Wedstrijdcellen (6-10 per subkamp)
  │           └── Patrouilles (toegewezen aan subkamp + cel)
  ├── Categorieën (snapshot van globale templates)
  │     ├── Tijdvenster (start- en eindtijd)
  │     ├── Wegingspercentage (alle categorieën samen = 100%)
  │     ├── Subcategorieën
  │     │     └── Criteria (type + wegingsfactor)
  │     └── Spelbegeleiders (toegewezen gebruikers)
  ├── Juryindeling (2 juryleden per subkamp + categorie)
  └── Inschrijfregels (snapshot deelnemersvoorwaarden)

Vereniging
  └── Groepen
        └── Patrouilles (per editie ingeschreven)

Categorie-template (globaal, herbruikbaar)
  ├── Subcategorieën
  │     └── Criteria
  └── Wordt als snapshot gekopieerd naar editie

Gebruiker
  ├── Rol
  ├── Groepskoppeling (voor leiding-rol, beheerd door admin)
  └── Categorie-toewijzing (voor spelbegeleider-rol, per editie)
```

### 7.2 Editie-snapshot principe
- Globale configuratie (categorie-templates, deelnemersvoorwaarden) is bewerkbaar door admin
- Bij aanmaak van een editie wordt een **snapshot** gemaakt van de actieve configuratie
- Historische edities tonen altijd hun eigen snapshot — wijzigingen raken oude edities nooit

### 7.3 Deelnemersvoorwaarden (configureerbaar, snapshot per editie)
- Minimale en maximale leeftijd per patrouille
- Minimum en maximum aantal scouts per patrouille
- Leeftijdsverdeling: bijv. "een groep van meer dan X scouts mag maximaal Y scouts hebben boven leeftijd Z"
- Maximum aantal deelnemende groepen per editie (max. 36)
- Validatie bij inschrijving op zowel frontend als backend

### 7.4 Patrouillenummers
- Handmatig toegewezen door organisator
- Jury en spelbegeleiders zien **alleen nummers** (geen groeps- of scoutnamen) om bias te voorkomen

### 7.5 Plattegrond & automatische plaatsing

#### Grid
- Vrije vorm op een rechthoekig raster (max. 30×30 cellen)
- Organisator markeert cellen als: **onbruikbaar** (bos, water, etc.), **HQ** of **wedstrijd**
- Subkampen worden door organisator gepositioneerd: elk subkamp heeft 1 HQ-cel en 6–10 wedstrijdcellen
- Groepen/verenigingen kunnen gekoppeld worden aan een subkamp; ook hier geldt maximale onderlinge afstand

#### Automatische plaatsingslogica
- Doel: patrouilles zo ver mogelijk spreiden op basis van herkomst
- **Prioriteit 1 (zwaarst)**: patrouilles uit dezelfde **groep** zo ver mogelijk uit elkaar
- **Prioriteit 2**: patrouilles uit dezelfde **vereniging** zo ver mogelijk uit elkaar
- Algoritme: nader te kiezen — gesimuleerde uitgloeien of greedy met afstandsmatrix (zie backlog)
- Afstandsmeting: Manhattan-afstand op de grid (|x1-x2| + |y1-y2|)
- Resultaat wordt visueel getoond op de plattegrond
- Handmatige aanpassing altijd mogelijk na automatische plaatsing

### 7.6 Categorieën, subcategorieën & criteria

#### Structuur
```
Categorie
  ├── Naam
  ├── Tijdvenster (starttijd – eindtijd)
  ├── Wegingspercentage (alle categorieën samen = 100%)
  └── Subcategorieën
        ├── Naam
        └── Criteria
              ├── Naam
              ├── Invoertype: getal | checkbox | opties | tekst | tijdmeting
              └── Wegingsfactor (binnen de categorie, relatief)
```

#### Invoertypes criteria

| Type         | Beschrijving                                       |
|--------------|----------------------------------------------------|
| `getal`      | Numerieke waarde binnen instelbaar bereik (min–max)|
| `checkbox`   | Ja = max score / Nee = 0                           |
| `opties`     | Keuze uit instelbare lijst; elke optie heeft puntwaarde |
| `tekst`      | Vrije opmerking (telt niet mee in score)           |
| `tijdmeting` | Stopwatch-invoer (mm:ss); lager = beter (instelbaar per criterium) |

#### Templates
- Categorieën worden globaal beheerd als herbruikbare templates door admin
- Per editie worden templates als snapshot gekopieerd en zijn daarna onafhankelijk aanpasbaar

### 7.7 Scoreberekening

```
Stap 1 — Normalisatie per criterium:
  criterium_score% = (ruwe_score - min) / (max - min) × 100

Stap 2 — Gewogen score per categorie:
  categorie_score = Σ (criterium_score% × criterium_wegingsfactor)
  → genormaliseerd naar 0–100%

Stap 3 — Eindscore patrouille:
  eindscore = Σ (categorie_score% × categorie_wegingspercentage / 100)
  → alle wegingspercentages samen = 100%
```

- Tijdmeting: omgezet naar seconden; "lager is beter" is per criterium instelbaar
- Checkbox: ja = 100%, nee = 0%
- Opties: puntwaarde per optie instelbaar bij aanmaken criterium
- Vrije tekst (`tekst`-type) telt niet mee in de berekening

### 7.8 Jurering & QR-codes

#### Standaard jurering (ingelogd)
- Alle subkampen doorlopen dezelfde categorieën in dezelfde volgorde
- Per categorie per subkamp: 2 juryleden, invoer via consensus (samen 1 score)
- Scores live zichtbaar voor jury, spelbegeleiders en organisatoren
- Jury ziet alleen anonieme patrouillenummers

#### QR-code jurering (zonder login)
- Organisator genereert QR-codes per categorie (per subkamp/sessie)
- QR-code is **tijdgebonden** (instelbare vervaltijd) én **eenmalig geldig per patrouille/criterium**
- Na scannen: minimale invulpagina zonder login (zie afwijkende layouts sectie 10)
- QR-token bevat (gehasht): `editie_id`, `categorie_id`, `subkamp_id`, `patrouille_id`, `criterium_id` (optioneel), `verlooptijd`
- Token direct ongeldig na gebruik
- **Toekomstige uitbreiding**: QR-code per specifiek criterium + patrouille combinatie (nog nader uit te werken)

#### Spelbegeleider
- Toegewezen aan een categorie per editie (door organisator)
- Ziet live scores van alle patrouilles in eigen categorie (anoniem op nummer)
- Kan categorie openzetten voor jurering
- Kan PDF-scoreformulieren printen voor eigen categorie

---

## 8. Modules / Pagina's

### 8.1 Publiek (geen login)
- Home / landingspagina
- Over de RSW
- Programma (indien gepubliceerd)
- Uitslagen (indien gepubliceerd)

### 8.2 Leiding
- Dashboard
- Inschrijving patrouilles (met validatie deelnemersvoorwaarden)
- Overzicht eigen inschrijvingen
- Historische uitslagen eigen groep

### 8.3 Vrijwilliger
- Dashboard
- Inschrijving + taakvorkeur opgeven
- Overzicht eigen inschrijving

### 8.4 Jury
- Dashboard
- Scoreformulier (gefilterd op eigen subkamp + categorie, anoniem op nummer)
- Live scoretabel (anoniem, alleen nummers)

### 8.5 Spelbegeleider
- Dashboard
- Overzicht toegewezen categorie (tijdvenster, subcategorieën, criteria)
- Live scoretabel alle patrouilles in eigen categorie
- Categorie openzetten voor jurering
- PDF-export scoreformulieren eigen categorie

### 8.6 Organisator
- Dashboard
- Editiebeheer (instellingen, tijdvensters, categorieën)
- **Plattegrond-editor** (grid tekenen, cellen markeren, subkampen positioneren)
- **Automatische plaatsingstool** (patrouilles verdelen + handmatig aanpassen)
- Patrouillenummers toewijzen
- Jury- en spelbegeleider-indeling per categorie
- QR-codes genereren en beheren
- Inschrijvingenoverzicht (groepen + vrijwilligers)
- Scorebeheer & live overzicht alle categorieën
- Uitslagen berekenen & publiceren
- PDF-export scoreformulieren en uitslagen
- Herinneringsmails versturen

### 8.7 Admin
- Alles van organisator
- Gebruikersbeheer (aanmaken, rollen, groepskoppeling)
- Verenigingen & groepen beheren
- Globale categorie-templates beheren
- Globale deelnemersvoorwaarden beheren
- Editiebeheer (aanmaken nieuwe editie, snapshot activeren)

---

## 9. Git Flow

### 9.1 Branch strategie
```
main          ← Productie (Azure) — alleen via release branches
develop       ← Integratie branch — basis voor alle features
feature/*     ← Nieuwe functionaliteit (vanuit develop)
bugfix/*      ← Bug fixes op develop
release/*     ← Release voorbereiding (vanuit develop naar main)
hotfix/*      ← Kritieke fixes op productie (vanuit main naar main + develop)
```

### 9.2 Naamconventies
```
feature/login-systeem
feature/inschrijving-patrouilles
feature/plattegrond-editor
feature/automatische-plaatsing
feature/jury-scoreformulier
feature/qr-code-jurering
feature/categorie-templates
bugfix/email-verificatie-token
release/v1.0.0
hotfix/v1.0.1-fix-auth
```

### 9.3 Workflow regels
- **Nooit direct pushen naar `main` of `develop`**
- Features altijd via Pull Request naar `develop`
- Release branch aanmaken vanuit `develop`, mergen naar `main` én `develop`
- Hotfixes vanuit `main`, mergen naar `main` én `develop`
- Commit messages in het Nederlands of Engels (consistent per project)
- Semantic versioning: `MAJOR.MINOR.PATCH`

### 9.4 Omgevingen
| Branch    | Omgeving  | Hosting          |
|-----------|-----------|------------------|
| `develop` | Test      | Eigen Kubernetes |
| `main`    | Productie | Azure (AKS)      |

---

## 10. Afwijkende Layouts

Standaard gebruikt elke pagina de globale layout (header + sidebar + footer + content). Uitzonderingen worden **altijd in overleg** besloten en hier gedocumenteerd.

| Pagina                  | Afwijking                              | Reden                          | Status              |
|-------------------------|----------------------------------------|--------------------------------|---------------------|
| Login / Registratie     | Geen sidebar, geen footer nav          | Minimale afleiding             | ✅ Akkoord          |
| Scoreformulier (jury)   | Geen sidebar — fullscreen focus        | Optimaal voor mobiel/tablet    | ✅ Akkoord          |
| QR-score invulpagina    | Geen header / sidebar / footer         | Anoniem, minimale interface    | ✅ Akkoord          |
| PDF Print views         | Geen layout (print-only)               | Printoptimalisatie             | ✅ Akkoord          |
| Plattegrond-editor      | Sidebar optioneel verborgen, max canvas| Maximale werkruimte            | 🔲 Nader te bepalen |

> Wil je een pagina toevoegen aan deze lijst? Bespreek dit eerst voordat je de layout aanpast.

---

## 11. Omgevingsvariabelen

Bewaar in `.env` (nooit committen — staat in `.gitignore`):

```env
# App
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=rsw_portaal
DB_USER=rsw_user
DB_PASSWORD=

# JWT
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Microsoft Graph
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
GRAPH_SENDER_EMAIL=

# QR tokens
QR_TOKEN_SECRET=
QR_DEFAULT_EXPIRY_MINUTES=120

# Overig
BCRYPT_ROUNDS=12
```

---

## 12. Codeer conventies

- **Taal**: Nederlands voor domein-specifieke variabelen/comments, Engels voor technische code
- **Modules**: ES Modules (`import/export`) op frontend, CommonJS op backend (of ESM bij Node ≥ 18)
- **Async**: altijd `async/await`, geen `.then()` chains
- **Error handling**: centrale Express error middleware, eigen `AppError` klasse
- **Validatie**: server-side altijd, client-side als UX-laag
- **Geen lange bestanden**: max ~200 regels per bestand — splits op als het groeit
- **Comments**: schrijf waarom, niet wat

---

## 13. Docker & Kubernetes

- `Dockerfile` voor frontend (nginx) en backend (node)
- `docker-compose.yml` voor lokale ontwikkeling (app + db)
- Kubernetes manifests in `/k8s/`
  - `deployment.yaml`, `service.yaml`, `ingress.yaml`, `configmap.yaml`, `secret.yaml`
- Aparte config voor test (eigen cluster) en productie (Azure AKS)
- Secrets via Kubernetes Secrets (niet in repo)

---

## 14. Nog te beslissen / backlog

- [ ] Kleurenpalet definitief vaststellen (voorstel in sectie 4.3)
- [ ] Logo RSW De Langstraat aanleveren
- [ ] Azure App Registration aanmaken voor Microsoft Graph
- [ ] Domeinnaam bepalen voor productie
- [ ] E-mailtemplates ontwerpen
- [ ] Algoritme automatische plaatsing kiezen: gesimuleerde uitgloeien vs. greedy afstandsmatrix
- [ ] Besluit layout plattegrond-editor (zie sectie 10)
- [ ] QR-code per specifiek criterium + patrouille verder uitwerken
- [ ] Bepalen of "lager is beter" bij tijdmeting altijd geldt of per criterium instelbaar is
- [ ] Publieke programma-pagina structuur bepalen
