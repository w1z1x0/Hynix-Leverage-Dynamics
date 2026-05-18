const state = {
  stockSeries: new Map(),
  productSeries: new Map(),
  stockDates: [],
  productDates: [],
  comparisonDates: [],
  filledStockSeries: new Map(),
  filledProductSeries: new Map(),
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
  performanceChart: document.getElementById("performanceChart"),
};

const chartConfig = {
  width: 920,
  height: 360,
  padding: {
    top: 22,
    right: 62,
    bottom: 44,
    left: 58,
  },
  series: [
    { key: "stock", label: "正股", color: "#245fdb" },
    { key: "strict2x", label: "严格两倍做多", color: "#b45500" },
    { key: "product", label: "7709", color: "#168455" },
  ],
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

function productDatesInRange(startDate, endDate) {
  return state.productDates.filter((d) => d >= startDate && d <= endDate);
}

function comparisonDatesInRange(startDate, endDate) {
  return state.comparisonDates.filter((d) => d >= startDate && d <= endDate);
}

function buildFilledSeries(rawSeries, rawDates, targetDates) {
  const filled = new Map();
  let sourceIndex = 0;
  let lastPrice = NaN;

  for (const targetDate of targetDates) {
    while (sourceIndex < rawDates.length && rawDates[sourceIndex] <= targetDate) {
      lastPrice = rawSeries.get(rawDates[sourceIndex]);
      sourceIndex += 1;
    }
    if (Number.isFinite(lastPrice)) {
      filled.set(targetDate, lastPrice);
    }
  }

  return filled;
}

function calculateStrict2xReturn(startDate, endDate) {
  const dates = comparisonDatesInRange(startDate, endDate);
  if (dates.length <= 1) {
    return 0;
  }

  let nav = 1;
  for (let i = 1; i < dates.length; i += 1) {
    const prev = state.filledStockSeries.get(dates[i - 1]);
    const current = state.filledStockSeries.get(dates[i]);
    const dailyReturn = current / prev - 1;
    nav *= 1 + 2 * dailyReturn;
  }
  return nav - 1;
}

function buildPerformanceSeries(startDate, endDate) {
  const dates = comparisonDatesInRange(startDate, endDate);
  if (dates.length === 0) {
    return [];
  }

  const stockStart = state.filledStockSeries.get(startDate);
  const productStart = state.filledProductSeries.get(startDate);
  if (!Number.isFinite(stockStart) || !Number.isFinite(productStart)) {
    return [];
  }

  let strict2xNav = 1;
  return dates.map((date, index) => {
    if (index > 0) {
      const prevStock = state.filledStockSeries.get(dates[index - 1]);
      const currentStock = state.filledStockSeries.get(date);
      strict2xNav *= 1 + 2 * (currentStock / prevStock - 1);
    }

    const stockPrice = state.filledStockSeries.get(date);
    const productPrice = state.filledProductSeries.get(date);
    return {
      date,
      stock: (stockPrice / stockStart - 1) * 100,
      strict2x: (strict2xNav - 1) * 100,
      product: (productPrice / productStart - 1) * 100,
    };
  });
}

function getChartScale(points) {
  const values = points.flatMap((point) => chartConfig.series.map((series) => point[series.key]));
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  if (rawMin === rawMax) {
    return { min: rawMin - 5, max: rawMax + 5 };
  }

  const padding = Math.max((rawMax - rawMin) * 0.12, 2);
  return {
    min: rawMin - padding,
    max: rawMax + padding,
  };
}

function getChartTicks(min, max, count) {
  const ticks = [];
  if (count <= 1) return [min];

  for (let i = 0; i < count; i += 1) {
    ticks.push(min + ((max - min) * i) / (count - 1));
  }
  return ticks;
}

function pickDateTickIndexes(pointCount) {
  if (pointCount <= 6) {
    return Array.from({ length: pointCount }, (_, index) => index);
  }

  const indexes = new Set();
  const lastIndex = pointCount - 1;
  for (let i = 0; i < 6; i += 1) {
    indexes.add(Math.round((lastIndex * i) / 5));
  }
  return Array.from(indexes).sort((a, b) => a - b);
}

function formatChartPct(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function getNearestChartPointIndex(points, chartX, chartLeft, chartInnerWidth) {
  if (points.length <= 1) return 0;

  const ratio = (chartX - chartLeft) / chartInnerWidth;
  const rawIndex = Math.round(ratio * (points.length - 1));
  return Math.max(0, Math.min(points.length - 1, rawIndex));
}

function bindPerformanceChartHover(points, xFor, yFor, bounds) {
  if (!el.performanceChart.querySelector) return;

  const svg = el.performanceChart.querySelector("svg");
  const hitbox = el.performanceChart.querySelector(".chart-hitbox");
  const hoverLayer = el.performanceChart.querySelector(".chart-hover-layer");
  if (!svg || !hitbox || !hoverLayer) return;

  const hoverLine = hoverLayer.querySelector(".chart-hover-line");
  const tooltip = hoverLayer.querySelector(".chart-tooltip");
  const tooltipDate = hoverLayer.querySelector("[data-tooltip-date]");
  const tooltipValues = new Map(
    chartConfig.series.map((series) => [
      series.key,
      hoverLayer.querySelector(`[data-tooltip-value="${series.key}"]`),
    ]),
  );
  const hoverDots = new Map(
    chartConfig.series.map((series) => [
      series.key,
      hoverLayer.querySelector(`[data-hover-dot="${series.key}"]`),
    ]),
  );

  const showPoint = (index) => {
    const point = points[index];
    const x = xFor(index);
    hoverLayer.style.opacity = "1";
    hoverLine.setAttribute("x1", x.toFixed(2));
    hoverLine.setAttribute("x2", x.toFixed(2));

    tooltipDate.textContent = point.date;
    chartConfig.series.forEach((series) => {
      const dot = hoverDots.get(series.key);
      const valueNode = tooltipValues.get(series.key);
      dot.setAttribute("cx", x.toFixed(2));
      dot.setAttribute("cy", yFor(point[series.key]).toFixed(2));
      valueNode.textContent = formatChartPct(point[series.key]);
    });

    const tooltipX = x > bounds.width - bounds.padding.right - 190 ? x - 190 : x + 12;
    tooltip.setAttribute("transform", `translate(${tooltipX.toFixed(2)} ${bounds.padding.top + 8})`);
  };

  hitbox.addEventListener("mousemove", (event) => {
    const rect = svg.getBoundingClientRect();
    const chartX = ((event.clientX - rect.left) * bounds.width) / rect.width;
    showPoint(getNearestChartPointIndex(points, chartX, bounds.padding.left, bounds.innerWidth));
  });
  hitbox.addEventListener("mouseleave", () => {
    hoverLayer.style.opacity = "0";
  });
  hitbox.addEventListener("focus", () => showPoint(0));
  hitbox.addEventListener("blur", () => {
    hoverLayer.style.opacity = "0";
  });
}

function renderPerformanceChart(points) {
  if (!el.performanceChart) return;
  if (points.length < 2) {
    el.performanceChart.innerHTML = "<p class=\"empty-chart\">日期范围不足，无法绘制走势。</p>";
    return;
  }

  const { width, height, padding } = chartConfig;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const scale = getChartScale(points);
  const xFor = (index) => padding.left + (innerWidth * index) / (points.length - 1);
  const yFor = (value) => padding.top + ((scale.max - value) * innerHeight) / (scale.max - scale.min);
  const yTicks = getChartTicks(scale.min, scale.max, 5);
  const xTickIndexes = pickDateTickIndexes(points.length);

  const grid = yTicks
    .map((tick) => {
      const y = yFor(tick);
      return `
        <line class="chart-grid" x1="${padding.left}" y1="${y.toFixed(2)}" x2="${width - padding.right}" y2="${y.toFixed(2)}"></line>
        <text class="chart-axis-label" x="${padding.left - 10}" y="${(y + 4).toFixed(2)}" text-anchor="end">${tick.toFixed(0)}%</text>
      `;
    })
    .join("");

  const dateTicks = xTickIndexes
    .map((index) => {
      const x = xFor(index);
      return `
        <line class="chart-tick" x1="${x.toFixed(2)}" y1="${height - padding.bottom}" x2="${x.toFixed(2)}" y2="${height - padding.bottom + 6}"></line>
        <text class="chart-axis-label" x="${x.toFixed(2)}" y="${height - 16}" text-anchor="middle">${points[index].date.slice(5)}</text>
      `;
    })
    .join("");

  const lines = chartConfig.series
    .map((series) => {
      const coordinates = points
        .map((point, index) => `${xFor(index).toFixed(2)},${yFor(point[series.key]).toFixed(2)}`)
        .join(" ");
      const lastPoint = points[points.length - 1];
      const labelX = width - padding.right + 10;
      const labelY = yFor(lastPoint[series.key]);
      return `
        <polyline class="chart-line" points="${coordinates}" stroke="${series.color}"></polyline>
        <circle class="chart-start-dot" cx="${padding.left}" cy="${yFor(0).toFixed(2)}" r="4" fill="${series.color}"></circle>
        <circle class="chart-end-dot" cx="${xFor(points.length - 1).toFixed(2)}" cy="${labelY.toFixed(2)}" r="3.5" fill="${series.color}"></circle>
        <text class="chart-line-label" x="${labelX}" y="${(labelY + 4).toFixed(2)}" fill="${series.color}">${series.label}</text>
      `;
    })
    .join("");
  const hoverDots = chartConfig.series
    .map(
      (series) => `
        <circle class="chart-hover-dot" data-hover-dot="${series.key}" r="4.5" fill="${series.color}"></circle>
      `,
    )
    .join("");
  const tooltipRows = chartConfig.series
    .map((series, index) => {
      const y = 46 + index * 22;
      return `
        <text class="chart-tooltip-label" x="12" y="${y}" fill="${series.color}">${series.label}</text>
        <text class="chart-tooltip-value" data-tooltip-value="${series.key}" x="170" y="${y}" text-anchor="end"></text>
      `;
    })
    .join("");

  el.performanceChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <line class="chart-axis" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
      <line class="chart-axis" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}"></line>
      ${grid}
      ${dateTicks}
      <line class="chart-baseline" x1="${padding.left}" y1="${yFor(0).toFixed(2)}" x2="${width - padding.right}" y2="${yFor(0).toFixed(2)}"></line>
      <text class="chart-baseline-label" x="${padding.left - 10}" y="${(yFor(0) - 6).toFixed(2)}" text-anchor="end">0%</text>
      ${lines}
      <g class="chart-hover-layer" style="opacity: 0;">
        <line class="chart-hover-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}"></line>
        ${hoverDots}
        <g class="chart-tooltip" transform="translate(${padding.left + 12} ${padding.top + 8})">
          <rect class="chart-tooltip-bg" width="182" height="116" rx="8"></rect>
          <text class="chart-tooltip-date" data-tooltip-date x="12" y="24"></text>
          ${tooltipRows}
        </g>
      </g>
      <rect
        class="chart-hitbox"
        x="${padding.left}"
        y="${padding.top}"
        width="${innerWidth}"
        height="${innerHeight}"
        tabindex="0"
        aria-label="移动鼠标查看各日期涨跌幅"
      ></rect>
    </svg>
  `;
  bindPerformanceChartHover(points, xFor, yFor, { width, padding, innerWidth });
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

  const rangeDates = comparisonDatesInRange(startDate, endDate);
  if (rangeDates.length < 2) {
    el.status.textContent = "所选日期范围不足 2 个并集交易日，请重新选择。";
    return;
  }

  const stockStart = state.filledStockSeries.get(startDate);
  const stockEnd = state.filledStockSeries.get(endDate);
  const productStart = state.filledProductSeries.get(startDate);
  const productEnd = state.filledProductSeries.get(endDate);

  if (
    !Number.isFinite(stockStart) ||
    !Number.isFinite(stockEnd) ||
    !Number.isFinite(productStart) ||
    !Number.isFinite(productEnd)
  ) {
    el.status.textContent = "所选日期缺少可填充的价格数据，请重新选择。";
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
  renderPerformanceChart(buildPerformanceSeries(startDate, endDate));

  const stockDays = stockDatesInRange(startDate, endDate).length;
  const productDays = productDatesInRange(startDate, endDate).length;
  const unionDays = rangeDates.length;
  el.status.textContent =
    `计算完成：并集交易日 ${unionDays} 天，SK hynix 实际交易日 ${stockDays} 天，7709 实际交易日 ${productDays} 天。`;
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

function populateDateSelectors(comparisonDates) {
  const options = comparisonDates.map((d) => `<option value="${d}">${d}</option>`).join("");
  el.startDate.innerHTML = options;
  el.endDate.innerHTML = options;

  el.startDate.value = comparisonDates[0];
  el.endDate.value = comparisonDates[comparisonDates.length - 1];
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
  state.productDates = Array.from(state.productSeries.keys()).sort();

  const unionDates = Array.from(new Set([...state.stockDates, ...state.productDates])).sort();
  const firstUsableDate = state.stockDates[0] > state.productDates[0] ? state.stockDates[0] : state.productDates[0];
  state.comparisonDates = unionDates.filter((d) => d >= firstUsableDate);

  state.filledStockSeries = buildFilledSeries(state.stockSeries, state.stockDates, state.comparisonDates);
  state.filledProductSeries = buildFilledSeries(state.productSeries, state.productDates, state.comparisonDates);

  if (state.comparisonDates.length < 2) {
    throw new Error("两份数据的并集交易日不足 2 天，无法计算区间收益。");
  }

  if (
    state.filledStockSeries.size !== state.comparisonDates.length ||
    state.filledProductSeries.size !== state.comparisonDates.length
  ) {
    throw new Error("无法完成并集日期的前值填充，请检查 CSV 起始日期。");
  }

  populateDateSelectors(state.comparisonDates);
}

async function init() {
  try {
    await loadData();
    el.status.textContent = `数据加载完成，可比较并集交易日 ${state.comparisonDates.length} 天。`;
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
