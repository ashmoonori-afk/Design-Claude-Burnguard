function Footer() {
  const cols = [
    { h: 'Our Firm', items: ['About Us', 'Leadership', 'History', 'Diversity & Inclusion', 'Sustainability'] },
    { h: 'Businesses', items: ['Asset Management', 'Investment Banking', 'Global Markets', 'Consumer & Wealth', 'Marquee'] },
    { h: 'Insights', items: ['BRIEFINGS', 'Exchanges Podcast', 'Market Outlook', 'Research', 'Newsroom'] },
    { h: 'Careers', items: ['Search Jobs', 'Students', 'Experienced Hires', 'Locations', 'Engineering'] },
  ];
  return (
    <footer style={{ background: '#fff', borderTop: '1px solid var(--gray-90)', paddingTop: 64 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr repeat(4, 1fr)', gap: 48, paddingBottom: 56 }}>
          <div>
            <img src="../../assets/logos/Northvale_Signature.svg" alt="Northvale Capital" style={{ height: 44, marginBottom: 20 }} />
            <p style={{ fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.5, margin: 0 }}>
              200 West Street<br/>New York, NY 10282<br/>United States
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.h}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-1)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 18 }}>{c.h}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.items.map((i) => <li key={i}><a href="#" style={{ fontSize: 13, color: 'var(--fg-2)' }}>{i}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--border)', padding: '24px 0 32px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>© {new Date().getFullYear()} The Northvale Capital Group, Inc. All rights reserved.</div>
          <div style={{ display: 'flex', gap: 24, fontSize: 11 }}>
            <a href="#" style={{ color: 'var(--fg-3)' }}>Privacy</a>
            <a href="#" style={{ color: 'var(--fg-3)' }}>Terms of Use</a>
            <a href="#" style={{ color: 'var(--fg-3)' }}>Cookie Settings</a>
            <a href="#" style={{ color: 'var(--fg-3)' }}>Accessibility</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
window.Footer = Footer;
