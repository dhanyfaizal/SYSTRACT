// Utilitas navigasi untuk AppShell (setara dengan navUtils di BAAKSYS & SIRENA).
//
// Struktur NAV:
//   { section: 'Judul bagian' }
//   { id, label, icon, to, end? }                 -> item biasa
//   { id, label, icon, children: [ ...item ] }     -> modul (drill-in)
//   { ..., roles: ['admin'] }                      -> opsional, disaring filterNav

// `to` boleh membawa query (mis. '/materi?courseId=7'). Item seperti itu hanya
// cocok bila setiap parameter query-nya juga ada di URL saat ini.
function queryCocok(toQuery, search) {
  if (!toQuery) return true;
  const sekarang = new URLSearchParams(search || '');
  for (const [k, v] of new URLSearchParams(toQuery)) {
    if (sekarang.get(k) !== v) return false;
  }
  return true;
}

// Halaman turunan (mis. /mata-kuliah/7 di bawah /mata-kuliah) juga dihitung cocok;
// findActive memilih `to` terpanjang sehingga item paling spesifik yang menang.
function cocok(to, pathname, search) {
  if (!to) return false;
  const [path, query] = to.split('?');
  if (!queryCocok(query, search)) return false;
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function firstLeaf(module) {
  return (module.children || []).find((c) => c.to) || null;
}

export function findActive(nav, pathname, search = '') {
  let terbaik = { module: null, item: null, panjang: -1 };
  for (const item of nav) {
    if (item.children) {
      for (const child of item.children) {
        if (child.to && cocok(child.to, pathname, search)
            && child.to.length > terbaik.panjang) {
          terbaik = { module: item, item: child, panjang: child.to.length };
        }
      }
    } else if (item.to && cocok(item.to, pathname, search)
               && item.to.length > terbaik.panjang) {
      terbaik = { module: null, item, panjang: item.to.length };
    }
  }
  return { module: terbaik.module, item: terbaik.item };
}

export function filterNav(nav, { role }) {
  const boleh = (n) => !n.roles || n.roles.includes(role);
  const hasil = [];
  for (const n of nav) {
    if (!boleh(n)) continue;
    if (n.children) {
      const anak = n.children.filter(boleh);
      if (anak.some((c) => c.to)) hasil.push({ ...n, children: anak });
    } else {
      hasil.push(n);
    }
  }
  // Buang judul bagian yang tidak diikuti item.
  return hasil.filter((n, i) => !n.section || (hasil[i + 1] && !hasil[i + 1].section));
}
