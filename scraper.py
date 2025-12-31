import yfinance as yf
import requests
import os
import sys

# تنظیمات (این‌ها را از متغیرهای گیت‌هاب می‌خواند)
# اگر آدرس ورکر خودت را داری اینجا جایگزین کن، وگرنه از Env می‌خواند
CLOUDFLARE_URL = os.environ.get("WORKER_URL") 
SECRET_KEY = os.environ.get("SECRET_KEY")

def get_gold_data():
    print("📈 Fetching Global Gold (XAU/USD) from Yahoo Finance...")
    try:
        # دریافت داده‌های طلای جهانی (GC=F فیوچرز طلا)
        gold = yf.Ticker("GC=F")
        hist = gold.history(period="1d")
        
        if hist.empty:
            print("❌ Data is empty!")
            return None

        current = hist['Close'].iloc[-1]
        open_price = hist['Open'].iloc[-1]
        high = hist['High'].iloc[-1]
        low = hist['Low'].iloc[-1]
        
        # محاسبه درصد تغییر
        change = ((current - open_price) / open_price) * 100
        
        data = {
            "price": round(current, 2),
            "change": round(change, 2),
            "high": round(high, 2),
            "low": round(low, 2)
        }
        print(f"✅ Data Fetched: {data}")
        return data
    except Exception as e:
        print(f"❌ Error fetching gold: {e}")
        return None

def send_to_worker(data):
    if not CLOUDFLARE_URL:
        print("❌ Error: WORKER_URL is missing!")
        return

    print(f"🚀 Sending to Cloudflare: {CLOUDFLARE_URL}")
    payload = {"market_data": data}
    headers = {
        "X-Secret-Key": SECRET_KEY,
        "Content-Type": "application/json"
    }
    
    try:
        resp = requests.post(CLOUDFLARE_URL, json=payload, headers=headers)
        print(f"📡 Response Status: {resp.status_code}")
        print(f"📡 Response Body: {resp.text}")
    except Exception as e:
        print(f"❌ Connection Error: {e}")

if __name__ == "__main__":
    gold_data = get_gold_data()
    if gold_data:
        send_to_worker(gold_data)
    else:
        print("Failed to get data. Exiting.")
        sys.exit(1)
