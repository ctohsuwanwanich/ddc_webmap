# Opportunities for Integrated Wastewater Management
### Jamaica Bay, New York City — Interactive Web Map

A spatial reading of capital infrastructure projects across the Jamaica Bay
watershed, produced for **Town & Gown NYC · NYC Department of Design and
Construction (DDC)**. Individual project geometries are shown over a quiet
backdrop of NYC blocks and the watershed boundary. Eleven **inter-agency
clusters** — opportunity sites where DEP, DDC, DOT, and DPR work converges
on the ground — can be toured one by one.

---

## What changed in this revision

- **NYC blocks** are now a single muted backdrop. The five-class
  concentration ramp and the block hover popup have been removed —
  blocks now read as passive context, not a data layer to inspect.
- **Capital projects** are controlled by a single **"Show all projects"**
  toggle (the prior pts/line/polygon split is gone — geometry type isn't
  analytically useful here).
- **Hover state** is now strongly distinctive: project markers grow and
  gain a white halo; lines thicken with a glow; polygons brighten and
  jump to a white stroke. The tooltip's referent is always obvious.
- **Agency pills** are now framed clearly as a filter, with a "↳ Filter
  by managing agency" prompt and outlined-chip affordance.
- **Timeline / playback** has been removed in both modes — the data
  reads well without temporal animation.
- **Cluster tour controls** (Prev / Next / progress dots / counter) now
  live **inside** the pinned cluster popup. Only one panel to read.
  No auto-play.

---

## The two modes

When the page opens, a welcome panel offers two ways to enter:

### 01 · Overall project locations
Every capital project in the watershed — points, lines, polygons —
rendered on the NYC-blocks backdrop. **Hover** any project to read its
details. **Tap an agency pill** in the legend to filter by managing
agency. From this mode, a **Start the cluster tour** button on the title
block moves the user to mode 02 without leaving the page.

### 02 · Inter-agency cluster tour
A curated walk through eleven sites where two or more agencies have
capital work converging. The cluster tour offers two sub-modes:

| Sub-mode | Behavior |
|---|---|
| **Guided** | The cluster description popup **pins** to the top-right corner with Prev / Next buttons, a 1 / 11 counter, and clickable progress dots all inside the same panel. Use the buttons, arrow keys (`←` / `→`), or click any progress dot to navigate. **Click any capital project** on the map (point/line/polygon) to read its details in a secondary popup at the bottom-right; the cluster description stays pinned. |
| **Explore** | The map frames the whole watershed. Click any cluster marker on the map to read its description. No prev/next — explore at your own pace. |

The capital infrastructure layers and the NYC-blocks backdrop remain
available in cluster mode and can be toggled in the legend. A
**Back to overall project locations** link at the top of the tour panel
returns to mode 01 at any time.

---

## Project structure

```
jamaica_bay_map/
├── index.html                       ← entry point
├── css/
│   └── style.css                    ← all styling
├── js/
│   ├── map.js                       ← Mapbox, modes, tour controller
│   └── popup-content.js             ← popup HTML templates
├── data/
│   ├── pts_capitalproj_jmb_simp.geojson      — capital project points
│   ├── line_capitalproj_jmb_simp.geojson     — capital project lines
│   ├── polygon_capitalproj_jmb_simp.geojson  — capital project polygons
│   ├── nycblock_sumwithin.geojson            — NYC blocks backdrop
│   ├── jmb_boundary_shapesimp.json           — study-area outline
│   └── cluster_desc_simp.geojson             — 11 inter-agency clusters
└── README.md
```

---

## Map composition

### Layer stack (top → bottom)

1. **Cluster markers + halo + numeric label** *(cluster mode only)*
2. Capital project points
3. Capital project lines (with a wide invisible hit-target for easy hover)
4. Capital project polygons
5. NYC blocks — single flat backdrop color (`#cfe1e3` fill, `#9fbcc0` outline)
6. Jamaica Bay study area outline

### Symbology

Capital projects are classified by **managing agency** (`magency`):

| Agency | Color | Role |
|---|---|---|
| DEP | `#1d4e89` (deep harbor blue) | wastewater, stormwater, sewer |
| DOT | `#c97b1f` (clay) | roadway, drainage |
| DDC | `#5b6770` (slate) | integrated infrastructure |
| DPR | `#5a8a3a` (marsh green) | parks, shoreline, restoration |

### Interactive elements

- **Welcome modal** — first-touch chooser between Overview and Cluster Tour.
- **Hover popup** for any capital project showing title, agency, FMS ID,
  completion date, budget. Project marker grows + glows on hover so the
  tooltip's referent is unmistakable.
- **Layer toggles** (legend): single "Capital projects" toggle, plus
  "Inter-agency clusters" (cluster mode), "NYC blocks", and the Jamaica
  Bay study area (always on).
- **Agency filter chips** — outlined pill buttons; tap any to toggle
  visibility of that agency's projects across all geometry types.
- **Tour controls** (cluster mode, guided sub-mode), all inside the
  pinned cluster popup:
  - `← Prev` / `Next →` buttons with a `N / 11` counter
  - **Progress dots** above the buttons — click any to jump
  - **Keyboard**: `←` `→` to navigate
- **Click any cluster marker** — moves the tour to that cluster
  (works in both sub-modes).
- **Click any capital project during the guided tour** — opens a
  secondary popup at the bottom-right with the project's details. The
  pinned cluster popup stays put. Close with `×` or advance the tour.

---

## Data sources

### Administrative boundaries
- **NYC Borough Boundaries** — NYC Open Data
  <https://data.cityofnewyork.us/City-Government/Borough-Boundaries/gthc-hcne/about_data>

### Jamaica Bay study area
- **NYU UDS, Jamaica Bay Boundary** —
  <https://nyuds.maps.arcgis.com/home/item.html?id=934450c68a534a67b05878eed18d0235>

### Capital projects
- **Citywide tracker (Power BI dashboard)**
- **Capital Projects Dashboard — Citywide Budget & Spend by Fiscal Year**
- **Capital Projects Dashboard — Citywide Budget and Schedule**
- **DDC Capital Project Data** (IRF Project Joined Clip)
- **DPR Capital Project Tracker** — NYC Open Data
- **DEP Green Infrastructure Point Layer** — NYC Open Data

### Inter-agency clusters
Eleven cluster sites in `cluster_desc_simp.geojson` identified by spatial
inspection of the deduplicated capital project dataset. Required schema:

```json
{
  "cluster_name":      "Rufus King Park",
  "agency_presented":  "DPR, DEP, DOT, DDC",
  "description":       "...opportunity description..."
}
```

---

## Methodology

### 1 — Capital project mapping
Capital project files are clipped to the Jamaica Bay boundary, filtered
by `magency IN ('DEP', 'DOT', 'DDC', 'DPR')`, and joined with project
detail attributes.

### 2 — De-duplication across sources
Overlapping records identified with **Select by Location → Intersect**.
Notable outcomes: 151 duplicates removed from the DPR/citywide overlap;
33 of 98 records removed from the DDC IRF overlap.

### 3 — Inter-agency clusters
Cluster sites identified manually by visual inspection — locations where
two or more of the four agencies have capital work within a small radius.

---

## Stack

- **Mapbox GL JS** v3.20.0 (basemap: `mapbox://styles/mapbox/dark-v11`)
- **Source Serif 4** (display) + **Inter Tight** (UI) + **JetBrains
  Mono** (numerical labels) — Google Fonts
- Vanilla HTML/CSS/JS — no build step

## License & attribution

Data sources are public-domain NYC Open Data and NYU UDS releases.
Cluster identification, descriptions, and methodology by **Town & Gown
NYC · NYC DDC**. Cite when reusing analysis or visuals.