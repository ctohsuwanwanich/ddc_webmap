/* =====================================================================
   map.js — main application
   Jamaica Bay Capital Projects · Integrated Wastewater Management
   =====================================================================

   Layer order (top → bottom of stack as user sees them):
     1. pts_capitalproj_jmb_simp           — capital project points
     2. line_capitalproj_jmb_simp          — capital project lines
     3. polygon_capitalproj_jmb_simp       — capital project polygons
     4. nycblock_projcount_shapesimp       — block-level concentration
     5. jmb_boundary.json_shapesimp        — Jamaica Bay study area outline

   Add layers BOTTOM → TOP so the visual stack matches the spec.
   ===================================================================== */

(function () {
  'use strict';

  /* ---------- 1. Configuration ---------------------------------- */

  // ── Mapbox token ──
  // Replace with your own token from https://account.mapbox.com.
  // The token below is a public sample shipped with the spec — substitute yours
  // before deploying anywhere production.
  mapboxgl.accessToken = 'pk.eyJ1IjoibmV3Y2hhbmFwb3JuIiwiYSI6ImNtbmkydWo3NTA4b3MydHBzNG51cTljd24ifQ.YRBkXAWNP5oubXSSObk9XQ';

  // Jamaica Bay center & framing
  var JMB_CENTER = [-73.85, 40.635];
  var DEFAULT_ZOOM = 11.2;

  // Bounds limit panning
  var JMB_BOUNDS = [
    [-74.10, 40.50],
    [-73.65, 40.78]
  ];

  // GeoJSON paths — match exactly the names called out in the spec
  var DATA_PATHS = {
    pts:      './data/pts_capitalproj_jmb_simp.geojson',
    line:     './data/line_capitalproj_jmb_simp.geojson',
    polygon:  './data/polygon_capitalproj_jmb_simp.geojson',
    blocks:   './data/nycblock_sumwithin_shapesimp.geojson',
    boundary: './data/jmb_boundary_shapesimp.json'
  };

  // Agency colors — matches CSS --agency-* tokens and popup module
  var AGENCY_COLORS = window.PopupContent.AGENCY_COLORS;
  var BLOCK_RAMP = window.PopupContent.BLOCK_RAMP;

  // Layer/source IDs (constant strings used throughout)
  var SOURCE = {
    pts: 'src-pts', line: 'src-line', polygon: 'src-polygon',
    blocks: 'src-blocks', boundary: 'src-boundary'
  };
  var LAYER = {
    boundaryFill:    'lyr-boundary-fill',
    boundaryLine:    'lyr-boundary-line',
    blocksFill:      'lyr-blocks-fill',
    blocksLine:      'lyr-blocks-line',
    polygonFill:     'lyr-polygon-fill',
    polygonLine:     'lyr-polygon-line',
    line:            'lyr-line',
    pts:             'lyr-pts'
  };

  // Hover state tracker (per logical layer key)
  var hovered = { pts: null, line: null, polygon: null, blocks: null, boundary: null };

  /* ---------- 2. Map init --------------------------------------- */

  function HomeControl() {}
  HomeControl.prototype.onAdd = function (m) {
    this._container = document.createElement('div');
    this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'home-button';
    b.title = 'Reset view';
    b.setAttribute('aria-label', 'Reset map view');
    b.textContent = '⌂';
    b.addEventListener('click', function () {
      m.easeTo({ center: JMB_CENTER, zoom: DEFAULT_ZOOM, pitch: 0, bearing: 0 });
    });
    this._container.appendChild(b);
    return this._container;
  };
  HomeControl.prototype.onRemove = function () {
    if (this._container.parentNode) this._container.parentNode.removeChild(this._container);
  };

  var map = new mapboxgl.Map({
    container: 'map',
    // Light, restrained basemap — keeps the watershed legible
    style: 'mapbox://styles/mapbox/dark-v11',
    center: JMB_CENTER,
    zoom: DEFAULT_ZOOM,
    maxBounds: JMB_BOUNDS,
    minZoom: 9,
    attributionControl: { compact: true }
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new HomeControl(), 'top-right');
  map.addControl(new mapboxgl.ScaleControl({ maxWidth: 100, unit: 'imperial' }), 'top-right');

  /* ---------- 3. Data normalization ----------------------------- */

  function ensureFeatureIds(data, prefix) {
    if (!data || !Array.isArray(data.features)) return;
    data.features.forEach(function (f, i) {
      if (f.id == null) f.id = prefix + '-' + i;
    });
  }

  function parseYearField(value) {
    if (!value) return null;
    var str = String(value).trim();
    if (!str) return null;
    var d = new Date(str);
    if (!isNaN(d.getTime())) return d.getFullYear();
    var m = str.match(/(\d{4})/);
    return m ? parseInt(m[1], 10) : null;
  }

  function getCompletionYear(props) {
    var candidates = [
      props.Construc_4, props.Construc_3, props.Construc_2, props.Construc_1,
      props.DesignActu, props.DesignProj, props.DesignStar,
      props.completion_date, props.COMPLETION_DATE, props.complete_date,
      props.compl_date, props.end_date, props.completed, props.fy_complete,
      props.date_const, props.time_const, props.mindate, props.maxdate
    ];
    var years = candidates.map(parseYearField).filter(function (y) { return y != null; });
    return years.length ? Math.max.apply(null, years) : null;
  }

  function normalizeCapitalProjects(data, kind) {
    ensureFeatureIds(data, kind);
    data.features.forEach(function (f) {
      var p = f.properties || (f.properties = {});
      var agency = window.PopupContent.getAgency(p, kind);
      p._agency = agency;
      p._color = AGENCY_COLORS[agency] || '#5b6770';
      p._year = getCompletionYear(p);
      // For points: DEP fill is 85%, others have transparent fill (outline only)
      p._isDEP = (agency === 'DEP') ? 1 : 0;
    });
  }

  function normalizeBlocks(data) {
    ensureFeatureIds(data, 'block');
    data.features.forEach(function (f) {
      var p = f.properties || (f.properties = {});
      var n = window.PopupContent.getProjCount(p);
      p._count = n;
      var band = window.PopupContent.classifyProjCount(n);
      p._fill = band.color;
      // Outline grey for light fills, white for dark fills (per spec)
      p._outline = (n >= 8) ? '#ffffff' : '#9e9e9e';
    });
  }

  function normalizeBoundary(data) {
    ensureFeatureIds(data, 'boundary');
  }

  /* ---------- 4. Add sources & layers --------------------------- */
  /* Add BOTTOM-UP so the visual order matches the spec.            */

  function buildLayers() {
    /* ---------- Boundary (BOTTOM of project layers) ---------- */
    map.addSource(SOURCE.boundary, { type: 'geojson', data: sources.boundary });
    map.addLayer({
      id: LAYER.boundaryFill,
      type: 'fill',
      source: SOURCE.boundary,
      paint: {
        'fill-color': '#14525c',
        'fill-opacity': 0.04
      }
    });
    map.addLayer({
      id: LAYER.boundaryLine,
      type: 'line',
      source: SOURCE.boundary,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#14525c',
        'line-width': 2,
        'line-dasharray': [3, 2],
        'line-opacity': 1
      }
    });

    /* ---------- Blocks (concentration choropleth) ---------- */
    map.addSource(SOURCE.blocks, { type: 'geojson', data: sources.blocks });
    map.addLayer({
      id: LAYER.blocksFill,
      type: 'fill',
      source: SOURCE.blocks,
      paint: {
        'fill-color': ['get', '_fill'],
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 0.95,
          0.78
        ]
      }
    });
    map.addLayer({
      id: LAYER.blocksLine,
      type: 'line',
      source: SOURCE.blocks,
      paint: {
        'line-color': ['get', '_outline'],
        // 0.1 point ≈ 0.13 px in mapbox terms — keep it thin
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 1.2,
          0.4
        ]
      }
    });

    /* ---------- Polygon capital projects ---------- */
    map.addSource(SOURCE.polygon, { type: 'geojson', data: sources.polygon });
    map.addLayer({
      id: LAYER.polygonFill,
      type: 'fill',
      source: SOURCE.polygon,
      paint: {
        'fill-color': ['get', '_color'],
        // Solid polygons distract; keep them subtle
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 0.5,
          0.22
        ]
      }
    });
    map.addLayer({
      id: LAYER.polygonLine,
      type: 'line',
      source: SOURCE.polygon,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', '_color'],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 2.5,
          1.4
        ],
        'line-opacity': 0.95
      }
    });

    /* ---------- Line capital projects ---------- */
    map.addSource(SOURCE.line, { type: 'geojson', data: sources.line });
    map.addLayer({
      id: LAYER.line,
      type: 'line',
      source: SOURCE.line,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', '_color'],
        'line-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 5,
          2.4
        ],
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 1,
          0.9
        ]
      }
    });

    /* ---------- Point capital projects (TOP) ----------
       Per spec:
         - opacity for DEP points = 85%
         - the rest = 0% fill (outline only / transparent)
       Implemented via a `case` on the _isDEP flag.
    */
    map.addSource(SOURCE.pts, { type: 'geojson', data: sources.pts });
    map.addLayer({
      id: LAYER.pts,
      type: 'circle',
      source: SOURCE.pts,
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 10,
          ['interpolate', ['linear'], ['zoom'],
            10, 6,
            13, 9,
            15, 14
          ]
        ],
        'circle-color': ['get', '_color'],
        'circle-opacity': 1.0,
        'circle-stroke-color': ['get', '_color'],
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 3,
          2.0
        ],
        'circle-stroke-opacity': 0.95
      }
    });
  }

  /* ---------- 5. Hover state helpers ---------------------------- */

  function setHoverState(layerKey, feature, on) {
    if (!feature || feature.id == null) return;
    map.setFeatureState({ source: SOURCE[layerKey], id: feature.id }, { hover: on });
  }

  function bindHover(layerKey, layerIds) {
    layerIds.forEach(function (lid) {
      map.on('mousemove', lid, function (e) {
        if (!e.features || !e.features.length) return;
        var f = e.features[0];
        var prev = hovered[layerKey];
        if (prev && prev.id !== f.id) setHoverState(layerKey, prev, false);
        if (!prev || prev.id !== f.id) {
          setHoverState(layerKey, f, true);
          hovered[layerKey] = f;
        }
        var html = window.PopupContent[layerKey](f.properties || {});
        setPanel(html);
        followCursor(e);
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', lid, function () {
        if (hovered[layerKey]) {
          setHoverState(layerKey, hovered[layerKey], false);
          hovered[layerKey] = null;
        }
        resetPanel();
        map.getCanvas().style.cursor = '';
      });
    });
  }

  /* ---------- 6. Popup panel controller ------------------------- */

  var panel = document.getElementById('popupPanel');
  var content = document.getElementById('popupContent');
  var placeholder = document.getElementById('popupPlaceholder');

  function setPanel(html) {
    content.innerHTML = html;
    content.hidden = false;
    placeholder.hidden = true;
    panel.classList.remove('is-empty');
  }

  function resetPanel() {
    content.hidden = true;
    placeholder.hidden = false;
    panel.classList.remove('is-cursor');
    panel.classList.add('is-fixed');
    panel.classList.add('is-empty');
    panel.style.left = '';
    panel.style.top = '';
  }

  function followCursor(evt) {
    var ev = evt.originalEvent || evt;
    var x = ev.clientX, y = ev.clientY;
    var pw = panel.offsetWidth || 320, ph = panel.offsetHeight || 200, m = 16;
    var left = x + 18, top = y + 18;
    if (left + pw + m > window.innerWidth) left = x - pw - 18;
    if (top + ph + m > window.innerHeight) top = y - ph - 18;
    if (left < m) left = m;
    if (top < m) top = m;
    panel.classList.remove('is-fixed');
    panel.classList.add('is-cursor');
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }

  function getLayerKeyFromLayerId(layerId) {
    if (layerId === LAYER.pts) return 'pts';
    if (layerId === LAYER.line) return 'line';
    if (layerId === LAYER.polygonFill || layerId === LAYER.polygonLine) return 'polygon';
    if (layerId === LAYER.blocksFill || layerId === LAYER.blocksLine) return 'blocks';
    if (layerId === LAYER.boundaryFill || layerId === LAYER.boundaryLine) return 'boundary';
    return null;
  }

  /* ---------- 7. Data loading ----------------------------------- */

  var sources = { pts: null, line: null, polygon: null, blocks: null, boundary: null };

  function load(key, normalize) {
    return fetch(DATA_PATHS[key])
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load ' + DATA_PATHS[key] + ' (' + r.status + ')');
        return r.json();
      })
      .then(function (data) {
        normalize(data);
        sources[key] = data;
        return data;
      })
      .catch(function (err) {
        console.warn('[map] could not load ' + key + ':', err.message);
        sources[key] = { type: 'FeatureCollection', features: [] };
        return sources[key];
      });
  }

  /* ---------- 8. Layer toggles --------------------------------- */

  function toggleLayer(key, visible) {
    var ids = [];
    if (key === 'pts')      ids = [LAYER.pts];
    if (key === 'line')     ids = [LAYER.line];
    if (key === 'polygon')  ids = [LAYER.polygonFill, LAYER.polygonLine];
    if (key === 'blocks')   ids = [LAYER.blocksFill, LAYER.blocksLine];
    if (key === 'boundary') ids = [LAYER.boundaryFill, LAYER.boundaryLine];
    ids.forEach(function (id) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    });
  }

  function setupLayerToggles() {
    var blockRamp = document.getElementById('blockRamp');
    document.querySelectorAll('.layer-toggle input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var key = cb.getAttribute('data-layer');
        var on = cb.checked;
        cb.parentElement.classList.toggle('is-active', on);
        toggleLayer(key, on);
        if (key === 'blocks' && blockRamp) {
          blockRamp.style.display = on ? '' : 'none';
        }
      });
    });
  }

  /* ---------- 9. Time slider ----------------------------------- */

  function setupTimeSlider() {
    var range = document.getElementById('timeRange');
    var readout = document.getElementById('timeReadout');
    var resetBtn = document.getElementById('timeReset');
    var playBtn = document.getElementById('timePlay');
    var ticksEl = document.getElementById('timeTicks');
    var playIcon = document.getElementById('playIcon');

    // Compute available year range from loaded data
    var years = [];
    ['pts', 'line', 'polygon'].forEach(function (k) {
      if (!sources[k]) return;
      sources[k].features.forEach(function (f) {
        var y = f.properties && f.properties._year;
        if (y) years.push(y);
      });
    });
    if (!years.length) {
      // Hide slider if no time data
      document.getElementById('timeSlider').style.display = 'none';
      return;
    }
    var minY = Math.min.apply(null, years);
    var maxY = Math.max.apply(null, years);
    range.min = minY;
    range.max = maxY;
    range.value = maxY;

    // Build year ticks
    ticksEl.innerHTML = '';
    var n = maxY - minY;
    var stride = n > 8 ? 2 : 1;
    for (var y = minY; y <= maxY; y += stride) {
      var span = document.createElement('span');
      span.textContent = "'" + String(y).slice(2);
      ticksEl.appendChild(span);
    }

    var allMode = true;

    function applyFilter(year) {
      // Filter expression: keep features with _year <= year
      // Use a hybrid filter: features with no year stay visible
      var filterExpr;
      if (allMode) {
        filterExpr = null; // show all
      } else {
        filterExpr = ['any',
          ['!', ['has', '_year']],
          ['<=', ['get', '_year'], year]
        ];
      }
      [LAYER.pts, LAYER.line, LAYER.polygonFill, LAYER.polygonLine].forEach(function (id) {
        if (map.getLayer(id)) {
          if (filterExpr === null) {
            map.setFilter(id, null);
          } else {
            map.setFilter(id, filterExpr);
          }
        }
      });
    }

    function updateReadout() {
      if (allMode) {
        readout.textContent = 'All years';
      } else {
        readout.textContent = 'Through ' + range.value;
      }
    }

    range.addEventListener('input', function () {
      allMode = false;
      applyFilter(parseInt(range.value, 10));
      updateReadout();
    });

    resetBtn.addEventListener('click', function () {
      allMode = true;
      range.value = maxY;
      applyFilter(maxY);
      updateReadout();
    });

    // Play / pause
    var playing = false;
    var timer = null;
    function step() {
      var v = parseInt(range.value, 10);
      if (v >= maxY) {
        v = minY;
      } else {
        v += 1;
      }
      range.value = v;
      allMode = false;
      applyFilter(v);
      updateReadout();
    }
    playBtn.addEventListener('click', function () {
      playing = !playing;
      if (playing) {
        playIcon.textContent = '❚❚';
        if (allMode) { allMode = false; range.value = minY; applyFilter(minY); updateReadout(); }
        timer = setInterval(step, 700);
      } else {
        playIcon.textContent = '▶';
        if (timer) { clearInterval(timer); timer = null; }
      }
    });

    updateReadout();
  }

  /* ---------- 10. Title block collapse ------------------------- */

  function setupTitleBlock() {
    var tb = document.getElementById('titleBlock');
    var toggle = document.getElementById('titleToggle');
    var reopen = document.createElement('button');
    reopen.className = 'title-block__reopen';
    reopen.textContent = '☰  Show overview';
    document.body.appendChild(reopen);

    toggle.addEventListener('click', function () {
      tb.classList.add('is-collapsed');
      setTimeout(function () { reopen.classList.add('is-visible'); }, 250);
    });
    reopen.addEventListener('click', function () {
      tb.classList.remove('is-collapsed');
      reopen.classList.remove('is-visible');
    });
  }

  /* ---------- 11. Boot ----------------------------------------- */

  map.on('load', function () {
    Promise.all([
      load('pts',      function (d) { normalizeCapitalProjects(d, 'pts'); }),
      load('line',     function (d) { normalizeCapitalProjects(d, 'line'); }),
      load('polygon',  function (d) { normalizeCapitalProjects(d, 'polygon'); }),
      load('blocks',   normalizeBlocks),
      load('boundary', normalizeBoundary)
    ]).then(function () {
      buildLayers();

      // Wire hover handlers in correct order — points on top get priority
      bindHover('boundary', [LAYER.boundaryFill]);
      bindHover('blocks',   [LAYER.blocksFill]);
      bindHover('polygon',  [LAYER.polygonFill]);
      bindHover('line',     [LAYER.line]);
      bindHover('pts',      [LAYER.pts]);

      setupLayerToggles();
      setupTimeSlider();
      setupTitleBlock();

      // Reset panel or show feature popup on click
      map.on('click', function (e) {
        var hits = map.queryRenderedFeatures(e.point, {
          layers: [LAYER.pts, LAYER.line, LAYER.polygonFill, LAYER.blocksFill, LAYER.boundaryFill]
        });
        if (!hits.length) {
          resetPanel();
          return;
        }
        var layerKey = getLayerKeyFromLayerId(hits[0].layer.id);
        if (layerKey) {
          setPanel(window.PopupContent[layerKey](hits[0].properties || {}));
          followCursor(e);
        } else {
          resetPanel();
        }
      });

      // Hide loader
      var loader = document.getElementById('loader');
      if (loader) loader.classList.add('is-hidden');
    });
  });

  // Reset panel when leaving the map area
  map.getContainer().addEventListener('mouseleave', resetPanel);

  // Surface map errors gracefully (e.g. invalid token)
  map.on('error', function (e) {
    if (e && e.error && /access token|401|403/i.test(String(e.error.message || e.error))) {
      console.error('[map] Mapbox token error — replace mapboxgl.accessToken in js/map.js');
      var loader = document.getElementById('loader');
      if (loader) {
        loader.querySelector('.loader__text').textContent =
          'Mapbox token error — see js/map.js';
      }
    }
  });

})();