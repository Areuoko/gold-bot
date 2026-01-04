import requests
import os
import sys
import datetime
import re

# تنظیمات
WORKER_URL = os.environ.get("WORKER_URL")
SECRET_KEY = os.environ.get("SECRET_KEY")

# 1. دریافت قیمت دقیق + سقف و کف از یاهو فایننس
def get_gold_data():
    print("⏳ Fetching Data from Yahoo Finance (GC=F)...")
    try:
        # دریافت داده‌های فیوچرز طلا (استاندارد جهانی)
        headers = {'User-Agent': 'Mozilla/5.0'}
        url = "https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d&range=1d"
        resp = requests.get(url, headers=headers, timeout=10)
        
        if resp.status_code != 200:
            print("❌ Yahoo Finance Failed.")
            return None

        data = resp.json()['chart']['result'][0]
        quote = data['meta']
        
        # استخراج داده‌های دقیق
        market_data = {
            "price": round(quote['regularMarketPrice'], 2),
            "prev_close": round(quote['previousClose'], 2),
            "high": round(quote['regularMarketDayHigh'], 2),
            "low": round(quote['regularMarketDayLow'], 2),
            "change_percent": 0.0
        }
        
        # محاسبه درصد تغییر
        diff = market_data['price'] - market_data['prev_close']
        market_data['change_percent'] = round((diff / market_data['prev_close']) * 100, 2)
        
        print(f"✅ Price: ${market_data['price']} | High: {market_data['high']} | Low: {market_data['low']}")
        return market_data

    except Exception as e:
        print(f"❌ Error getting price: {e}")
        return None

# 2. دریافت اخبار (توسط پایتون انجام می‌شود تا بلاک نشود)
def get_news():
    print("⏳ Fetching News...")
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
                # استخراج ساده تیترها با Regex
                titles = re.findall(r'<title>(.*?)</title>', resp.text)
                # حذف تگ‌های اضافه و تمیزکاری
                clean_titles = [t.replace("<![CDATA[", "").replace("]]>", "").strip() for t in titles]
                # حذف تیترهای تکراری یا نامربوط (مثل اسم سایت)
                filtered = [t for t in clean_titles if len(t) > 15 and "Kitco" not in t][:3]
                news_list.extend(filtered)
        except:
            continue
            
    print(f"✅ Fetched {len(news_list)} news headlines.")
    return news_list[:6] # ارسال 6 خبر مهم

# 3. ارسال همه چیز به کلودفلر
def send_payload(market_data, news_list):
    if not WORKER_URL:
        print("❌ WORKER_URL missing.")
        sys.exit(1)

    # محاسبه تاریخ و ساعت دقیق
    now = datetime.datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    time_str = now.strftime("%H:%M UTC")

    payload = {
        "market_data": market_data,
        "news_list": news_list,
        "date": date_str,
        "time": time_str
    }

    print("🚀 Sending full payload to Worker...")
    headers = {"X-Secret-Key": SECRET_KEY, "Content-Type": "application/json"}
    
    try:
        resp = requests.post(WORKER_URL, json=payload, headers=headers, timeout=20)
        print(f"📡 Response: {resp.text}")
    except Exception as e:
        print(f"❌ Send Failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    data = get_gold_data()
    news = get_news()
    
    if data:
        send_payload(data, news)
    else:
        print("❌ Failed to get data.")
        sys.exit(1)
