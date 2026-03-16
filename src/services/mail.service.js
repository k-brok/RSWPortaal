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

async function stuurWelkomMail(aan, naam, tijdelijkWachtwoord) {
  const link = `${APP_URL}/#/login`;
  await stuurMail({
    aan,
    onderwerp: 'Welkom bij RSW Portaal — jouw account is aangemaakt',
    html: baseTemplate(`
      <p>Hallo <strong>${naam}</strong>,</p>
      <p>Er is een account voor je aangemaakt in het RSW Portaal.</p>
      <table style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
        <tr><td style="color:#9e9e9e;padding:4px 12px 4px 0">E-mail</td><td><strong>${aan}</strong></td></tr>
        <tr><td style="color:#9e9e9e;padding:4px 12px 4px 0">Wachtwoord</td><td><strong>${tijdelijkWachtwoord}</strong></td></tr>
      </table>
      <a href="${link}" style="display:inline-block;background:#e94560;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">Inloggen</a>
      <p style="color:#9e9e9e;font-size:13px">Wijzig je wachtwoord na de eerste keer inloggen.</p>`),
  });
}

module.exports = {
  stuurMail, stuurVerificatieMail, stuurWachtwoordResetMail,
  stuurEmailWijzigMail, stuurWelkomMail,
};
