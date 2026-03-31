import yfinance as yf
import pandas as pd
import numpy as np
import ta
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from datetime import datetime, timedelta

def main():
    """
    StockSight: Financial Forecasting and Visual Analytics System
    This script downloads stock data, performs feature engineering, trains a 
    Random Forest model to predict price movement, and exports the data for BI tools.
    """
    
    # ==========================================
    # 1. Data Ingestion
    # ==========================================
    ticker = 'AAPL'
    print(f"[*] Downloading 2 years of daily data for {ticker}...")
    
    # Calculate date range (exact last 2 years from today)
    end_date = datetime.today()
    start_date = end_date - timedelta(days=365 * 2)
    
    # Fetch data using yfinance
    df = yf.download(
        tickers=ticker, 
        start=start_date.strftime('%Y-%m-%d'), 
        end=end_date.strftime('%Y-%m-%d')
    )
    
    if df.empty:
        print("[!] Error: No data downloaded. Please check your internet connection or the ticker symbol.")
        return
        
    # Handle yfinance multi-index columns (common in newer yfinance versions)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.droplevel(1)
        
    print(f"[+] Successfully downloaded {len(df)} rows of data.")

    # ==========================================
    # 2. Feature Engineering
    # ==========================================
    print("[*] Calculating technical indicators (SMA, RSI, MACD)...")
    
    # 20-day Simple Moving Average (SMA)
    # Highlights the short-to-medium term trend
    df['SMA_20'] = ta.trend.sma_indicator(df['Close'], window=20)
    
    # 14-day Relative Strength Index (RSI)
    # Measures the magnitude of recent price changes to evaluate overbought or oversold conditions
    df['RSI'] = ta.momentum.rsi(df['Close'], window=14)
    
    # Moving Average Convergence Divergence (MACD)
    # Shows the relationship between two moving averages of a security’s price
    macd = ta.trend.MACD(df['Close'])
    df['MACD'] = macd.macd()
    df['MACD_Signal'] = macd.macd_signal()
    df['MACD_Histogram'] = macd.macd_diff()

    # ==========================================
    # 3. Target Variable
    # ==========================================
    # We want to predict if TOMORROW's close is higher than TODAY's close.
    # We shift the close price backwards by 1 to align tomorrow's close with today's features.
    df['Next_Close'] = df['Close'].shift(-1)
    
    # Binary classification: 1 if Next_Close > Close (Price goes up), else 0
    df['Target'] = (df['Next_Close'] > df['Close']).astype(int)

    # Drop rows with NaN values created by our shift and indicator lookback windows
    # (e.g. SMA_20 requires 20 periods of data before it yields its first valid value)
    df.dropna(inplace=True)
    
    print(f"[+] Prepared data shape after dropping NaNs: {df.shape}")

    # ==========================================
    # 4. Model Training
    # ==========================================
    print("[*] Training RandomForestClassifier...")
    
    # Define our feature set
    features = ['SMA_20', 'RSI', 'MACD', 'MACD_Signal', 'MACD_Histogram']
    X = df[features]
    y = df['Target']

    # Chronological Train/Test Split (80% Train, 20% Test)
    # For time-series, we never use random splitting (like train_test_split) to avoid data leakage
    split_idx = int(len(df) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    print(f"    -> Training set: {len(X_train)} samples")
    print(f"    -> Testing set: {len(X_test)} samples")

    # Initialize and train the Random Forest
    model = RandomForestClassifier(
        n_estimators=100, 
        random_state=42,
        class_weight='balanced' # Helps if there is slight class imbalance
    )
    model.fit(X_train, y_train)

    # Make predictions on the unseen test data
    y_test_pred = model.predict(X_test)

    # ==========================================
    # 5. Evaluation
    # ==========================================
    print("\n" + "="*42)
    print(" MODEL EVALUATION (TEST SET)")
    print("="*42)
    
    accuracy = accuracy_score(y_test, y_test_pred)
    print(f"Accuracy: {accuracy:.4f}\n")
    
    print("Classification Report:")
    print(classification_report(y_test, y_test_pred))

    # Add historical predictions back to the full dataset for our BI Dashboard
    # (Note: In a true production app, we'd only visualize test predictions, 
    # but for a portfolio BI dashboard it's helpful to see model behavior over the whole history)
    df['Model_Prediction'] = model.predict(X)

    # ==========================================
    # 6. BI Export
    # ==========================================
    print("\n[*] Exporting data for Tableau / Power BI...")
    
    # Reset index so 'Date' becomes a standard column instead of the dataframe index
    export_df = df.reset_index()
    
    # Optimize Date formatting for Dashboard ingestion (YYYY-MM-DD)
    export_df['Date'] = pd.to_datetime(export_df['Date']).dt.date
    
    # Ensure types are strict for BI tools
    export_columns = [
        'Date', 'Open', 'High', 'Low', 'Close', 'Volume', 
        'SMA_20', 'RSI', 'MACD', 'MACD_Signal', 'MACD_Histogram',
        'Target', 'Model_Prediction'
    ]
    
    # Filter only necessary columns to keep the file clean and lightweight
    export_df = export_df[export_columns]
    
    # Round numerical values for cleaner CSV reading
    float_cols = ['Open', 'High', 'Low', 'Close', 'SMA_20', 'RSI', 'MACD', 'MACD_Signal', 'MACD_Histogram']
    export_df[float_cols] = export_df[float_cols].round(4)
    
    # Save to CSV
    export_filename = 'stocksight_export.csv'
    export_df.to_csv(export_filename, index=False)
    
    print(f"[+] Process complete! '{export_filename}' has been generated successfully.")

if __name__ == "__main__":
    main()
