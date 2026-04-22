function Hero() {
  return (
    <section style={{ background: '#fff', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '80px 32px 96px', display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 64, alignItems: 'center' }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 20 }}>INSIGHTS · MARKETS · Q1 2026</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--fg-1)', margin: 0, marginBottom: 24 }}>
            Markets enter the second quarter on firmer footing.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: 'var(--fg-2)', margin: 0, marginBottom: 32, maxWidth: 560 }}>
            Our research desk weighs in on the rate path, equity rotation, and where the dollar finds support through year-end.
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button style={{ background: 'var(--gray-90)', color: '#fff', border: 'none', padding: '14px 24px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 4 }}>
              Read the report
            </button>
            <button style={{ background: 'transparent', color: 'var(--fg-1)', border: '1px solid var(--border-strong)', padding: '14px 24px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', borderRadius: 4 }}>
              Subscribe to BRIEFINGS
            </button>
          </div>
        </div>
        <div style={{ aspectRatio: '4/3', background: 'linear-gradient(135deg, #2A3F4D 0%, #1C2B36 100%)', borderRadius: 4, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', padding: 32 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 30%, rgba(115, 153, 198, 0.25), transparent 60%)' }}></div>
          <div style={{ position: 'relative', color: '#fff' }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#7399C6', marginBottom: 10 }}>FEATURED</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, lineHeight: 1.2 }}>
              The 2026 Macro Outlook
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
window.Hero = Hero;
