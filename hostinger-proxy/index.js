const express = require('express');
const crypto = require('crypto');
const app = express();
app.use(express.json({ limit: '2mb' }));

const AES_KEY = process.env.PAYSPRINT_AES_KEY || '';
const AES_IV  = process.env.PAYSPRINT_AES_IV  || '';

/**
 * Attempts to AES-128-CBC decrypt a base64 string.
 * Returns the parsed JSON object on success, or null on failure.
 */
function tryDecryptPayload(base64String) {
  try {
    if (!AES_KEY || !AES_IV) return null;
    const key = Buffer.from(AES_KEY.slice(0, 16), 'utf-8');
    const iv  = Buffer.from(AES_IV.slice(0, 16),  'utf-8');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decrypted = decipher.update(base64String, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (_) {
    return null;
  }
}

/**
 * All PaySprint endpoints expect plain JSON. If any request arrives with the
 * encrypted wrapper { data: "base64..." }, decrypt it before forwarding.
 * This handles both AEPS and recharge endpoints uniformly.
 */
function resolvePayload(url, payload) {
  if (!payload || typeof payload !== 'object') return payload;

  const keys = Object.keys(payload);
  if (keys.length === 1 && keys[0] === 'data' && typeof payload.data === 'string') {
    const decrypted = tryDecryptPayload(payload.data);
    if (decrypted) {
      console.log('[proxy] Encrypted payload detected for', url, '— decrypted before forwarding');
      return decrypted;
    }
    console.warn('[proxy] Payload looks encrypted but decryption failed for', url, '— forwarding as-is');
  }

  return payload;
}

app.post('/', async (req, res) => {
  try {
    const { url, headers, payload } = req.body;
    if (!url || !headers) {
      return res.status(400).json({ error: 'Missing url or headers' });
    }

    const finalPayload = resolvePayload(url, payload);

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(finalPayload),
    });

    const body = await response.text();
    res.json({ status: response.status, body: body });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/ip', async (req, res) => {
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const data = await r.json();
    res.json({ outbound_ip: data.ip });
  } catch (error) {
    res.json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Proxy running on port ' + PORT));
