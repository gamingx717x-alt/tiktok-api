const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(express.json({ limit: '10mb' }));

let browser;

// Launch Puppeteer once at startup
(async () => {
browser = await puppeteer.launch({
  executablePath: await chromium.executablePath() || '/usr/bin/google-chrome',
  headless: true,
  args: [
    ...chromium.args,
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--single-process',
    '--no-zygote'
  ]
});
// Helper: Check one username
async function checkUsername(username, page) {
  try {
    await page.goto(`https://www.tiktok.com/@${username}`, {
      waitUntil: 'networkidle2',
      timeout: 10000,
    });

    const notFoundText = await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('p')).find(el =>
        el.innerText.toLowerCase().includes('couldn’t find this account') ||
        el.innerText.toLowerCase().includes('this account doesn’t exist')
      );
      return p ? p.innerText : null;
    });

    return { username, available: !!notFoundText };
  } catch (err) {
    return { username, available: false, error: 'Rate limited or timeout' };
  }
}

// === SINGLE CHECK ===
app.post('/check', async (req, res) => {
  const { username } = req.body;
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Invalid username' });
  }

  try {
    const page = await browser.newPage();
    const result = await Promise.race([
      checkUsername(username.trim(), page),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 45000)),
    ]);
    await page.close();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === BULK CHECK ===
app.post('/bulk-check', async (req, res) => {
  let { usernames } = req.body;
  if (!Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'Send array of usernames' });
  }

  usernames = usernames.slice(0, 100).map(u => u.toString().trim()).filter(Boolean);
  if (usernames.length === 0) {
    return res.status(400).json({ error: 'No valid usernames' });
  }

  try {
    const page = await browser.newPage();
    const results = [];

    for (const username of usernames) {
      const result = await Promise.race([
        checkUsername(username, page),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), 23000)),
      ]);
      results.push(result);
      await new Promise(r => setTimeout(r, 300)); // Delay to avoid detection
    }

    await page.close();
    res.json({ count: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'TikTok Username Checker API Live', endpoints: ['/check', '/bulk-check'] });
});

app.get('/healthz', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API running on port ${PORT}`);
});


