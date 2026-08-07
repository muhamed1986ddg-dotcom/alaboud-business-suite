"use strict";

// Deterministic fixed-point arithmetic.
// Money: 4 decimal places. Exchange rates: 8 decimal places.
const MONEY_SCALE = 10_000n;
const RATE_SCALE = 100_000_000n;

function parseScaled(value, scale) {
  const text = String(value ?? "0").trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new TypeError(`Invalid decimal value: ${value}`);
  const negative = text.startsWith("-");
  const clean = negative ? text.slice(1) : text;
  const [whole, fraction = ""] = clean.split(".");
  const digits = String(scale).length - 1;
  const padded = (fraction + "0".repeat(digits + 1)).slice(0, digits + 1);
  let result = BigInt(whole) * scale + BigInt(padded.slice(0, digits) || "0");
  if (Number(padded[digits] || "0") >= 5) result += 1n; // ROUND_HALF_UP
  return negative ? -result : result;
}

function roundedDivide(numerator, denominator) {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let quotient = n / d;
  const remainder = n % d;
  if (remainder * 2n >= d) quotient += 1n;
  return negative ? -quotient : quotient;
}

function formatScaled(value, scale, decimals) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / scale;
  const fraction = String(abs % scale).padStart(decimals, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function money(value) { return parseScaled(value, MONEY_SCALE); }
function rate(value) { return parseScaled(value, RATE_SCALE); }
function formatMoney(value) { return formatScaled(value, MONEY_SCALE, 4); }
function formatRate(value) { return formatScaled(value, RATE_SCALE, 8); }
function toNumber(value, scale = MONEY_SCALE) { return Number(value) / Number(scale); }
function moneyToNumber(value) { return toNumber(value, MONEY_SCALE); }
function rateToNumber(value) { return toNumber(value, RATE_SCALE); }
function addMoney(...values) { return values.reduce((sum, value) => sum + money(value), 0n); }
function subtractMoney(left, right) { return money(left) - money(right); }
function maxMoney(value, minimum = 0) {
  const parsed = money(value);
  const floor = money(minimum);
  return parsed > floor ? parsed : floor;
}
function multiplyAmountByRate(amountValue, rateValue) {
  return roundedDivide(money(amountValue) * rate(rateValue), RATE_SCALE);
}
function divideMoneyByAmountToRate(moneyValue, amountValue) {
  const amount = money(amountValue);
  if (amount === 0n) return 0n;
  return roundedDivide(money(moneyValue) * RATE_SCALE, amount);
}
function addRate(left, right) { return rate(left) + rate(right); }
function subtractRate(left, right) { return rate(left) - rate(right); }

module.exports = {
  MONEY_SCALE,
  RATE_SCALE,
  parseScaled,
  roundedDivide,
  money,
  rate,
  formatMoney,
  formatRate,
  toNumber,
  moneyToNumber,
  rateToNumber,
  addMoney,
  subtractMoney,
  maxMoney,
  multiplyAmountByRate,
  divideMoneyByAmountToRate,
  addRate,
  subtractRate,
};
