/* =====================================================================
   popup-content.js
   Builds the HTML content shown in the floating popup panel(s).
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

  /* ---------- Cluster helpers ---------- */
  var AGENCY_DISPLAY_ORDER = ['DEP', 'DDC', 'DOT', 'DPR'];

  function parseAgencyList(raw) {
    if (!raw) return [];
    var tokens = String(raw)
      .split(/[,;/]/)
      .map(function (s) { return s.trim().toUpperCase(); })
      .filter(function (s) { return AGENCY_COLORS.hasOwnProperty(s); });
    var seen = {};
    tokens.forEach(function (t) { seen[t] = true; });
    return AGENCY_DISPLAY_ORDER.filter(function (a) { return seen[a]; });
  }

  function agencyPillsHtml(agencies) {
    return agencies.map(function (a) {
      var color = AGENCY_COLORS[a];
      return '<span class="pop-agency-pill" style="background:' +
             color + '"><i></i>' + escapeHtml(a) + '</span>';
    }).join(' ');
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
    getAgency: getAgency,
    getCompletionDate: getCompletionDate,
    parseAgencyList: parseAgencyList,

    pts:     function (props) { return capitalProjectTemplate(props, 'point',   'pts'); },
    line:    function (props) { return capitalProjectTemplate(props, 'line',    'line'); },
    polygon: function (props) { return capitalProjectTemplate(props, 'polygon', 'polygon'); },

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
    },

    /* ---------- Cluster popup ----------
       For the inter-agency cluster tour. Properties expected:
         - cluster_name        (string)
         - agency_presented    (comma-separated agency codes)
         - description         (paragraph of opportunity description)
       Optional second arg `meta` provides {index, total} for tour positioning.
    */
    clusters: function (props, meta) {
      var name = escapeHtml(props.cluster_name || 'Cluster site');
      var agencies = parseAgencyList(props.agency_presented);
      var pills = agencyPillsHtml(agencies);
      var desc = escapeHtml((props.description || '').trim());

      var eyebrow = 'Inter-agency cluster';
      if (meta && meta.index != null && meta.total != null) {
        eyebrow += ' · ' + (meta.index + 1) + ' of ' + meta.total;
      }

      return '' +
        '<p class="pop-eyebrow">' + eyebrow + '</p>' +
        '<p class="pop-title">' + name + '</p>' +
        '<div class="pop-cluster-agencies">' +
          '<span class="pop-cluster-k">Agencies presented</span>' +
          '<div class="pop-cluster-pills">' + pills + '</div>' +
        '</div>' +
        '<div class="pop-cluster-desc">' +
          '<p>' + desc + '</p>' +
        '</div>';
    }
  };

})();