"""Collect public TGJU quotes/history without an API key; preserve failures explicitly."""
import concurrent.futures
import datetime as dt
import html
import json
import os
import re
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data/market.json'
TRANSLATE = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
ASSETS = {'gold': ('geram18', 10), 'dollar': ('price_dollar_rl', 10), 'ounce': ('ons', 1)}

def clean(s):
    return html.unescape(re.sub('<[^>]+>', '', s)).translate(TRANSLATE).strip()

def number(s):
    v = float(clean(s).replace(',', '').replace('٬', ''))
    if not 0 < v < 1e12:
        raise ValueError('Price outside valid range')
    return v

def cell(s, label):
    m = re.search(r'<td[^>]*>\s*' + re.escape(label) + r'\s*</td>\s*<td[^>]*>(.*?)</td>', s, re.S)
    return clean(m[1]) if m else None

def parse_page_time(value):
    # Source hours/minutes may be unpadded; never rely on ISO-only parsing.
    if not isinstance(value, str):
        raise ValueError('Missing source page time')
    match = re.fullmatch(r'(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2}):(\d{1,2})', clean(value))
    if not match:
        raise ValueError('Invalid source page time')
    return dt.datetime(*map(int, match.groups()), tzinfo=ZoneInfo('Asia/Tehran'))


def parse_quote(s, slug, divisor):
    m = re.search(r'data-col="info.last_trade.PDrCotVal"[^>]*>(.*?)</span>', s, re.S)
    if not m:
        raise ValueError('Quote markup changed')
    v = number(m[1]) / divisor
    prev = cell(s, 'نرخ روز گذشته')
    server = re.search(r'id="server-time"[^>]*data-value="([^"]+)"', s)
    stamp = parse_page_time(server[1]).strftime('%Y-%m-%d %H:%M:%S') if server else None
    # Page time is NOT claimed as the quote's full timestamp. Source supplies a time label.
    return {'value': v, 'previous': number(prev) / divisor if prev else None,
            'unit': 'USD/oz' if divisor == 1 else 'IRT', 'source': 'TGJU',
            'url': f'https://www.tgju.org/profile/{slug}',
            'sourceTimeLabel': cell(s, 'زمان ثبت آخرین نرخ'), 'pageTime': stamp,
            'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'status': 'ok'}

def parse_history(s, divisor):
    m = re.search(r'<table[^>]*history-table.*?</table>', s, re.S)
    if not m:
        raise ValueError('History markup changed')
    result = []
    for row in re.findall(r'<tr[^>]*>(.*?)</tr>', m[0], re.S):
        cols = [clean(x) for x in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
        if len(cols) < 8:
            continue
        date = dt.date.fromisoformat(cols[6].replace('/', '-')).isoformat()
        o, lo, hi, c = [number(x) / divisor for x in cols[:4]]
        if not lo <= min(o, c) <= max(o, c) <= hi:
            raise ValueError('Invalid OHLC range')
        result.append({'date': date, 'open': o, 'low': lo, 'high': hi, 'close': c})
    if not result:
        raise ValueError('Empty history')
    return sorted(result, key=lambda r: r['date'])


def merge_history(existing, incoming, divisor, now=None, source_page_time=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    today = now.astimezone(ZoneInfo('Asia/Tehran')).date().isoformat()
    source_day = None
    try:
        page = parse_page_time(source_page_time)
        if page <= now.astimezone(ZoneInfo('Asia/Tehran')) + dt.timedelta(minutes=5):
            source_day = page.date().isoformat()
    except (TypeError, ValueError):
        pass
    rows = {r['date']: r for r in existing}
    for row in incoming:
        dated = {**row, 'source': 'TGJU', 'unit': 'USD/oz' if divisor == 1 else 'IRT'}
        if row['date'] < today and source_day and row['date'] < source_day:
            prior = rows.get(row['date'], {})
            # Preserve first closed-day observation unless the source revises OHLC.
            same = all(prior.get(k) == row[k] for k in ('open','low','high','close'))
            dated['finalObservedAt'] = prior.get('finalObservedAt') if same and prior.get('finalObservedAt') else now.isoformat()
        if 'finalObservedAt' not in dated and rows.get(row['date'], {}).get('finalObservedAt'):
            continue
        rows[row['date']] = dated
    return [rows[d] for d in sorted(rows) if d <= today][-1500:]

def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (IranGoldRadar/0.1; public market dashboard)', 'Accept-Language': 'fa,en;q=0.8'})
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read(8_000_000).decode('utf-8')

def main():
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    result = {'schemaVersion': 1, 'updatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'quotes': {}, 'history': old.get('history', {}), 'errors': []}
    jobs = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for key, (slug, div) in ASSETS.items():
            jobs[pool.submit(fetch, f'https://www.tgju.org/profile/{slug}')] = (key, slug, div, False)
            jobs[pool.submit(fetch, f'https://www.tgju.org/profile/{slug}/history')] = (key, slug, div, True)
        for job in concurrent.futures.as_completed(jobs):
            key, slug, div, history = jobs[job]
            try:
                source = job.result()
                if history:
                    page_stamp = re.search(r'id="server-time"[^>]*data-value="([^"]+)"', source)
                    result['history'][key] = merge_history(result['history'].get(key, []), parse_history(source, div), div, source_page_time=page_stamp[1] if page_stamp else None)
                else:
                    result['quotes'][key] = parse_quote(source, slug, div)
            except Exception as exc:
                # Errors contain no keys or private inputs.
                result['errors'].append({'asset': key, 'kind': 'history' if history else 'quote', 'error': type(exc).__name__})
                if not history and key in old.get('quotes', {}):
                    result['quotes'][key] = {**old['quotes'][key], 'status': 'stale'}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({'quotes': {k: v['status'] for k, v in result['quotes'].items()},
                      'historyRows': {k: len(v) for k, v in result['history'].items()}, 'errors': result['errors']}))

if __name__ == '__main__':
    main()
