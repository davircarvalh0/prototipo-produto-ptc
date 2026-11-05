/*
 * DOM-backdrop adaptation of the rounded SDF and Snell edge refraction in
 * iyinchao/liquid-glass-studio, commit f7b28c36305a862f5cffed3ddd51511cf1204f56.
 * Copyright (c) 2024 Charles Yin. MIT; see THIRD-PARTY-NOTICES.txt.
 * The original renders a supplied texture in WebGL2/WebGPU. This adaptation
 * generates an SVG displacement map for the live DOM backdrop instead.
 */
(() => {
  'use strict';
  const reduceTransparency = matchMedia('(prefers-reduced-transparency: reduce)');
  const highContrast = matchMedia('(prefers-contrast: more)');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const selector = '.search-input-wrap, #nav a.active, .segments button.selected, .primary:not([data-action="create"]), .phone-top, .back-link';
  const svgNS = 'http://www.w3.org/2000/svg';
  const supportsBackdrop = CSS.supports('backdrop-filter', 'url("#glass-test")');
  const host = document.createElementNS(svgNS, 'svg');
  host.setAttribute('aria-hidden', 'true');
  host.setAttribute('focusable', 'false');
  host.classList.add('glass-filter-definitions');
  const defs = document.createElementNS(svgNS, 'defs');
  host.append(defs);
  document.body.append(host);
  const surfaces = new Map();
  let nextId = 0;
  let scheduled = false;
  let listening = false;
  const svg = (tag, attrs) => {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    return element;
  };

  function displacementMap(width, height, radius) {
    // Work in CSS pixels, capping map resolution without scaling its strength.
    const sampleScale = Math.min(1, 500 / width, 180 / height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil(width * sampleScale));
    canvas.height = Math.max(2, Math.ceil(height * sampleScale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    const image = context.createImageData(canvas.width, canvas.height);
    const thickness = Math.min(12, height * 0.26);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const px = (x + 0.5) / sampleScale - width / 2;
        const py = (y + 0.5) / sampleScale - height / 2;
        const qx = Math.abs(px) - (width / 2 - radius);
        const qy = Math.abs(py) - (height / 2 - radius);
        const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
        const length = Math.hypot(ox, oy);
        const distance = length + Math.min(Math.max(qx, qy), 0) - radius;
        const depth = Math.max(0, -distance);
        let nx, ny;
        if (length > 0) { nx = ox / length * Math.sign(px); ny = oy / length * Math.sign(py); }
        else { nx = qx > qy ? Math.sign(px) : 0; ny = qx > qy ? 0 : Math.sign(py); }
        // Snell's law profile adapted from fragment-main.glsl; asin is clamped.
        const ratio = Math.max(0, Math.min(1, 1 - depth / thickness));
        const incident = Math.asin(Math.min(0.999, ratio * ratio));
        const transmitted = Math.asin(Math.sin(incident) / 1.45);
        const bend = depth < thickness ? Math.min(1, -Math.tan(transmitted - incident)) : 0;
        const offset = (y * canvas.width + x) * 4;
        image.data[offset] = Math.round(128 - nx * bend * 110);
        image.data[offset + 1] = Math.round(128 - ny * bend * 110);
        image.data[offset + 2] = 128;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return canvas.toDataURL();
  }

  function configure(element, surface) {
    if (!element.isConnected) return;
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const radius = Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 10, rect.width / 2, rect.height / 2);
    const signature = [Math.round(rect.width), Math.round(rect.height), radius].join(':');
    if (surface.signature === signature) return;
    surface.signature = signature;
    const map = displacementMap(rect.width, rect.height, radius);
    if (!map) return;
    const filter = svg('filter', {id: surface.id, x:'0%', y:'0%', width:'100%', height:'100%', 'color-interpolation-filters':'sRGB'});
    filter.append(
      svg('feGaussianBlur', {in:'SourceGraphic', stdDeviation:'2.5', result:'soft-backdrop'}),
      svg('feImage', {href:map, x:0, y:0, width:'100%', height:'100%', preserveAspectRatio:'none', result:'edge-normals'}),
      svg('feDisplacementMap', {in:'soft-backdrop', in2:'edge-normals', scale:18, xChannelSelector:'R', yChannelSelector:'G'})
    );
    surface.filter?.remove();
    surface.filter = filter;
    defs.append(filter);
    element.style.setProperty('--liquid-filter', `url("#${surface.id}")`);
  }

  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => queue()) : null;
  function refresh() {
    scheduled = false;
    const desired = new Set(document.querySelectorAll(selector));
    for (const [element, surface] of surfaces) {
      if (!element.isConnected || !desired.has(element)) {
        surface.filter?.remove();
        resize?.unobserve(element);
        element.classList.remove('liquid-surface');
        element.style.removeProperty('--liquid-filter');
        surfaces.delete(element);
      }
    }
    const optical = supportsBackdrop && !reduceTransparency.matches && !highContrast.matches;
    document.documentElement.dataset.glassRenderer = optical ? 'svg-refraction' : 'css-fallback';
    for (const element of desired) {
      let surface = surfaces.get(element);
      if (!surface) {
        surface = {id:`liquid-edge-${++nextId}`};
        surfaces.set(element, surface);
        element.classList.add('liquid-surface');
        resize?.observe(element);
      }
      if (optical) configure(element, surface);
    }
    if (!listening) { listening = true; window.addEventListener('resize', queue, {passive:true}); }
  }
  function queue() { if (!scheduled) { scheduled = true; requestAnimationFrame(refresh); } }
  // No continuous animation loop: regenerate only when the UI or size changes.
  new MutationObserver(records => {
    if (records.some(record => !host.contains(record.target))) queue();
  }).observe(document.body, {childList:true, subtree:true});
  for (const query of [reduceTransparency, highContrast]) query.addEventListener('change', queue);
  document.addEventListener('pointermove', event => {
    if (reduceMotion.matches || reduceTransparency.matches || event.pointerType === 'touch') return;
    const target = event.target.closest?.('.liquid-surface');
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--glare-x', `${Math.round((event.clientX - rect.left) / rect.width * 100)}%`);
    target.style.setProperty('--glare-y', `${Math.round((event.clientY - rect.top) / rect.height * 100)}%`);
  }, {passive:true});
  refresh();
})();
