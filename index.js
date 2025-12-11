const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

async function launchBrowser() {
  return await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
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
    const result = [];
    const anchors = [...document.querySelectorAll('a')];

    for (const a of anchors) {
      const href = a.href || "";
      const text = a.innerText || "";

      if (href.includes(date.replace(/-/g, '')) || text.includes(date)) {
        result.push({ text, href });
      }
    }

    return result.slice(0, 20);
  }, dateStr);

  await browser.close();
  return races;
}

async function fetchRaceDetail(url) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

  const data = await page.evaluate(() => {
    const title = document.querySelector('h1')?.innerText?.trim() || document.title;

    const horses = [];
    const rows = document.querySelectorAll("table tr");

    rows.forEach(row => {
      const cols = row.querySelectorAll("td");
      if (cols.length >= 3) {
        const num = cols[0].innerText.trim();
        const name = cols[1].innerText.trim();
        const jockey = cols[2].innerText.trim();

        if (/^\d+$/.test(num)) {
          horses.push({ num: Number(num), name, jockey });
        }
      }
    });

    return { title, horses };
  });

  await browser.close();
  return data;
}

app.get("/race", async (req, res) => {
  const date = req.query.date;
  if (!date) return res.status(400).json({ error: "date=YYYY-MM-DD が必要です" });

  try {
    const list = await fetchRaceListForDate(date);

    const details = [];
    for (const r of list.slice(0, 5)) {
      try {
        const detail = await fetchRaceDetail(r.href);
        details.push({ ...r, detail });
      } catch (e) {
        details.push({ ...r, error: e.message });
      }
    }

    res.json({ date, count: details.length, details });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "ok", usage: "/race?date=YYYY-MM-DD" });
});

app.listen(PORT, () => {
  console.log(`Keiba API running on port ${PORT}`);
});
