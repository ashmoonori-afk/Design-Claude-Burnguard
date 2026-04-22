const { useState } = React;

function Header() {
  const [open, setOpen] = useState(null);
  const nav = ['Insights', 'Our Firm', 'Investor Relations', 'Careers', 'Client Login'];
  return (
    <header style={{ borderBottom: '1px solid var(--border)', background: '#fff' }}>
      <div style={{ background: 'var(--gray-10)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '8px 32px', display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 12, color: 'var(--fg-3)' }}>
          <a href="#" style={{ color: 'var(--fg-3)' }}>Marquee</a>
          <a href="#" style={{ color: 'var(--fg-3)' }}>Goldman Sachs Asset Management</a>
          <a href="#" style={{ color: 'var(--fg-3)' }}>10,000 Small Businesses</a>
          <span style={{ color: 'var(--gray-30)' }}>|</span>
          <a href="#" style={{ color: 'var(--fg-3)' }}>EN ▾</a>
        </div>
      </div>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 32px', display: 'flex', alignItems: 'center', gap: 48 }}>
        <a href="#" style={{ borderBottom: 'none', flexShrink: 0 }}>
          <img src="../../assets/logos/Goldman_Sachs_Signature.svg" alt="Goldman Sachs" style={{ height: 36, display: 'block' }} />
        </a>
        <nav style={{ display: 'flex', gap: 32, flex: 1 }}>
          {nav.map((n, i) => (
            <a key={n} href="#"
              onMouseEnter={() => setOpen(i)} onMouseLeave={() => setOpen(null)}
              style={{ fontSize: 14, fontWeight: 500, color: 'var(--fg-1)', borderBottom: open === i ? '2px solid var(--gray-90)' : '2px solid transparent', paddingBottom: 4, transition: 'border-color 120ms' }}>
              {n}
            </a>
          ))}
        </nav>
        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-1)', fontSize: 14 }}>
          <i data-lucide="search" style={{ width: 18, height: 18 }}></i>
        </button>
      </div>
    </header>
  );
}
window.Header = Header;
