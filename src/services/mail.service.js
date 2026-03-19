// src/services/mail.service.js — E-mail via Microsoft Graph API

const https = require('https');

const TENANT_ID    = process.env.GRAPH_TENANT_ID;
const CLIENT_ID    = process.env.GRAPH_CLIENT_ID;
const CLIENT_SECRET = process.env.GRAPH_CLIENT_SECRET;
const SENDER_EMAIL = process.env.GRAPH_SENDER_EMAIL;
const APP_URL      = process.env.APP_URL || 'http://localhost:3000';

// Haal een OAuth2 access token op via client credentials flow
async function getAccessToken() {
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default',
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path:     `/${TENANT_ID}/oauth2/v2.0/token`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const json = JSON.parse(data);
        if (json.access_token) resolve(json.access_token);
        else reject(new Error(json.error_description || 'Token ophalen mislukt'));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Verstuur een e-mail via Microsoft Graph
async function stuurMail({ aan, onderwerp, html }) {
  // Als Graph niet geconfigureerd is, log alleen in development
  if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET || !SENDER_EMAIL) {
    console.log(`[MAIL MOCK] Aan: ${aan} | Onderwerp: ${onderwerp}`);
    return;
  }

  const token = await getAccessToken();
  const payload = JSON.stringify({
    message: {
      subject:      onderwerp,
      body:         { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: aan } }],
    },
    saveToSentItems: false,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.microsoft.com',
      path:     `/v1.0/users/${SENDER_EMAIL}/sendMail`,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      if (res.statusCode === 202) return resolve();
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => reject(new Error(`Graph fout ${res.statusCode}: ${data}`)));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── E-mail templates ──────────────────────────────────────────────

function baseTemplate(inhoud) {
  return `<!DOCTYPE html><html lang="nl"><body style="font-family:sans-serif;background:#1a1a2e;color:#eaeaea;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#16213e;border-radius:12px;padding:32px;border:1px solid #2a2a4a">
    <h2 style="color:#e94560;margin-top:0">RSW Portaal</h2>
    ${inhoud}
    <hr style="border-color:#2a2a4a;margin:24px 0">
    <p style="font-size:12px;color:#9e9e9e">Regio De Langstraat — Regionale Scouting Wedstrijden</p>
  </div></body></html>`;
}

async function stuurVerificatieMail(aan, naam, token) {
  const link = `${APP_URL}/api/auth/verifieer/${token}`;
  await stuurMail({
    aan,
    onderwerp: 'Bevestig je e-mailadres — RSW Portaal',
    html: baseTemplate(`
      <p>Hallo <strong>${naam}</strong>,</p>
      <p>Bedankt voor je registratie. Klik op de knop hieronder om je e-mailadres te bevestigen.</p>
      <a href="${link}" style="display:inline-block;background:#e94560;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">E-mailadres bevestigen</a>
      <p style="color:#9e9e9e;font-size:13px">Deze link is 24 uur geldig. Heb je je niet geregistreerd? Dan kun je deze mail negeren.</p>`),
  });
}

async function stuurWachtwoordResetMail(aan, naam, token) {
  const link = `${APP_URL}/#/wachtwoord-reset?token=${token}`;
  await stuurMail({
    aan,
    onderwerp: 'Wachtwoord opnieuw instellen — RSW Portaal',
    html: baseTemplate(`
      <p>Hallo <strong>${naam}</strong>,</p>
      <p>We hebben een verzoek ontvangen om je wachtwoord opnieuw in te stellen.</p>
      <a href="${link}" style="display:inline-block;background:#e94560;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Wachtwoord instellen</a>
      <p style="color:#9e9e9e;font-size:13px">Deze link is 1 uur geldig. Heb je dit niet aangevraagd? Dan kun je deze mail negeren.</p>`),
  });
}

async function stuurEmailWijzigMail(aan, naam, token) {
  const link = `${APP_URL}/#/email-bevestigen?token=${token}`;
  await stuurMail({
    aan,
    onderwerp: 'Bevestig je nieuwe e-mailadres — RSW Portaal',
    html: baseTemplate(`
      <p>Hallo <strong>${naam}</strong>,</p>
      <p>Bevestig je nieuwe e-mailadres door op de knop hieronder te klikken.</p>
      <a href="${link}" style="display:inline-block;background:#e94560;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Nieuw e-mailadres bevestigen</a>
      <p style="color:#9e9e9e;font-size:13px">Deze link is 1 uur geldig.</p>`),
  });
}

async function stuurUitnodigingsMail(aan, naam, token) {
  const link = `${APP_URL}/#/uitnodiging?token=${token}`;
  await stuurMail({
    aan,
    onderwerp: 'Welkom bij RSW Portaal — activeer je account',
    html: baseTemplate(`
      <p>Hallo <strong>${naam}</strong>,</p>
      <p>Er is een account voor je aangemaakt in het RSW Portaal. Klik op de knop hieronder om je account te activeren en een eigen wachtwoord in te stellen.</p>
      <a href="${link}" style="display:inline-block;background:#e94560;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Account activeren</a>
      <p style="color:#9e9e9e;font-size:13px">Deze link is 7 dagen geldig. Heb je geen account aangevraagd? Dan kun je deze mail negeren.</p>`),
  });
}


// Notificatie naar organisatoren bij nieuwe aanvraag
async function stuurNieuweAanvraagMail(aan, aanvragerNaam, type, extra) {
  const typeLabel = type === 'leiding' ? 'leiding' : 'vrijwilliger';
  const extraRegel = extra ? `<p><strong>Details:</strong> ${extra}</p>` : '';
  await stuurMail({
    aan,
    onderwerp: `Nieuwe ${typeLabel}-aanvraag — RSW Portaal`,
    html: baseTemplate(`
      <p>Er is een nieuwe aanvraag binnengekomen.</p>
      <p><strong>Naam:</strong> ${aanvragerNaam}</p>
      <p><strong>Type:</strong> ${typeLabel}</p>
      ${extraRegel}
      <a href="${APP_URL}/#/organisator/aanvragen"
         style="display:inline-block;background:#e94560;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
        Aanvraag bekijken
      </a>`),
  });
}

// Bevestiging naar aanvrager: goedgekeurd
async function stuurAanvraagGoedgekeurdMail(aan, naam, rolOfGroep) {
  await stuurMail({
    aan,
    onderwerp: 'Je aanvraag is goedgekeurd — RSW Portaal',
    html: baseTemplate(`
      <p>Hallo <strong>${naam}</strong>,</p>
      <p>Goed nieuws! Je aanvraag is goedgekeurd.</p>
      <p><strong>Toegewezen:</strong> ${rolOfGroep}</p>
      <p>Je kunt nu inloggen en aan de slag.</p>
      <a href="${APP_URL}/#/login"
         style="display:inline-block;background:#e94560;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
        Inloggen
      </a>`),
  });
}

// Notificatie naar aanvrager: afgewezen
async function stuurAanvraagAfgewezenMail(aan, naam, type, reden = null) {
  const redenRegel = reden ? `<p><strong>Reden:</strong> ${reden}</p>` : '';
  await stuurMail({
    aan,
    onderwerp: 'Je aanvraag is niet goedgekeurd — RSW Portaal',
    html: baseTemplate(`
      <p>Hallo <strong>${naam}</strong>,</p>
      <p>Helaas is je aanvraag als <strong>${type}</strong> niet goedgekeurd.</p>
      ${redenRegel}
      <p style="color:#9e9e9e;font-size:13px">Heb je vragen? Neem contact op met de organisatie.</p>`),
  });
}

module.exports = {
  stuurMail, stuurVerificatieMail, stuurWachtwoordResetMail,
  stuurEmailWijzigMail, stuurUitnodigingsMail,
  stuurNieuweAanvraagMail, stuurAanvraagGoedgekeurdMail, stuurAanvraagAfgewezenMail,
};
