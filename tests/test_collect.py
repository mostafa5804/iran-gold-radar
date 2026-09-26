import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from collect import parse_quote, parse_history

class ParserTest(unittest.TestCase):
    def test_quote_converts_rials_once(self):
        s='<div id="server-time" data-value="2026-09-26 12:00:00"></div><span data-col="info.last_trade.PDrCotVal">۲۰۰,۰۰۰,۰۰۰</span><td>نرخ روز گذشته</td><td>190,000,000</td>'
        q=parse_quote(s,'geram18',10)
        self.assertEqual(q['value'],20_000_000)
        self.assertEqual(q['previous'],19_000_000)
    def test_history_ohlc_and_date(self):
        s='<table class="history-table"><tr>'+''.join('<td>'+x+'</td>' for x in ['100','90','120','110','10','10%','2026/09/20','1405/06/29'])+'</tr></table>'
        r=parse_history(s,10)[0]
        self.assertEqual(r['close'],11)
        self.assertEqual(r['date'],'2026-09-20')
    def test_invalid_markup_fails_closed(self):
        with self.assertRaises(ValueError):parse_quote('blocked','geram18',10)
if __name__=='__main__': unittest.main()
