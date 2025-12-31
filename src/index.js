import { XMLParser } from 'fast-xml-parser';

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
    // 1. دریافت داده‌ها
    const [priceData, newsData] = await Promise.all([
      fetchGoldPrice(),
      fetchAllNews()
    ]);

    // 2. شناسایی مدل فعال گوگل (این بخش جدید است)
    const activeModel = await findBestGeminiModel(env.AI_API_KEY);

    // 3. ارسال درخواست با مدل پیدا شده
    const prompt = createPrompt(priceData, newsData);
    const analysis = await askGemini(prompt, env.AI_API_KEY, activeModel);

    return new Response(JSON.stringify({ 
      status: "Success",
      used_model: activeModel, // اسم مدلی که خودکار پیدا کرد
      data: {
        price: priceData.price,
        news_count: newsData.length
      },
      analysis_report: analysis 
    }, null, 2), {
      headers: { "content-type": "application/json; charset=UTF-8" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: "Bot Execution Failed",
      details: error.message,
      hint: "Check your API Key permissions in Google AI Studio"
    }, null, 2), { status: 500 });
  }
}

// --- توابع کمکی ---

// *** تابع جدید: کشف خودکار مدل سالم ***
async function findBestGeminiModel(apiKey) {
  // پرسیدن لیست مدل‌ها از گوگل
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();

  if (data.error) throw new Error(`ListModels Failed: ${data.error.message}`);
  if (!data.models) throw new Error("No models found for this API Key");

  // فیلتر کردن مدل‌هایی که قابلیت تولید متن دارند
  const textModels = data.models.filter(m => 
    m.supportedGenerationMethods && 
    m.supportedGenerationMethods.includes("generateContent")
  );

  if (textModels.length === 0) throw new Error("This API Key has no access to text generation models.");

  // اولویت‌بندی: اول فلش (سریع)، بعد پرو، بعد هر چی بود
  const bestModel = textModels.find(m => m.name.includes("flash")) || 
                    textModels.find(m => m.name.includes("pro")) || 
                    textModels[0];

  // خروجی مثلاً "models/gemini-1.5-flash" است، ما فقط اسم آخر را می‌خواهیم
  return bestModel.name.replace("models/", "");
}

async function askGemini(prompt, apiKey, modelName) {
  // استفاده از همان اسمی که پیدا کردیم
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  
  if (data.error) throw new Error(`Gemini Error (${modelName}): ${data.error.message}`);
  
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No output";
}

async function fetchGoldPrice() {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT');
    const data = await response.json();
    return { price: parseFloat(data.price).toFixed(2) };
  } catch (e) { return { price: "Error" }; }
}

async function fetchAllNews() {
  const rssFeeds = [
    "https://www.kitco.com/rss/category/commodities/gold",
    "https://www.fxstreet.com/rss/news"
  ];
  const promises = rssFeeds.map(url => fetchRSS(url));
  const results = await Promise.all(promises);
  return results.flat().slice(0, 10);
}

async function fetchRSS(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(text);
    const items = jsonObj.rss?.channel?.item || jsonObj.feed?.entry || [];
    if (!Array.isArray(items)) return [];
    return items.slice(0, 3).map(i => `- ${i.title ?? ""}`);
  } catch (e) { return []; }
}

function createPrompt(price, news) {
  return `
  You are an expert Financial Analyst for Gold (XAU/USD).
  Current Price: $${price.price}
  News Headlines:
  ${news.join('\n')}
  
  Task: Write a short, professional analysis in Persian (Farsi) for Telegram.
  Include: Fundamental check, Technical check, and a Prediction (Short/Long term).
  Start with: "📢 گزارش هوشمند طلا"
  `;
}
