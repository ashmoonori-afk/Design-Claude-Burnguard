function MarketStrip() {
  const tickers = [
    { sym: 'S&P 500', val: '5,247.32', d: '+18.42', pct: '+0.35%', up: true },
    { sym: 'NASDAQ', val: '16,894.10', d: '+92.06', pct: '+0.55%', up: true },
    { sym: 'DOW', val: '39,118.86', d: '−21.56', pct: '−0.06%', up: false },
    { sym: 'US10Y', val: '4.21%', d: '−0.06', pct: '−1.40%', up: false },
    { sym: 'WTI', val: '$78.42', d: '+0.51', pct: '+0.65%', up: true },
    { sym: 'GOLD', val: '$2,341', d: '+8.10', pct: '+0.35%', up: true },
    { sym: 'BTC', val: '$67,420', d: '−1,210', pct: '−1.76%', up: false },
  ];
  return (
    <div style={{ background: 'var(--gray-90)', color: '#fff', borderTop: '1px solid var(--gray-80)', borderBottom: '1px solid var(--gray-80)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 32px', display: 'flex', gap: 40, overflowX: 'auto' }}>
        {tickers.map((t) => (
          <div key={t.sym} style={{ display: 'flex', alignItems: 'baseline', gap: 10, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-30)', letterSpacing: '0.08em' }}>{t.sym}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{t.val}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: t.up ? '#43C478' : '#FA5343' }}>{t.d}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: t.up ? '#43C478' : '#FA5343' }}>{t.pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
window.MarketStrip = MarketStrip;
