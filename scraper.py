import requests
import os
import sys
import time

# تنظیمات
WORKER_URL = os.environ.get("WORKER_URL")
SECRET_KEY = os.environ.get("SECRET_KEY")

def get_gold_price():
    print("⏳ Connecting to CoinGecko API...")
    try:
        # استفاده از API کوین‌گکو برای قیمت PAX Gold (معادل طلای جهانی)
        # این API تحریم نیست و نیاز به فیلترشکن ندارد
        url = "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_24hr_change=true"
        
        # هدر مرورگر برای اینکه ربات تشخیص داده نشود
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
        
        resp = requests.get(url, headers=headers, timeout=15)
        
        if resp.status_code != 200:
            print(f"❌ CoinGecko API Failed: {resp.status_code}")
            print(resp.text)
            return None
            
        data = resp.json()
        
        # استخراج داده‌ها
        if 'pax-gold' not in data:
            print("❌ Error: 'pax-gold' not found in response.")
            return None

        market_data = {
            "price": float(data['pax-gold']['usd']),
            "change": float(data['pax-gold']['usd_24h_change']),
            "high": "N/A", # کوین‌گکو در حالت رایگان سقف/کف نمی‌دهد
            "low": "N/A",
            "source": "CoinGecko (PAXG)"
        }
        print(f"✅ Price Found: ${market_data['price']}")
        return market_data

    except Exception as e:
        print(f"❌ Error fetching price: {e}")
        return None

def send_to_worker(data):
    if not WORKER_URL:
        print("❌ CRITICAL ERROR: WORKER_URL is missing!")
        sys.exit(1)

    print(f"🚀 Sending data to: {WORKER_URL}")
    
    headers = {
        "X-Secret-Key": SECRET_KEY,
        "Content-Type": "application/json"
    }
    
    payload = {"market_data": data}

    try:
        resp = requests.post(WORKER_URL, json=payload, headers=headers, timeout=20)
        print(f"📡 Worker Status: {resp.status_code}")
        print(f"📡 Worker Response: {resp.text}")
        
        if resp.status_code == 200:
            print("✅ SUCCESS! Message sent to Telegram.")
        else:
            print("⚠️ Worker did not return 200. Check Worker Logs.")
            sys.exit(1)
            
    except Exception as e:
        print(f"❌ Failed to send to Worker: {e}")
        sys.exit(1)

if __name__ == "__main__":
    data = get_gold_price()
    if data:
        send_to_worker(data)
    else:
        print("❌ Failed to get gold price. Exiting.")
        sys.exit(1)
