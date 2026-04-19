const express = require('express');
const app = express();
app.use(express.json({ limit: '2mb' }));

app.post('/', async (req, res) => {
  try {
    const { url, headers, payload } = req.body;
    if (!url || !headers) {
      return res.status(400).json({ error: 'Missing url or headers' });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
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
