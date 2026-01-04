export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      return await handleRequest(request, env);
    }
    return new Response("Bot is Ready. Waiting for Python...", { status: 200 });
  },
};

async function handleRequest(request, env) {
  try {
    const body = await request.json();
    
    // بررسی رمز
    if (request.headers.get("X-Secret-Key") !== env.SECRET_KEY) {
      return new Response("Forbidden", { status: 403 });
    }

    // استخراج داده‌هایی که پایتون فرستاده
    const { market_data, news_list, date, time } = body;

    // پیدا کردن مدل هوش مصنوعی
    const activeModel = await findBestGeminiModel(env.AI_API_KEY);
    
    // ساخت پرامپت دقیق با داده‌های کامل
    const prompt = createPrompt(market_data, news_list, date, time);
    
    // تحلیل
    const analysis = await askGemini(prompt, env.AI_API_KEY, activeModel);
    
    // ارسال به تلگرام
    await sendToTelegram(analysis, env);

    return new Response(JSON.stringify({ status: "Sent", model: activeModel }), { 
      headers: { "content-type": "application/json" } 
    });

  } catch (error) {
    if(env.TELEGRAM_BOT_TOKEN) await sendToTelegram(`⚠️ Error: ${error.message}`, env);
    return new Response(error.message, { status: 500 });
  }
}

// --- توابع ---

async function findBestGeminiModel(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    const models = data.models || [];
    const best = models.find(m => m.name.includes("flash")) || models.find(m => m.name.includes("pro"));
    return best ? best.name.replace("models/", "") : "gemini-pro";
  } catch(e) { return "gemini-pro"; }
}

async function askGemini(prompt, apiKey, modelName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "AI Error";
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

function createPrompt(data, news, date, time) {
  return `
  Role: Senior Gold Market Analyst.
  Current Time: ${date} | ${time}
  
  📊 LIVE MARKET DATA (XAU/USD):
  - Price: $${data.price}
  - Change (24h): ${data.change_percent}%
  - Day High: $${data.high} (Strong Resistance)
  - Day Low: $${data.low} (Strong Support)
  
  📰 LATEST NEWS HEADLINES:
  ${news.length > 0 ? news.join('\n') : "No major news currently."}
  
  TASK:
  Write a highly professional Persian Telegram report.
  
  STRUCTURE:
  1. 🗓 **تاریخ و زمان:** (Use the provided date/time)
  2. 💰 **وضعیت بازار:** (Analyze price vs High/Low)
  3. 🌍 **فاندامنتال:** (Analyze news impacts if any, or general market sentiment)
  4. ⚔️ **سطوح کلیدی:** (Highlight the High and Low as trading zones)
  5. 🔮 **سیگنال:** (Bullish/Bearish/Neutral based on data)
  
  TONE: Professional, financial, use emojis. Do NOT use placeholders like [Date]. Use exact data provided.
  `;
}
