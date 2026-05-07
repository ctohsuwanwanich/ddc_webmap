/* =====================================================================
   popup-content.js
   Builds the HTML content shown in the floating popup panel.
   ===================================================================== */

(function () {
  'use strict';

  // Agency colors mirror CSS custom properties --agency-*
  var AGENCY_COLORS = {
    DEP: '#1d4e89',
    DOT: '#c97b1f',
    DDC: '#5b6770',
    DPR: '#5a8a3a'
  };

  // Block concentration ramp (matches the hex codes in spec)
  var BLOCK_RAMP = ['#fafdf8', '#BAE4BC', '#7BCCC4', '#43A2CA', '#9868AC'];
  var BLOCK_BANDS = [
    { min: 0, max: 0.415,   label: 'No Capital Infrastructure Projects',  band: 'Very low',  color: BLOCK_RAMP[0] },
    { min: 0.415, max: 3.288,   label: 'A Couple of Projects',  band: 'Low',       color: BLOCK_RAMP[1] },
    { min: 3.288, max: 23.16,   label: 'Some Projects',  band: 'Moderate',  color: BLOCK_RAMP[2] },
    { min: 23.16, max: 160.586,  label: 'High Concentration of Projects', band: 'High',      color: BLOCK_RAMP[3] },
    { min: 160.586, max: Infinity, label: 'Very High Concentration of Projects', band: 'Very high', color: BLOCK_RAMP[4] }
  ];

  function classifyProjCount(n) {
    n = Number(n) || 0;
    for (var i = 0; i < BLOCK_BANDS.length; i++) {
      if (n >= BLOCK_BANDS[i].min && n <= BLOCK_BANDS[i].max) return BLOCK_BANDS[i];
    }
    return BLOCK_BANDS[0];
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(d) {
    if (!d) return '—';
    // Try to parse ISO or year-only strings
    var date = new Date(d);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return escapeHtml(d);
  }

  function fmtBudget(b) {
    var n = Number(b);
    if (isNaN(n)) return '—';
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'K';
    return '$' + n.toFixed(0);
  }

  function getFirstNonEmptyValue(props, keys) {
    for (var i = 0; i < keys.length; i++) {
      var v = props[keys[i]];
      if (v != null) {
        var s = String(v).trim();
        if (s) return s;
      }
    }
    return '';
  }

  function getAgency(props, kind) {
    if (kind === 'pts') {
      return getFirstNonEmptyValue(props, ['magency', 'MAGENCY', 'agency', 'AGENCY']).toUpperCase();
    }
    if (kind === 'line') {
      return getFirstNonEmptyValue(props, ['Managing_Agency', 'MANAGING_AGENCY', 'managing_agency', 'magency', 'MAGENCY', 'agency', 'AGENCY']).toUpperCase();
    }
    if (kind === 'polygon') {
      return getFirstNonEmptyValue(props, ['magencyacr', 'MAGENCYACR', 'magenacro', 'magency', 'MAGENCY', 'agency', 'AGENCY']).toUpperCase();
    }
    return getFirstNonEmptyValue(props, ['magency', 'MAGENCY', 'agency', 'AGENCY', 'Managing_Agency', 'MANAGING_AGENCY', 'managing_agency', 'magencyacr', 'MAGENCYACR', 'magenacro']).toUpperCase();
  }

  function getTitle(props) {
    return props.title || props.TITLE || props.Title ||
           props.FMS_Project_Name || props.proj_name || props.PROJ_NAME ||
           props.descriptio || props.NAME || 'Untitled project';
  }

  function getFmsId(props, kind) {
    if (kind === 'pts') {
      return getFirstNonEmptyValue(props, ['FMSID', 'FMSid', 'fmsid']);
    }
    return getFirstNonEmptyValue(props, ['FMS_ID', 'FMSID', 'FMSid', 'fms_id', 'fmsid']);
  }

  function getCompletionDate(props) {
    return props.completion_date || props.COMPLETION_DATE ||
           props.complete_date || props.compl_date || props.end_date ||
           props.completed || props.fy_complete ||
           props.DesignActu || props.DesignProj || props.Construc_4 ||
           props.Construc_3 || props.DesignStar || props.date_const ||
           props.time_const || props.mindate || props.maxdate || null;
  }

  function getBudget(props) {
    return props.budget_usd || props.budget || props.BUDGET ||
           props.amount || props.cost || null;
  }

  function getProjCount(props) {
    var v = props.Point_Count || props.POINT_COUNT || 0;
    return Number(v) || 0;
  }

  // -------------------- TEMPLATES --------------------

  function capitalProjectTemplate(props, geometryLabel, kind) {
    var title = escapeHtml(getTitle(props));
    var agency = getAgency(props, kind);
    var color = AGENCY_COLORS[agency] || '#5b6770';
    var date = fmtDate(getCompletionDate(props));
    var budget = fmtBudget(getBudget(props));
    var fmsId = escapeHtml(getFmsId(props, kind) || '—');

    return '' +
      '<p class="pop-eyebrow">Capital project · ' + escapeHtml(geometryLabel) + '</p>' +
      '<p class="pop-title">' + title + '</p>' +
      '<div class="pop-grid">' +
        '<div class="pop-row">' +
          '<span class="k">Managing agency</span>' +
          '<span class="v"><span class="pop-agency-pill" style="background:' + color + '"><i></i>' + escapeHtml(agency || '—') + '</span></span>' +
        '</div>' +
        '<div class="pop-row">' +
          '<span class="k">FMS ID</span>' +
          '<span class="v">' + fmsId + '</span>' +
        '</div>' +
        '<div class="pop-row">' +
          '<span class="k">Completion</span>' +
          '<span class="v">' + date + '</span>' +
        '</div>' +
        (getBudget(props) ? (
          '<div class="pop-row">' +
            '<span class="k">Budget</span>' +
            '<span class="v">' + budget + '</span>' +
          '</div>'
        ) : '') +
      '</div>';
  }

  // Public API
  window.PopupContent = {

    AGENCY_COLORS: AGENCY_COLORS,
    BLOCK_RAMP: BLOCK_RAMP,
    BLOCK_BANDS: BLOCK_BANDS,

    classifyProjCount: classifyProjCount,
    getAgency: getAgency,
    getCompletionDate: getCompletionDate,
    getProjCount: getProjCount,

    pts: function (props) {
      return capitalProjectTemplate(props, 'point', 'pts');
    },

    line: function (props) {
      return capitalProjectTemplate(props, 'line', 'line');
    },

    polygon: function (props) {
      return capitalProjectTemplate(props, 'polygon', 'polygon');
    },

    blocks: function (props) {
      var n = getProjCount(props);
      var band = classifyProjCount(n);
      var textColor = (n >= 8) ? '#fff' : '#1a2a33';
      var borderColor = (n >= 8) ? '#fff' : '#bdbdbd';
      var concentrationText = (band.band === 'Very high')
        ? 'Very high concentration'
        : n + '<small>projects on this block</small>';
      return '' +
        '<p class="pop-eyebrow">NYC block · concentration</p>' +
        '<p class="pop-title">Capital infrastructure concentration</p>' +
        '<p class="pop-concentration">' + concentrationText + '</p>' +
        '<div class="pop-grid">' +
          '<div class="pop-row">' +
            '<span class="k">Class</span>' +
            '<span class="v"><span class="pop-band" style="background:' + band.color + ';color:' + textColor + ';border-color:' + borderColor + '">' + escapeHtml(band.band) + '</span></span>' +
          '</div>' +
          '<div class="pop-row">' +
            '<span class="k">Range</span>' +
            '<span class="v">' + escapeHtml(band.label) + '</span>' +
          '</div>' +
        '</div>';
    },

    boundary: function (props) {
      var name = escapeHtml(props.name || 'Jamaica Bay Study Area');
      return '' +
        '<p class="pop-eyebrow">Study area · boundary</p>' +
        '<p class="pop-title">' + name + '</p>' +
        '<p class="placeholder-text" style="margin-top:6px">' +
          'Watershed extent used to clip capital project data and analyze ' +
          'opportunities for integrated wastewater management across DEP, ' +
          'DOT, DDC, and DPR.' +
        '</p>';
    }
  };

})();