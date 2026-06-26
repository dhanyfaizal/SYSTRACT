/**
 * SIRA-SYS — WebSlide HTML Generator (AI-Driven Layouts & Interactive Accordions)
 * Helper untuk menyusun berkas HTML WebSlide interaktif secara dinamis
 * berdasarkan data materi pertemuan hasil generate AI yang kaya visual.
 */

const PRODI_THEMES = {
  si: {
    accent: '#ef4444',
    dark: '#7f1d1d',
    rgbaLight: 'rgba(239, 68, 68, 0.1)',
    rgbaDark: 'rgba(239, 68, 68, 0.16)'
  },
  ka: {
    accent: '#10b981',
    dark: '#064e3b',
    rgbaLight: 'rgba(16, 185, 129, 0.1)',
    rgbaDark: 'rgba(16, 185, 129, 0.16)'
  },
  ti: {
    accent: '#f97316',
    dark: '#9a3412',
    rgbaLight: 'rgba(249, 115, 22, 0.1)',
    rgbaDark: 'rgba(249, 115, 22, 0.16)'
  },
  dkv: {
    accent: '#8b5cf6',
    dark: '#581c87',
    rgbaLight: 'rgba(139, 92, 246, 0.1)',
    rgbaDark: 'rgba(139, 92, 246, 0.16)'
  },
  default: {
    accent: '#3b82f6',
    dark: '#1e3a8a',
    rgbaLight: 'rgba(59, 130, 246, 0.1)',
    rgbaDark: 'rgba(59, 130, 246, 0.16)'
  }
};

function getThemeByProdi(prodiName) {
  const name = prodiName?.toLowerCase() || '';
  if (name.includes('sistem informasi') || name.includes('si')) return PRODI_THEMES.si;
  if (name.includes('komputerisasi akuntansi') || name.includes('ka')) return PRODI_THEMES.ka;
  if (name.includes('teknik informatika') || name.includes('ti')) return PRODI_THEMES.ti;
  if (name.includes('desain komunikasi visual') || name.includes('dkv')) return PRODI_THEMES.dkv;
  return PRODI_THEMES.default;
}

export function generateWebSlideHtml(courseName, prodiName, meetingNo, slideData) {
  const theme = getThemeByProdi(prodiName);
  const title = slideData?.title || `Materi Pertemuan ${meetingNo}`;
  let slides = [...(slideData?.slides || [])];

  // Tambahkan slide terima kasih di akhir secara dinamis jika belum ada
  const hasThankYou = slides.some(s => s.layout === 'thank_you' || s.title?.toLowerCase().includes('terima kasih'));
  if (!hasThankYou) {
    slides.push({
      slide_no: slides.length + 1,
      layout: 'thank_you',
      title: 'Terima Kasih',
      description: 'Semoga materi perkuliahan hari ini bermanfaat. Sampai jumpa di pertemuan berikutnya!'
    });
  }

  // Bangun option slide untuk menu dropdown
  const dropdownOptions = slides.map((slide, idx) => {
    return `<option value="${idx}">Slide ${idx + 1}: ${slide.title || 'Materi'}</option>`;
  }).join('\n            ');

  // Parser konten slide dinamis berdasarkan layout yang ditentukan AI atau fallback manual
  function renderSlideBody(slide, slideIndex) {
    const layout = slide.layout || (slideIndex === 0 ? 'cover' : 'legacy');
    const imgUrl = slide.image_url || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80';

    // 1. LAYOUT: COVER (Slide Pembuka)
    if (layout === 'cover') {
      const coverTitle = slide.title || title;
      const subtitle = slide.subtitle || courseName;
      const desc = slide.description || (slide.content && slide.content[0]) || 'Outline presentasi terstruktur pendukung perkuliahan berbasis Outcome-Based Education.';
      return `
        <div class="slide-layout-cover-grid animate-item">
          <div class="slide-content-col" style="justify-content: center;">
            <h2 class="animate-item animate-delay-1" style="color: var(--accent-cyan); text-transform: uppercase; letter-spacing: 2.5px; font-weight: 700; margin-bottom: 12px; font-size: calc(18px * var(--fs-mult));">
              Pertemuan ${meetingNo}
            </h2>
            <h1 class="animate-item animate-delay-1" style="line-height: 1.15; margin-bottom: 24px; font-weight: 800; font-size: calc(42px * var(--fs-mult)); color: #FFFFFF; text-shadow: 0 4px 12px rgba(0,0,0,0.15);">
              ${subtitle.toUpperCase()}<br>
              <span style="color: var(--accent-cyan);">${coverTitle.toUpperCase()}</span>
            </h1>
            <p class="animate-item animate-delay-2" style="max-width: 850px; font-weight: 500; font-size: calc(18px * var(--fs-mult)); color: #D8E7FF; line-height: 1.6; margin-bottom: 24px;">
              ${desc}
            </p>
            <div class="animate-item animate-delay-3" style="display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap;">
              <span class="badge-tag">Rencana Pembelajaran Semester</span>
              <span class="badge-tag">Pertemuan ${meetingNo}</span>
              <span class="badge-tag" style="background: rgba(255,255,255,0.15); color: #fff;">${prodiName}</span>
            </div>
            <div class="animate-item animate-delay-3" style="margin-top: 30px; font-size: calc(12px * var(--fs-mult)); color: rgba(255,255,255,0.4); font-weight: 600;">
              Powered by WebSlide — <a href="https://getwebslide.com" target="_blank" style="color: rgba(255,255,255,0.6); text-decoration: none; border-bottom: 1px dotted rgba(255,255,255,0.4);">getwebslide.com</a>
            </div>
          </div>
          <div class="slide-image-col">
            <div class="webslide-image-wrapper">
              <img src="${imgUrl}" alt="Cover Illustration" class="webslide-image" />
            </div>
          </div>
        </div>
      `;
    }

    // 1b. LAYOUT: THANK YOU (Slide Penutup)
    if (layout === 'thank_you') {
      return `
        <div class="cover-content" style="text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%;">
          <h1 class="animate-item animate-delay-1" style="font-weight: 800; font-size: calc(56px * var(--fs-mult)); color: #FFFFFF; text-shadow: 0 4px 12px rgba(0,0,0,0.15); margin-bottom: 20px; font-family: 'Urbanist', sans-serif;">
            TERIMA KASIH
          </h1>
          <p class="animate-item animate-delay-2" style="max-width: 600px; font-weight: 500; font-size: calc(18px * var(--fs-mult)); color: #D8E7FF; line-height: 1.6; margin-bottom: 30px;">
            ${slide.description || 'Semoga materi perkuliahan hari ini bermanfaat. Sampai jumpa di pertemuan berikutnya!'}
          </p>
          <div class="animate-item animate-delay-3" style="font-size: calc(12px * var(--fs-mult)); color: rgba(255,255,255,0.4); font-weight: 600; margin-top: 20px;">
            Powered by WebSlide — <a href="https://getwebslide.com" target="_blank" style="color: rgba(255,255,255,0.6); text-decoration: none; border-bottom: 1px dotted rgba(255,255,255,0.4);">getwebslide.com</a>
          </div>
        </div>
      `;
    }

    let innerHtml = '';

    // 2. LAYOUT: SPLIT (Stacked vertically when image is on the right)
    if (layout === 'split') {
      const left = slide.split_left || { heading: 'Konteks Utama', description: '' };
      const rightPoints = slide.split_right || [];
      innerHtml = `
        <div class="webslide-split-stacked animate-item">
          <div class="accent-card accent-blue" style="padding: 24px;">
            <h3 style="font-size: calc(20px * var(--fs-mult)); margin-bottom: 10px; font-weight: 800; color: var(--accent-cyan); font-family: 'Urbanist', sans-serif;">
              ${left.heading}
            </h3>
            <p class="body" style="font-size: calc(14.5px * var(--fs-mult)); color: var(--text-main); line-height: 1.55;">
              ${left.description}
            </p>
          </div>
          <div class="webslide-split-right-points" style="margin-top: 10px;">
            ${rightPoints.map((pt, idx) => `
              <div style="display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px;" class="animate-item animate-delay-${idx + 1}">
                <div class="chk chk-green"><svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1 4.5l2.5 2.5L8 1.5" stroke="var(--accent-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                <p class="body" style="font-size: calc(14.5px * var(--fs-mult)); color: var(--text-dim); line-height: 1.5; margin: 0;">${pt}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
    // 3. LAYOUT: GRID
    else if (layout === 'grid') {
      const items = slide.grid_items || [];
      const gridClass = items.length === 2 ? 'grid-2-col' : 'grid-2x2';
      innerHtml = `
        <div class="${gridClass} animate-item">
          ${items.map((item, idx) => `
            <div class="tile animate-item animate-delay-${idx + 1}" style="padding: 20px; min-height: 120px; gap: 8px;">
              <i class="${item.icon || 'fa-solid fa-lightbulb'}" style="font-size: 24px;"></i>
              <h3 style="font-size: calc(16px * var(--fs-mult));">${item.title}</h3>
              <p style="font-size: calc(13px * var(--fs-mult));">${item.desc}</p>
            </div>
          `).join('')}
        </div>
      `;
    }
    // 4. LAYOUT: LIST
    else if (layout === 'list') {
      const items = slide.list_items || [];
      innerHtml = `
        <div class="content-list animate-item">
          ${items.map((item, idx) => `
            <div class="accent-card accent-${item.color || 'blue'} animate-item animate-delay-${idx + 1}" style="padding: 16px 20px;">
              <p class="body" style="font-size: calc(14.5px * var(--fs-mult)); color: var(--text-dim); line-height: 1.5;">
                ${item.text}
              </p>
            </div>
          `).join('')}
        </div>
      `;
    }
    // 5. LAYOUT: TABLE
    else if (layout === 'table') {
      const table = slide.table_data || { headers: [], rows: [] };
      innerHtml = `
        <div class="table-wrapper animate-item">
          <table>
            <thead>
              <tr>
                ${table.headers.map(h => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${table.rows.map(row => `
                <tr>
                  ${row.map(cell => `<td>${cell}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
    // 6. LAYOUT: ACCORDION
    else if (layout === 'accordion') {
      const items = slide.accordion_items || [];
      innerHtml = `
        <div class="accordion-container animate-item">
          <p style="font-size: calc(14.8px * var(--fs-mult)); color: var(--text-dim); margin-bottom: 12px; font-weight: 500;" class="animate-item">
            Klik pada setiap pertanyaan di bawah untuk membuka poin diskusi:
          </p>
          ${items.map((item, idx) => `
            <details class="accordion-item animate-item animate-delay-${idx + 1}">
              <summary class="accordion-header" style="padding: 14px 20px; font-size: calc(15px * var(--fs-mult));">
                <span>${item.header}</span>
                <i class="fa-solid fa-chevron-down"></i>
              </summary>
              <div class="accordion-content" style="padding: 0 20px 16px 20px; font-size: calc(14px * var(--fs-mult));">
                <p>${item.content}</p>
              </div>
            </details>
          `).join('')}
        </div>
      `;
    }
    // 7. BACKWARD COMPATIBILITY / FALLBACK (Legacy)
    else {
      const points = slide.content || [];
      if (points.length === 0) return '';
      const isCompact = points.length > 4;
      innerHtml = `
        <div class="content-list ${isCompact ? 'compact' : ''} animate-item">
          ${points.map((pt, idx) => `
            <div class="content-item animate-item animate-delay-${idx + 1}" style="padding: 14px 20px; gap: 12px;">
              <div class="item-icon"><i class="fa-solid fa-square-check"></i></div>
              <div class="item-text" style="font-size: calc(14.5px * var(--fs-mult));">${pt}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `
      <div class="slide-layout-grid animate-item">
        <div class="slide-content-col">
          ${innerHtml}
        </div>
        <div class="slide-image-col">
          <div class="webslide-image-wrapper">
            <img src="${imgUrl}" alt="Slide Reference" class="webslide-image" />
          </div>
        </div>
      </div>
    `;
  }

  // Bangun elemen HTML slide
  const slidesHtml = slides.map((slide, idx) => {
    const isDarkClass = (idx === 0 || slide.layout === 'cover' || slide.layout === 'thank_you' || idx === slides.length - 1) ? 'dark' : '';
    const isActiveClass = (idx === 0) ? 'active' : '';
    const slideClasses = `${isDarkClass} ${isActiveClass}`.trim();
    
    const slideTitle = (idx === 0 || slide.layout === 'thank_you') 
      ? '' 
      : `<h2 class="slide-title"><span>${slide.title || `Slide ${idx + 1}`}</span></h2>`;

    const referenceFooter = (slide.reference && slide.layout !== 'cover' && slide.layout !== 'thank_you')
      ? `<div class="slide-reference-footer animate-item" style="font-size: calc(11.5px * var(--fs-mult)); color: var(--text-dim); margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(0, 0, 0, 0.08); display: flex; align-items: center; gap: 6px; font-weight: 600;">
           <i class="fa-solid fa-book-bookmark" style="color: var(--accent-cyan); font-size: 11px;"></i>
           <span>Rujukan: ${slide.reference}</span>
         </div>`
      : '';

    return `
    <!-- Slide ${idx + 1} -->
    <div class="slide ${slideClasses}" id="slide${idx + 1}">
        ${slideTitle}
        <div class="content-area">
            ${renderSlideBody(slide, idx)}
            ${referenceFooter}
        </div>
    </div>`;
  }).join('\n');

  // Kerangka HTML Utama WebSlide
  return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebSlide - ${courseName} - Pertemuan ${meetingNo}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;600;800&family=Plus+Jakarta+Sans:wght@400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        :root {
            --bg-dark: #F3F4F6;
            --bg-card: #FFFFFF;
            --bg-card-hover: #F9FAFB;
            --accent-cyan: ${theme.accent};
            --accent-dark: ${theme.dark};
            
            --accent-red: #ef4444;
            --accent-amber: #f59e0b;
            --accent-green: #10b981;
            --accent-blue: #3b82f6;
            
            --accent-red-light: #fef2f2;
            --accent-amber-light: #fffbeb;
            --accent-green-light: #ecfdf5;
            --accent-blue-light: #eff6ff;
            
            --text-main: #1F2937;
            --text-dim: #4B5563;
            --slide-width: 1280px;
            --slide-height: 720px;
            --fs-mult: 1.05;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg-dark); color: var(--text-main);
            font-family: 'Plus Jakarta Sans', sans-serif;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            min-height: 100vh; overflow: hidden;
        }
        #slider-wrapper {
            width: var(--slide-width); height: var(--slide-height); position: relative;
            background-color: var(--bg-dark); border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.08);
            overflow: hidden; border: 1px solid rgba(209,213,219,1); transition: all 0.3s ease;
        }
        #slider-wrapper:fullscreen { width: 100vw !important; height: 100vh !important; border-radius: 0 !important; display: flex; flex-direction: column; justify-content: center; align-items: center; background-color: var(--bg-dark); }
        #slider-wrapper:fullscreen .slide { padding: 120px 80px 80px 80px; }
        .top-header {
            position: absolute; top: 20px; left: 40px; right: 40px; height: 60px;
            display: flex; justify-content: space-between; align-items: center; z-index: 20;
            background: rgba(255,255,255,0.85); padding: 10px 20px; border-radius: 12px;
            border: 1px solid rgba(209,213,219,0.8); backdrop-filter: blur(12px);
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        #slider-wrapper:fullscreen .top-header { top: 30px; left: 50px; right: 50px; }
        .brand-logo { display: flex; align-items: center; gap: 12px; font-family: 'Urbanist', sans-serif; font-weight: 800; font-size: 20px; letter-spacing: -0.5px; transition: opacity .25s ease; }
        .header-controls { display: flex; align-items: center; gap: 12px; margin-left: auto; }
        .font-control-group { display: flex; background: #FFFFFF; border: 1px solid rgba(209,213,219,1); border-radius: 8px; overflow: hidden; }
        .font-btn, .action-btn { background: transparent; border: none; color: var(--text-main); padding: 8px 12px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.2s ease; display: flex; align-items: center; gap: 6px; }
        .font-btn:hover, .action-btn:hover { background: ${theme.rgbaLight}; color: var(--accent-cyan); }
        .font-btn:not(:last-child) { border-right: 1px solid rgba(209,213,219,1); }
        .action-btn { background: #FFFFFF; border: 1px solid rgba(209,213,219,1); border-radius: 8px; padding: 8px 14px; }
        .slide-select-nav {
            background: #FFFFFF; color: var(--text-main); border: 1px solid rgba(209,213,219,1);
            padding: 8px 14px; border-radius: 8px; font-family: 'Plus Jakarta Sans', sans-serif;
            font-size: 14px; font-weight: 600; cursor: pointer; outline: none; transition: all 0.3s ease; max-width: 260px;
        }
        .slide-select-nav:hover, .slide-select-nav:focus { border-color: var(--accent-cyan); box-shadow: 0 0 10px rgba(0,0,0,0.05); }
        #progress-container { position: absolute; top: 0; left: 0; width: 100%; height: 6px; background: rgba(229,231,235,1); z-index: 10; }
        #progress-bar { height: 100%; width: 0%; background: linear-gradient(90deg, #9CA3AF, var(--accent-cyan)); transition: width 0.4s cubic-bezier(0.22,1,0.36,1); }
        
        .slide {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%; padding: 100px 60px 60px 60px;
            opacity: 0; visibility: hidden; transform: translateX(50px); transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.22,1,0.36,1), visibility 0.5s;
            display: flex; flex-direction: column; z-index: 1;
            background-image: radial-gradient(circle at 100% 0%, ${theme.rgbaLight} 0%, transparent 50%), linear-gradient(rgba(243,244,246,0.96), rgba(243,244,246,0.99)), url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgwLDAsMCwwLjA0KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+');
            background-size: cover, cover, auto; background-position: center;
        }
        .slide.dark { background: radial-gradient(circle at 100% 0%, ${theme.rgbaDark} 0%, transparent 45%), linear-gradient(135deg, ${theme.dark}, #111827 75%); }
        .slide.active { opacity: 1; visibility: visible; transform: translateX(0); z-index: 2; }
        .slide.prev-slide { transform: translateX(-50px); }
        .content-area { position: relative; z-index: 2; flex-grow: 1; display: flex; flex-direction: column; justify-content: center; width: 100%; min-height: 0; }
        
        .slide-title { font-size: calc(36px * var(--fs-mult)); font-weight: 800; margin-bottom: 22px; text-transform: uppercase; border-left: 6px solid var(--accent-cyan); padding-left: 20px; line-height: 1.1; transition: font-size 0.2s ease; font-family: 'Urbanist', sans-serif; letter-spacing: -1px; }
        .slide-title span { color: var(--accent-cyan); }
        .dark .slide-title { color: #FFFFFF; }
        
        /* ── Grid Layouts ── */
        .grid-2-col { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
        .grid-3-col { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
        .grid-2x2 { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; gap: 20px; }
        .split { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; flex: 1; min-height: 0; align-items: stretch; }
        .col { display: flex; flex-direction: column; gap: 16px; min-height: 0; }
        
        /* ── Card: Tile ── */
        .tile {
            background: var(--bg-card); border: 1px solid rgba(229,231,235,1);
            padding: 28px 24px; border-radius: 16px; transition: all 0.3s ease;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03); display: flex; flex-direction: column;
            gap: 12px; min-height: 140px; justify-content: flex-start;
        }
        .tile:hover { transform: translateY(-4px); border-color: var(--accent-cyan); box-shadow: 0 12px 20px -8px ${theme.rgbaLight}; }
        .tile i { font-size: 30px; color: var(--accent-cyan); margin-bottom: 4px; }
        .tile h3 { font-size: calc(18px * var(--fs-mult)); font-weight: 800; color: var(--text-main); font-family: 'Urbanist', sans-serif; }
        .tile p { font-size: calc(14.2px * var(--fs-mult)); color: var(--text-dim); line-height: 1.5; font-weight: 500; }
        
        /* ── Card: Accent Card ── */
        .accent-card {
            border-radius: 12px; padding: 22px 26px; position: relative; overflow: hidden;
            border: 1px solid rgba(229, 231, 235, 0.8); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
            transition: all 0.3s ease;
        }
        .accent-card:hover { transform: translateY(-2px); box-shadow: 0 8px 16px -4px rgba(0,0,0,0.04); }
        .accent-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
        
        .accent-red { background: var(--accent-red-light); }
        .accent-red::before { background: var(--accent-red); }
        .accent-amber { background: var(--accent-amber-light); }
        .accent-amber::before { background: var(--accent-amber); }
        .accent-green { background: var(--accent-green-light); }
        .accent-green::before { background: var(--accent-green); }
        .accent-blue { background: var(--accent-blue-light); }
        .accent-blue::before { background: var(--accent-blue); }
        
        /* ── Lists ── */
        .content-list { display: flex; flex-direction: column; gap: 16px; }
        .content-item {
            background: var(--bg-card); border: 1px solid rgba(229,231,235,1);
            padding: 20px 24px; border-radius: 12px; display: flex; align-items: flex-start;
            gap: 16px; transition: all 0.3s ease; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
        }
        .content-item:hover { transform: translateY(-2px); border-color: var(--accent-cyan); box-shadow: 0 8px 15px -3px rgba(0,0,0,0.05); }
        .item-icon { color: var(--accent-cyan); font-size: 20px; margin-top: 2px; flex-shrink: 0; }
        .item-text { font-size: calc(15.5px * var(--fs-mult)); color: var(--text-dim); line-height: 1.55; font-weight: 500; }
        
        /* Compact Vertical List */
        .content-list.compact { gap: 10px; }
        .content-list.compact .content-item { padding: 12px 20px; gap: 12px; }
        .content-list.compact .item-text { font-size: calc(14.5px * var(--fs-mult)); }
        
        /* ── Checklist SVG ── */
        .chk { width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; background: ${theme.rgbaLight}; border: 1px solid rgba(62,207,142,0.15); margin-top: 3px; }
        
        /* ── Table Wrapper & Table ── */
        .table-wrapper { max-height: 420px; overflow-y: auto; background: var(--bg-card); border-radius: 12px; border: 1px solid rgba(209,213,219,1); box-shadow: 0 4px 6px -1px rgba(0,0,0,0.04); }
        .table-wrapper::-webkit-scrollbar { width: 6px; }
        .table-wrapper::-webkit-scrollbar-thumb { background: var(--accent-cyan); border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th { text-align: left; padding: 14px 18px; background: #111827; color: #FFFFFF; font-weight: 700; position: sticky; top: 0; z-index: 5; font-size: calc(14px * var(--fs-mult)); border-bottom: 2px solid rgba(209,213,219,1); font-family: 'Urbanist', sans-serif; letter-spacing: -.3px; }
        td { padding: 12px 18px; border-bottom: 1px solid rgba(229,231,235,1); color: var(--text-dim); font-size: calc(13.8px * var(--fs-mult)); transition: font-size 0.2s ease; vertical-align: top; line-height: 1.55; font-weight: 500; }
        
        /* ── Accordion Native Details/Summary ── */
        .accordion-container { display: flex; flex-direction: column; width: 100%; }
        details.accordion-item {
            background: var(--bg-card); border: 1px solid rgba(229, 231, 235, 1);
            border-radius: 12px; margin-bottom: 12px; overflow: hidden;
            transition: all 0.3s ease; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02);
        }
        details.accordion-item[open] { border-color: var(--accent-cyan); box-shadow: 0 10px 20px -8px ${theme.rgbaLight}; }
        summary.accordion-header {
            padding: 18px 24px; font-size: calc(16.5px * var(--fs-mult)); font-weight: 700;
            color: var(--text-main); cursor: pointer; display: flex; justify-content: space-between;
            align-items: center; list-style: none; user-select: none;
        }
        summary.accordion-header::-webkit-details-marker { display: none; }
        summary.accordion-header i { transition: transform 0.3s ease; color: var(--accent-cyan); font-size: 15px; }
        details.accordion-item[open] summary.accordion-header i { transform: rotate(180deg); }
        .accordion-content {
            padding: 0 24px 20px 24px; font-size: calc(14.8px * var(--fs-mult));
            color: var(--text-dim); line-height: 1.6; border-top: 1px dashed rgba(229, 231, 235, 0.6);
            padding-top: 16px; background: #fafafa;
        }
        
        /* ── Legacy Fallbacks ── */
        .content-card {
            background: var(--bg-card); border: 1px solid rgba(229,231,235,1);
            padding: 28px 24px; border-radius: 16px; transition: all 0.3s ease;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03); display: flex; flex-direction: column;
            gap: 14px; min-height: 140px; justify-content: flex-start;
        }
        .content-card:hover { transform: translateY(-4px); border-color: var(--accent-cyan); box-shadow: 0 12px 20px -8px ${theme.rgbaLight}; }
        .card-icon { font-size: 28px; color: var(--accent-cyan); }
        .card-text { font-size: calc(15px * var(--fs-mult)); color: var(--text-dim); line-height: 1.6; font-weight: 500; }
        
        .badge-tag {
            background: rgba(255,255,255,0.08); color: var(--accent-cyan);
            padding: 6px 14px; border-radius: 8px; font-size: calc(12px * var(--fs-mult));
            font-weight: 700; border: 1px solid rgba(255,255,255,0.15); display: inline-block;
        }
        .controls { position: absolute; bottom: 30px; right: 40px; display: flex; gap: 15px; z-index: 10; }
        .nav-btn-bottom {
            background: #FFFFFF; border: 1px solid rgba(209,213,219,1); color: var(--text-main);
            width: 48px; height: 48px; border-radius: 50%; cursor: pointer; display: flex;
            align-items: center; justify-content: center; font-size: 18px; transition: all 0.3s ease;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
        }
        .nav-btn-bottom:hover { background: var(--accent-cyan); color: #FFFFFF; border-color: var(--accent-cyan); box-shadow: 0 10px 15px -3px ${theme.rgbaLight}; transform: translateY(-2px); }
        
        /* Animation states */
        .active .animate-item { animation: fadeInUp 0.5s forwards; opacity: 0; }
        .active .animate-delay-1 { animation-delay: 0.1s; }
        .active .animate-delay-2 { animation-delay: 0.22s; }
        .active .animate-delay-3 { animation-delay: 0.35s; }
        .active .animate-delay-4 { animation-delay: 0.48s; }
        .active .animate-delay-5 { animation-delay: 0.6s; }
        .active .animate-delay-6 { animation-delay: 0.72s; }
        .active .animate-delay-7 { animation-delay: 0.84s; }
        .active .animate-delay-8 { animation-delay: 0.96s; }
        .dark .slide-reference-footer {
            border-top-color: rgba(255, 255, 255, 0.12) !important;
            color: rgba(216, 231, 255, 0.5) !important;
        }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

        /* ── Image & Column layouts ── */
        .slide-layout-grid {
            display: grid;
            grid-template-columns: 1.15fr 0.85fr;
            gap: 40px;
            align-items: start;
            width: 100%;
            height: 100%;
            flex-grow: 1;
            min-height: 0;
        }
        .slide-layout-cover-grid {
            display: grid;
            grid-template-columns: 1.2fr 0.8fr;
            gap: 40px;
            align-items: center;
            width: 100%;
            height: 100%;
            flex-grow: 1;
            min-height: 0;
        }
        .slide-content-col {
            display: flex;
            flex-direction: column;
            gap: 16px;
            min-height: 0;
            justify-content: center;
            height: 100%;
        }
        .slide-image-col {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            min-height: 0;
        }
        .webslide-image-wrapper {
            width: 100%;
            aspect-ratio: 1.6 / 1;
            border-radius: 12px;
            overflow: hidden;
            position: relative;
            background: #e2e8f0;
            border: 1px solid rgba(209,213,219,1);
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
        }
        .webslide-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            transition: transform 0.4s ease;
        }
        .webslide-image-wrapper:hover .webslide-image {
            transform: scale(1.02);
        }
        .webslide-split-stacked {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .webslide-split-right-points {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
    </style>
</head>
<body>
<div id="slider-wrapper">
    <div id="progress-container"><div id="progress-bar"></div></div>
    <div class="top-header">
        <div class="brand-logo" id="header-brand-logo">
            <img src="https://i.ibb.co.com/kgV7WDhF/Logo-SYS.png" alt="Logo STIKOM Yos Sudarso" style="height: 36px; object-fit: contain;">
            <span style="border-left: 2px solid #374151; padding-left: 12px; margin-left: 5px; color: var(--text-main); font-weight: 700;">Pertemuan ${meetingNo}</span>
        </div>
        <div class="header-controls">
            <button class="action-btn" id="btn-fullscreen" title="Layar Penuh"><i class="fa-solid fa-expand"></i> Fullscreen</button>
            <div class="font-control-group">
                <button class="font-btn" id="btn-font-down"><i class="fa-solid fa-minus"></i> A</button>
                <button class="font-btn" id="btn-font-reset">A</button>
                <button class="font-btn" id="btn-font-up"><i class="fa-solid fa-plus"></i> A</button>
            </div>
            <select class="slide-select-nav" id="slide-jump-menu">
                ${dropdownOptions}
            </select>
        </div>
    </div>

    ${slidesHtml}

    <div class="controls">
        <button class="nav-btn-bottom" id="prev-btn" title="Slide Sebelumnya"><i class="fa-solid fa-arrow-left"></i></button>
        <button class="nav-btn-bottom" id="next-btn" title="Slide Berikutnya"><i class="fa-solid fa-arrow-right"></i></button>
    </div>
</div>

<script>
    const slides = document.querySelectorAll(".slide");
    const progressBar = document.getElementById("progress-bar");
    const jumpMenu = document.getElementById("slide-jump-menu");
    const headerLogo = document.getElementById("header-brand-logo");
    const sliderWrapper = document.getElementById("slider-wrapper");
    const fullscreenBtn = document.getElementById("btn-fullscreen");
    let currentSlide = 0;

    function goToSlide(index) {
        if (index < 0 || index >= slides.length) return;
        slides.forEach((slide, idx) => {
            slide.classList.remove("active", "prev-slide");
            if (idx < index) slide.classList.add("prev-slide");
        });
        currentSlide = index;
        slides[currentSlide].classList.add("active");
        
        // Hide logo on Cover Slide (Slide 1)
        if (currentSlide === 0) {
            headerLogo.style.opacity = "0";
            headerLogo.style.pointerEvents = "none";
        } else {
            headerLogo.style.opacity = "1";
            headerLogo.style.pointerEvents = "auto";
        }
        jumpMenu.value = currentSlide;
        progressBar.style.width = ((currentSlide + 1) / slides.length * 100) + "%";
    }

    document.getElementById("next-btn").addEventListener("click", () => currentSlide < slides.length - 1 && goToSlide(currentSlide + 1));
    document.getElementById("prev-btn").addEventListener("click", () => currentSlide > 0 && goToSlide(currentSlide - 1));
    jumpMenu.addEventListener("change", (e) => { goToSlide(parseInt(e.target.value)); });
    
    document.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); currentSlide < slides.length - 1 && goToSlide(currentSlide + 1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); currentSlide > 0 && goToSlide(currentSlide - 1); }
    });
    
    fullscreenBtn.addEventListener("click", () => {
        if (!document.fullscreenElement) {
            sliderWrapper.requestFullscreen().catch(err => { alert(\`Gagal: \${err.message}\`); });
        } else { document.exitFullscreen(); }
    });
    
    document.addEventListener("fullscreenchange", () => {
        if (document.fullscreenElement) {
            fullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i> Exit Fullscreen';
            fullscreenBtn.style.backgroundColor = "${theme.rgbaLight}";
            fullscreenBtn.style.color = "var(--accent-cyan)";
        } else {
            fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i> Fullscreen';
            fullscreenBtn.style.backgroundColor = "#FFFFFF";
            fullscreenBtn.style.color = "var(--text-main)";
        }
    });
    
    // Swipe gestures
    let touchstartX = 0;
    document.addEventListener('touchstart', e => {
        touchstartX = e.touches[0].clientX;
    }, {passive: true});
    
    document.addEventListener('touchend', e => {
        const touchendX = e.changedTouches[0].clientX;
        const diffX = touchendX - touchstartX;
        if (Math.abs(diffX) > 50) {
            if (diffX < 0) { // Swipe left, next slide
                currentSlide < slides.length - 1 && goToSlide(currentSlide + 1);
            } else { // Swipe right, prev slide
                currentSlide > 0 && goToSlide(currentSlide - 1);
            }
        }
    }, {passive: true});

    goToSlide(0);

    let fontMultiplier = 1.05;
    const rootStyle = document.documentElement.style;
    document.getElementById("btn-font-up").addEventListener("click", () => {
        if (fontMultiplier < 1.45) { fontMultiplier += 0.05; rootStyle.setProperty('--fs-mult', fontMultiplier.toFixed(2)); }
    });
    document.getElementById("btn-font-down").addEventListener("click", () => {
        if (fontMultiplier > 0.85) { fontMultiplier -= 0.05; rootStyle.setProperty('--fs-mult', fontMultiplier.toFixed(2)); }
    });
    document.getElementById("btn-font-reset").addEventListener("click", () => {
        fontMultiplier = 1.05; rootStyle.setProperty('--fs-mult', fontMultiplier.toFixed(2));
    });
</script>
</body>
</html>`;
}
