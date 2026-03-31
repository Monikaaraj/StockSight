from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import yfinance as yf
import pandas as pd
import numpy as np
import ta
from sklearn.ensemble import RandomForestClassifier
from datetime import datetime, timedelta

app = FastAPI(title="StockSight API")

@app.get("/api/analyze")
def analyze_stock(ticker: str = "AAPL"):
    ticker = ticker.upper()
    print(f"[*] Analyzing {ticker} in real-time...")
    
    end_date = datetime.today()
    start_date = end_date - timedelta(days=365 * 2)
    
    # Download data rapidly
    df = yf.download(
        tickers=ticker, 
        start=start_date.strftime('%Y-%m-%d'), 
        end=end_date.strftime('%Y-%m-%d'),
        progress=False
    )
    
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for {ticker}")
        
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)

    # Feature Engineering
    df['SMA_20'] = ta.trend.sma_indicator(df['Close'], window=20)
    df['RSI'] = ta.momentum.rsi(df['Close'], window=14)
    macd = ta.trend.MACD(df['Close'])
    df['MACD'] = macd.macd()
    df['MACD_Signal'] = macd.macd_signal()
    df['MACD_Histogram'] = macd.macd_diff()

    # Target Logic
    df['Next_Close'] = df['Close'].shift(-1)
    df['Target'] = (df['Next_Close'] > df['Close']).astype(int)
    
    df.dropna(inplace=True)
    
    if len(df) < 50:
        raise HTTPException(status_code=400, detail="Not enough history to train ML.")

    # Train Random Forest
    features = ['SMA_20', 'RSI', 'MACD', 'MACD_Signal', 'MACD_Histogram']
    X = df[features]
    y = df['Target']
    split_idx = int(len(df) * 0.8)
    X_train, y_train = X.iloc[:split_idx], y.iloc[:split_idx]
    X_test, y_test = X.iloc[split_idx:], y.iloc[split_idx:]

    model = RandomForestClassifier(n_estimators=100, random_state=42, class_weight='balanced')
    model.fit(X_train, y_train)

    from sklearn.metrics import accuracy_score
    y_test_pred = model.predict(X_test)
    accuracy_val = accuracy_score(y_test, y_test_pred)

    df['Model_Prediction'] = model.predict(X)
    
    # Export Preparation
    export_df = df.reset_index()
    export_df['Date'] = pd.to_datetime(export_df['Date']).dt.strftime('%Y-%m-%d')
    
    export_columns = [
        'Date', 'Open', 'High', 'Low', 'Close', 'Volume', 
        'SMA_20', 'RSI', 'MACD', 'MACD_Signal', 'MACD_Histogram',
        'Target', 'Model_Prediction'
    ]
    export_df = export_df[export_columns]
    
    # Convert inf/-inf/NaN to None for JSON
    export_df = export_df.replace([np.inf, -np.inf], None)
    export_df = export_df.where(pd.notnull(export_df), None)
    
    # Keep last 150 days
    export_df = export_df.tail(150)
    
    return JSONResponse(content={"ticker": ticker, "accuracy": round(accuracy_val, 4), "data": export_df.to_dict(orient='records')})

# Serve the Dashboard statically
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Run server programmatically when executing main.py
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
