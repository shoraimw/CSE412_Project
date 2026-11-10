import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CURRENCIES, CurrencyCode } from './payments.dto';

@Injectable()
export class PaymentsService {
  private cachedRates: { rates: Record<string, number>; fetchedAt: number } | null = null;

  async getRates() {
    if (this.cachedRates && Date.now() - this.cachedRates.fetchedAt < 60 * 60 * 1000) {
      return { base: 'BDT', rates: this.pickRates(this.cachedRates.rates), fetchedAt: new Date(this.cachedRates.fetchedAt).toISOString(), cached: true };
    }
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/BDT', { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('FX provider request failed');
      const data: any = await response.json();
      if (data.result !== 'success' || !data.rates) throw new Error('FX provider returned invalid data');
      this.cachedRates = { rates: data.rates, fetchedAt: Date.now() };
      return { base: 'BDT', rates: this.pickRates(data.rates), fetchedAt: new Date().toISOString(), cached: false, provider: 'open.er-api.com' };
    } catch {
      if (this.cachedRates) return { base: 'BDT', rates: this.pickRates(this.cachedRates.rates), fetchedAt: new Date(this.cachedRates.fetchedAt).toISOString(), cached: true, stale: true };
      throw new ServiceUnavailableException('Live exchange rates are temporarily unavailable. Please try again later.');
    }
  }

  private pickRates(all: Record<string, number>) {
    return Object.fromEntries(CURRENCIES.map(code => [code, code === 'BDT' ? 1 : all[code]]).filter(([, rate]) => typeof rate === 'number'));
  }

  async createQuote(amountBDT: number, currency: CurrencyCode, rideId?: string) {
    const result = await this.getRates();
    const rate = result.rates[currency];
    if (typeof rate !== 'number') throw new ServiceUnavailableException('Exchange rate for ' + currency + ' is unavailable.');
    const convertedAmount = Number((amountBDT * rate).toFixed(2));
    const quoteId = 'quote_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    return {
      quoteId,
      rideId: rideId || null,
      originalAmount: amountBDT,
      originalCurrency: 'BDT',
      convertedAmount,
      currency,
      exchangeRate: rate,
      rateFetchedAt: result.fetchedAt,
      status: 'quote_only',
      paymentGateway: null,
      paymentCollected: false,
      message: 'Currency conversion quote only. No payment has been initiated or collected.',
    };
  }

  supportedCurrencies() { return CURRENCIES; }
}
