/* =====================================================================
   map.js — main application
   Jamaica Bay Capital Projects · Integrated Wastewater Management
   =====================================================================

   Layer order (top → bottom of stack as user sees them):
     1. pts_capitalproj_jmb_simp           — capital project points
     2. line_capitalproj_jmb_simp          — capital project lines
     3. polygon_capitalproj_jmb_simp       — capital project polygons
     4. nycblock_sumwithin_shapesimp       — block-level concentration
     5. jmb_boundary_shapesimp             — Jamaica Bay study area outline

   Add layers BOTTOM → TOP so the visual stack matches the spec.

   Patch: defensive diagnostics for the points layer + auto re-projection
   of EPSG:2263 (NY State Plane) coordinates to WGS84.
   ===================================================================== */

(function () {
  'use strict';

  /* ---------- 1. Configuration ---------------------------------- */

  // ── Mapbox token ──
  mapboxgl.accessToken = 'pk.eyJ1IjoibmV3Y2hhbmFwb3JuIiwiYSI6ImNtbmkydWo3NTA4b3MydHBzNG51cTljd24ifQ.YRBkXAWNP5oubXSSObk9XQ';

  var JMB_CENTER = [-73.85, 40.635];
  var DEFAULT_ZOOM = 11.2;

  var JMB_BOUNDS = [
    [-74.10, 40.50],
    [-73.65, 40.78]
  ];

  var DATA_PATHS = {
    pts:      './data/pts_capitalproj_jmb_simp.geojson',
    line:     './data/line_capitalproj_jmb_simp.geojson',
    polygon:  './data/polygon_capitalproj_jmb_simp.geojson',
    blocks:   './data/nycblock_sumwithin_shapesimp.geojson',
    boundary: './data/jmb_boundary_shapesimp.json'
  };

  var AGENCY_COLORS = window.PopupContent.AGENCY_COLORS;
  var BLOCK_RAMP = window.PopupContent.BLOCK_RAMP;

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

  /* ----------------------------------------------------------------
     COORDINATE PROJECTION HELPERS
     ----------------------------------------------------------------
     ArcGIS Pro frequently exports GeoJSON in NY Long Island State
     Plane (EPSG:2263, units = US survey feet). Mapbox GL strictly
     requires WGS84 (lng/lat). If we detect state-plane coords we
     convert them on the fly so the layer is visible.
  ---------------------------------------------------------------- */

  function looksLikeStatePlane(coord) {
    // EPSG:2263 NY-LI: x ≈ 900,000–1,100,000 ft, y ≈ 100,000–300,000 ft
    return Math.abs(coord[0]) > 1000 && Math.abs(coord[1]) > 1000;
  }

  // Approximate inverse Lambert Conformal Conic for EPSG:2263 → WGS84.
  // Accurate to ~5–10 m, good enough for visualization.
  function statePlaneToWGS84(x, y) {
    // Convert US survey feet to meters
    var x_m = x * 0.3048006096;
    var y_m = y * 0.3048006096;

    // EPSG:2263 parameters
    var lat0 = 40.16666666666666 * Math.PI / 180; // latitude of origin
    var lng0 = -74.0;                              // central meridian
    var lat1 = 40.66666666666666 * Math.PI / 180; // standard parallel 1
    var lat2 = 41.03333333333333 * Math.PI / 180; // standard parallel 2
    var x0 = 300000;                               // false easting (m)
    var y0 = 0;                                    // false northing (m)
    var a  = 6378137.0;                            // GRS80 semi-major axis
    var f  = 1 / 298.257222101;
    var e2 = 2 * f - f * f;
    var e  = Math.sqrt(e2);

    function m(lat) {
      return Math.cos(lat) / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat));
    }
    function t(lat) {
      var sinL = Math.sin(lat);
      return Math.tan(Math.PI / 4 - lat / 2) /
        Math.pow((1 - e * sinL) / (1 + e * sinL), e / 2);
    }
    var m1 = m(lat1), m2 = m(lat2);
    var t0 = t(lat0), t1 = t(lat1), t2 = t(lat2);
    var n  = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
    var F  = m1 / (n * Math.pow(t1, n));
    var rho0 = a * F * Math.pow(t0, n);

    var dx = x_m - x0;
    var dy = rho0 - (y_m - y0);
    var rho = Math.sqrt(dx * dx + dy * dy) * (n < 0 ? -1 : 1);
    var theta = Math.atan2(dx, dy);
    var tNew = Math.pow(rho / (a * F), 1 / n);

    var lat = Math.PI / 2 - 2 * Math.atan(tNew);
    for (var i = 0; i < 8; i++) {
      var sinL = Math.sin(lat);
      lat = Math.PI / 2 - 2 * Math.atan(
        tNew * Math.pow((1 - e * sinL) / (1 + e * sinL), e / 2)
      );
    }
    var lng = theta / n + lng0 * Math.PI / 180;
    return [lng * 180 / Math.PI, lat * 180 / Math.PI];
  }

  function reprojectCoords(coords) {
    if (typeof coords[0] === 'number') {
      if (looksLikeStatePlane(coords)) {
        var p = statePlaneToWGS84(coords[0], coords[1]);
        coords[0] = p[0];
        coords[1] = p[1];
      }
      return;
    }
    for (var i = 0; i < coords.length; i++) reprojectCoords(coords[i]);
  }

  function reprojectIfNeeded(data, kind) {
    if (!data || !Array.isArray(data.features) || data.features.length === 0) return false;
    var sampleCoord = null;
    for (var i = 0; i < data.features.length && !sampleCoord; i++) {
      var g = data.features[i].geometry;
      if (!g || !g.coordinates) continue;
      var c = g.coordinates;
      while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
      if (typeof c[0] === 'number' && typeof c[1] === 'number') sampleCoord = c;
    }
    if (!sampleCoord || !looksLikeStatePlane(sampleCoord)) return false;

    console.warn('[map] ' + kind + ' appears to be in EPSG:2263 (NY State Plane); ' +
                 'reprojecting to WGS84 on the fly. For best results re-export the ' +
                 'GeoJSON from ArcGIS Pro using the WGS84 coordinate system.');
    data.features.forEach(function (f) {
      if (f.geometry && f.geometry.coordinates) reprojectCoords(f.geometry.coordinates);
    });
    return true;
  }

  /* ---------- Diagnostic logging --------------------------------- */
  function logLayerDiagnostic(key, data) {
    var n = (data && data.features) ? data.features.length : 0;
    if (!n) {
      console.error('[map] layer "' + key + '" has 0 features. ' +
                    'Check that ' + DATA_PATHS[key] + ' exists and is valid GeoJSON.');
      return;
    }
    var types = {};
    var sampleCoord = null;
    var sampleProps = data.features[0].properties;
    data.features.forEach(function (f) {
      if (f.geometry) {
        var t = f.geometry.type;
        types[t] = (types[t] || 0) + 1;
        if (!sampleCoord && f.geometry.coordinates) {
          var c = f.geometry.coordinates;
          while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
          if (typeof c[0] === 'number') sampleCoord = c;
        }
      }
    });
    console.log('[map] ' + key + ': ' + n + ' features',
                'types=' + JSON.stringify(types),
                'sample coord=' + JSON.stringify(sampleCoord),
                'sample props keys=' + Object.keys(sampleProps || {}).join(','));
  }

  function normalizeCapitalProjects(data, kind) {
    ensureFeatureIds(data, kind);
    reprojectIfNeeded(data, kind);
    logLayerDiagnostic(kind, data);

    if (kind === 'pts' && data.features.length) {
      var nonPoint = data.features.filter(function (f) {
        return !f.geometry || (f.geometry.type !== 'Point' && f.geometry.type !== 'MultiPoint');
      });
      if (nonPoint.length === data.features.length) {
        console.error('[map] pts file contains NO Point/MultiPoint geometries — ' +
                      'a circle layer cannot render this. Geometry types found: ' +
                      JSON.stringify(Array.from(new Set(data.features.map(function(f){return f.geometry && f.geometry.type;})))));
      } else if (nonPoint.length > 0) {
        console.warn('[map] pts file contains ' + nonPoint.length +
                     ' non-point features that will not render in the circle layer.');
      }
    }

    data.features.forEach(function (f) {
      var p = f.properties || (f.properties = {});
      var agency = window.PopupContent.getAgency(p, kind);
      p._agency = agency;
      p._color = AGENCY_COLORS[agency] || '#5b6770';
      p._year = getCompletionYear(p);
      p._isDEP = (agency === 'DEP') ? 1 : 0;
    });
  }

  function normalizeBlocks(data) {
    ensureFeatureIds(data, 'block');
    reprojectIfNeeded(data, 'blocks');
    logLayerDiagnostic('blocks', data);
    data.features.forEach(function (f) {
      var p = f.properties || (f.properties = {});
      var n = window.PopupContent.getProjCount(p);
      p._count = n;
      var band = window.PopupContent.classifyProjCount(n);
      p._fill = band.color;
      p._outline = (n >= 8) ? '#ffffff' : '#9e9e9e';
    });
  }

  function normalizeBoundary(data) {
    ensureFeatureIds(data, 'boundary');
    reprojectIfNeeded(data, 'boundary');
    logLayerDiagnostic('boundary', data);
  }

  /* ---------- 4. Add sources & layers --------------------------- */

  function buildLayers() {
    /* Boundary */
    map.addSource(SOURCE.boundary, { type: 'geojson', data: sources.boundary });
    map.addLayer({
      id: LAYER.boundaryFill, type: 'fill', source: SOURCE.boundary,
      paint: { 'fill-color': '#14525c', 'fill-opacity': 0.04 }
    });
    map.addLayer({
      id: LAYER.boundaryLine, type: 'line', source: SOURCE.boundary,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#14525c', 'line-width': 2,
        'line-dasharray': [3, 2], 'line-opacity': 1
      }
    });

    /* Blocks */
    map.addSource(SOURCE.blocks, { type: 'geojson', data: sources.blocks });
    map.addLayer({
      id: LAYER.blocksFill, type: 'fill', source: SOURCE.blocks,
      paint: {
        'fill-color': ['get', '_fill'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.78]
      }
    });
    map.addLayer({
      id: LAYER.blocksLine, type: 'line', source: SOURCE.blocks,
      paint: {
        'line-color': ['get', '_outline'],
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.2, 0.4]
      }
    });

    /* Polygon capital projects */
    map.addSource(SOURCE.polygon, { type: 'geojson', data: sources.polygon });
    map.addLayer({
      id: LAYER.polygonFill, type: 'fill', source: SOURCE.polygon,
      paint: {
        'fill-color': ['get', '_color'],
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.5, 0.22]
      }
    });
    map.addLayer({
      id: LAYER.polygonLine, type: 'line', source: SOURCE.polygon,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', '_color'],
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 1.4],
        'line-opacity': 0.95
      }
    });

    /* Line capital projects */
    map.addSource(SOURCE.line, { type: 'geojson', data: sources.line });
    map.addLayer({
      id: LAYER.line, type: 'line', source: SOURCE.line,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', '_color'],
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 5, 2.4],
        'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.9]
      }
    });

    /* Point capital projects (TOP) */
    map.addSource(SOURCE.pts, { type: 'geojson', data: sources.pts });
    map.addLayer({
      id: LAYER.pts, type: 'circle', source: SOURCE.pts,
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 10,
          ['interpolate', ['linear'], ['zoom'],
            10, 6, 13, 9, 15, 14
          ]
        ],
        // Defensive fallback in case the data file has no `_color`
        'circle-color': [
          'case',
          ['has', '_color'], ['get', '_color'],
          '#5b6770'
        ],
        'circle-opacity': 1.0,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'hover'], false], 3, 1.5
        ],
        'circle-stroke-opacity': 0.95
      }
    });

    // After layers settle, see how many points are actually rendered.
    setTimeout(function () {
      try {
        var rendered = map.querySourceFeatures(SOURCE.pts);
        var visible = map.queryRenderedFeatures({ layers: [LAYER.pts] });
        console.log('[map] points: ' + rendered.length + ' in source, ' +
                    visible.length + ' rendered in current viewport');
        if (rendered.length > 0 && visible.length === 0) {
          console.warn('[map] points exist in the source but none are in the current ' +
                       'viewport. Auto-fitting bounds to point data…');
          fitToPoints();
        }
      } catch (err) {
        console.warn('[map] post-build diagnostic failed:', err);
      }
    }, 800);
  }

  function fitToPoints() {
    if (!sources.pts || !sources.pts.features || !sources.pts.features.length) return;
    var bounds = new mapboxgl.LngLatBounds();
    sources.pts.features.forEach(function (f) {
      if (!f.geometry || !f.geometry.coordinates) return;
      var c = f.geometry.coordinates;
      if (typeof c[0] === 'number') {
        if (isFinite(c[0]) && isFinite(c[1]) &&
            Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90) {
          bounds.extend(c);
        }
      } else if (Array.isArray(c[0])) {
        c.forEach(function (cc) {
          if (Array.isArray(cc) && typeof cc[0] === 'number' &&
              Math.abs(cc[0]) <= 180 && Math.abs(cc[1]) <= 90) {
            bounds.extend(cc);
          }
        });
      }
    });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 800 });
    }
  }

  /* ---------- 5. Hover ----------------------------------------- */

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

  /* ---------- 6. Popup panel ----------------------------------- */

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

  /* ---------- 7. Data loading ---------------------------------- */

  var sources = { pts: null, line: null, polygon: null, blocks: null, boundary: null };

  function load(key, normalize) {
    return fetch(DATA_PATHS[key])
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status + ' on ' + DATA_PATHS[key]);
        return r.json();
      })
      .then(function (data) {
        normalize(data);
        sources[key] = data;
        return data;
      })
      .catch(function (err) {
        console.error('[map] could not load "' + key + '" — ' + err.message);
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

    var years = [];
    ['pts', 'line', 'polygon'].forEach(function (k) {
      if (!sources[k]) return;
      sources[k].features.forEach(function (f) {
        var y = f.properties && f.properties._year;
        if (y) years.push(y);
      });
    });
    if (!years.length) {
      document.getElementById('timeSlider').style.display = 'none';
      return;
    }
    var minY = Math.min.apply(null, years);
    var maxY = Math.max.apply(null, years);
    range.min = minY;
    range.max = maxY;
    range.value = maxY;

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
      var filterExpr;
      if (allMode) {
        filterExpr = null;
      } else {
        // Keep features whose _year is missing/null OR <= the slider year.
        // The triple branch handles all three states defensively so a feature
        // never silently disappears just because the date field was unparseable.
        filterExpr = ['any',
          ['!', ['has', '_year']],
          ['==', ['get', '_year'], null],
          ['<=', ['to-number', ['get', '_year']], year]
        ];
      }
      [LAYER.pts, LAYER.line, LAYER.polygonFill, LAYER.polygonLine].forEach(function (id) {
        if (map.getLayer(id)) {
          if (filterExpr === null) map.setFilter(id, null);
          else map.setFilter(id, filterExpr);
        }
      });
    }

    function updateReadout() {
      readout.textContent = allMode ? 'All years' : 'Through ' + range.value;
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

    var playing = false;
    var timer = null;
    function step() {
      var v = parseInt(range.value, 10);
      v = (v >= maxY) ? minY : v + 1;
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

  /* ---------- 10. Title block ---------------------------------- */

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

  /* ---------- 10b. Agency filter ------------------------------ */

  function setupAgencyFilter() {
    var agencyChips = document.querySelectorAll('.agency-chip');
    if (!agencyChips.length) return;

    // Initialize: all agencies selected
    var selectedAgencies = { DEP: true, DOT: true, DDC: true, DPR: true };

    function applyAgencyFilter() {
      var agencies = Object.keys(selectedAgencies).filter(function (a) {
        return selectedAgencies[a];
      });

      var filterExpr;
      if (agencies.length === 4) {
        // All agencies selected — no filter needed
        filterExpr = null;
      } else if (agencies.length === 0) {
        // No agencies selected — hide all
        filterExpr = false;
      } else {
        // Some agencies selected — show only those
        filterExpr = ['in', ['get', '_agency'], ['literal', agencies]];
      }

      // Apply to all capital project layers
      [LAYER.pts, LAYER.line, LAYER.polygonFill, LAYER.polygonLine].forEach(function (id) {
        if (map.getLayer(id)) {
          if (filterExpr === null) map.setFilter(id, null);
          else map.setFilter(id, filterExpr);
        }
      });
    }

    agencyChips.forEach(function (chip) {
      var agency = chip.getAttribute('data-agency');
      if (agency) {
        // Mark as selected initially
        chip.classList.add('is-selected');

        chip.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          selectedAgencies[agency] = !selectedAgencies[agency];
          chip.classList.toggle('is-selected', selectedAgencies[agency]);
          applyAgencyFilter();
        });
      }
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

      bindHover('boundary', [LAYER.boundaryFill]);
      bindHover('blocks',   [LAYER.blocksFill]);
      bindHover('polygon',  [LAYER.polygonFill]);
      bindHover('line',     [LAYER.line]);
      bindHover('pts',      [LAYER.pts]);

      setupLayerToggles();
      setupTimeSlider();
      setupAgencyFilter();
      setupTitleBlock();

      map.on('click', function (e) {
        var hits = map.queryRenderedFeatures(e.point, {
          layers: [LAYER.pts, LAYER.line, LAYER.polygonFill, LAYER.blocksFill, LAYER.boundaryFill]
        });
        if (!hits.length) { resetPanel(); return; }
        var layerKey = getLayerKeyFromLayerId(hits[0].layer.id);
        if (layerKey) {
          setPanel(window.PopupContent[layerKey](hits[0].properties || {}));
          followCursor(e);
        } else {
          resetPanel();
        }
      });

      var loader = document.getElementById('loader');
      if (loader) loader.classList.add('is-hidden');
    });
  });

  map.getContainer().addEventListener('mouseleave', resetPanel);

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