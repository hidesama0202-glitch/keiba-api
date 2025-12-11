const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Render で動く最強設定（executablePath不要）
async function launchBrowser() {
  return await puppeteer.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ],
    headless: true
  });
}

async function fetchRaceListForDate(dateStr) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto('https://www.jra.go.jp/JRADB/accessS.html', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  const races = await page.evaluate((date) => {
    const out = [];
    const anchors = Array.from(document.querySelectorAll('a'));
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const txt = a.innerText || '';
      if (href.includes(date.replace(/-/g, '')) || txt.includes(date)) {
        out.push({ text: txt.trim(), href });
      }
    }
    return out.slice(0, 200);
  }, dateStr);

  await browser.close();
  return races;
}

async function fetchRaceDetail(raceUrl) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  let url = raceUrl;
  if (!url.startsWith('http')) {
    url = new URL(raceUrl, 'https://www.jra.go.jp/JRADB/accessS.html').href;
  }

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  const data = await page.evaluate(() => {
    const getText = (el) => (el ? el.innerText.trim() : '');

    const raceName = getText(document.querySelector('h1')) ||
                     getText(document.querySelector('.race_title')) ||
                     document.title;

    const horses = [];
    const rows = document.querySelectorAll('table tr');
    rows.forEach((tr) => {
      const cols = tr.querySelectorAll('td, th');
      if (cols.length >= 3) {
        const num = cols[0].innerText.trim();
        const name = cols[1].innerText.trim();
        const jockey = cols[2].innerText.trim();
        if (num.match(/^\d+$/) && name) {
          horses.push({ num: Number(num), name, jockey });
        }
      }
    });

    return { raceName, horses };
  });

  await browser.close();
  return data;
}

app.get('/race', async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date query parameter required' });

  try {
    const list = await fetchRaceListForDate(date);
    const out = [];

    for (const item of list.slice(0, 6)) {
      const href = item.href.startsWith('/')
        ? 'https://www.jra.go.jp' + item.href
        : item.href;

      try {
        const detail = await fetchRaceDetail(href);
        out.push({ link: href, sourceText: item.text, detail });
      } catch (e) {
        out.push({ link: href, error: e.message });
      }
    }

    res.json({ date, fetchedAt: new Date().toISOString(), list: out });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    message: 'Keiba API PoC - Japanese Horse Racing Data',
    version: '1.0.0',
    usage: 'GET /race?date=YYYY-MM-DD',
    example: '/race?date=2024-12-08'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Keiba API running on port ${PORT}`);
});

