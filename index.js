const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

async function launchBrowser() {
  return await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--single-process',
      '--no-zygote'
    ],
    headless: 'new'
  });
}

async function fetchRaceListForDate(dateStr) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto('https://www.jra.go.jp/JRADB/accessS.html', { waitUntil: 'networkidle2', timeout: 30000 });

  const races = await page.evaluate((date) => {
    const out = [];
    const anchors = Array.from(document.querySelectorAll('a'));
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      const txt = a.innerText || '';
      if (href.includes(date.replace(/-/g, '')) || txt.includes(date)) {
        out.push({ text: txt.trim(), href: href });
      }
    }
    if (out.length === 0) {
      for (const a of anchors) {
        const txt = a.innerText || '';
        if (txt.match(/開催|レース|R/)) {
          out.push({ text: txt.trim(), href: a.getAttribute('href') || '' });
        }
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
  if (url && !url.startsWith('http')) {
    url = new URL(raceUrl, 'https://www.jra.go.jp/JRADB/accessS.html').href;
  }
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
  }

  const data = await page.evaluate(() => {
    const getText = (el) => (el ? el.innerText.trim() : '');
    const raceNameEl = document.querySelector('h1') || document.querySelector('.race_title') || document.querySelector('.title');
    const raceName = getText(raceNameEl) || document.title || '';

    const horses = [];
    const rows = document.querySelectorAll('table tr');
    rows.forEach((tr) => {
      const cols = tr.querySelectorAll('td, th');
      if (cols.length >= 3) {
        const first = cols[0].innerText.trim();
        const second = cols[1].innerText.trim();
        if (first.match(/^\d+$/) && second.length > 0 && second.match(/[^\d\s]/)) {
          const num = parseInt(first, 10);
          const name = second;
          const jockey = cols[2].innerText.trim() || '';
          horses.push({ num, name, jockey });
        }
      }
    });

    if (horses.length === 0) {
      const lis = document.querySelectorAll('li');
      lis.forEach((li) => {
        const txt = li.innerText.trim();
        const m = txt.match(/^(\d+)\s+(.+?)\s+(\S+)/);
        if (m) {
          horses.push({ num: parseInt(m[1], 10), name: m[2], jockey: m[3] });
        }
      });
    }

    return { raceName, horses };
  });

  await browser.close();
  return data;
}

app.get('/race', async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: 'date query parameter required, format YYYY-MM-DD' });

  try {
    const list = await fetchRaceListForDate(date);
    const out = [];

    const toFetch = list.slice(0, 6);

    for (const item of toFetch) {
      if (!item.href) {
        out.push({ sourceText: item.text, note: 'no href found' });
        continue;
      }
      let href = item.href;
      if (href && href.startsWith('/')) href = 'https://www.jra.go.jp' + href;
      try {
        const detail = await fetchRaceDetail(href);
        out.push({ link: href, sourceText: item.text, detail });
      } catch (e) {
        out.push({ link: href, error: e.message });
      }
    }

    return res.json({ date, fetchedAt: new Date().toISOString(), list: out });
  } catch (err) {
    console.error('error', err);
    return res.status(500).json({ error: err.message });
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
