# Opportunities for Integrated Wastewater Management
### Jamaica Bay, New York City — Web Map

A spatial reading of capital infrastructure projects across the Jamaica Bay
watershed, produced for **Town & Gown NYC · NYC Department of Design and
Construction (DDC)**. The map highlights points, lines, and polygons of
capital work commissioned by **DEP**, **DDC**, **DOT**, and **DPR**, and
exposes block-level concentrations of capital infrastructure to surface
opportunities for integrated wastewater management.

---

## Project structure

```
jamaica_bay_map/
├── index.html                  ← entry point
├── css/
│   └── style.css               ← all styling (typography, layout, theme)
├── js/
│   ├── map.js                  ← Mapbox GL setup, layers, time slider, toggles
│   └── popup-content.js        ← popup HTML templates (one per layer)
├── data/
│   ├── pts_capitalproj_jmb_simp.geojson
│   ├── line_capitalproj_jmb_simp.geojson
│   ├── polygon_capitalproj_jmb_simp.geojson
│   ├── nycblock_sumwihtin_shapesimp.geojson
│   └── jmb_boundary.json_shapesimp.geojson
└── README.md

```

---

## Map composition

### Layer stack (top → bottom)

The layer order specified for this project, where higher items are drawn
on top of lower ones:

1. `pts_capitalproj_jmb_simp.geojson` — capital project points
2. `line_capitalproj_jmb_simp.geojson` — capital project lines
3. `polygon_capitalproj_jmb_simp.geojson` — capital project polygons
4. `nycblock_projcount_shapesimp.geojson` — block-level concentration
5. `jmb_boundary.json_shapesimp.geojson` — Jamaica Bay study area outline

In Mapbox GL JS the visual order is built **bottom-up**: the boundary
loads first, the points load last. See `js/map.js → buildLayers()`.

### Symbology

**Capital projects** are classified by **managing agency** (`magency`):

| Agency | Color | Use |
|---|---|---|
| DEP | `#1d4e89` (deep harbor blue) | wastewater, stormwater, sewer |
| DOT | `#c97b1f` (clay) | roadway, drainage |
| DDC | `#5b6770` (slate) | integrated infrastructure |
| DPR | `#5a8a3a` (marsh green) | parks, shoreline, restoration |

**Point fill opacity** follows the project specification:
- **DEP points** are filled at **85% opacity** (visually dominant — the
  wastewater management focus of the study)
- **All other agencies** have **0% fill opacity** (outline-only rings),
  keeping non-DEP locations visible without competing for attention

**Block-level capital infrastructure concentration** uses a 5-class
sequential ramp:

| Class | Range | Hex |
|---|---|---|
| Very low | 0 - 0.42 Projects | `#F0F9E8` |
| Low | 0.42 - 3.29 Projects | `#BAE4BC` |
| Moderate | 3.29 - 23.16 Projects | `#7BCCC4` |
| High | 23.16 - 160.59 Projects| `#43A2CA` |
| Very high | More than 160.59 Projects | `#9868AC` |

Block outlines are 0.1 pt — **grey (`#9e9e9e`) on light fills**, **white
(`#ffffff`) on dark fills** (per spec).

### Interactive elements

- **Hover popup** for every capital project (point/line/polygon) shows:
  *project title*, *managing agency*, *completion date*. Budget is
  shown when available.
- **Hover popup** on blocks shows **level of capital infrastructure
  concentration** (numeric count + class band).
- **Legend** with checkboxes turns each layer on and off independently.
- **Time slider** (bottom-center) filters projects by completion year.
  Press ▶ to animate forward through the timeline; press *All* to reset.
- **Title block** collapses out of the way so the watershed reads cleanly.
- **Reset view** button (top-right) returns to the framing.

---

## Data sources

### Administrative boundaries
- **NYC Borough Boundaries** — NYC Open Data
  <https://data.cityofnewyork.us/City-Government/Borough-Boundaries/gthc-hcne/about_data>

### Jamaica Bay study area
- **NYU UDS, Jamaica Bay Boundary** —
  <https://nyuds.maps.arcgis.com/home/item.html?id=934450c68a534a67b05878eed18d0235>

### Capital projects
- **Citywide tracker (Power BI dashboard)** —
  <https://app.powerbigov.us/view?r=eyJrIjoiMTkwYWMyNGEtMDNiZC00OTY4LTk4YjEtYzI0MzhlOTA3MzllIiwidCI6IjM1YzgyODE2LTZjNTYtNDQzYi1iYWY2LTgzMTIxNjNjYWRjMSJ9>
- **Capital Projects Dashboard — Citywide Budget & Spend by Fiscal Year**
- **Capital Projects Dashboard — Citywide Budget and Schedule**
- **DDC Capital Project Data** (IRF Project Joined Clip)
- **DPR Capital Project Tracker** — NYC Open Data
  <https://data.cityofnewyork.us/Recreation/Capital-Project-Tracker/qiwj-i2jk/about_data>
- **DEP Green Infrastructure Point Layer** — NYC Open Data
  <https://data.cityofnewyork.us/Environment/DEP-Green-Infrastructure-Point-Layer-/df32-vzax/about_data>

---

## Methodology

### 1 — Capital project mapping

1. Upload borough boundaries.
2. Obtain the Jamaica Bay boundary file from the NYU UDS ArcGIS Online
   item.
3. *Add Data from Path* using the link above; the original includes
   features outside the study area.
4. **Copy Features** to extract just the Jamaica Bay study area; export
   to a polygon feature class (`jmb_boundary`).
5. Inventory the available capital project data:
   - The dataset separated by fiscal year contains all the fiscal years
     needed but no project details and no spatial geometry.
   - The other dataset has all the project details but no fiscal year
     information and no spatial geometry.
   - The polygon dataset has spatial geometry but limited details and
     no fiscal years.
6. **Clip** all spatial capital infrastructure datasets to the Jamaica
   Bay boundary.
7. **Select by Attributes** to retain only the agencies of interest:
   `magency IN ('DOT', 'DEP', 'DDC', 'DPR')`.
8. **Clean** the capital project files:
   - Filter for the lowest project number per fiscal year, narrowing to
     the canonical record per project.
   - **Left join** the project details onto the fiscal-year file so
     each row carries spatial geometry, fiscal year, and full attributes.

### 2 — De-duplication across sources

Three datasets overlap: the **IMF JSON**, the **DCP Capital Project
Tracker**, and the **DPR Capital Project Tracker**.

- Use **Select by Location → Intersect** to identify duplicates.
- Before deletion, **Copy Features** the duplicates to a separate layer
  for future reference.
- Pairs and outcomes:
  - `Capital_PARKS_jmb` ↔ `jmb_capitalproj_selection` →
    389 − 238 = **151 duplicate projects** removed.
  - `Capital_PARKS_jmb` ↔ `jmb_capitalproj_pts_selection` →
    no overlap.
  - `IRF_Project_Joined_Clip` (DDC data) ↔ `jmb_capitalproj_selection`,
    using the *Completely within* clause →
    **33 of 98** overlapping; removed.
  - `IRF_Project_Joined_Clip` ↔ `jmb_capitalproj_pts_selection` →
    no overlap.

### 3 — Clustering analysis

To reason about concentration, polygon projects must first be reduced
to representative points so they can be summed alongside true point
features:

1. **Create Spatial Sampling Locations** to generate representative
   points within each polygon.
   - Datasets: `IFRProjects_join_buffer`, `Capitalproj_selection`
   - Sampling method: **Systematic**
   - Bin shape: **square**
   - Bin size: **400 m²**
   - Minimum distance between sample points: **0 m**
2. Convert multipoint capital features to single point features using
   the **Multipart to Singlepart** tool.
3. Use **Summarize Within** to sum how many capital projects fall on
   each NYC tax block:
   - **Input polygons:** `nyblock_jmb`
   - **Summarize features:** all capital infrastructure (points)
4. The resulting attribute (`proj_count`) is classified into the 5
   concentration bands described above and rendered with the
   sequential ramp `#F0F9E8 → #BAE4BC → #7BCCC4 → #43A2CA → #9868AC`.

## Stack

- **Mapbox GL JS** v3.20.0 (basemap: `mapbox://styles/mapbox/light-v11`)
- **Source Serif 4** (display) + **Inter Tight** (UI) + **JetBrains
  Mono** (numerical labels) — Google Fonts
- Vanilla HTML/CSS/JS — no build step

## License & attribution

Data sources are public-domain NYC Open Data and NYU UDS releases.
Cite **Town & Gown NYC · NYC DDC** when reusing analysis or visuals.