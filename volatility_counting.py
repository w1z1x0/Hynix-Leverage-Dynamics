#!/usr/bin/env python3
"""Compute underlying vs daily 2x leveraged holding return from a CSV."""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


def compute_returns(csv_path: Path, price_col: str) -> dict[str, float]:
    df = pd.read_csv(csv_path)
    df["日期"] = pd.to_datetime(df["日期"], format="%Y年%m月%d日")
    df = df.sort_values("日期")

    price = df[price_col].astype(float)
    daily_return = price.pct_change().dropna()
    leveraged_daily_return = 2.0 * daily_return

    result = {
        "start_date": df["日期"].iloc[0],
        "end_date": df["日期"].iloc[-1],
        "start_price": price.iloc[0],
        "end_price": price.iloc[-1],
        "stock_return": (1.0 + daily_return).prod() - 1.0,
        "lev2_return": (1.0 + leveraged_daily_return).prod() - 1.0,
    }
    result["naive_2x_stock_return"] = 2.0 * result["stock_return"]
    result["lev2_minus_naive_2x"] = result["lev2_return"] - result["naive_2x_stock_return"]
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Calculate stock buy-and-hold return and daily 2x leveraged return."
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=Path(__file__).with_name("sk_stock.csv"),
        help="Path to CSV file (default: sk_stock.csv next to this script).",
    )
    parser.add_argument(
        "--price-col",
        default="調整後的收市價",
        help="Price column in CSV (default: 調整後的收市價).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = compute_returns(args.csv, args.price_col)

    print(f"date range: {result['start_date'].date()} -> {result['end_date'].date()}")
    print(f"start price: {result['start_price']:.2f}")
    print(f"end price: {result['end_price']:.2f}")
    print(f"stock return: {result['stock_return']:.6%}")
    print(f"daily 2x leveraged return: {result['lev2_return']:.6%}")
    print(f"naive 2x(stock return): {result['naive_2x_stock_return']:.6%}")
    print(f"lev2 - naive 2x: {result['lev2_minus_naive_2x']:.6%}")


if __name__ == "__main__":
    main()
