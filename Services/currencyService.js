const axios = require('axios');
const NodeCache = require('node-cache');

class CurrencyService {
  constructor() {
    // Cache for 24 hours (86400 seconds)
    this.cache = new NodeCache({ stdTTL: 86400 });
    this.BASE_URL = 'https://open.er-api.com/v6/latest';
  }

  /**
   * Convert amount from one currency to another
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency code (e.g. 'EUR')
   * @param {string} toCurrency - Target currency code (e.g. 'COP')
   * @returns {Promise<{amount: number, rate: number}|null>} - Converted amount and rate used, or null if failed
   */
  async convert(amount, fromCurrency, toCurrency) {
    if (!amount || !fromCurrency || !toCurrency) {
      return null;
    }

    const from = fromCurrency.toUpperCase();
    const to = toCurrency.toUpperCase();

    if (from === to) {
      return { amount, rate: 1 };
    }

    try {
      const rates = await this.getRates(from);
      const rate = rates[to];

      if (!rate) {
        console.warn(`Exchange rate not found for ${from} to ${to}`);
        return null;
      }

      const convertedAmount = amount * rate;
      return { 
        amount: parseFloat(convertedAmount.toFixed(2)), 
        rate 
      };
    } catch (error) {
      console.error(`Error converting currency ${from} -> ${to}:`, error.message);
      return null;
    }
  }

  /**
   * Get exchange rates for a base currency
   * @param {string} baseCurrency 
   * @returns {Promise<Object>} - Map of currency codes to rates
   */
  async getRates(baseCurrency) {
    const cacheKey = `rates_${baseCurrency}`;
    const cachedRates = this.cache.get(cacheKey);

    if (cachedRates) {
      return cachedRates;
    }

    try {
      const response = await axios.get(`${this.BASE_URL}/${baseCurrency}`);
      if (response.data && response.data.result === 'success') {
        const rates = response.data.rates;
        this.cache.set(cacheKey, rates);
        return rates;
      } else {
        throw new Error('Failed to fetch rates from API');
      }
    } catch (error) {
      console.error(`Error fetching rates for ${baseCurrency}:`, error.message);
      throw error;
    }
  }
}

module.exports = new CurrencyService();
