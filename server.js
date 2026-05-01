const { chromium } = require("playwright");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const EXPO_PUSH_TOKEN = "ExponentPushToken[jl1SNnGKIQlOUd-J98BM8u]";

let leads = [];

const seenTexts = new Set();
let isScanning = false;

const keywords = [
  "架網站",
  "做網站",
  "電商網站",
  "官網",
  "網站設計",
  "找人做網站",
  "一頁式網站",
  "預約系統",
  "後台管理",
  "系統",
  "網站架設",
  "系統架設",
  "網站",
  "架設網站",
];

function matchedKeywords(text) {
  return keywords.filter((word) => text.includes(word));
}

async function sendPush(text, matched) {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: EXPO_PUSH_TOKEN,
      title: "🔥 Threads 商機來了",
      body: `命中：${matched.join("、")}\n${text}`,
      data: {
        source: "threads-test",
        matched,
      },
    }),
  });

  return res.json();
}

app.post("/check", async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "缺少 text" });
  }

  const cleanText = text.trim();

  if (seenTexts.has(cleanText)) {
     return res.json({
      matched: false,
      message: "重複貼文，已略過",
     });
  }

const matched = matchedKeywords(cleanText);

  if (matched.length > 0) {
    const lead = {
      id: Date.now(),
      text,
      matched,
      createdAt: new Date().toISOString(),
    };

    seenTexts.add(cleanText);

    leads.unshift(cleanText);

    const pushResult = await sendPush(text, matched);

    return res.json({
      matched: true,
      message: "命中關鍵字，已發送推播",
      lead,
      pushResult,
    });
  }

  res.json({
    matched: false,
    message: "沒有命中關鍵字",
  });
});

app.get("/leads", (req, res) => {
  res.json(leads);
});

app.get("/dashboard", (req, res) => {
  const html = `
  <html>
    <head>
      <meta charset="UTF-8" />
      <title>Threads 商機後台</title>
      <style>
        body { font-family: Arial, sans-serif; background:#111827; color:white; padding:30px; }
        .card { background:#1f2937; padding:20px; border-radius:12px; margin-bottom:16px; }
        .tag { background:#2563eb; padding:4px 8px; border-radius:999px; margin-right:6px; font-size:12px; }
        .time { color:#9ca3af; font-size:12px; margin-top:8px; }
      </style>
    </head>
    <body>
      <h1>🔥 Threads 商機後台</h1>
      <div id="list">載入中...</div>

      <script>
        async function loadLeads() {
          const res = await fetch("/leads");
          const leads = await res.json();

          document.getElementById("list").innerHTML = leads.length
            ? leads.map(lead => \`
              <div class="card">
                <div>\${lead.text}</div>
                <div style="margin-top:12px;">
                  \${lead.matched.map(k => \`<span class="tag">\${k}</span>\`).join("")}
                </div>
                <div class="time">\${new Date(lead.createdAt).toLocaleString()}</div>
              </div>
            \`).join("")
            : "目前沒有商機";
        }

        loadLeads();
        setInterval(loadLeads, 3000);
      </script>
    </body>
  </html>
  `;

  res.send(html);
});

app.get("/", (req, res) => {
  res.send("Threads Lead Backend is running");
});

app.get("/test", async (req, res) => {
  const text = "我要做電商網站";
  const matched = matchedKeywords(text);

  if (matched.length > 0) {
    const pushResult = await sendPush(text, matched);
    return res.json({ ok: true, pushResult });
  }

  res.json({ ok: false });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");

  scanThreads();
  setInterval(scanThreads, 180000);
});

async function fetchThreadsByKeyword(keyword) {
  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
    });

    const page = await browser.newPage();

    const url = `https://www.threads.net/search?q=${encodeURIComponent(keyword)}`;

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    await page.waitForTimeout(6000);

    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(1500);
    }

    const posts = await page.$$eval("div[role='article']", (elements) =>
      elements
        .map((el) => el.innerText)
        .filter((text) => text && text.length > 10)
    );

    return posts;
  } catch (err) {
    console.error(`❌ 搜尋 ${keyword} 失敗：`, err.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function scanThreads() {
  if (isScanning) {
    console.log("⏳ 上一輪還沒跑完，略過這輪");
    return;
  }

  isScanning = true;

  const searchKeywords = [
    "做網站",
    "架網站",
    "電商網站",
    "網站設計",
    "找人做網站",
    "一頁式網站",
    "網頁設計",
    "網站架設",
    "想做網站",
    "需要網站",
    "網站",
    "官網",
  ];

  try {
    for (const keyword of searchKeywords) {
      console.log("🔍 搜尋中：", keyword);

      const posts = await fetchThreadsByKeyword(keyword);

      console.log(`找到 ${posts.length} 筆`);

      for (const text of posts) {
        await fetch("http://localhost:3000/check", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (err) {
    console.error("❌ scanThreads 錯誤：", err.message);
  } finally {
    isScanning = false;
  }
}