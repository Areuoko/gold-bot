import { XMLParser } from 'fast-xml-parser';

export default {
  async fetch(request, env, ctx) {
    // اجرا برای درخواست دستی (تست)
    return await handleRequest(env);
  },

  async scheduled(event, env, ctx) {
    // اجرا برای زمان‌بندی خودکار
    ctx.waitUntil(handleRequest(env));
  }
};

async function handleRequest(env) {
  try {
    // 1. دریافت داده‌ها (قیمت + اخبار)
    const [priceData, newsData] = await Promise.all([
      fetchGoldPrice(),
      fetchAllNews()
    ]);

    // 2. ساخت پرامپت
    const prompt = createPrompt(priceData, newsData);

    // 3. ارسال به هوش مصنوعی (Gemini)
    const analysis = await askGemini(prompt, env.AI_API_KEY);

    // خروجی جیسون (فعلاً برای نمایش در مرورگر)
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
    // نمایش خطای تمیز به جای کرش کردن
    return new Response(JSON.stringify({ 
      error: "Bot Execution Failed",
      details: error.message,
      stack: error.stack
    }, null, 2), { status: 500 });
  }
}

// --- توابع کمکی ---

async function fetchGoldPrice() {
  try {
    // استفاده از API بایننس برای قیمت PAXG (معادل طلای جهانی)
    // این API بسیار پایدارتر از یاهو است و بلاک نمی‌کند
    const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=PAXGUSDT');
    
    if (!response.ok) throw new Error("Binance API Error");
    
    const data = await response.json();
    return {
      price: parseFloat(data.price).toFixed(2),
      // چون بایننس قیمت لحظه‌ای می‌دهد، قیمت قبلی را فعلا تخمینی می‌زنیم یا حذف می‌کنیم
      // برای تحلیل هوش مصنوعی همین قیمت لحظه‌ای کافیست
      trend: "Live Data"
    };
  } catch (e) {
    console.error("Price Fetch Error:", e);
    // در صورت خطا، یک قیمت فرضی برمی‌گرداند تا ربات متوقف نشود
    return { price: "Error fetching price", trend: "Unknown" };
  }
}

async function fetchAllNews() {
  // لیست RSS ها
  const rssFeeds = [
    "https://www.kitco.com/rss/category/commodities/gold",
    "https://www.fxstreet.com/rss/news",
    "https://www.dailyfx.com/feeds/market-news"
  ];
  
  // دریافت موازی اخبار
  const promises = rssFeeds.map(url => fetchRSS(url));
  const results = await Promise.all(promises);
  
  // ترکیب و انتخاب ۱۵ تیتر اول
  const allNews = results.flat();
  return allNews.slice(0, 15);
}

async function fetchRSS(url) {
  try {
    // هدر User-Agent برای جلوگیری از بلاک شدن توسط سایت‌های خبری
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } 
    });
    
    if (!response.ok) return [];

    const text = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(text);
    
    // پیدا کردن آیتم‌ها در ساختارهای مختلف RSS
    const items = jsonObj.rss?.channel?.item || jsonObj.feed?.entry || [];
    
    if (!Array.isArray(items)) return [];

    return items.slice(0, 5).map(item => {
      // تمیزکاری عنوان خبر
      const title = item.title ? String(item.title).replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : "No Title";
      return `- ${title}`;
    });
  } catch (e) {
    console.log(`Failed to fetch RSS: ${url}`);
    return [];
  }
}

async function askGemini(prompt, apiKey) {
  if (!apiKey) throw new Error("API Key is missing!");

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
