"use strict";

// Integer minor-unit arithmetic for deterministic financial calculations.
// CAD amounts use 4 decimal places internally; rates use 8 decimal places.
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
  const guard = Number(padded[digits] || "0");
  if (guard >= 5) result += 1n; // ROUND_HALF_UP
  return negative ? -result : result;
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
function multiplyAmountByRate(amountValue, rateValue) {
  const a = money(amountValue);
  const r = rate(rateValue);
  const product = a * r;
  const quotient = product / RATE_SCALE;
  const remainder = product % RATE_SCALE;
  return quotient + (remainder * 2n >= RATE_SCALE ? 1n : 0n);
}
function toNumber(value, scale = MONEY_SCALE) { return Number(value) / Number(scale); }

module.exports = { MONEY_SCALE, RATE_SCALE, money, rate, formatMoney, formatRate, multiplyAmountByRate, toNumber };
