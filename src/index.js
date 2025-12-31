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
    const [priceData, newsData] = await Promise.all([
      fetchGoldPrice(),
      fetchAllNews()
    ]);

    const prompt = createPrompt(priceData, newsData);
    
    // اینجا تغییر کرد: ارسال درخواست با قابلیت تلاش مجدد روی مدل‌های مختلف
    const analysis = await askGeminiSmart(prompt, env.AI_API_KEY);

    return new Response(JSON.stringify({ 
      status: "Success",
      price_source: "Binance (PAXG/USDT)",
      used_model: analysis.model, // نشان می‌دهد کدام مدل موفق شد
      data: {
        price: priceData.price,
        news_count: newsData.length
      },
      analysis_report: analysis.text 
    }, null, 2), {
      headers: { "content-type": "application/json; charset=UTF-8" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: "Bot Execution Failed",
      details: error.message
    }, null, 2), { status: 500 });
  }
}

// --- توابع کمکی ---

async function fetchGoldPrice() {
  try {
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT');
    if (!response.ok) throw new Error("Binance API Error");
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
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } 
    });
    if (!response.ok) return [];
    const text = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(text);
    const items = jsonObj.rss?.channel?.item || jsonObj.feed?.entry || [];
    if (!Array.isArray(items)) return [];
    return items.slice(0, 4).map(item => {
      const title = item.title ? String(item.title).replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : "";
      return `- ${title}`;
    });
  } catch (e) { return []; }
}

// *** تابع جدید و هوشمند برای ارتباط با هوش مصنوعی ***
async function askGeminiSmart(prompt, apiKey) {
  if (!apiKey) throw new Error("API Key is missing!");

  // لیست مدل‌هایی که به ترتیب تست می‌شوند
  const modelsToTry = [
    "gemini-1.5-flash",       // مدل جدید و سریع
    "gemini-1.5-flash-latest", // نسخه آخر فلش
    "gemini-pro",             // مدل استاندارد قدیمی
    "gemini-1.0-pro"          // نام جایگزین
  ];

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Trying model: ${modelName}...`);
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

      // اگر ارور داد، برو مدل بعدی
      if (data.error) {
        throw new Error(data.error.message);
      }

      // اگر موفق شد، خروجی را برگردان
      return {
        model: modelName,
        text: data.candidates?.[0]?.content?.parts?.[0]?.text || "No output"
      };

    } catch (err) {
      console.log(`Model ${modelName} failed: ${err.message}`);
      lastError = err;
      // حلقه ادامه پیدا می‌کند تا مدل بعدی تست شود
    }
  }

  // اگر همه مدل‌ها شکست خوردند
  throw new Error(`All Gemini models failed. Last error: ${lastError?.message}`);
}

function createPrompt(price, news) {
  return `
  You are an expert Financial Analyst for Gold (XAU/USD).
  
  DATA:
  - Current Gold Price: $${price.price}
  - News:
  ${news.join('\n')}
  
  TASK:
  Write a trading report in Persian (Farsi) for a Telegram channel.
  Analyze Fundamental (News/Fed) and Technical (Price) aspects.
  Give a prediction (Short/Long term).
  Start with "📢 تحلیل فوری طلا".
  `;
}
