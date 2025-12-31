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
    // 1. دریافت داده‌های بازار (با مدیریت خطای پیشرفته)
    const marketData = await fetchMarketData();
    
    // 2. دریافت اخبار
    const newsData = await fetchAllNews();

    // 3. پیدا کردن مدل هوش مصنوعی
    const activeModel = await findBestGeminiModel(env.AI_API_KEY);

    // 4. ساخت پرامپت
    const prompt = createPrompt(marketData, newsData);

    // 5. دریافت تحلیل از هوش مصنوعی
    const analysis = await askGemini(prompt, env.AI_API_KEY, activeModel);

    // 6. ارسال به تلگرام
    const telegramResult = await sendToTelegram(analysis, env);

    return new Response(JSON.stringify({ 
      status: "Success",
      telegram_sent: telegramResult,
      model_used: activeModel,
      market_data: marketData,
      report_preview: analysis 
    }, null, 2), {
      headers: { "content-type": "application/json; charset=UTF-8" }
    });

  } catch (error) {
    // ارسال گزارش خطا به تلگرام برای اطلاع شما
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      await sendToTelegram(`❌ خطا در ربات:\n${error.message}`, env);
    }
    return new Response(JSON.stringify({ 
      error: "Bot Failed", 
      details: error.message,
      stack: error.stack
    }, null, 2), { status: 500 });
  }
}

// ------------------------------------------
// توابع کمکی (Helper Functions)
// ------------------------------------------

// تابع دریافت JSON ایمن (برای جلوگیری از ارور Unexpected end of JSON)
async function safeJsonFetch(url) {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) return null; // اگر خطا داد، نال برگردان
    const text = await response.text(); // اول متن را بگیر
    if (!text) return null; // اگر خالی بود، نال برگردان
    return JSON.parse(text); // حالا تبدیل کن
  } catch (e) {
    return null;
  }
}

async function fetchMarketData() {
  // تلاش اول: بایننس
  const binanceData = await safeJsonFetch('https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT');
  
  if (binanceData && binanceData.lastPrice) {
    return {
      price: parseFloat(binanceData.lastPrice).toFixed(2),
      changePercent: parseFloat(binanceData.priceChangePercent).toFixed(2),
      high: parseFloat(binanceData.highPrice).toFixed(2),
      low: parseFloat(binanceData.lowPrice).toFixed(2),
      volume: parseFloat(binanceData.volume).toFixed(2),
      source: "Binance"
    };
  }

  // تلاش دوم: کوین‌گکو (بکاپ)
  const geckoData = await safeJsonFetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true');
  
  if (geckoData && geckoData['pax-gold']) {
    return {
      price: geckoData[
