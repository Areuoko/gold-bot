export default {
  async fetch(request, env, ctx) {
    // فقط درخواست‌های POST که از طرف پایتون می‌آیند را قبول کن
    if (request.method === "POST") {
      return await handleRequest(request, env);
    }
    return new Response("Waiting for Python Data...", { status: 200 });
  },
};

async function handleRequest(request, env) {
  try {
    // 1. خواندن قیمتی که پایتون فرستاده
    const body = await request.json();
    
    // چک کردن رمز امنیتی (که کسی الکی قیمت نفرستد)
    const secret = request.headers.get("X-Secret-Key");
    if (secret !== env.SECRET_KEY) {
      return new Response("Unauthorized", { status: 403 });
    }

    const marketData = body.market_data; // قیمت و اطلاعات تکنیکال از پایتون

    // 2. دریافت اخبار (اخبار هنوز توسط کلودفلر گرفته می‌شود چون بلاک نیست)
    const newsData = await fetchAllNews();

    // 3. هوش مصنوعی
    const activeModel = await findBestGeminiModel(env.AI_API_KEY);
    const prompt = createPrompt(marketData, newsData);
    const analysis = await askGemini(prompt, env.AI_API_KEY, activeModel);

    // 4. ارسال به تلگرام
    await sendToTelegram(analysis, env);

    return new Response(JSON.stringify({ status: "Success", analysis }), { 
      headers: { "content-type": "application/json" } 
    });

  } catch (error) {
    if (env.TELEGRAM_BOT_TOKEN) {
      await sendToTelegram(`❌ Error: ${error.message}`, env);
    }
    return new Response(error.message, { status: 500 });
  }
}

// --- توابع کمکی ---

async function fetchAllNews() {
  const rssUrl = "https://www.kitco.com/rss/category/commodities/gold";
  try {
    const res = await fetch(rssUrl);
    const text = await res.text();
    const titles = text.match(/<title>(.*?)<\/title>/g) || [];
    return titles.slice(2, 7).map(t => t.replace(/<\/?title>|<!\[CDATA\[|\]\]>/g, "").trim());
  } catch (e) { return ["News fetch failed"]; }
}

async function findBestGeminiModel(apiKey) {
  if (!apiKey) return "gemini-pro";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    const models = data.models || [];
    const best = models.find(m => m.name.includes("flash") && m.supportedGenerationMethods?.includes("generateContent"));
    return best ? best.name.replace("models/", "") : "gemini-pro";
  } catch (e) { return "gemini-pro"; }
}

async function askGemini(prompt, apiKey, modelName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No AI Response";
}

async function sendToTelegram(text, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const cleanText = text.replace(/\*/g, "").replace(/_/g, "-");
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: cleanText })
  });
}

function createPrompt(data, news) {
  return `
  Role: Gold Analyst (XAU/USD).
  Technical Data (Source: Yahoo Finance):
  - Price: $${data.price}
  - Change: ${data.change}%
  - High: ${data.high}
  - Low: ${data.low}
  
  News Headlines:
  ${news.join('\n')}
  
  Task: Write a Persian Telegram report.
  Analyze price action and news. Give Buy/Sell signal.
  Use emojis.
  `;
}
