/* =====================================================================
   map.js — main application
   Jamaica Bay Capital Projects · Integrated Wastewater Management
   =====================================================================

   Modes:
     - 'overview' — original five-layer atlas with time slider
     - 'cluster'  — same five layers + cluster overlay; guided or
                    free-explore tour through 11 inter-agency sites

   During a guided cluster tour the cluster description popup is pinned
   top-right. Clicks on any capital project (point / line / polygon /
   block) populate a SECONDARY popup panel at the bottom-right so both
   reading contexts coexist. The secondary panel has its own close
   button and is auto-hidden when the tour advances.

   Layer order (top → bottom, visible to user):
     1. lyr-clusters (cluster mode only)
     2. lyr-pts
     3. lyr-line
     4. lyr-polygon-(fill|line)
     5. lyr-blocks-(fill|line)
     6. lyr-boundary-(fill|line)

   Add layers BOTTOM → TOP so the visual stack matches the spec.
   ===================================================================== */

(function () {
  'use strict';

  /* ---------- 1. Configuration ---------------------------------- */

  mapboxgl.accessToken = 'pk.eyJ1IjoibmV3Y2hhbmFwb3JuIiwiYSI6ImNtbmkydWo3NTA4b3MydHBzNG51cTljd24ifQ.YRBkXAWNP5oubXSSObk9XQ';

  var JMB_CENTER = [-73.85, 40.635];
  var DEFAULT_ZOOM = 11.2;
  var TOUR_ZOOM = 14.5;

  var JMB_BOUNDS = [
    [-74.10, 40.50],
    [-73.65, 40.78]
  ];

  var DATA_PATHS = {
    pts:      './data/pts_capitalproj_jmb_simp.geojson',
    line:     './data/line_capitalproj_jmb_simp.geojson',
    polygon:  './data/polygon_capitalproj_jmb_simp.geojson',
    blocks:   './data/nycblock_sumwithin.geojson',
    boundary: './data/jmb_boundary_shapesimp.json',
    clusters: './data/cluster_desc_simp.geojson'
  };

  var AGENCY_COLORS = window.PopupContent.AGENCY_COLORS;
  var BLOCK_RAMP    = window.PopupContent.BLOCK_RAMP;

  var SOURCE = {
    pts: 'src-pts', line: 'src-line', polygon: 'src-polygon',
    blocks: 'src-blocks', boundary: 'src-boundary',
    clusters: 'src-clusters'
  };
  var LAYER = {
    boundaryFill:  'lyr-boundary-fill',
    boundaryLine:  'lyr-boundary-line',
    blocksFill:    'lyr-blocks-fill',
    blocksLine:    'lyr-blocks-line',
    polygonFill:   'lyr-polygon-fill',
    polygonLine:   'lyr-polygon-line',
    line:          'lyr-line',
    pts:           'lyr-pts',
    clusterHalo:   'lyr-cluster-halo',
    clusters:      'lyr-clusters',
    clusterLabels: 'lyr-cluster-labels'
  };

  var hovered = { pts: null, line: null, polygon: null, blocks: null, boundary: null, clusters: null };

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

  /* ----- EPSG:2263 → WGS84 reprojection (unchanged from prior patch) ----- */

  function looksLikeStatePlane(coord) {
    return Math.abs(coord[0]) > 1000 && Math.abs(coord[1]) > 1000;
  }
  function statePlaneToWGS84(x, y) {
    var x_m = x * 0.3048006096;
    var y_m = y * 0.3048006096;
    var lat0 = 40.16666666666666 * Math.PI / 180;
    var lng0 = -74.0;
    var lat1 = 40.66666666666666 * Math.PI / 180;
    var lat2 = 41.03333333333333 * Math.PI / 180;
    var x0 = 300000, y0 = 0;
    var a = 6378137.0, f = 1 / 298.257222101;
    var e2 = 2 * f - f * f, e = Math.sqrt(e2);
    function m(lat) { return Math.cos(lat) / Math.sqrt(1 - e2 * Math.sin(lat) * Math.sin(lat)); }
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
    var dx = x_m - x0, dy = rho0 - (y_m - y0);
    var rho = Math.sqrt(dx * dx + dy * dy) * (n < 0 ? -1 : 1);
    var theta = Math.atan2(dx, dy);
    var tNew = Math.pow(rho / (a * F), 1 / n);
    var lat = Math.PI / 2 - 2 * Math.atan(tNew);
    for (var i = 0; i < 8; i++) {
      var sinL = Math.sin(lat);
      lat = Math.PI / 2 - 2 * Math.atan(tNew * Math.pow((1 - e * sinL) / (1 + e * sinL), e / 2));
    }
    var lng = theta / n + lng0 * Math.PI / 180;
    return [lng * 180 / Math.PI, lat * 180 / Math.PI];
  }
  function reprojectCoords(coords) {
    if (typeof coords[0] === 'number') {
      if (looksLikeStatePlane(coords)) {
        var p = statePlaneToWGS84(coords[0], coords[1]);
        coords[0] = p[0]; coords[1] = p[1];
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
    console.warn('[map] ' + kind + ' appears to be in EPSG:2263; reprojecting to WGS84.');
    data.features.forEach(function (f) {
      if (f.geometry && f.geometry.coordinates) reprojectCoords(f.geometry.coordinates);
    });
    return true;
  }

  function logLayerDiagnostic(key, data) {
    var n = (data && data.features) ? data.features.length : 0;
    if (!n) { console.error('[map] layer "' + key + '" has 0 features.'); return; }
    var types = {};
    data.features.forEach(function (f) {
      if (f.geometry) types[f.geometry.type] = (types[f.geometry.type] || 0) + 1;
    });
    console.log('[map] ' + key + ': ' + n + ' features  types=' + JSON.stringify(types));
  }

  function normalizeCapitalProjects(data, kind) {
    ensureFeatureIds(data, kind);
    reprojectIfNeeded(data, kind);
    logLayerDiagnostic(kind, data);
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

  function normalizeClusters(data) {
    ensureFeatureIds(data, 'cluster');
    reprojectIfNeeded(data, 'clusters');
    logLayerDiagnostic('clusters', data);
    data.features.sort(function (a, b) {
      var ao = (a.properties && a.properties.OBJECTID) || 0;
      var bo = (b.properties && b.properties.OBJECTID) || 0;
      return ao - bo;
    });
    data.features.forEach(function (f, i) {
      var p = f.properties || (f.properties = {});
      p._index = i;
      var agencies = window.PopupContent.parseAgencyList(p.agency_presented);
      p._agencyCount = agencies.length;
      p._isFourAgency = agencies.length >= 4 ? 1 : 0;
    });
  }

  /* ---------- 4. Add sources & layers --------------------------- */

  function buildLayers() {
    /* Boundary (bottom) */
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

    /* Point capital projects */
    map.addSource(SOURCE.pts, { type: 'geojson', data: sources.pts });
    map.addLayer({
      id: LAYER.pts, type: 'circle', source: SOURCE.pts,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          11.2, 2, 13, 4, 16, 10
        ],
        'circle-color': ['case', ['has', '_color'], ['get', '_color'], '#5b6770'],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'],
          11.2, 0.2, 16, 0.8
        ],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3, 0.5],
        'circle-stroke-opacity': 0.3
      }
    });

    /* Clusters (top) */
    map.addSource(SOURCE.clusters, { type: 'geojson', data: sources.clusters });

    map.addLayer({
      id: LAYER.clusterHalo, type: 'circle', source: SOURCE.clusters,
      layout: { 'visibility': 'none' },
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'active'], false], 28,
          ['boolean', ['feature-state', 'hover'], false], 20,
          16
        ],
        'circle-color': '#c69744',
        'circle-opacity': [
          'case',
          ['boolean', ['feature-state', 'active'], false], 0.35,
          ['boolean', ['feature-state', 'hover'], false], 0.22,
          0
        ],
        'circle-stroke-color': '#c69744',
        'circle-stroke-width': [
          'case',
          ['boolean', ['feature-state', 'active'], false], 2,
          ['boolean', ['feature-state', 'hover'], false], 1.5,
          0
        ],
        'circle-stroke-opacity': 0.7
      }
    });

    map.addLayer({
      id: LAYER.clusters, type: 'circle', source: SOURCE.clusters,
      layout: { 'visibility': 'none' },
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'active'], false], 12,
          ['boolean', ['feature-state', 'hover'], false], 10,
          8
        ],
        'circle-color': [
          'case',
          ['==', ['get', '_isFourAgency'], 1], '#0c343b',
          '#14525c'
        ],
        'circle-opacity': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2.5,
        'circle-stroke-opacity': 1
      }
    });

    map.addLayer({
      id: LAYER.clusterLabels, type: 'symbol', source: SOURCE.clusters,
      layout: {
        'visibility': 'none',
        'text-field': ['concat', ['to-string', ['+', ['get', '_index'], 1]]],
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-allow-overlap': true,
        'text-ignore-placement': true
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#0c343b',
        'text-halo-width': 0.5
      }
    });

    setTimeout(function () {
      try {
        var rendered = map.querySourceFeatures(SOURCE.pts);
        console.log('[map] points: ' + rendered.length + ' in source');
      } catch (err) { /* ignore */ }
    }, 800);
  }

  /* ---------- 5. Hover ----------------------------------------- */

  function setHoverState(layerKey, feature, on) {
    if (!feature || feature.id == null) return;
    map.setFeatureState({ source: SOURCE[layerKey], id: feature.id }, { hover: on });
  }
  function setActiveState(layerKey, feature, on) {
    if (!feature || feature.id == null) return;
    map.setFeatureState({ source: SOURCE[layerKey], id: feature.id }, { active: on });
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
        // Don't overwrite the pinned cluster popup during a guided tour
        if (popupPinned) return;
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
        if (!popupPinned) resetPanel();
        map.getCanvas().style.cursor = '';
      });
    });
  }

  /* ---------- 6. Popup panel(s) -------------------------------- */

  var panel       = document.getElementById('popupPanel');
  var content     = document.getElementById('popupContent');
  var placeholder = document.getElementById('popupPlaceholder');
  var popupPinned = false; // when true, hover events won't overwrite popup

  // Secondary panel — for clicked capital projects during guided tour
  var panel2       = document.getElementById('popupPanelSecondary');
  var content2     = document.getElementById('popupContentSecondary');
  var closeBtn2    = document.getElementById('popupSecondaryClose');

  function setPanel(html) {
    content.innerHTML = html;
    content.hidden = false;
    placeholder.hidden = true;
    panel.classList.remove('is-empty');
  }

  function resetPanel() {
    if (popupPinned) return;
    content.hidden = true;
    placeholder.hidden = false;
    panel.classList.remove('is-cursor');
    panel.classList.remove('is-pinned');
    panel.classList.add('is-fixed');
    panel.classList.add('is-empty');
    panel.style.left = '';
    panel.style.top = '';
  }

  function pinPanel(html) {
    popupPinned = true;
    content.innerHTML = html;
    content.hidden = false;
    placeholder.hidden = true;
    panel.classList.remove('is-cursor');
    panel.classList.remove('is-fixed');
    panel.classList.remove('is-empty');
    panel.classList.add('is-pinned');
    panel.style.left = '';
    panel.style.top = '';
  }

  function unpinPanel() {
    popupPinned = false;
    panel.classList.remove('is-pinned');
    resetPanel();
  }

  function setSecondaryPanel(html) {
    if (!panel2 || !content2) return;
    content2.innerHTML = html;
    panel2.classList.remove('is-hidden');
  }
  function hideSecondaryPanel() {
    if (!panel2) return;
    panel2.classList.add('is-hidden');
  }

  function positionSecondaryPanel(evt) {
    if (!panel2) return;
    var ev = evt.originalEvent || evt;
    var x = ev.clientX, y = ev.clientY;
    var pw = panel2.offsetWidth || 340, ph = panel2.offsetHeight || 200, m = 16;
    var left = x + 18, top = y + 18;
    if (left + pw + m > window.innerWidth) left = x - pw - 18;
    if (top + ph + m > window.innerHeight) top = y - ph - 18;
    if (left < m) left = m;
    if (top < m) top = m;
    panel2.style.left = left + 'px';
    panel2.style.top = top + 'px';
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
    panel.classList.remove('is-pinned');
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
    if (layerId === LAYER.clusters || layerId === LAYER.clusterHalo || layerId === LAYER.clusterLabels) return 'clusters';
    return null;
  }

  /* ---------- 7. Data loading ---------------------------------- */

  var sources = { pts: null, line: null, polygon: null, blocks: null, boundary: null, clusters: null };

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
    if (key === 'clusters') ids = [LAYER.clusterHalo, LAYER.clusters, LAYER.clusterLabels];
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
    range.min = minY; range.max = maxY; range.value = maxY;

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
      allMode = true; range.value = maxY; applyFilter(maxY); updateReadout();
    });
    var playing = false, timer = null;
    function step() {
      var v = parseInt(range.value, 10);
      v = (v >= maxY) ? minY : v + 1;
      range.value = v; allMode = false; applyFilter(v); updateReadout();
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

  /* ---------- 10b. Agency filter ------------------------------ */

  function setupAgencyFilter() {
    var agencyChips = document.querySelectorAll('.agency-chip');
    if (!agencyChips.length) return;

    var selectedAgencies = { DEP: true, DOT: true, DDC: true, DPR: true };

    function applyAgencyFilter() {
      var agencies = Object.keys(selectedAgencies).filter(function (a) {
        return selectedAgencies[a];
      });
      var filterExpr;
      if (agencies.length === 4)        filterExpr = null;
      else if (agencies.length === 0)   filterExpr = false;
      else                              filterExpr = ['in', ['get', '_agency'], ['literal', agencies]];

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

  /* =============================================================
     11. MODE MANAGEMENT — overview ↔ cluster
     ============================================================= */

  var currentMode = null; // 'overview' | 'cluster'
  var welcomeOverlay = document.getElementById('welcomeOverlay');
  var titleBlock     = document.getElementById('titleBlock');
  var tourHeader     = document.getElementById('tourHeader');
  var tourControl    = document.getElementById('tourControl');
  var timeSlider     = document.getElementById('timeSlider');
  var legendCluster  = document.getElementById('legendClusterGroup');
  var legendBlocks   = document.getElementById('legendBlocksGroup');

  function setMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;

    // Always clear secondary popup on any mode change
    hideSecondaryPanel();

    if (mode !== 'cluster') {
      Tour.stopAuto();
      Tour.clearActive();
      unpinPanel();
    }

    if (mode === 'overview') {
      titleBlock.hidden = false;
      tourHeader.hidden = true;
      tourControl.hidden = true;
      timeSlider.style.display = '';
      legendCluster.hidden = true;
      if (legendBlocks) legendBlocks.hidden = false;

      toggleLayer('clusters', false);
      ['pts', 'line', 'polygon', 'blocks', 'boundary'].forEach(function (k) {
        var cb = document.querySelector('.layer-toggle input[data-layer="' + k + '"]');
        var on = cb ? cb.checked : true;
        toggleLayer(k, on);
      });

      map.easeTo({ center: JMB_CENTER, zoom: DEFAULT_ZOOM, duration: 800 });
    }
    else if (mode === 'cluster') {
      titleBlock.hidden = true;
      tourHeader.hidden = false;
      tourControl.hidden = false;
      timeSlider.style.display = 'none';
      legendCluster.hidden = false;
      if (legendBlocks) legendBlocks.hidden = true;

      toggleLayer('clusters', true);
      ['pts', 'line', 'polygon', 'boundary'].forEach(function (k) {
        var cb = document.querySelector('.layer-toggle input[data-layer="' + k + '"]');
        var on = cb ? cb.checked : true;
        toggleLayer(k, on);
      });
      toggleLayer('blocks', false);

      Tour.setSubmode('guided', { jumpTo: 0 });
    }
  }

  function setupModeControls() {
    document.querySelectorAll('.welcome-choice').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-mode');
        hideWelcome();
        setMode(mode);
      });
    });

    var enterTourBtn = document.getElementById('enterTourBtn');
    if (enterTourBtn) {
      enterTourBtn.addEventListener('click', function () { setMode('cluster'); });
    }

    var backBtn = document.getElementById('backToOverviewBtn');
    if (backBtn) {
      backBtn.addEventListener('click', function () { setMode('overview'); });
    }

    document.querySelectorAll('.tour-mini-choice').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var sub = btn.getAttribute('data-tour-mode');
        Tour.setSubmode(sub);
      });
    });

    // Close button on the secondary popup
    if (closeBtn2) {
      closeBtn2.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        hideSecondaryPanel();
      });
    }
  }

  function hideWelcome() {
    welcomeOverlay.classList.add('is-hidden');
    setTimeout(function () { welcomeOverlay.style.display = 'none'; }, 350);
  }

  /* =============================================================
     12. TOUR CONTROLLER
     ============================================================= */

  var Tour = (function () {
    var idx = 0;
    var submode = 'guided';  // 'guided' | 'explore'
    var autoTimer = null;
    var autoPlaying = false;
    var activeFeature = null;

    var counterEl    = document.getElementById('tourCounter');
    var nameEl       = document.getElementById('tourName');
    var progressEl   = document.getElementById('tourProgress');
    var prevBtn      = document.getElementById('tourPrevBtn');
    var nextBtn      = document.getElementById('tourNextBtn');
    var autoBtn      = document.getElementById('tourAutoBtn');
    var autoIcon     = document.getElementById('tourAutoIcon');
    var guidedPanel  = document.getElementById('tourControlGuided');
    var explorePanel = document.getElementById('tourControlExplore');

    function features() {
      return (sources.clusters && sources.clusters.features) ? sources.clusters.features : [];
    }
    function count() { return features().length; }

    function buildProgress() {
      if (!progressEl) return;
      progressEl.innerHTML = '';
      var n = count();
      for (var i = 0; i < n; i++) {
        var d = document.createElement('button');
        d.className = 'tour-dot';
        d.type = 'button';
        d.setAttribute('data-idx', String(i));
        d.setAttribute('aria-label', 'Go to cluster ' + (i + 1));
        d.addEventListener('click', function (e) {
          var k = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
          stopAuto();
          go(k, { animate: true });
        });
        progressEl.appendChild(d);
      }
    }

    function updateProgress() {
      if (!progressEl) return;
      progressEl.querySelectorAll('.tour-dot').forEach(function (el, i) {
        el.classList.toggle('is-active', i === idx);
        el.classList.toggle('is-past', i < idx);
      });
    }

    function clearActive() {
      if (activeFeature) {
        setActiveState('clusters', activeFeature, false);
        activeFeature = null;
      }
    }

    function go(i, opts) {
      var feats = features();
      if (!feats.length) return;
      idx = ((i % feats.length) + feats.length) % feats.length;
      var f = feats[idx];

      clearActive();
      activeFeature = f;
      setActiveState('clusters', f, true);

      // Advancing the tour dismisses any open project-detail popup
      hideSecondaryPanel();

      var coords = f.geometry.coordinates;
      var doAnimate = !opts || opts.animate !== false;
      if (doAnimate) {
        map.flyTo({
          center: coords, zoom: TOUR_ZOOM,
          speed: 0.8, curve: 1.4, essential: true
        });
      }

      var name = (f.properties && f.properties.cluster_name) || ('Cluster ' + (idx + 1));
      if (counterEl) counterEl.textContent = 'Cluster ' + (idx + 1) + ' of ' + feats.length;
      if (nameEl)    nameEl.textContent = name;
      updateProgress();

      var html = window.PopupContent.clusters(f.properties || {}, { index: idx, total: feats.length });
      pinPanel(html);
    }

    function next() { stopAutoIfManual(); go(idx + 1, { animate: true }); }
    function prev() { stopAutoIfManual(); go(idx - 1, { animate: true }); }
    function stopAutoIfManual() { /* manual nav doesn't stop auto by default */ }

    function startAuto() {
      if (autoPlaying) return;
      autoPlaying = true;
      if (autoIcon) autoIcon.textContent = '❚❚';
      if (autoBtn)  autoBtn.classList.add('is-playing');
      autoTimer = setInterval(function () { go(idx + 1, { animate: true }); }, 5000);
    }
    function stopAuto() {
      autoPlaying = false;
      if (autoIcon) autoIcon.textContent = '▶';
      if (autoBtn)  autoBtn.classList.remove('is-playing');
      if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    }
    function toggleAuto() { autoPlaying ? stopAuto() : startAuto(); }

    function setSubmode(s, opts) {
      submode = s;
      document.querySelectorAll('.tour-mini-choice').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-tour-mode') === s);
      });
      if (s === 'guided') {
        guidedPanel.hidden = false;
        explorePanel.hidden = true;
        if (opts && opts.jumpTo != null) idx = opts.jumpTo;
        if (features().length) go(idx, { animate: true });
      } else {
        guidedPanel.hidden = true;
        explorePanel.hidden = false;
        stopAuto();
        clearActive();
        unpinPanel();
        // Leaving guided mode also closes the secondary panel
        hideSecondaryPanel();
        map.easeTo({ center: JMB_CENTER, zoom: DEFAULT_ZOOM, duration: 700 });
      }
    }

    function getSubmode() { return submode; }

    function init() {
      buildProgress();
      if (prevBtn)  prevBtn.addEventListener('click', prev);
      if (nextBtn)  nextBtn.addEventListener('click', next);
      if (autoBtn)  autoBtn.addEventListener('click', toggleAuto);

      document.addEventListener('keydown', function (e) {
        if (currentMode !== 'cluster' || submode !== 'guided') return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
        if (e.key === ' ')          { e.preventDefault(); toggleAuto(); }
      });
    }

    return {
      init: init,
      go: go,
      next: next,
      prev: prev,
      stopAuto: stopAuto,
      setSubmode: setSubmode,
      getSubmode: getSubmode,
      clearActive: clearActive,
      current: function () { return idx; }
    };
  })();

  /* =============================================================
     13. Boot
     ============================================================= */

  map.on('load', function () {
    Promise.all([
      load('pts',      function (d) { normalizeCapitalProjects(d, 'pts'); }),
      load('line',     function (d) { normalizeCapitalProjects(d, 'line'); }),
      load('polygon',  function (d) { normalizeCapitalProjects(d, 'polygon'); }),
      load('blocks',   normalizeBlocks),
      load('boundary', normalizeBoundary),
      load('clusters', normalizeClusters)
    ]).then(function () {
      buildLayers();

      bindHover('boundary', [LAYER.boundaryFill]);
      bindHover('blocks',   [LAYER.blocksFill]);
      bindHover('polygon',  [LAYER.polygonFill]);
      bindHover('line',     [LAYER.line]);
      bindHover('pts',      [LAYER.pts]);
      bindHover('clusters', [LAYER.clusters, LAYER.clusterHalo, LAYER.clusterLabels]);

      setupLayerToggles();
      setupTimeSlider();
      setupAgencyFilter();
      setupTitleBlock();
      setupModeControls();
      Tour.init();

      /* ----- Map click handler -----------------------------------
         In CLUSTER mode:
           1. If user clicked a cluster marker → advance Tour to that cluster.
           2. Else if a tour is in progress (popupPinned) AND user clicked a
              capital infrastructure feature → show that feature's details
              in the SECONDARY popup panel (bottom-right). The pinned
              cluster popup stays put.
           3. Else (explore submode, no pin) → behave like overview.
         In OVERVIEW mode:
           Standard popup behavior — show clicked feature in primary panel.
      */
      map.on('click', function (e) {
        if (currentMode === 'cluster') {
          // (1) Cluster clicks always advance the tour
          var clusterHits = map.queryRenderedFeatures(e.point, {
            layers: [LAYER.clusters, LAYER.clusterHalo]
          });
          if (clusterHits.length) {
            var cf = clusterHits[0];
            var i = (cf.properties && cf.properties._index != null)
              ? Number(cf.properties._index) : 0;
            Tour.stopAuto();
            Tour.go(i, { animate: true });
            return;
          }

          // (2) During a guided tour, route capital project clicks to the
          //     secondary panel so the pinned cluster popup is preserved.
          if (popupPinned) {
            var capitalHits = map.queryRenderedFeatures(e.point, {
              layers: [LAYER.pts, LAYER.line, LAYER.polygonFill, LAYER.blocksFill]
            });
            if (capitalHits.length) {
              var hit = capitalHits[0];
              var key = getLayerKeyFromLayerId(hit.layer.id);
              if (key) {
                var html2 = window.PopupContent[key](hit.properties || {});
                setSecondaryPanel(html2);
                positionSecondaryPanel(e);
              }
              return;
            }
            // Clicked empty space during a guided tour — leave both
            // panels alone (user may still be reading them).
            return;
          }
        }

        // OVERVIEW mode (or explore submode in cluster mode) — original behavior
        var hits = map.queryRenderedFeatures(e.point, {
          layers: [LAYER.pts, LAYER.line, LAYER.polygonFill, LAYER.blocksFill, LAYER.boundaryFill]
        });
        if (!hits.length) {
          if (!popupPinned) resetPanel();
          return;
        }
        var layerKey = getLayerKeyFromLayerId(hits[0].layer.id);
        if (layerKey && !popupPinned) {
          setPanel(window.PopupContent[layerKey](hits[0].properties || {}));
          followCursor(e);
        }
      });

      var loader = document.getElementById('loader');
      if (loader) loader.classList.add('is-hidden');
    });
  });

  map.getContainer().addEventListener('mouseleave', function () {
    if (!popupPinned) resetPanel();
  });

  map.on('error', function (e) {
    if (e && e.error && /access token|401|403/i.test(String(e.error.message || e.error))) {
      console.error('[map] Mapbox token error — replace mapboxgl.accessToken in js/map.js');
      var loader = document.getElementById('loader');
      if (loader) {
        loader.querySelector('.loader__text').textContent = 'Mapbox token error — see js/map.js';
      }
    }
  });

})();
