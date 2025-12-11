async function getChromePath() {
  // puppeteer のキャッシュディレクトリ
  const base = "/opt/render/.cache/puppeteer/chrome";

  const fs = require("fs");
  const path = require("path");

  if (!fs.existsSync(base)) {
    throw new Error("Chrome directory not found: " + base);
  }

  // 中にあるバージョンディレクトリを探す
  const versions = fs.readdirSync(base);
  if (!versions.length) {
    throw new Error("No Chrome versions found inside: " + base);
  }

  // 最新バージョンを使用
  const latest = versions.sort().reverse()[0];

  const exe = path.join(base, latest, "chrome-linux64", "chrome");

  if (!fs.existsSync(exe)) {
    throw new Error("Chrome executable not found at: " + exe);
  }

  return exe;
}

async function launchBrowser() {
  const executablePath = await getChromePath();

  return await puppeteer.launch({
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-software-rasterizer",
      "--no-zygote",
      "--single-process"
    ],
    headless: true,
  });
}

