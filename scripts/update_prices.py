#!/usr/bin/env python3
"""Update SK hynix and 7709 price CSV files from Yahoo Finance chart data."""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import requests


ROOT = Path(__file__).resolve().parents[1]
SK_CSV = ROOT / "sk_price.csv"
PRODUCT_CSV = ROOT / "7709_price.csv"

SK_SYMBOL = "000660.KS"
PRODUCT_SYMBOL = "7709.HK"

SK_HEADER = ["日期", "開市", "最高", "最低", "關閉", "調整後的收市價", "成交量"]
PRODUCT_HEADER = ["時間", "收市價"]

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
USER_AGENT = "Mozilla/5.0 (compatible; Hynix-Leverage-Dynamics/1.0)"


PriceRow = dict[str, Any]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and validate data without writing CSV files.",
    )
    return parser.parse_args()


def parse_loose_date(value: str) -> dt.date:
    separator = "/" if "/" in value else "-"
    year, month, day = (int(part) for part in value.strip().split(separator))
    return dt.date(year, month, day)


def format_sk_date(date_value: dt.date) -> str:
    return f"{date_value.year}-{date_value.month}-{date_value.day}"


def format_product_date(date_value: dt.date) -> str:
    return f"{date_value.year}/{date_value.month:02d}/{date_value.day:02d}"


def normalize_price(value: float) -> str:
    return f"{value:.2f}".rstrip("0").rstrip(".")


def read_csv_rows(path: Path) -> list[list[str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.reader(handle))


def latest_date(path: Path) -> dt.date:
    rows = read_csv_rows(path)
    dates = [parse_loose_date(row[0]) for row in rows[1:] if row]
    if not dates:
        raise ValueError(f"No existing dates found in {path}")
    return max(dates)


def fetch_yahoo_chart(symbol: str, start_date: dt.date, end_date: dt.date) -> dict[str, Any]:
    period1 = int(dt.datetime.combine(start_date, dt.time.min, dt.timezone.utc).timestamp())
    period2 = int(dt.datetime.combine(end_date, dt.time.min, dt.timezone.utc).timestamp())
    params = {
        "period1": period1,
        "period2": period2,
        "interval": "1d",
        "events": "history",
        "includeAdjustedClose": "true",
    }
    url = f"{YAHOO_CHART_URL.format(symbol=symbol)}?{urlencode(params)}"
    headers = {"User-Agent": USER_AGENT}

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = requests.get(url, headers=headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(2**attempt)

    raise RuntimeError(f"Failed to fetch Yahoo chart data for {symbol}: {last_error}") from last_error


def parse_yahoo_chart_rows(payload: dict[str, Any]) -> list[PriceRow]:
    chart = payload.get("chart") or {}
    if chart.get("error"):
        raise ValueError(f"Yahoo chart error: {chart['error']}")

    results = chart.get("result") or []
    if not results:
        raise ValueError("No Yahoo chart result")

    result = results[0]
    timestamps = result.get("timestamp") or []
    indicators = result.get("indicators") or {}
    quotes = indicators.get("quote") or []
    if not timestamps or not quotes:
        raise ValueError("No price rows in Yahoo chart result")

    quote = quotes[0]
    adjclose = (indicators.get("adjclose") or [{}])[0].get("adjclose") or quote.get("close")
    timezone_name = result.get("meta", {}).get("timezone") or "UTC"
    market_tz = ZoneInfo(timezone_name)

    rows: list[PriceRow] = []
    for index, timestamp in enumerate(timestamps):
        close = quote.get("close", [])[index]
        if close is None:
            continue

        date_value = dt.datetime.fromtimestamp(timestamp, market_tz).date()
        rows.append(
            {
                "date": format_sk_date(date_value),
                "open": quote.get("open", [])[index],
                "high": quote.get("high", [])[index],
                "low": quote.get("low", [])[index],
                "close": close,
                "adj_close": adjclose[index] if adjclose else close,
                "volume": quote.get("volume", [])[index] or 0,
            }
        )

    if not rows:
        raise ValueError("No price rows in Yahoo chart result")
    return rows


def write_rows(path: Path, rows: list[list[str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerows(rows)


def write_sk_csv(path: Path, incoming_rows: list[PriceRow]) -> None:
    existing_rows = read_csv_rows(path)
    merged: dict[dt.date, list[str]] = {}

    for row in existing_rows[1:]:
        if row:
            merged[parse_loose_date(row[0])] = row

    for row in incoming_rows:
        date_value = parse_loose_date(row["date"])
        merged[date_value] = [
            format_sk_date(date_value),
            f"{row['open']:.2f}",
            f"{row['high']:.2f}",
            f"{row['low']:.2f}",
            f"{row['close']:.2f}",
            f"{row['adj_close']:.2f}",
            str(int(row["volume"])),
        ]

    rows = [SK_HEADER]
    rows.extend(merged[date_value] for date_value in sorted(merged, reverse=True))
    write_rows(path, rows)


def write_7709_csv(path: Path, incoming_rows: list[PriceRow]) -> None:
    existing_rows = read_csv_rows(path)
    merged: dict[dt.date, list[str]] = {}

    for row in existing_rows[1:]:
        if row:
            merged[parse_loose_date(row[0])] = row

    for row in incoming_rows:
        date_value = parse_loose_date(row["date"])
        merged[date_value] = [
            format_product_date(date_value),
            normalize_price(float(row["close"])),
        ]

    rows = [PRODUCT_HEADER]
    rows.extend(merged[date_value] for date_value in sorted(merged))
    write_rows(path, rows)


def main() -> None:
    args = parse_args()
    start_sk = latest_date(SK_CSV) - dt.timedelta(days=14)
    start_product = latest_date(PRODUCT_CSV) - dt.timedelta(days=14)
    end_date = dt.date.today() + dt.timedelta(days=1)

    sk_rows = parse_yahoo_chart_rows(fetch_yahoo_chart(SK_SYMBOL, start_sk, end_date))
    product_rows = parse_yahoo_chart_rows(fetch_yahoo_chart(PRODUCT_SYMBOL, start_product, end_date))

    if args.dry_run:
        print(f"{SK_SYMBOL}: fetched {len(sk_rows)} rows")
        print(f"{PRODUCT_SYMBOL}: fetched {len(product_rows)} rows")
        return

    write_sk_csv(SK_CSV, sk_rows)
    write_7709_csv(PRODUCT_CSV, product_rows)
    print(f"{SK_SYMBOL}: merged {len(sk_rows)} fetched rows into {SK_CSV.name}")
    print(f"{PRODUCT_SYMBOL}: merged {len(product_rows)} fetched rows into {PRODUCT_CSV.name}")


if __name__ == "__main__":
    main()
