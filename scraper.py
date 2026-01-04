import requests
import os
import sys
import datetime
import re
import json

# تنظیمات
WORKER_URL = os.environ.get("WORKER_URL")
SECRET_KEY = os.environ.get("SECRET_KEY")

# --- منبع اول: یاهو فایننس (دقیق + سقف و کف) ---
def fetch_yahoo():
    print("1️⃣ Trying Yahoo Finance (GC=F)...")
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        url = "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d"
        resp = requests.get(url, headers=headers, timeout=10)
        
        if resp.status_code != 200:
            print("⚠️ Yahoo responded with error code.")
            return None

        data = resp.json()
        meta = data['chart']['result'][0]['meta']
        
        # استفاده از متد .get برای جلوگیری از ارور اگر کلیدی نبود
        price = meta.get('regularMarketPrice')
        prev_close = meta.get('chartPreviousClose') or meta.get('previousClose')
        high = meta.get('regularMarketDayHigh')
        low = meta.get('regularMarketDayLow')

        if price is None: return None

        # محاسبه درصد تغییر
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

# --- منبع دوم: کوین‌گکو (بکاپ - همیشه فعال) ---
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
            "high": "N/A (Backup Mode)",
            "low": "N/A (Backup Mode)",
            "source": "CoinGecko (Backup)"
        }
    except Exception as e:
        print(f"⚠️ CoinGecko Failed: {e}")
        return None

# --- مدیریت دریافت قیمت ---
def get_best_market_data():
    # اول یاهو را امتحان کن
    data = fetch_yahoo()
    if data: return data
    
    # اگر نشد، کوین‌گکو را امتحان کن
    print("🔄 Switching to Backup Source...")
    data = fetch_coingecko()
    if data: return data
    
    return None

# --- دریافت اخبار ---
def get_news():
    print("📰 Fetching News...")
    news_list = []
    urls = [
        "https://www.kitco.com/rss/category/commodities/gold",
        "https://www.fxstreet.com/rss/news"
    ]
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    for url in urls:
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            if resp.status_code == 200:
                titles = re.findall(r'<title>(.*?)</title>', resp.text)
                clean = [t.replace("<![CDATA[", "").replace("]]>", "").strip() for t in titles]
                filtered = [t for t in clean if len(t) > 20 and "Kitco" not in t][:2]
                news_list.extend(filtered)
        except: continue
            
    return news_list[:5]

# --- ارسال به کلودفلر ---
def send_payload(market_data, news_list):
    if not WORKER_URL:
        print("❌ ERROR: WORKER_URL is missing.")
        sys.exit(1)

    now = datetime.datetime.now()
    payload = {
        "market_data": market_data,
        "news_list": news_list,
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M UTC")
    }

    print(f"🚀 Sending Data: {market_data['source']}")
    headers = {"X-Secret-Key": SECRET_KEY, "Content-Type": "application/json"}
    
    try:
        resp = requests.post(WORKER_URL, json=payload, headers=headers, timeout=20)
        print(f"📡 Status: {resp.status_code}")
        print(f"📡 Response: {resp.text}")
    except Exception as e:
        print(f"❌ Connection Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    # 1. گرفتن قیمت (با سیستم هوشمند)
    market_data = get_best_market_data()
    
    # 2. گرفتن اخبار
    news_list = get_news()
    
    if market_data:
        send_payload(market_data, news_list)
    else:
        print("❌ Total Failure: Could not fetch price from ANY source.")
        sys.exit(1)
