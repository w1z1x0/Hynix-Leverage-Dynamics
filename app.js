const state = {
  stockSeries: new Map(),
  productSeries: new Map(),
  stockDates: [],
  commonDates: [],
};

const el = {
  startDate: document.getElementById("startDate"),
  endDate: document.getElementById("endDate"),
  calcBtn: document.getElementById("calcBtn"),
  status: document.getElementById("status"),
  resultSection: document.getElementById("resultSection"),
  rangeText: document.getElementById("rangeText"),
  stockStart: document.getElementById("stockStart"),
  stockEnd: document.getElementById("stockEnd"),
  stockReturn: document.getElementById("stockReturn"),
  naive2xReturn: document.getElementById("naive2xReturn"),
  strict2xReturn: document.getElementById("strict2xReturn"),
  prodStart: document.getElementById("prodStart"),
  prodEnd: document.getElementById("prodEnd"),
  prodReturn: document.getElementById("prodReturn"),
  strictMinusNaive: document.getElementById("strictMinusNaive"),
  prodMinusNaive: document.getElementById("prodMinusNaive"),
  prodMinusStrict: document.getElementById("prodMinusStrict"),
};

function normalizeDate(raw) {
  if (!raw) return "";
  const text = String(raw).trim();
  const separator = text.includes("/") ? "/" : "-";
  const parts = text.split(separator).map((p) => p.trim());
  if (parts.length !== 3) return "";

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return "";

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function parseNumber(raw) {
  if (raw == null) return NaN;
  const cleaned = String(raw).replace(/,/g, "").trim();
  if (!cleaned) return NaN;
  return Number(cleaned);
}

function splitCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function parseCsv(text) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.replace(/^\ufeff/, "").trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length === 1 && !cells[0].trim()) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] || "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function pickKey(row, candidates) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return key;
    }
  }
  return "";
}

function buildSeries(rows, dateKeys, priceKeys) {
  if (rows.length === 0) {
    return new Map();
  }
  const dateKey = pickKey(rows[0], dateKeys);
  const priceKey = pickKey(rows[0], priceKeys);
  if (!dateKey || !priceKey) {
    throw new Error("CSV 列名无法识别，请检查表头。");
  }

  const map = new Map();
  for (const row of rows) {
    const date = normalizeDate(row[dateKey]);
    const price = parseNumber(row[priceKey]);
    if (!date || !Number.isFinite(price)) continue;
    map.set(date, price);
  }
  return map;
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatPct(value) {
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function setSignedText(node, text, value) {
  node.textContent = text;
  node.classList.remove("positive", "negative");
  if (value > 0) {
    node.classList.add("positive");
  } else if (value < 0) {
    node.classList.add("negative");
  }
}

function stockDatesInRange(startDate, endDate) {
  return state.stockDates.filter((d) => d >= startDate && d <= endDate);
}

function calculateStrict2xReturn(startDate, endDate) {
  const dates = stockDatesInRange(startDate, endDate);
  if (dates.length <= 1) {
    return 0;
  }

  let nav = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const prev = state.stockSeries.get(dates[i - 1]);
    const current = state.stockSeries.get(dates[i]);
    const dailyReturn = current / prev - 1;
    nav *= 1 + 2 * dailyReturn;
  }
  return nav - 1;
}

function computeAndRender() {
  const startDate = el.startDate.value;
  const endDate = el.endDate.value;

  if (!startDate || !endDate) {
    el.status.textContent = "请选择买入日期和截止日期。";
    return;
  }
  if (startDate > endDate) {
    el.status.textContent = "买入日期不能晚于截止日期。";
    return;
  }

  const stockStart = state.stockSeries.get(startDate);
  const stockEnd = state.stockSeries.get(endDate);
  const productStart = state.productSeries.get(startDate);
  const productEnd = state.productSeries.get(endDate);

  if (
    !Number.isFinite(stockStart) ||
    !Number.isFinite(stockEnd) ||
    !Number.isFinite(productStart) ||
    !Number.isFinite(productEnd)
  ) {
    el.status.textContent = "所选日期缺少价格数据，请重新选择。";
    return;
  }

  const stockReturn = stockEnd / stockStart - 1;
  const naive2xReturn = 2 * stockReturn;
  const strict2xReturn = calculateStrict2xReturn(startDate, endDate);
  const productReturn = productEnd / productStart - 1;

  const strictMinusNaive = strict2xReturn - naive2xReturn;
  const productMinusNaive = productReturn - naive2xReturn;
  const productMinusStrict = productReturn - strict2xReturn;

  el.rangeText.textContent = `${startDate} ~ ${endDate}`;
  el.stockStart.textContent = formatPrice(stockStart);
  el.stockEnd.textContent = formatPrice(stockEnd);
  el.prodStart.textContent = formatPrice(productStart);
  el.prodEnd.textContent = formatPrice(productEnd);

  setSignedText(el.stockReturn, formatPct(stockReturn), stockReturn);
  setSignedText(el.naive2xReturn, formatPct(naive2xReturn), naive2xReturn);
  setSignedText(el.strict2xReturn, formatPct(strict2xReturn), strict2xReturn);
  setSignedText(el.prodReturn, formatPct(productReturn), productReturn);

  setSignedText(el.strictMinusNaive, formatPct(strictMinusNaive), strictMinusNaive);
  setSignedText(el.prodMinusNaive, formatPct(productMinusNaive), productMinusNaive);
  setSignedText(el.prodMinusStrict, formatPct(productMinusStrict), productMinusStrict);

  const stockDays = stockDatesInRange(startDate, endDate).length;
  const commonDays = state.commonDates.filter((d) => d >= startDate && d <= endDate).length;
  el.status.textContent = `计算完成：正股交易日 ${stockDays} 天，交集交易日 ${commonDays} 天。`;
  el.resultSection.classList.remove("hidden");
}

function syncStartEnd() {
  if (el.startDate.value > el.endDate.value) {
    el.endDate.value = el.startDate.value;
  }
}

function syncEndStart() {
  if (el.endDate.value < el.startDate.value) {
    el.startDate.value = el.endDate.value;
  }
}

function populateDateSelectors(commonDates) {
  const options = commonDates.map((d) => `<option value="${d}">${d}</option>`).join("");
  el.startDate.innerHTML = options;
  el.endDate.innerHTML = options;

  el.startDate.value = commonDates[0];
  el.endDate.value = commonDates[commonDates.length - 1];
}

async function loadData() {
  const [stockResponse, productResponse] = await Promise.all([
    fetch("./sk_price.csv"),
    fetch("./7709_price.csv"),
  ]);

  if (!stockResponse.ok || !productResponse.ok) {
    throw new Error("CSV 文件加载失败，请确认文件路径是否正确。");
  }

  const [stockText, productText] = await Promise.all([
    stockResponse.text(),
    productResponse.text(),
  ]);

  const stockRows = parseCsv(stockText);
  const productRows = parseCsv(productText);

  state.stockSeries = buildSeries(
    stockRows,
    ["日期", "時間", "时间", "Date"],
    ["調整後的收市價", "调整后收市价", "收市價", "收市价", "關閉", "关闭", "Close"],
  );
  state.productSeries = buildSeries(
    productRows,
    ["時間", "时间", "日期", "Date"],
    ["收市價", "收市价", "Close", "調整後的收市價", "调整后收市价"],
  );

  state.stockDates = Array.from(state.stockSeries.keys()).sort();
  state.commonDates = state.stockDates.filter((d) => state.productSeries.has(d));

  if (state.commonDates.length < 2) {
    throw new Error("两份数据的共同交易日不足 2 天，无法计算区间收益。");
  }

  populateDateSelectors(state.commonDates);
}

async function init() {
  try {
    await loadData();
    el.status.textContent = `数据加载完成，共同交易日 ${state.commonDates.length} 天。`;
    computeAndRender();
  } catch (error) {
    el.status.textContent = `加载失败：${error.message}`;
  }
}

el.startDate.addEventListener("change", () => {
  syncStartEnd();
  computeAndRender();
});

el.endDate.addEventListener("change", () => {
  syncEndStart();
  computeAndRender();
});

el.calcBtn.addEventListener("click", computeAndRender);

init();
