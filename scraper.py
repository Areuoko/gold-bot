import requests
import os
import sys

# تنظیمات
WORKER_URL = os.environ.get("WORKER_URL")
SECRET_KEY = os.environ.get("SECRET_KEY")

def get_gold_price():
    print("⏳ Connecting to Binance API...")
    try:
        # دریافت قیمت PAXG (طلای جهانی)
        url = "https://api.binance.com/api/v3/ticker/24hr?symbol=PAXGUSDT"
        resp = requests.get(url, timeout=10)
        
        if resp.status_code != 200:
            print(f"❌ Binance API Failed: {resp.status_code}")
            return None
            
        data = resp.json()
        
        market_data = {
            "price": float(data['lastPrice']),
            "change": float(data['priceChangePercent']),
            "high": float(data['highPrice']),
            "low": float(data['lowPrice']),
            "source": "Binance via GitHub"
        }
        print(f"✅ Price Found: ${market_data['price']}")
        return market_data

    except Exception as e:
        print(f"❌ Error fetching price: {e}")
        return None

def send_to_worker(data):
    if not WORKER_URL:
        print("❌ Error: WORKER_URL is missing!")
        sys.exit(1)

    print(f"🚀 Sending data to: {WORKER_URL}")
    
    headers = {
        "X-Secret-Key": SECRET_KEY,
        "Content-Type": "application/json"
    }
    
    payload = {"market_data": data}

    try:
        resp = requests.post(WORKER_URL, json=payload, headers=headers, timeout=10)
        print(f"📡 Worker Response: {resp.status_code}")
        
        if resp.status_code == 200:
            print("✅ SUCCESS! Message sent to Telegram.")
        else:
            print(f"⚠️ Worker Error: {resp.text}")
            
    except Exception as e:
        print(f"❌ Failed to send to Worker: {e}")
        sys.exit(1)

if __name__ == "__main__":
    data = get_gold_price()
    if data:
        send_to_worker(data)
    else:
        sys.exit(1)
