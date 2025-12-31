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
    const analysis = await askGemini(prompt, env.AI_API_KEY);

    return new Response(JSON.stringify({ 
      status: "Success",
      price_source: "Binance (PAXG/USDT)",
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
    return {
      price: parseFloat(data.price).toFixed(2)
    };
  } catch (e) {
    return { price: "Error fetching price" };
  }
}

async function fetchAllNews() {
  const rssFeeds = [
    "https://www.kitco.com/rss/category/commodities/gold",
    "https://www.fxstreet.com/rss/news",
    "https://www.dailyfx.com/feeds/market-news"
  ];
  
  const promises = rssFeeds.map(url => fetchRSS(url));
  const results = await Promise.all(promises);
  return results.flat().slice(0, 15);
}

async function fetchRSS(url) {
  try {
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } 
    });
    if (!response.ok) return [];
    const text = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(text);
    const items = jsonObj.rss?.channel?.item || jsonObj.feed?.entry || [];
    if (!Array.isArray(items)) return [];
    return items.slice(0, 5).map(item => {
      const title = item.title ? String(item.title).replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : "No Title";
      return `- ${title}`;
    });
  } catch (e) { return []; }
}

async function askGemini(prompt, apiKey) {
  if (!apiKey) throw new Error("API Key is missing!");

  // *** تغییر مهم: استفاده از مدل gemini-pro که عمومی‌تر است ***
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
  
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
  
  if (data.error) {
    throw new Error(`Gemini API Error: ${data.error.message}`);
  }
  
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response from AI";
}

function createPrompt(price, news) {
  return `
  You are an expert Financial Analyst for Gold (XAU/USD).
  
  DATA:
  - Current Gold Price: $${price.price}
  - Recent Headlines:
  ${news.join('\n')}
  
  TASK:
  Provide a professional trading report in Persian (Farsi).
  Focus on:
  1. Fundamental Analysis (Fed, Inflation, Geopolitics based on headlines).
  2. Technical Sentiment (based on price level).
  3. Forecast (Short-term & Long-term).
  
  FORMAT:
  Use emojis. Keep it structured. Start with "📢 گزارش اختصاصی تحلیل طلا".
  `;
}
