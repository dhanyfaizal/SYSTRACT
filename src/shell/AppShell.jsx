/**
 * AppShell — kerangka aplikasi, disalin dari SIRPL (BAAKSYS & SIRENA).
 * Perbedaan dari SIRPL: findActive menerima location.search agar menu
 * dengan query (mis. /materi?courseId=7) bisa ditandai aktif.
 *
 * - Desktop  (>= 768px): sidebar penuh, bisa dilipat menjadi rail ikon.
 * - Ponsel   (< 768px) : sidebar menjadi drawer dengan tombol menu & overlay.
 * - Sidebar drill-in   : membuka modul mengganti isi sidebar dengan sub-menu
 *                        modul itu, lengkap dengan tombol kembali ke menu utama.
 *                        Tingkat yang tampil ditentukan oleh URL, jadi refresh,
 *                        tombol back, dan link yang dibagikan tetap konsisten.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { findActive, firstLeaf } from './navUtils';
import './shell.css';

const MOBILE_QUERY = '(max-width: 767px)';

function useMediaQuery(query) {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function readPref(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage tidak tersedia */ }
}

// ── Item menu ────────────────────────────────────────────────
function LeafLink({ item, onNavigate, iconSize = 16 }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end !== false}
      title={item.label}
      onClick={onNavigate}
      onMouseEnter={item.onPrefetch}
      onFocus={item.onPrefetch}
      className={({ isActive }) => `shell-item${isActive ? ' active' : ''}`}
    >
      {Icon ? <Icon size={iconSize} className="shell-item-icon" aria-hidden="true" /> : null}
      <span className="shell-item-label">{item.label}</span>
      {item.badge ? <span className="shell-item-badge">{item.badge}</span> : null}
    </NavLink>
  );
}

function ModuleButton({ item, active, onOpen }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      title={item.label}
      onClick={() => onOpen(item)}
      className={`shell-item${active ? ' active' : ''}`}
    >
      {Icon ? <Icon size={16} className="shell-item-icon" aria-hidden="true" /> : null}
      <span className="shell-item-label">{item.label}</span>
      {item.badge ? <span className="shell-item-badge">{item.badge}</span> : null}
      <ChevronRight size={14} className="shell-item-chev" aria-hidden="true" />
    </button>
  );
}

// ── Sidebar ──────────────────────────────────────────────────
function ShellSidebar({ nav, brand, top, footer, rail, navigateOnOpen, onExpand, onNavigate }) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = useMemo(() => findActive(nav, location.pathname, location.search), [nav, location.pathname, location.search]);

  // Modul yang sedang dibuka di sidebar. Ikut URL setiap kali URL berpindah.
  const [drillId, setDrillId] = useState(active.module?.id ?? null);
  const [direction, setDirection] = useState('in');
  useEffect(() => {
    setDrillId(active.module?.id ?? null);
  }, [active.module?.id]);

  const drilled = !rail && drillId ? nav.find((n) => n.id === drillId && n.children) : null;

  const openModule = useCallback((module) => {
    setDirection('in');
    setDrillId(module.id);
    if (rail) onExpand?.();
    // Desktop: masuk ke modul langsung membuka halaman pertamanya.
    // Ponsel: cukup tampilkan sub-menu agar pengguna memilih sendiri (drawer tetap terbuka).
    if (navigateOnOpen && active.module?.id !== module.id) {
      const leaf = firstLeaf(module);
      if (leaf) navigate(leaf.to);
    }
  }, [rail, navigateOnOpen, onExpand, active.module?.id, navigate]);

  const backToRoot = () => {
    setDirection('back');
    setDrillId(null);
  };

  return (
    <aside className="shell-sidebar" aria-label="Navigasi utama">
      <div className="shell-brand">
        {brand.logo ? <img src={brand.logo} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
        <div className="shell-brand-text">
          <div className="shell-brand-name">{brand.name}</div>
          {brand.sub ? <div className="shell-brand-sub">{brand.sub}</div> : null}
        </div>
      </div>

      {top ? <div className="shell-sidebar-top">{top}</div> : null}

      <nav className="shell-nav">
        {drilled ? (
          <div key={`m-${drilled.id}`} className="shell-panel shell-sub">
            <button type="button" className="shell-item shell-back" onClick={backToRoot}>
              <ArrowLeft size={16} className="shell-item-icon" aria-hidden="true" />
              <span className="shell-item-label">Menu utama</span>
            </button>
            <div className="shell-module-title">
              {drilled.icon ? <drilled.icon size={16} aria-hidden="true" /> : null}
              <span>{drilled.label}</span>
            </div>
            {drilled.children.map((child, i) =>
              child.section
                ? <div key={`s-${i}`} className="shell-section">{child.section}</div>
                : <LeafLink key={child.to} item={child} onNavigate={onNavigate} />
            )}
          </div>
        ) : (
          <div key="root" className={`shell-panel${direction === 'back' ? ' from-left' : ''}`}>
            {nav.map((item, i) => {
              if (item.section) return <div key={`s-${i}`} className="shell-section">{item.section}</div>;
              if (item.children) {
                return (
                  <ModuleButton
                    key={item.id}
                    item={item}
                    active={active.module?.id === item.id}
                    onOpen={openModule}
                  />
                );
              }
              return <LeafLink key={item.id || item.to} item={item} onNavigate={onNavigate} />;
            })}
          </div>
        )}
      </nav>

      {footer ? <div className="shell-sidebar-footer">{footer}</div> : null}
    </aside>
  );
}

// ── Shell ────────────────────────────────────────────────────
export function AppShell({ nav, brand, sidebarTop, sidebarFooter, headerRight, storageKey = 'shell', children }) {
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const location = useLocation();
  const prefKey = `${storageKey}:rail`;

  const [rail, setRail] = useState(() => {
    const saved = readPref(prefKey);
    if (saved !== null) return saved === '1';
    return typeof window !== 'undefined' && window.innerWidth < 1100;
  });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Tutup drawer setiap pindah halaman
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const setRailPersist = useCallback((value) => {
    setRail(value);
    writePref(prefKey, value ? '1' : '0');
  }, [prefKey]);

  const toggle = () => {
    if (isMobile) setDrawerOpen((v) => !v);
    else setRailPersist(!rail);
  };

  const active = useMemo(() => findActive(nav, location.pathname, location.search), [nav, location.pathname, location.search]);
  const title = active.module
    ? { parent: active.module.label, current: active.item?.label }
    : { parent: null, current: active.item?.label };

  const cls = ['shell'];
  if (rail && !isMobile) cls.push('is-rail');
  if (drawerOpen && isMobile) cls.push('is-drawer-open');

  const ToggleIcon = isMobile ? Menu : rail ? PanelLeftOpen : PanelLeftClose;

  return (
    <div className={cls.join(' ')}>
      <ShellSidebar
        nav={nav}
        brand={brand}
        top={sidebarTop}
        footer={sidebarFooter}
        rail={rail && !isMobile}
        navigateOnOpen={!isMobile}
        onExpand={() => setRailPersist(false)}
        onNavigate={() => { if (isMobile) setDrawerOpen(false); }}
      />
      {drawerOpen && isMobile ? <div className="shell-overlay" onClick={() => setDrawerOpen(false)} aria-hidden="true" /> : null}

      <div className="shell-main">
        <header className="shell-header">
          <button
            type="button"
            className="shell-icon-btn"
            onClick={toggle}
            aria-label={isMobile ? 'Buka menu' : rail ? 'Lebarkan sidebar' : 'Lipat sidebar'}
            aria-expanded={isMobile ? drawerOpen : !rail}
          >
            <ToggleIcon size={18} />
          </button>
          {title.current || title.parent ? (
            <div className="shell-header-title">
              {title.parent && title.current ? <span>{title.parent} / </span> : null}
              {title.current || title.parent}
            </div>
          ) : (
            <div className="shell-header-title">{brand.name}</div>
          )}
          <div className="shell-header-slot">{headerRight}</div>
        </header>
        <main className="shell-content" id="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
