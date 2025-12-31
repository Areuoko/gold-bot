import { XMLParser } from 'fast-xml-parser';

export default {
  async fetch(request, env, ctx) {
    // 1. لیست منابع خبری (فاندامنتال)
    const rssFeeds = [
      "https://www.kitco.com/rss/category/commodities/gold", 
      "https://www.fxstreet.com/rss/news", 
      "https://uk.investing.com/rss/news_25.rss", 
      "https://www.dailyfx.com/feeds/market-news", 
      "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258" 
    ];

    // 2. دریافت قیمت طلا
    const goldPriceData = await fetchGoldPrice();

    // 3. دریافت اخبار
    const feedPromises = rssFeeds.map(url => fetchRSS(url));
    const feedResults = await Promise.all(feedPromises);

    // 4. تمیزکاری داده‌ها
    const cleanData = processData(goldPriceData, feedResults);

    return new Response(JSON.stringify(cleanData, null, 2), {
      headers: { "content-type": "application/json; charset=UTF-8" },
    });
  },
  // این بخش برای اجرای خودکار (Cron) است
  async scheduled(event, env, ctx) {
      console.log("Cron Triggered!");
      // اینجا بعدا کد تحلیل و ارسال به تلگرام را می‌گذاریم
  }
};

// --- توابع کمکی ---

async function fetchGoldPrice() {
  try {
    // دریافت دیتای تکنیکال ساده از یاهو
    const resp = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=5d');
    const data = await resp.json();
    const quote = data.chart.result[0].meta;
    return {
      price: quote.regularMarketPrice,
      previousClose: quote.previousClose,
      high: quote.regularMarketDayHigh,
      low: quote.regularMarketDayLow,
      time: new Date().toISOString()
    };
  } catch (e) {
    return { error: "Price Fetch Error", details: e.message };
  }
}

async function fetchRSS(url) {
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'GoldBot-Worker' } });
    const text = await response.text();
    const parser = new XMLParser();
    const jsonObj = parser.parse(text);
    const items = jsonObj.rss ? jsonObj.rss.channel.item : (jsonObj.feed ? jsonObj.feed.entry : []);
    
    // گرفتن 3 خبر اول هر سایت
    return items.slice(0, 3).map(item => ({
      title: item.title,
      link: item.link
    }));
  } catch (err) {
    return [];
  }
}

function processData(price, newsArrays) {
  const allNews = newsArrays.flat();
  // فیلتر کلمات کلیدی مهم برای تحلیل فاندامنتال
  const keywords = ["Gold", "XAU", "Fed", "Rate", "Inflation", "CPI", "NFP", "Job", "Yield", "Dollar"];
  const relevantNews = allNews.filter(n => 
    keywords.some(k => (n.title || "").includes(k))
  );

  return {
    price_data: price,
    news_headlines: relevantNews.map(n => n.title)
  };
}
