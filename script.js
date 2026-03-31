// Chart Customization Defaults
Chart.defaults.color = '#8b949e';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.scale.grid.color = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(22, 27, 34, 0.9)';
Chart.defaults.plugins.tooltip.titleColor = '#fff';
Chart.defaults.plugins.tooltip.bodyColor = '#8b949e';
Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.cornerRadius = 8;

let charts = {}; // Store charts to destroy on re-render

document.addEventListener('DOMContentLoaded', () => {
    fetchStockData('AAPL');
});

function handleSearch(event) {
    if (event.key === 'Enter') fetchStockData();
}

async function fetchStockData(defaultTicker = null) {
    const inputEl = document.getElementById('ticker-input');
    let ticker = defaultTicker || inputEl.value.trim().toUpperCase();
    if (!ticker) return;
    
    document.getElementById('loading-overlay').classList.remove('hidden');
    
    try {
        const response = await fetch(`/api/analyze?ticker=${ticker}`);
        if (!response.ok) throw new Error(`Data fetch failed for ${ticker}`);
        const json = await response.json();
        
        document.querySelector('.ticker-info h2').innerText = json.ticker;
        document.querySelector('.company-name').innerText = json.ticker + " Data";
        
        // Dynamically update correct accuracy
        const accPercentage = (json.accuracy * 100).toFixed(1);
        document.querySelector('.model-acc').innerText = accPercentage + "%";
        
        initializeDashboard(json.data);
    } catch (err) {
        console.error(err);
        alert(err.message);
        document.getElementById('ai-pred-next').innerText = "Data Error";
    } finally {
        document.getElementById('loading-overlay').classList.add('hidden');
    }
}

function initializeDashboard(data) {
    // Sort data chronologically just in case
    data.sort((a, b) => new Date(a.Date) - new Date(b.Date));

    // Get the most recent valid row
    const latestRow = data[data.length - 1];
    const prevRow = data[data.length - 2];

    // ==============
    // UPDATE UI KPIs
    // ==============
    
    // Format Date
    document.getElementById('last-date').innerText = latestRow.Date;
    
    // Price
    document.getElementById('last-price').innerText = '$' + latestRow.Close.toFixed(2);
    
    // Price Change
    const priceDiff = latestRow.Close - prevRow.Close;
    const priceChangePct = (priceDiff / prevRow.Close) * 100;
    const changeEl = document.getElementById('price-change');
    
    if (priceDiff >= 0) {
        changeEl.innerText = `+${priceDiff.toFixed(2)} (+${priceChangePct.toFixed(2)}%)`;
        changeEl.className = 'price-change positive';
    } else {
        changeEl.innerText = `${priceDiff.toFixed(2)} (${priceChangePct.toFixed(2)}%)`;
        changeEl.className = 'price-change negative';
    }

    // AI Prediction for Next Day
    const predictionText = document.getElementById('ai-pred-next');
    if (latestRow.Model_Prediction === 1) {
        predictionText.innerText = "UPWARD TREND";
        predictionText.className = "prediction-text positive";
    } else {
        predictionText.innerText = "DOWNWARD TREND";
        predictionText.className = "prediction-text negative";
    }

    // SMA KPI
    document.getElementById('kpi-sma').innerText = '$' + latestRow.SMA_20.toFixed(2);
    const smaDiff = latestRow.Close - latestRow.SMA_20;
    const kpiSmaTrend = document.getElementById('kpi-sma-trend');
    if(smaDiff > 0) {
        kpiSmaTrend.innerText = "Price > SMA (Bullish)";
        kpiSmaTrend.className = "trend positive";
    } else {
        kpiSmaTrend.innerText = "Price < SMA (Bearish)";
        kpiSmaTrend.className = "trend negative";
    }

    // RSI KPI
    document.getElementById('kpi-rsi').innerText = latestRow.RSI.toFixed(2);
    const kpiRsiEval = document.getElementById('kpi-rsi-eval');
    if (latestRow.RSI >= 70) {
        kpiRsiEval.innerText = "Overbought Line";
        kpiRsiEval.className = "trend negative";
    } else if (latestRow.RSI <= 30) {
        kpiRsiEval.innerText = "Oversold Line";
        kpiRsiEval.className = "trend positive";
    } else {
        kpiRsiEval.innerText = "Neutral Zone";
        kpiRsiEval.className = "trend";
    }

    // MACD KPI
    document.getElementById('kpi-macd').innerText = latestRow.MACD_Histogram.toFixed(3);
    const kpiMacdTrend = document.getElementById('kpi-macd-trend');
    if (latestRow.MACD_Histogram > 0) {
        kpiMacdTrend.innerText = "Positive Momentum";
        kpiMacdTrend.className = "trend positive";
    } else {
        kpiMacdTrend.innerText = "Negative Momentum";
        kpiMacdTrend.className = "trend negative";
    }

    // ==============
    // BUILD CHARTS
    // ==============
    
    // We will limit to the last 150 days for better visualization fidelity
    const displayData = data.slice(-150);
    
    const dates = displayData.map(d => d.Date);
    const prices = displayData.map(d => d.Close);
    const smas = displayData.map(d => d.SMA_20);
    
    // Find points where model predicted UP (1)
    const buySignals = displayData.map(d => 
        (d.Model_Prediction === 1) ? d.Close : null
    );

    // 1. PRICE & SMA CHART
    const ctxPrice = document.getElementById('priceChart').getContext('2d');
    if (charts['price']) charts['price'].destroy();
    
    // Create subtle gradient for price line
    const gradientPrice = ctxPrice.createLinearGradient(0, 0, 0, 400);
    gradientPrice.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
    gradientPrice.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    charts['price'] = new Chart(ctxPrice, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Close Price',
                    data: prices,
                    borderColor: '#3b82f6',
                    backgroundColor: gradientPrice,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    pointHoverRadius: 5
                },
                {
                    label: '20-Day SMA',
                    data: smas,
                    borderColor: 'rgba(255, 255, 255, 0.2)',
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.2,
                    pointRadius: 0
                },
                {
                    label: 'AI Predicts Upward',
                    data: buySignals,
                    borderColor: '#10b981',
                    backgroundColor: '#10b981',
                    borderWidth: 0,
                    pointStyle: 'circle',
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month' },
                    grid: { display: false }
                },
                y: {
                    position: 'right',
                    ticks: { callback: (value) => '$' + value }
                }
            }
        }
    });

    // 2. RSI CHART
    const rsis = displayData.map(d => d.RSI);
    const ctxRsi = document.getElementById('rsiChart').getContext('2d');
    if (charts['rsi']) charts['rsi'].destroy();
    
    charts['rsi'] = new Chart(ctxRsi, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'RSI',
                data: rsis,
                borderColor: '#8b5cf6',
                borderWidth: 1.5,
                fill: false,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                annotation: { // Simple annotations can be done via scaling configs if plugin absent, we'll just use grid lines here
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month' },
                    grid: { display: false }
                },
                y: {
                    min: 0,
                    max: 100,
                    grid: {
                        color: (context) => {
                            if (context.tick.value === 30 || context.tick.value === 70) {
                                return 'rgba(255, 255, 255, 0.15)';
                            }
                            return 'rgba(255, 255, 255, 0.05)';
                        }
                    }
                }
            }
        }
    });

    // 3. MACD CHART
    const macds = displayData.map(d => d.MACD);
    const macdSignals = displayData.map(d => d.MACD_Signal);
    const macdHist = displayData.map(d => d.MACD_Histogram);
    
    // Histogram colors based on positive/negative
    const histColors = macdHist.map(h => h >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)');

    const ctxMacd = document.getElementById('macdChart').getContext('2d');
    if (charts['macd']) charts['macd'].destroy();

    charts['macd'] = new Chart(ctxMacd, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    type: 'bar',
                    label: 'Histogram',
                    data: macdHist,
                    backgroundColor: histColors,
                    borderWidth: 0,
                    yAxisID: 'y'
                },
                {
                    type: 'line',
                    label: 'MACD',
                    data: macds,
                    borderColor: '#3b82f6',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    tension: 0.3
                },
                {
                    type: 'line',
                    label: 'Signal',
                    data: macdSignals,
                    borderColor: '#f59e0b',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'month' },
                    grid: { display: false }
                },
                y: {
                    position: 'right'
                }
            }
        }
    });
}

function scrollToSection(index, el) {
    const listItems = document.querySelectorAll('#nav-list li');
    listItems.forEach(li => li.classList.remove('active'));
    el.classList.add('active');

    const sections = ['section-overview', 'section-technical', 'section-model'];
    const target = document.getElementById(sections[index]);
    if(target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}
