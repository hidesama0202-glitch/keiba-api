const fs = require("fs");
const path = require("path");

async function findChrome() {
  const base = "/opt/render/.cache/puppeteer/chrome";

  // キャッシュフォルダ自体が無いなら Chrome 未インストール状態
  if (!fs.existsSync(base)) {
    console.log("Chrome base directory not found yet:", base);
    return null;
  }

  // 中のバージョン一覧を取得
  const versions = fs.readdirSync(base).filter(v => v.includes("linux"));
  if (versions.length === 0) {
    console.log("Chrome version directory not found in:", base);
    return null;
  }

  // 最新バージョンを使う
  const latest = versions.sort().reverse()[0];
  const exe = path.join(base, latest, "chrome-linux64", "chrome");

  if (!fs.existsSync(exe)) {
    console.log("Chrome executable not found at:", exe);
    return null;
  }

  return exe;
}

async function launchBrowser() {
  const chromePath = await findChrome();

  return await puppeteer.launch({
    executablePath: chromePath || undefined, // ← 見つからなくても落ちない
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--single-process",
      "--no-zygote",
    ],
  });
}

