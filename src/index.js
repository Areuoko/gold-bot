export default {
  async fetch(request, env, ctx) {
    return await handleRequest(env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleRequest(env));
  }
};

async function handleRequest(env) {
  try {
    const marketData = await fetchMarketData();
    const newsData = await fetchAllNews();
    const activeModel = await findBestGeminiModel(env.AI_API_KEY);
    const prompt = createPrompt(marketData, newsData);
    const analysis = await askGemini(prompt, env.AI_API_KEY, activeModel);
    const telegramResult = await sendToTelegram(analysis, env);

    return new Response(JSON.stringify({ 
      status: "Success",
      telegram: telegramResult,
      model: activeModel,
      data: marketData
    }, null, 2), { headers: { "content-type": "application/json" } });

  } catch (error) {
    if (env.TELEGRAM_BOT_TOKEN) {
      await sendToTelegram(`❌ Error: ${error.message}`, env);
    }
    return new Response(error.message, { status: 500 });
  }
}

// --- توابع کمکی ---

async function fetchMarketData() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT');
    const data = await res.json();
    return {
      price: parseFloat(data.lastPrice).toFixed(2),
      change: parseFloat(data.priceChangePercent).toFixed(2),
      high: parseFloat(data.highPrice).toFixed(2),
      low: parseFloat(data.lowPrice).toFixed(2)
    };
  } catch (e) {
    return { price: "N/A", change: "0", high: "0", low: "0" };
  }
}

async function fetchAllNews() {
  // روش جدید بدون نیاز به کتابخانه XML Parser (ساده‌سازی شده برای جلوگیری از ارور)
  const rssUrl = "https://www.kitco.com/rss/category/commodities/gold";
  try {
    const res = await fetch(rssUrl);
    const text = await res.text();
    // استخراج ساده تیترها با Regex
    const titles = text.match(/<title>(.*?)<\/title>/g) || [];
    return titles.slice(2, 7).map(t => t.replace(/<\/?title>|<!\[CDATA\[|\]\]>/g, "").trim());
  } catch (e) {
    return ["News not available"];
  }
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
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return "No Creds";
  const cleanText = text.replace(/\*/g, "").replace(/_/g, "-");
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: cleanText })
  });
  return "Sent";
}

function createPrompt(data, news) {
  return `
  Role: Gold Analyst (XAU/USD).
  Price: $${data.price} (Change: ${data.change}%)
  High/Low: ${data.high} / ${data.low}
  News:
  ${news.join('\n')}
  
  Write a short Persian Telegram report with Buy/Sell signal.
  Use emojis.
  `;
}
