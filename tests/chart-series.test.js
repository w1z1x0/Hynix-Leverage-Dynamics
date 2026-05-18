const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeElement() {
  return {
    textContent: "",
    innerHTML: "",
    value: "",
    classList: {
      add() {},
      remove() {},
    },
    addEventListener() {},
  };
}

function loadApp() {
  const elements = new Map();
  const sandbox = {
    console,
    Intl,
    fetch: async () => {
      throw new Error("fetch disabled in unit tests");
    },
    document: {
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, makeElement());
        }
        return elements.get(id);
      },
    },
  };
  sandbox.__elements = elements;

  const appPath = path.join(__dirname, "..", "app.js");
  const code = fs.readFileSync(appPath, "utf8");
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

const app = loadApp();

assert.equal(typeof app.buildPerformanceSeries, "function");

vm.runInContext(
  `
  state.comparisonDates = ["2026-01-01", "2026-01-02", "2026-01-03"];
  state.filledStockSeries = new Map([
    ["2026-01-01", 100],
    ["2026-01-02", 110],
    ["2026-01-03", 99],
  ]);
  state.filledProductSeries = new Map([
    ["2026-01-01", 50],
    ["2026-01-02", 60],
    ["2026-01-03", 54],
  ]);
  result = buildPerformanceSeries("2026-01-01", "2026-01-03");
  `,
  app,
);

const result = JSON.parse(JSON.stringify(app.result));

assert.deepEqual(result.map((point) => point.date), [
  "2026-01-01",
  "2026-01-02",
  "2026-01-03",
]);

assert.deepEqual(
  result.map((point) => Number(point.stock.toFixed(4))),
  [0, 10, -1],
);
assert.deepEqual(
  result.map((point) => Number(point.strict2x.toFixed(4))),
  [0, 20, -4],
);
assert.deepEqual(
  result.map((point) => Number(point.product.toFixed(4))),
  [0, 20, 8],
);

vm.runInContext("renderPerformanceChart(result);", app);
const chartHtml = app.__elements.get("performanceChart").innerHTML;
assert.match(chartHtml, /<svg/);
assert.match(chartHtml, />0%<\/text>/);
assert.match(chartHtml, /class="chart-hitbox"/);
assert.match(chartHtml, /class="chart-hover-layer"/);
assert.match(chartHtml, /data-tooltip-date/);
assert.match(chartHtml, /data-tooltip-value="stock"/);
assert.match(chartHtml, /data-tooltip-value="strict2x"/);
assert.match(chartHtml, /data-tooltip-value="product"/);
assert.equal((chartHtml.match(/<polyline/g) || []).length, 3);
assert.equal((chartHtml.match(/class="chart-start-dot"/g) || []).length, 3);
assert.equal(app.getNearestChartPointIndex(result, 458, 58, 800), 1);
