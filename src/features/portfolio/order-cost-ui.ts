export function enteredSlippage(
  action: 'buy' | 'sell',
  quantity: number,
  price: number,
  referencePrice: number | undefined,
): number | undefined {
  if (!referencePrice || referencePrice <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
    return undefined;
  }
  const priceDifference = action === 'buy' ? price - referencePrice : referencePrice - price;
  return Math.round(priceDifference * quantity * 100) / 100;
}

export function usd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function signedUsd(value: number): string {
  return `${value > 0 ? '+' : ''}${usd(value)}`;
}
