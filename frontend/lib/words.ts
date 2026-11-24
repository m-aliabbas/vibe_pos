import { ToWords } from 'to-words';

// en-IN gives Lakh / Crore grouping, which is how amounts are read in Pakistan.
const rupees = new ToWords({
  localeCode: 'en-IN',
  converterOptions: {
    currency: true,
    ignoreDecimal: false,
    ignoreZeroCurrency: false,
    doNotAddOnly: false,
    currencyOptions: {
      name: 'Rupee',
      plural: 'Rupees',
      symbol: 'Rs',
      fractionalUnit: { name: 'Paisa', plural: 'Paise', symbol: 'P' },
    },
  },
});

/** "1500" → "One Thousand Five Hundred Rupees Only". Empty string for blank/invalid input. */
export function amountInWords(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value.trim().replace(/,/g, '') : String(value);
  if (text === '') return '';
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 1e15) return '';
  try {
    return rupees.convert(Math.round(parsed * 100) / 100);
  } catch {
    return '';
  }
}
