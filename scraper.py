import requests
import os
import sys
import datetime
import re
import json

# تنظیمات
WORKER_URL = os.environ.get("WORKER_URL")
SECRET_KEY = os.environ.get("SECRET_KEY")

# ==========================================
# بخش ۱: دریافت قیمت (ضدضربه)
# ==========================================
def fetch_yahoo():
    print("1️⃣ Trying Yahoo Finance (GC=F)...")
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        url = "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d"
        resp = requests.get(url, headers=headers, timeout=10)
        
        if resp.status_code != 200: return None

        data = resp.json()
        meta = data['chart']['result'][0]['meta']
        
        price = meta.get('regularMarketPrice')
        prev_close = meta.get('chartPreviousClose') or meta.get('previousClose')
        high = meta.get('regularMarketDayHigh')
        low = meta.get('regularMarketDayLow')

        if price is None: return None

        change = 0.0
        if prev_close:
            change = round(((price - prev_close) / prev_close) * 100, 2)

        return {
            "price": round(price, 2),
            "change_percent": change,
            "high": round(high, 2) if high else "N/A",
            "low": round(low, 2) if low else "N/A",
            "source": "Yahoo Finance (GC=F)"
        }
    except Exception as e:
        print(f"⚠️ Yahoo Failed: {e}")
        return None

def fetch_coingecko():
    print("2️⃣ Trying CoinGecko (PAXG)...")
    try:
        url = "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true"
        headers = {'User-Agent': 'Mozilla/5.0'}
        resp = requests.get(url, headers=headers, timeout=10)
        
        if resp.status_code != 200: return None
        
        data = resp.json()['pax-gold']
        
        return {
            "price": float(data['usd']),
            "change_percent": round(float(data['usd_24h_change']), 2),
            "high": "N/A (Backup)",
            "low": "N/A (Backup)",
            "source": "CoinGecko (Backup)"
        }
    except: return None

def get_best_market_data():
    data = fetch_yahoo()
    if data: return data
    print("🔄 Switching to Backup Source...")
    return fetch_coingecko()

# ==========================================
# بخش ۲: دریافت اخبار (۵ منبع کامل)
# ==========================================
def get_news():
    print("📰 Fetching News from 5 Sources...")
    news_list = []
    
    # لیست کامل ۵ منبع خبری معتبر
    urls = [
        "https://www.kitco.com/rss/category/commodities/gold",  # تخصصی طلا
        "https://www.fxstreet.com/rss/news",                    # اخبار فارکس
        "https://uk.investing.com/rss/news_25.rss",             # کامودیتی‌ها
        "https://www.dailyfx.com/feeds/market-news",            # تحلیل بازار
        "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258" # اقتصاد آمریکا
    ]
    
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    for url in urls:
        try:
            # تایم‌اوت کم (۵ ثانیه) برای اینکه اگر سایتی کند بود، بقیه معطل نشوند
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                # استخراج تیترها با Regex
                titles = re.findall(r'<title>(.*?)</title>', resp.text)
                
                # تمیزکاری متن
                clean = [t.replace("<![CDATA[", "").replace("]]>", "").strip() for t in titles]
                
                # فیلتر کردن تیترهای کوتاه یا تبلیغاتی
                filtered = [t for t in clean if len(t) > 20 and "Kitco" not in t and "DailyFX" not in t][:2]
                
                news_list.extend(filtered)
                print(f"✅ Fetched from {url.split('/')[2]}")
        except Exception as e:
            print(f"⚠️ Failed: {url.split('/')[2]}")
            continue
            
    # ارسال ۱۰ خبر برتر
    unique_news = list(set(news_list)) # حذف تکراری‌ها
    return unique_news[:10]

# ==========================================
# بخش ۳: ارسال به کلودفلر
# ==========================================
def send_payload(market_data, news_list):
    if not WORKER_URL:
        print("❌ ERROR: WORKER_URL is missing.")
        sys.exit(1)

    now = datetime.datetime.now()
    # فرمت تاریخ و ساعت دقیق برای نمایش در تلگرام
    payload = {
        "market_data": market_data,
        "news_list": news_list,
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M UTC")
    }

    print(f"🚀 Sending Payload ({market_data['source']})...")
    headers = {"X-Secret-Key": SECRET_KEY, "Content-Type": "application/json"}
    
    try:
        resp = requests.post(WORKER_URL, json=payload, headers=headers, timeout=20)
        print(f"📡 Worker Response: {resp.text}")
    except Exception as e:
        print(f"❌ Connection Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    market_data = get_best_market_data()
    news_list = get_news()
    
    if market_data:
        send_payload(market_data, news_list)
    else:
        print("❌ CRITICAL: Could not fetch price.")
        sys.exit(1)
