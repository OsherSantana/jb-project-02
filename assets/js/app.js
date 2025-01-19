'use strict';

// Utility HOFs
const debounce = (fn, delay) => {
    let timeoutId;
    return function (event) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(function () {
            fn(event);
        }, delay);
    };
};

// Cache duration configuration
const CACHE_DURATION = {
    timeInMinutes: 2,
    calculateMilliseconds: function () {
        return CACHE_DURATION.timeInMinutes * 60 * 1000;
    }
};

// Cache management using HOF
const withCache = (fn) => {
    const cache = {};

    return async function (id) {
        const key = JSON.stringify(id);
        const cached = cache.hasOwnProperty(key) ? cache[key] : null;

        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION.calculateMilliseconds()) {
            return cached.value;
        }

        const result = await fn(id);
        cache[key] = { value: result, timestamp: Date.now() };
        return result;
    };
};

// State Management
const state = {
    currencies: [],
    selectedCurrencies: [],
    chartInterval: null
};



// API URLs
const API_URLS = {
    base: 'https://api.coingecko.com/api/v3',
    cryptoCompare: 'https://min-api.cryptocompare.com/data'
};

// API Service with Fetch
const api = {
    async getCurrencies() {
        try {
            const response = await fetch(`${API_URLS.base}/coins/list`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            return data.slice(0, 100);
        } catch (error) {
            console.error('Error fetching currencies:', error);
            throw error;
        }
    },

    getCurrencyDetails: withCache(async function (id) {
        try {
            const response = await fetch(`${API_URLS.base}/coins/${id}`);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error('Error fetching currency details:', error);
            throw error;
        }
    }),

    async getLivePrices(symbols) {
        try {
            const response = await fetch(`${API_URLS.cryptoCompare}/pricemulti?fsyms=${symbols.join(',')}&tsyms=USD`);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.json();
        } catch (error) {
            console.error('Error fetching live prices:', error);
            throw error;
        }
    }
};

// UI Components
const createCurrencyCard = function (currency) {
    const isSelected = Boolean(state.selectedCurrencies.find(function (c) {
        return c.id === currency.id;
    }));

    return `
        <div class="col-12 col-md-6 col-lg-4 mb-4">
            <div class="card h-100" data-currency-id="${currency.id}">
                <div class="card-body">
                    <h5 class="card-title">${currency.name}</h5>
                    <h6 class="card-subtitle mb-2 text-muted">${currency.symbol.toUpperCase()}</h6>
                    
                    <button class="btn btn-info btn-sm me-2 info-btn" 
                            onclick="handleMoreInfo('${currency.id}')">
                        More Info
                    </button>
                    
                    <button class="btn ${isSelected ? 'btn-danger' : 'btn-success'} btn-sm toggle-btn"
                            onclick="handleToggleSelection('${currency.id}')">
                        ${isSelected ? 'Remove from Report' : 'Add to Report'}
                    </button>
                    
                    <div class="currency-info mt-3" style="display: none;"></div>
                </div>
            </div>
        </div>
    `;
};

// Chart Management
let chart = null;

const initializeChart = function () {
    if (!chart) {
        chart = new CanvasJS.Chart("chartContainer", {
            title: {
                text: "Real-time Cryptocurrency Prices (USD)"
            },
            axisX: {
                title: "Time",
                valueFormatString: "HH:mm:ss"
            },
            axisY: {
                title: "Price (USD)",
                includeZero: false
            },
            legend: {
                cursor: "pointer",
                verticalAlign: "top",
                horizontalAlign: "center",
                dockInsidePlotArea: true
            },
            data: state.selectedCurrencies.map(function (currency) {
                return {
                    type: "line",
                    name: currency.symbol.toUpperCase(),
                    showInLegend: true,
                    dataPoints: []
                };
            })
        });
    }
    return chart;
};

// Event Handlers
const handleMoreInfo = async function (currencyId) {
    const card = document.querySelector(`[data-currency-id="${currencyId}"]`);
    const infoDiv = card.querySelector('.currency-info');

    if (infoDiv.style.display === 'none') {
        showLoading();
        try {
            const details = await api.getCurrencyDetails(currencyId);
            const prices = details.market_data.current_price;
            infoDiv.innerHTML = `
                <img src="${details.image.small}" class="mb-2" alt="${details.name}">
                <p class="mb-1">USD: $${prices.usd}</p>
                <p class="mb-1">EUR: €${prices.eur}</p>
                <p class="mb-1">ILS: ₪${prices.ils}</p>
            `;
            infoDiv.style.display = 'block';
        } catch (error) {
            infoDiv.innerHTML = '<p class="text-danger">Error loading details</p>';
            infoDiv.style.display = 'block';
        } finally {
            hideLoading();
        }
    } else {
        infoDiv.style.display = 'none';
    }
};

const handleToggleSelection = function (currencyId) {
    const currency = state.currencies.find(function (c) {
        return c.id === currencyId;
    });
    if (!currency) return;

    const isSelected = Boolean(state.selectedCurrencies.find(function (c) {
        return c.id === currencyId;
    }));

    if (isSelected) {
        state.selectedCurrencies = state.selectedCurrencies.filter(function (c) {
            return c.id !== currencyId;
        });
    } else if (state.selectedCurrencies.length >= 5) {
        showReportModal(currency);
        return;
    } else {
        state.selectedCurrencies.push(currency);
    }

    updateUI();
};

// Modal Management
const showReportModal = function (newCurrency) {
    const modalContent = `
        <div class="modal-header">
            <h5 class="modal-title">Select a currency to remove</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
            ${state.selectedCurrencies.map(function (currency) {
        return `
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span>${currency.name} (${currency.symbol.toUpperCase()})</span>
                        <button class="btn btn-danger btn-sm" 
                                onclick="handleReplaceSelection('${currency.id}', '${newCurrency.id}')">
                            Remove
                        </button>
                    </div>
                `;
    }).join('')}
        </div>
        <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
        </div>
    `;

    document.querySelector('#reportModal .modal-content').innerHTML = modalContent;
    const reportModal = new bootstrap.Modal(document.getElementById('reportModal'));
    reportModal.show();
};

const handleReplaceSelection = function (oldId, newId) {
    state.selectedCurrencies = state.selectedCurrencies.filter(function (c) {
        return c.id !== oldId;
    });

    const newCurrency = state.currencies.find(function (c) {
        return c.id === newId;
    });

    if (newCurrency) {
        state.selectedCurrencies.push(newCurrency);
    }

    const reportModal = bootstrap.Modal.getInstance(document.getElementById('reportModal'));
    reportModal.hide();

    updateUI();
};

const handleSearch = debounce(function (event) {
    const searchTerm = event.target.value.toLowerCase();
    const cards = document.querySelectorAll('.card');

    cards.forEach(function (card) {
        const text = card.textContent.toLowerCase();
        const cardContainer = card.closest('.col-12');
        if (cardContainer) {
            cardContainer.style.display = text.includes(searchTerm) ? 'block' : 'none';
        }
    });
}, 300);

// Chart Updates
const startLiveUpdates = async function () {
    if (state.selectedCurrencies.length === 0) return;

    const symbols = state.selectedCurrencies.map(function (c) {
        return c.symbol.toUpperCase();
    });

    const chart = initializeChart();

    const updateChart = async function () {
        try {
            const prices = await api.getLivePrices(symbols);
            const time = new Date();

            chart.options.data.forEach(function (series, index) {
                const symbol = symbols[index];
                if (prices[symbol]) {
                    series.dataPoints.push({
                        x: time,
                        y: prices[symbol].USD
                    });

                    if (series.dataPoints.length > 50) {
                        series.dataPoints.shift();
                    }
                }
            });

            chart.render();
        } catch (error) {
            console.error('Error updating chart:', error);
        }
    };

    clearInterval(state.chartInterval);
    updateChart(); // Initial update
    state.chartInterval = setInterval(updateChart, 2000);
};

const stopLiveUpdates = function () {
    clearInterval(state.chartInterval);
    state.chartInterval = null;
};

// UI Updates
const updateUI = function () {
    const mainContent = document.getElementById('mainContent');
    const path = window.location.hash || '#currencies';

    switch (path) {
        case '#currencies':
            mainContent.innerHTML = `
                <div class="row">
                    ${state.currencies.map(createCurrencyCard).join('')}
                </div>
            `;
            document.getElementById('chartContainer').style.display = 'none';
            stopLiveUpdates();
            break;

        case '#reports':
            if (state.selectedCurrencies.length === 0) {
                mainContent.innerHTML = '<div class="alert alert-info">No currencies selected for report</div>';
                document.getElementById('chartContainer').style.display = 'none';
                stopLiveUpdates();
            } else {
                mainContent.innerHTML = `
                    <div class="selected-currencies mb-4">
                        <h3>Selected Currencies</h3>
                        <div class="row">
                            ${state.selectedCurrencies.map(createCurrencyCard).join('')}
                        </div>
                    </div>
                `;
                document.getElementById('chartContainer').style.display = 'block';
                startLiveUpdates();
            }
            break;

        case '#about':
            mainContent.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-4 mb-4">
                                <img src="./assets/images/PHOTO-2024-11-22-22-51-31.jpg" alt="Osher Santana" class="img-fluid rounded about-image">
                            </div>
                            <div class="col-md-8">
                                <h2>About Me</h2>
                                <h4>Osher Santana</h4>
                                <p>Age: 22</p>
                                <p>Location: Hamerkaz, Israel</p>
                                <div class="mt-4">
                                    <h5>About This Project</h5>
                                    <p>Hey! I'm excited to share this cryptocurrency tracking platform I've developed. It's a dynamic website that lets you monitor real-time crypto prices, create custom watchlists, and view detailed market data. I built it using modern web technologies including HTML5, CSS3, JavaScript, and integrated multiple APIs to provide live market updates. The project showcases my passion for both web development and the cryptocurrency space.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.getElementById('chartContainer').style.display = 'none';
            stopLiveUpdates();
            break;
    }
};

// Loading State
const showLoading = function () {
    document.getElementById('loadingSpinner').style.display = 'flex';
};

const hideLoading = function () {
    document.getElementById('loadingSpinner').style.display = 'none';
};

// Navigation
const handleNavigation = function () {
    document.querySelectorAll('.nav-link').forEach(function (link) {
        link.classList.remove('active');
    });
    const currentHash = window.location.hash || '#currencies';
    const currentLink = document.querySelector(`[href="${currentHash}"]`);
    if (currentLink) {
        currentLink.classList.add('active');
    }
    updateUI();
};

// Initialize Application
const initialize = async function () {
    try {
        showLoading();
        state.currencies = await api.getCurrencies();
        handleNavigation();
    } catch (error) {
        console.error('Error initializing application:', error);
        document.getElementById('mainContent').innerHTML = `
            <div class="alert alert-danger">
                Failed to load currencies. Please try again later.
            </div>
        `;
    } finally {
        hideLoading();
    }
};

// Event Listeners
window.addEventListener('hashchange', handleNavigation);
document.getElementById('searchInput').addEventListener('input', handleSearch);
document.addEventListener('DOMContentLoaded', initialize);

// Make functions globally available
window.handleMoreInfo = handleMoreInfo;
window.handleToggleSelection = handleToggleSelection;
window.handleReplaceSelection = handleReplaceSelection;