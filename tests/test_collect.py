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

class FinalHistoryTest(unittest.TestCase):
    def test_only_closed_tehran_day_gets_final_marker(self):
        from collect import merge_history
        import datetime as dt
        rows=[{'date':d,'open':100,'low':90,'high':120,'close':110} for d in ['2026-09-26','2026-09-27']]
        now=dt.datetime.fromisoformat('2026-09-26T21:00:00+00:00')
        merged=merge_history([],rows,10,now,source_page_time='2026-09-27 00:25:00')
        self.assertIn('finalObservedAt',merged[0])
        self.assertNotIn('finalObservedAt',merged[1])
        self.assertEqual(merged[0]['unit'],'IRT')
        self.assertEqual(merge_history(merged,rows,10,now+dt.timedelta(hours=1),source_page_time='2026-09-27 01:25:00')[0]['finalObservedAt'],merged[0]['finalObservedAt'])
        rows[0]['close']=111
        revised=merge_history(merged,rows,10,now+dt.timedelta(hours=1),source_page_time='2026-09-27 01:25:00')
        self.assertNotEqual(revised[0]['finalObservedAt'],merged[0]['finalObservedAt'])

    def test_cached_source_from_target_day_is_not_a_final_close(self):
        from collect import merge_history
        import datetime as dt
        rows=[{'date':'2026-09-26','open':100,'low':90,'high':120,'close':110}]
        now=dt.datetime.fromisoformat('2026-09-27T10:00:00+00:00')
        for stamp in (None,'2026-09-26 17:00:00','invalid'):
            self.assertNotIn('finalObservedAt',merge_history([],rows,10,now,source_page_time=stamp)[0])
