import { isUsEquityTradingDay } from '../../src/data/calendar.js';

export function isUsMarketOpenNow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const date = new Date(Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day'))));
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return isUsEquityTradingDay(date) && minutes >= 570 && minutes < 960;
}
