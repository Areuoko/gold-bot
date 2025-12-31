import { XMLParser } from 'fast-xml-parser';

export default {
  async fetch(request, env, ctx) {
    // اگر درخواست دستی بود اجرا کن
    return await handleRequest(env);
  },

  async scheduled(event, env, ctx) {
    // اگر ساعت 8 صبح/شب بود اجرا کن
    ctx.waitUntil(handleRequest(env));
  }
};

async function handleRequest(env) {
  try {
    // 1. جمع‌آوری داده‌ها
    const [priceData, newsData] = await Promise.all([
      fetchGoldPrice(),
      fetchAllNews()
    ]);

    // 2. ساخت پرامپت برای هوش مصنوعی
    const prompt = createPrompt(priceData, newsData);

    // 3. ارسال به Google Gemini
    const analysis = await askGemini(prompt, env.AI_API_KEY);

    // فعلاً خروجی را نشان می‌دهیم (در مرحله بعد می‌فرستیم به تلگرام)
    return new Response(JSON.stringify({ 
      status: "Success",
      analysis_result: analysis 
    }, null, 2), {
      headers: { "content-type": "application/json; charset=UTF-8" }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

// --- توابع کمکی ---

async function askGemini(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  
  if (data.error) throw new Error(data.error.message);
  return data.candidates[0].content.parts[0].text;
}

function createPrompt(price, news) {
  return `
  Act as a Senior Financial Analyst specializing in Commodities and Gold (XAU/USD).
  
  CURRENT MARKET DATA:
  - Price: $${price.price}
  - Previous Close: $${price.previousClose}
  - Day High/Low: ${price.high} / ${price.low}
  
  LATEST NEWS HEADLINES (Fundamental Data):
  ${news.join('\n')}
  
  TASK:
  Analyze the provided data to forecast Gold trends. Pay specific attention to mentions of:
  - Federal Reserve (Fed) Interest Rates
  - Inflation Data (CPI, PPI)
  - US Dollar Index (DXY)
  - Employment Data (NFP)
  - Geopolitical Tensions
  
  OUTPUT FORMAT (in Persian / Farsi):
  Please write a comprehensive report suitable for a Telegram channel. Use emojis.
  Structure:
  1. 📊 **وضعیت لحظه‌ای:** (Short summary of current price status)
  2. 🌍 **تحلیل فاندامنتال:** (Analyze the news impacts, specifically Fed & Inflation)
  3. 📈 **تحلیل تکنیکال:** (Based on price action and volatility)
  4. 🔮 **پیش‌بینی:**
     - کوتاه مدت (۱ هفته): [Bullish/Bearish/Neutral]
     - میان مدت (۱ ماه): [Trend]
     - بلند مدت (۶ ماه): [Trend]
  5. 💡 **نتیجه‌گیری نهایی:** (Buy/Sell/Wait recommendation)
  `;
}

async function fetchGoldPrice() {
  // گرفتن قیمت از یاهو فایننس
  const resp = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d');
  const data = await resp.json();
  const quote = data.chart.result[0].meta;
  return {
    price: quote.regularMarketPrice,
    previousClose: quote.previousClose,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow
  };
}

async function fetchAllNews() {
  const rssFeeds = [
    "https://www.kitco.com/rss/category/commodities/gold",
    "https://www.fxstreet.com/rss/news",
    "https://www.dailyfx.com/feeds/market-news"
  ];
  
  const promises = rssFeeds.map(url => fetchRSS(url));
  const results = await Promise.all(promises);
  return results.flat().slice(0, 15); // 15 تیتر مهم
}

async function fetchRSS(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'GoldBot' } });
    const text = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(text);
    const items = jsonObj.rss?.channel?.item || jsonObj.feed?.entry || [];
    
    return items.slice(0, 5).map(item => {
      const title = item.title;
      return `- ${title} (Source: ${new URL(url).hostname})`;
    });
  } catch (e) { return []; }
}
