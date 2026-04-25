function CalloutBand() {
  return (
    <section style={{ background: 'var(--gray-90)', color: '#fff', padding: '96px 32px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7399C6', marginBottom: 16 }}>SPOTLIGHT · ASSET MANAGEMENT</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 48, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em', margin: 0, marginBottom: 20 }}>
            $2.8 trillion under supervision.
          </h2>
          <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--gray-30)', margin: 0, marginBottom: 28, maxWidth: 480 }}>
            One of the world's leading asset managers, with the scale to invest across every asset class and the conviction to act on it.
          </p>
          <a href="#" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#fff', fontSize: 15, fontWeight: 600, borderBottom: '1px solid #7399C6', paddingBottom: 4 }}>
            Visit Northvale Capital Asset Management →
          </a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--gray-80)', border: '1px solid var(--gray-80)' }}>
          {[
            { v: '$2.8T', l: 'Assets under supervision' },
            { v: '40+', l: 'Countries served' },
            { v: '155+', l: 'Years of experience' },
            { v: '49K+', l: 'Employees worldwide' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--gray-90)', padding: '32px 28px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff', marginBottom: 6 }}>{s.v}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-30)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
window.CalloutBand = CalloutBand;
