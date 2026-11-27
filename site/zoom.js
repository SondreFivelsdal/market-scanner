// Dra-for-å-zoome (som i Grafana): trykk og dra over et tidsrom i grafen → et lyst felt markerer utsnittet → slipp for å zoome inn.
// Dobbeltklikk tilbakestiller. Gjelder mus; på berøringsskjerm beholdes vanlig dra/klyp. Prisaksen til høyre fungerer som før.
// Bruk: ZOOM.attach(chart, host, { onZoom(fromSek, tilSek), onReset() })  – uten onZoom zoomes grafen selv.
(() => {
  'use strict';
  function attach(ch, host, o = {}) {
    if (!ch || !host || host._zoom) return; host._zoom = true; if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const box = document.createElement('div'); box.className = 'zbrush'; box.hidden = true; host.append(box);
    let st = null;
    const plotW = () => ch.timeScale().width(), x = e => e.clientX - host.getBoundingClientRect().left;
    host.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.shiftKey || (o.enabled && !o.enabled())) return; const x0 = x(e); if (x0 < 0 || x0 > plotW()) return; // prisaksen: vanlig skalering
      if (e.target.closest && e.target.closest('.dshape, .tvleg, .dlayer.on, button, a')) return;
      st = { x0, x1: x0 }; e.stopPropagation(); e.preventDefault();
      const mv = ev => { st.x1 = Math.max(0, Math.min(plotW(), x(ev))); const a = Math.min(st.x0, st.x1), w = Math.abs(st.x1 - st.x0); if (w > 3) { box.hidden = false; box.style.left = a + 'px'; box.style.width = w + 'px'; } };
      const up = () => { window.removeEventListener('pointermove', mv); box.hidden = true; const a = Math.min(st.x0, st.x1), b = Math.max(st.x0, st.x1); st = null; if (b - a < 8) return;
        const ts = ch.timeScale(), la = ts.coordinateToLogical(a), lb = ts.coordinateToLogical(b); if (la == null || lb == null) return;
        if (o.onZoom) { const t = l => { const c = ts.logicalToCoordinate(Math.round(l)), tt = c != null ? ts.coordinateToTime(c) : null; return typeof tt === 'number' ? tt : null; }; o.onZoom(t(la), t(lb), la, lb); }
        else { ts.setVisibleLogicalRange({ from: la, to: lb }); try { ch.priceScale('right').applyOptions({ autoScale: true }); } catch (x2) { /* ok */ } } };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up, { once: true });
    }, true);
    // grafbiblioteket lytter på mousedown – stopp det mens vi markerer, ellers drar grafen samtidig
    host.addEventListener('mousedown', e => { if (st) { e.stopPropagation(); e.preventDefault(); } }, true);
    host.addEventListener('dblclick', e => { if (x(e) > plotW()) return; if (o.onReset) o.onReset(); else ch.timeScale().fitContent(); });
    if (!o.quiet) host.title = host.title || 'Dra over et område for å zoome inn · dobbeltklikk for å tilbakestille';
  }
  window.ZOOM = { attach };
})();
