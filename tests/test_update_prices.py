import csv
import json
from pathlib import Path

import pytest

from scripts import update_prices


def chart_payload():
    return {
        "chart": {
            "result": [
                {
                    "meta": {
                        "timezone": "HKT",
                        "exchangeTimezoneName": "Asia/Hong_Kong",
                    },
                    "timestamp": [1776297600, 1776384000],
                    "indicators": {
                        "quote": [
                            {
                                "open": [10.0, 11.0],
                                "high": [12.0, 13.0],
                                "low": [9.0, 10.0],
                                "close": [11.5, 12.25],
                                "volume": [1000, 1200],
                            }
                        ],
                        "adjclose": [{"adjclose": [11.5, 12.25]}],
                    },
                }
            ],
            "error": None,
        }
    }


def read_rows(path):
    with Path(path).open(encoding="utf-8", newline="") as handle:
        return list(csv.reader(handle))


def test_parse_yahoo_chart_rows_keeps_market_dates_and_prices():
    rows = update_prices.parse_yahoo_chart_rows(chart_payload())

    assert rows == [
        {
            "date": "2026-4-16",
            "open": 10.0,
            "high": 12.0,
            "low": 9.0,
            "close": 11.5,
            "adj_close": 11.5,
            "volume": 1000,
        },
        {
            "date": "2026-4-17",
            "open": 11.0,
            "high": 13.0,
            "low": 10.0,
            "close": 12.25,
            "adj_close": 12.25,
            "volume": 1200,
        },
    ]


def test_update_sk_csv_merges_new_rows_in_reverse_chronological_order(tmp_path):
    csv_path = tmp_path / "sk_price.csv"
    csv_path.write_text(
        "日期,開市,最高,最低,關閉,調整後的收市價,成交量\n"
        "2026-4-15,9.00,9.00,9.00,9.00,9.00,900\n",
        encoding="utf-8",
    )

    update_prices.write_sk_csv(csv_path, update_prices.parse_yahoo_chart_rows(chart_payload()))

    assert read_rows(csv_path) == [
        ["日期", "開市", "最高", "最低", "關閉", "調整後的收市價", "成交量"],
        ["2026-4-17", "11.00", "13.00", "10.00", "12.25", "12.25", "1200"],
        ["2026-4-16", "10.00", "12.00", "9.00", "11.50", "11.50", "1000"],
        ["2026-4-15", "9.00", "9.00", "9.00", "9.00", "9.00", "900"],
    ]


def test_update_7709_csv_merges_close_prices_in_chronological_order(tmp_path):
    csv_path = tmp_path / "7709_price.csv"
    csv_path.write_text(
        "時間,收市價\n"
        "2026/04/15,9\n",
        encoding="utf-8",
    )

    update_prices.write_7709_csv(csv_path, update_prices.parse_yahoo_chart_rows(chart_payload()))

    assert read_rows(csv_path) == [
        ["時間", "收市價"],
        ["2026/04/15", "9"],
        ["2026/04/16", "11.5"],
        ["2026/04/17", "12.25"],
    ]


def test_empty_yahoo_payload_is_rejected():
    payload = json.loads(json.dumps(chart_payload()))
    payload["chart"]["result"][0]["timestamp"] = []

    with pytest.raises(ValueError, match="No price rows"):
        update_prices.parse_yahoo_chart_rows(payload)
