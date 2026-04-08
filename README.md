# Hynix Leverage Dynamics

一个静态网页工具，用于比较：

1. 正股（SK hynix）
2. 正股 2x（线性放大，即区间收益乘 2）
3. 严格两倍股（每天收益都等于正股当天收益的两倍，再做日复利）
4. 7709（南方东英 SK 海力士每日杠杆 2X 产品）

## 数据来源

- `7709_price.csv`
  - source: https://www.hkex.com.hk/Market-Data/Securities-Prices/Exchange-Traded-Products/Exchange-Traded-Products-Quote?sym=7709
- `sk_price.csv`
  - source: https://hk.finance.yahoo.com/quote/000660.KS/history/

## 网页功能

- 选择买入日期（当日收盘价）
- 选择截止日期（当日收盘价）
- 输出以下指标：
  - 日期区间
  - 正股 start price / end price / 期间涨跌幅
  - 严格两倍股期间涨跌幅
  - 7709 start price / end price / 期间涨跌幅
  - 严格两倍股 - 正股 2x 的损耗
  - 7709 - 正股 2x 的损耗
  - 7709 - 严格两倍股（南方基金/汇率导致的损耗）

## 计算口径

给定买入日 `t0`、截止日 `t1`：

- 正股区间收益：`R_stock = P_stock(t1) / P_stock(t0) - 1`
- 正股 2x（线性）：`R_stock_2x_linear = 2 * R_stock`
- 严格两倍股：
  - 正股每日收益：`r_t = P_stock(t) / P_stock(t-1) - 1`
  - 严格两倍股区间收益：`R_strict_2x = Π(1 + 2 * r_t) - 1`
- 7709 区间收益：`R_7709 = P_7709(t1) / P_7709(t0) - 1`
- 对比项：
  - 严格两倍股 - 正股 2x：`R_strict_2x - R_stock_2x_linear`
  - 7709 - 正股 2x：`R_7709 - R_stock_2x_linear`
  - 7709 - 严格两倍股：`R_7709 - R_strict_2x`

说明：

- 日期下拉采用两份数据的并集交易日。
- 若某个标的在某个并集交易日没有报价，则沿用它前一个有效交易日的价格。
- 严格两倍股复利基于正股在并集交易日上的价格序列计算；若正股在某天休市，则该日价格沿用前值，对应当日收益为 0。

## 本地预览

```bash
cd "Hynix Leverage Dynamics"
python3 -m http.server 8080
```

浏览器访问：`http://localhost:8080
