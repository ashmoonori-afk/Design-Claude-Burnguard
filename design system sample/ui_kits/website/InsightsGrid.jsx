function InsightsGrid() {
  const items = [
    { eyebrow: 'MACRO', title: 'Where the Fed pivots next', desc: 'Three scenarios for the June meeting and what each means for duration.', meta: 'Apr 18 · 8 min read' },
    { eyebrow: 'EQUITIES', title: 'The case for quality at peak rates', desc: 'Why balance-sheet strength historically outperforms in late-cycle markets.', meta: 'Apr 16 · 6 min read' },
    { eyebrow: 'COMMODITIES', title: 'Crude, copper, and the China question', desc: 'Reading the demand signal as inventories normalize across hubs.', meta: 'Apr 15 · 5 min read' },
  ];
  return (
    <section style={{ background: '#fff', padding: '96px 32px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Latest insights</h2>
          <a href="#" style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue-60)' }}>View all →</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {items.map((it, i) => (
            <article key={i} style={{ borderTop: '1px solid var(--gray-90)', paddingTop: 20 }}>
              <div style={{ aspectRatio: '4/3', background: ['linear-gradient(135deg,#3E5463,#1C2B36)','linear-gradient(135deg,#5B7282,#2A3F4D)','linear-gradient(135deg,#103A75,#0D1826)'][i], marginBottom: 20, borderRadius: 2 }}></div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>{it.eyebrow}</div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, lineHeight: 1.2, color: 'var(--fg-1)', margin: 0, marginBottom: 10, letterSpacing: '-0.01em' }}>{it.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--fg-2)', margin: 0, marginBottom: 14 }}>{it.desc}</p>
              <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{it.meta}</div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
window.InsightsGrid = InsightsGrid;
