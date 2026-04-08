#!/usr/bin/env python3
"""Recalculate stock, strict-2x, and 7709 returns from the latest CSV files."""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path

import pandas as pd

STOCK_DATE_KEYS = ("日期", "時間", "时间", "Date")
STOCK_PRICE_KEYS = (
    "調整後的收市價",
    "调整后收市价",
    "收市價",
    "收市价",
    "關閉",
    "关闭",
    "Close",
)
PRODUCT_DATE_KEYS = ("時間", "时间", "日期", "Date")
PRODUCT_PRICE_KEYS = ("收市價", "收市价", "Close", "調整後的收市價", "调整后收市价")


def normalize_header(header: object) -> str:
    return str(header).replace("\ufeff", "").strip()


def parse_number(raw: object) -> float | None:
    if raw is None or pd.isna(raw):
        return None
    cleaned = str(raw).replace(",", "").strip()
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_date(raw: object) -> pd.Timestamp | None:
    if raw is None or pd.isna(raw):
        return None
    if isinstance(raw, pd.Timestamp):
        return raw.normalize()

    text = str(raw).strip()
    if not text:
        return None

    match = re.search(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})", text)
    if not match:
        return None

    year, month, day = (int(part) for part in match.groups())
    try:
        return pd.Timestamp(year=year, month=month, day=day)
    except ValueError:
        return None


def pick_column(columns: list[str], candidates: tuple[str, ...], label: str) -> str:
    for candidate in candidates:
        if candidate in columns:
            return candidate
    raise ValueError(f"Cannot find {label} column. Available columns: {columns}")


def load_series(
    csv_path: Path,
    date_candidates: tuple[str, ...],
    price_candidates: tuple[str, ...],
) -> pd.DataFrame:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.reader(handle))

    if not rows:
        raise ValueError(f"{csv_path.name} is empty.")

    headers = [normalize_header(col) for col in rows[0]]
    date_col = pick_column(headers, date_candidates, "date")
    price_col = pick_column(headers, price_candidates, "price")
    date_index = headers.index(date_col)
    price_index = headers.index(price_col)

    parsed_rows: list[dict[str, object]] = []
    for row in rows[1:]:
        if not row:
            continue
        date_raw = row[date_index] if date_index < len(row) else ""
        price_raw = row[price_index] if price_index < len(row) else ""
        parsed_rows.append({"date": parse_date(date_raw), "price": parse_number(price_raw)})

    series = pd.DataFrame(parsed_rows).dropna(subset=["date", "price"])
    series = series.sort_values("date")
    series = series.drop_duplicates(subset=["date"], keep="last").reset_index(drop=True)

    if len(series) < 2:
        raise ValueError(f"{csv_path.name} has fewer than 2 valid rows after parsing.")

    return series


def resolve_selected_date(raw: str | None, available_dates: set[pd.Timestamp], field: str) -> pd.Timestamp | None:
    if raw is None:
        return None
    parsed = parse_date(raw)
    if parsed is None:
        raise ValueError(f"Invalid {field}: {raw}")
    if parsed not in available_dates:
        formatted = ", ".join(date.strftime("%Y-%m-%d") for date in sorted(available_dates))
        raise ValueError(f"{field} {parsed.strftime('%Y-%m-%d')} is not in common dates: {formatted}")
    return parsed


def calculate_strict_2x_return(stock_slice: pd.DataFrame) -> float:
    daily_return = stock_slice["price"].pct_change().dropna()
    return (1.0 + 2.0 * daily_return).prod() - 1.0


def align_prices_to_union(series: pd.DataFrame, union_dates: list[pd.Timestamp]) -> pd.DataFrame:
    price_series = series.set_index("date")["price"].sort_index()
    aligned = price_series.reindex(union_dates, method="ffill")
    aligned = aligned.rename_axis("date").reset_index(name="price")
    return aligned


def compute_metrics(
    stock_csv: Path,
    product_csv: Path,
    start_date: str | None,
    end_date: str | None,
) -> dict[str, object]:
    stock = load_series(stock_csv, STOCK_DATE_KEYS, STOCK_PRICE_KEYS)
    product = load_series(product_csv, PRODUCT_DATE_KEYS, PRODUCT_PRICE_KEYS)

    stock_dates = set(stock["date"])
    product_dates = set(product["date"])
    union_dates = sorted(stock_dates | product_dates)

    first_usable_date = max(stock.iloc[0]["date"], product.iloc[0]["date"])
    usable_union_dates = [date for date in union_dates if date >= first_usable_date]
    if len(usable_union_dates) < 2:
        raise ValueError("The two CSV files do not have enough union trading dates for comparison.")

    available_union_dates = set(usable_union_dates)
    selected_start = resolve_selected_date(start_date, available_union_dates, "start date") or usable_union_dates[0]
    selected_end = resolve_selected_date(end_date, available_union_dates, "end date") or usable_union_dates[-1]

    if selected_start > selected_end:
        raise ValueError("start date cannot be later than end date.")

    union_slice_dates = [date for date in usable_union_dates if selected_start <= date <= selected_end]
    if len(union_slice_dates) < 2:
        raise ValueError("Selected range has fewer than 2 union trading dates for comparison.")

    stock_slice = align_prices_to_union(stock, union_slice_dates)
    product_slice = align_prices_to_union(product, union_slice_dates)
    stock_actual_days = int(((stock["date"] >= selected_start) & (stock["date"] <= selected_end)).sum())
    product_actual_days = int(((product["date"] >= selected_start) & (product["date"] <= selected_end)).sum())

    stock_start = float(stock_slice.iloc[0]["price"])
    stock_end = float(stock_slice.iloc[-1]["price"])
    product_start = float(product_slice.iloc[0]["price"])
    product_end = float(product_slice.iloc[-1]["price"])

    stock_return = stock_end / stock_start - 1.0
    naive_2x_return = 2.0 * stock_return
    strict_2x_return = calculate_strict_2x_return(stock_slice)
    product_return = product_end / product_start - 1.0

    return {
        "stock_csv": stock_csv,
        "product_csv": product_csv,
        "stock_data_start": stock.iloc[0]["date"],
        "stock_data_end": stock.iloc[-1]["date"],
        "product_data_start": product.iloc[0]["date"],
        "product_data_end": product.iloc[-1]["date"],
        "comparison_start": selected_start,
        "comparison_end": selected_end,
        "stock_actual_days": stock_actual_days,
        "product_actual_days": product_actual_days,
        "union_days": len(union_slice_dates),
        "stock_start": stock_start,
        "stock_end": stock_end,
        "stock_return": stock_return,
        "naive_2x_return": naive_2x_return,
        "strict_2x_return": strict_2x_return,
        "product_start": product_start,
        "product_end": product_end,
        "product_return": product_return,
        "strict_minus_naive": strict_2x_return - naive_2x_return,
        "product_minus_naive": product_return - naive_2x_return,
        "product_minus_strict": product_return - strict_2x_return,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare SK hynix, strict daily 2x, and 7709 using the latest CSV files."
    )
    base_dir = Path(__file__).resolve().parent
    parser.add_argument(
        "--stock-csv",
        type=Path,
        default=base_dir / "sk_price.csv",
        help="Path to the SK hynix CSV file.",
    )
    parser.add_argument(
        "--product-csv",
        type=Path,
        default=base_dir / "7709_price.csv",
        help="Path to the 7709 CSV file.",
    )
    parser.add_argument(
        "--start-date",
        help="Optional start date. Supported examples: 2026-04-02, 2026/04/02, 2026年4月2日.",
    )
    parser.add_argument(
        "--end-date",
        help="Optional end date. Supported examples: 2026-04-08, 2026/04/08, 2026年4月8日.",
    )
    return parser.parse_args()


def format_date(value: pd.Timestamp) -> str:
    return value.strftime("%Y-%m-%d")


def main() -> None:
    args = parse_args()
    result = compute_metrics(args.stock_csv, args.product_csv, args.start_date, args.end_date)

    print(f"stock csv: {result['stock_csv']}")
    print(f"7709 csv: {result['product_csv']}")
    print(
        f"stock data range: {format_date(result['stock_data_start'])} -> "
        f"{format_date(result['stock_data_end'])}"
    )
    print(
        f"7709 data range: {format_date(result['product_data_start'])} -> "
        f"{format_date(result['product_data_end'])}"
    )
    print(
        f"comparison range: {format_date(result['comparison_start'])} -> "
        f"{format_date(result['comparison_end'])}"
    )
    print(f"stock actual trading days in range: {result['stock_actual_days']}")
    print(f"7709 actual trading days in range: {result['product_actual_days']}")
    print(f"union trading days in range: {result['union_days']}")
    print()
    print(f"stock start price: {result['stock_start']:.2f}")
    print(f"stock end price: {result['stock_end']:.2f}")
    print(f"stock return: {result['stock_return']:.6%}")
    print(f"stock 2x linear return: {result['naive_2x_return']:.6%}")
    print(f"strict daily 2x return: {result['strict_2x_return']:.6%}")
    print()
    print(f"7709 start price: {result['product_start']:.2f}")
    print(f"7709 end price: {result['product_end']:.2f}")
    print(f"7709 return: {result['product_return']:.6%}")
    print()
    print(f"strict 2x - stock 2x linear: {result['strict_minus_naive']:.6%}")
    print(f"7709 - stock 2x linear: {result['product_minus_naive']:.6%}")
    print(f"7709 - strict 2x: {result['product_minus_strict']:.6%}")


if __name__ == "__main__":
    main()
