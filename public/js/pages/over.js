// over.js — Publieke informatiepagina over de RSW

export function render() {
  document.getElementById('content').innerHTML = buildPage();
}

function buildPage() {
  return `
    <div class="page-header mb-24">
      <h1 class="page-title"><span class="material-icons">info</span> Over de RSW</h1>
      <p class="page-subtitle">
        Regionale Scouting Wedstrijden &mdash; Regio De Langstraat
      </p>
    </div>

    <div class="dashboard-grid">

      <div class="card card-accent-primary card-full">
        <div class="card-header">
          <div class="card-title">
            <span class="card-icon"><span class="material-icons">flag</span></span>
            Wat zijn de RSW?
          </div>
        </div>
        <div class="card-body">
          <p style="margin-bottom:12px;">
            De <strong>Regionale Scouting Wedstrijden</strong> (RSW) zijn het jaarlijkse
            evenement waarbij scoutinggroepen uit <strong>regio De Langstraat</strong> het
            tegen elkaar opnemen in diverse categorieën en activiteiten. Het evenement brengt
            scouts, leiding, vrijwilligers en juryleden samen voor een dag vol uitdaging,
            samenwerking en scouting spirit.
          </p>
          <p>
            Elke deelnemende groep stuurt één of meerdere <strong>patrouilles</strong> af.
            Een patrouille doorloopt gedurende de dag alle categorieën en wordt daarin
            beoordeeld door een onafhankelijke jury.
          </p>
        </div>
      </div>

      <div class="card card-accent-info">
        <div class="card-header">
          <div class="card-title">
            <span class="card-icon"><span class="material-icons">groups</span></span>
            Deelname
          </div>
        </div>
        <div class="card-body">
          <ul style="padding-left:18px;line-height:1.9;color:var(--color-text-muted);">
            <li>Open voor scoutinggroepen uit regio De Langstraat</li>
            <li>Maximum van <strong>36 groepen</strong> per editie</li>
            <li>Patrouilles worden gevormd door scouts binnen een bepaalde leeftijdscategorie</li>
            <li>Inschrijving verloopt via dit portaal door de leiding van de groep</li>
            <li>Deelnemersvoorwaarden (leeftijd, groepsgrootte) worden per editie vastgesteld</li>
          </ul>
        </div>
      </div>

      <div class="card card-accent-success">
        <div class="card-header">
          <div class="card-title">
            <span class="card-icon"><span class="material-icons">category</span></span>
            Categorieën &amp; jurering
          </div>
        </div>
        <div class="card-body">
          <p style="margin-bottom:12px;">
            Het evenement bestaat uit meerdere <strong>categorieën</strong>, elk met eigen
            subcategorieën en criteria. Alle patrouilles doorlopen dezelfde categorieën in
            dezelfde volgorde.
          </p>
          <ul style="padding-left:18px;line-height:1.9;color:var(--color-text-muted);">
            <li>Per categorie zijn twee juryleden aanwezig</li>
            <li>Jury werkt met <strong>anonieme patrouillenummers</strong> — geen namen of groepen zichtbaar</li>
            <li>Scores worden live verwerkt en gewogen op basis van categorie-wegingen</li>
            <li>Elke categorie telt mee voor een vastgesteld percentage van de eindscore</li>
          </ul>
        </div>
      </div>

      <div class="card card-accent-warning">
        <div class="card-header">
          <div class="card-title">
            <span class="card-icon"><span class="material-icons">leaderboard</span></span>
            Scoreberekening
          </div>
        </div>
        <div class="card-body">
          <p style="margin-bottom:12px;">
            De uiteindelijke ranglijst wordt bepaald via een gewogen scoringsysteem:
          </p>
          <ol style="padding-left:18px;line-height:2;color:var(--color-text-muted);">
            <li>Per criterium wordt de ruwe score genormaliseerd naar 0–100%</li>
            <li>Gewogen scores per criterium worden samengevat tot een categorie-score</li>
            <li>Categoriescores worden gewogen naar de eindscore van de patrouille</li>
          </ol>
          <p style="margin-top:12px;font-size:.88rem;color:var(--color-text-muted);">
            Uitslagen worden pas gepubliceerd na afloop van het evenement.
          </p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="card-icon"><span class="material-icons">volunteer_activism</span></span>
            Vrijwilligers
          </div>
        </div>
        <div class="card-body">
          <p style="margin-bottom:12px;">
            De RSW draait op vrijwilligers. Je kunt je aanmelden als:
          </p>
          <ul style="padding-left:18px;line-height:1.9;color:var(--color-text-muted);">
            <li><strong>Jurylid</strong> — beoordeel patrouilles in een categorie</li>
            <li><strong>Spelbegeleider</strong> — begeleid en coördineer een categorie</li>
            <li><strong>Vrijwilliger</strong> — ondersteun de organisatie op diverse taken</li>
          </ul>
        </div>
        <div class="card-footer">
          <a href="/registreren?rol=vrijwilliger" class="btn btn-primary btn-sm">Aanmelden als vrijwilliger</a>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="card-icon"><span class="material-icons">push_pin</span></span>
            Dit portaal
          </div>
        </div>
        <div class="card-body">
          <p style="margin-bottom:12px;">
            Het <strong>RSW Portaal</strong> is het centrale systeem voor alle betrokkenen:
          </p>
          <ul style="padding-left:18px;line-height:1.9;color:var(--color-text-muted);">
            <li>Leiding schrijft patrouilles in en volgt de uitslagen</li>
            <li>Vrijwilligers melden zich aan en geven taakvorkeur op</li>
            <li>Juryleden voeren scores in op hun toegewezen categorie</li>
            <li>Organisatoren beheren de plattegrond, indeling en publicatie</li>
          </ul>
          <p style="margin-top:12px;font-size:.85rem;color:var(--color-text-muted);">
            Ontwikkeld door <strong>CHUNKK</strong> voor regio De Langstraat.
          </p>
        </div>
        <div class="card-footer">
          <a href="/registreren" class="btn btn-ghost btn-sm">Account aanmaken</a>
          <a href="/login" class="btn btn-ghost btn-sm">Inloggen</a>
        </div>
      </div>

    </div>
  `;
}
