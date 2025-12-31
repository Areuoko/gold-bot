import { XMLParser } from 'fast-xml-parser';

export default {
  // اجرای دستی (وقتی لینک را در مرورگر باز می‌کنید)
  async fetch(request, env, ctx) {
    return await handleRequest(env);
  },

  // اجرای خودکار (طبق زمان‌بندی Cron در ساعت ۸ صبح و شب)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleRequest(env));
  }
};

async function handleRequest(env) {
  try {
    // 1. دریافت داده‌های بازار (تکنیکال) و اخبار (فاندامنتال) به صورت همزمان
    const [marketData, newsData] = await Promise.all([
      fetchMarketData(),
      fetchAllNews()
    ]);

    // 2. پیدا کردن بهترین مدل هوش مصنوعی فعال برای کلید شما
    const activeModel = await findBestGeminiModel(env.AI_API_KEY);

    // 3. ساخت دستور (Prompt) برای هوش مصنوعی با داده‌های کامل
    const prompt = createPrompt(marketData, newsData);

    // 4. دریافت تحلیل از هوش مصنوعی
    const analysis = await askGemini(prompt, env.AI_API_KEY, activeModel);

    // 5. ارسال گزارش به تلگرام
    const telegramResult = await sendToTelegram(analysis, env);

    // خروجی جیسون (فقط برای لاگ و دیباگ)
    return new Response(JSON.stringify({ 
      status: "Success",
      telegram_sent: telegramResult,
      model_used: activeModel,
      market_data: marketData,
      news_count: newsData.length,
      report_preview: analysis 
    }, null, 2), {
      headers: { "content-type": "application/json; charset=UTF-8" }
    });

  } catch (error) {
    // در صورت بروز خطا، به تلگرام هم گزارش می‌دهد که متوجه شوید
    if (env.TELEGRAM_BOT_TOKEN) {
      await sendToTelegram(`❌ ربات دچار مشکل شد:\n${error.message}`, env);
    }
    return new Response(JSON.stringify({ 
      error: "Bot Failed", 
      details: error.message 
    }, null, 2), { status: 500 });
  }
}

// ------------------------------------------
// توابع کمکی (Helper Functions)
// ------------------------------------------

// 1. دریافت داده‌های تکنیکال (قیمت، تغییرات، سقف و کف)
async function fetchMarketData() {
  try {
    // تلاش اول: بایننس (دقیق‌ترین داده‌ها)
    // PAXGUSDT معادل طلای جهانی دیجیتال است
    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT');
    
    if (!response.ok) throw new Error("Binance Error");
    
    const data = await response.json();
    
    return {
      price: parseFloat(data.lastPrice).toFixed(2),
      changePercent: parseFloat(data.priceChangePercent).toFixed(2), // درصد تغییر روزانه
      high: parseFloat(data.highPrice).toFixed(2),      // بالاترین قیمت امروز (مقاومت)
      low: parseFloat(data.lowPrice).toFixed(2),        // پایین‌ترین قیمت امروز (حمایت)
      volume: parseFloat(data.volume).toFixed(2),       // حجم معاملات
      source: "Binance"
    };
  } catch (e) {
    // تلاش دوم: اگر بایننس جواب نداد، از کوین‌گکو بگیر (بکاپ)
    return await fetchBackupPrice(); 
  }
}

// تابع بکاپ (CoinGecko)
async function fetchBackupPrice() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true');
    const d = await res.json();
    return {
      price: d['pax-gold'].usd,
      changePercent: d['pax-gold'].usd_24h_change.toFixed(2),
      high: "N/A", // کوین‌گکو در نسخه رایگان سقف و کف نمی‌دهد
      low: "N/A",
      volume: "N/A",
      source: "CoinGecko (Backup)"
    };
  } catch(e) {
    return { price: "Error", changePercent: "0", source: "Failed" };
  }
}

// 2. دریافت اخبار از 5 منبع معتبر (RSS)
async function fetchAllNews() {
  const rssFeeds = [
    "https://www.kitco.com/rss/category/commodities/gold",  // تخصصی طلا
    "https://www.fxstreet.com/rss/news",                    // خبرهای فوری فارکس
    "https://uk.investing.com/rss/news_25.rss",             // کامودیتی‌ها
    "https://www.dailyfx.com/feeds/market-news",            // تحلیل بازار
    "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258" // اقتصاد آمریکا
  ];
  
  // دریافت همزمان همه فیدها برای سرعت بیشتر
  const promises = rssFeeds.map(url => fetchRSS(url));
  const results = await Promise.all(promises);
  
  // ترکیب همه اخبار و انتخاب 15 تیتر اول
  return results.flat().slice(0, 15);
}

// تابع خواندن RSS
async function fetchRSS(url) {
  try {
    const response = await fetch(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } 
    });
    if(!response.ok) return [];
    
    const text = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(text);
    
    const items = jsonObj.rss?.channel?.item || jsonObj.feed?.entry || [];
    
    if (!Array.isArray(items)) return [];
    
    // فقط 3 خبر اول هر سایت را برمی‌گرداند
    return items.slice(0, 3).map(i => {
      const title = i.title ? String(i.title).replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') : "";
      return `- ${title}`;
    });
  } catch (e) { return []; }
}

// 3. پیدا کردن مدل هوش مصنوعی (برای جلوگیری از ارور Model Not Found)
async function findBestGeminiModel(apiKey) {
  if (!apiKey) throw new Error("API Key یافت نشد!");

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const resp = await fetch(url);
  const data = await resp.json();

  // اگر لیست مدل‌ها را نداد، پیش‌فرض را استفاده کن
  if (!data.models) return "gemini-pro";

  // فیلتر کردن مدل‌هایی که قابلیت نوشتن متن دارند
  const textModels = data.models.filter(m => 
    m.supportedGenerationMethods?.includes("generateContent")
  );

  // اولویت با مدل‌های Flash (سریع) است، اگر نبود مدل Pro
  const bestModel = textModels.find(m => m.name.includes("flash")) || 
                    textModels.find(m => m.name.includes("pro")) || 
                    textModels[0];

  return bestModel ? bestModel.name.replace("models/", "") : "gemini-pro";
}

// 4. ارسال درخواست به هوش مصنوعی
async function askGemini(prompt, apiKey, modelName) {
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
  
  if (data.error) throw new Error(`AI Error: ${data.error.message}`);
  
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "خطا در تولید متن.";
}

// 5. ارسال پیام به تلگرام
async function sendToTelegram(text, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.log("Telegram credentials missing.");
    return false;
  }
  
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: text,
      // نکته: پارس مد را غیرفعال کردیم تا کاراکترهای خاص باعث ارور نشوند
      // خود هوش مصنوعی متن را زیبا می‌کند
    })
  });
  
  return response.ok;
}

// 6. ساخت پرامپت (دستور به هوش مصنوعی)
function createPrompt(data, news) {
  return `
  نقش شما: تحلیلگر ارشد و حرفه‌ای بازار جهانی طلا (XAU/USD).
  
  📊 داده‌های تکنیکال لحظه‌ای:
  - قیمت فعلی: $${data.price}
  - تغییر ۲۴ ساعته: ${data.changePercent}% (مثبت=صعودی، منفی=نزولی)
  - بالاترین قیمت امروز (مقاومت): $${data.high}
  - پایین‌ترین قیمت امروز (حمایت): $${data.low}
  - حجم معاملات: ${data.volume}
  
  📰 تیترهای خبری مهم (فاندامنتال):
  ${news.join('\n')}
  
  وظیفه:
  یک گزارش جامع، جذاب و فارسی برای کانال تلگرام بنویسید.
  
  ساختار گزارش:
  1. 💰 **وضعیت بازار:** (اشاره به قیمت و قدرت روند صعودی/نزولی بر اساس درصد تغییر)
  2. 🌍 **تحلیل فاندامنتال:** (بررسی تاثیر اخبار بالا بر طلا و دلار)
  3. 📉 **تحلیل تکنیکال:** (استفاده از سقف و کف روزانه برای تعیین حمایت و مقاومت)
  4. 🔮 **پیش‌بینی و سیگنال:**
     - دیدگاه کوتاه‌مدت (امروز و فردا)
     - دیدگاه میان‌مدت (یک هفته آینده)
  5. 💡 **نتیجه‌گیری:** (خرید، فروش یا صبر؟)

  نکات مهم:
  - از بولد کردن با ستاره (*) استفاده نکنید چون در تلگرام بهم می‌ریزد.
  - از ایموجی‌های مرتبط (📈📉💰) استفاده کنید.
  - لحن کاملاً حرفه‌ای و مالی باشد.
  `;
}
