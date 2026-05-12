# Opportunities for Integrated Wastewater Management
### Jamaica Bay, New York City — Interactive Web Map

A spatial reading of capital infrastructure projects across the Jamaica Bay
watershed, produced for **Town & Gown NYC · NYC Department of Design and
Construction (DDC)**. The map exposes block-level concentrations of capital
investment alongside individual project geometries, and surfaces **eleven
inter-agency clusters** — opportunity sites where DEP, DDC, DOT, and DPR
work converges on the ground.

---

## The two modes

When the page opens, a welcome panel offers two ways to enter:

### 01 · Overall project locations
The full atlas. Every capital project in the watershed — points, lines,
polygons — rendered over a block-level concentration surface, with a time
slider to filter by completion year and layer toggles for each geometry
type. **Hover** any project to read its details in the floating popup.
From this mode, a **Start cluster tour** button on the title block moves
the user to mode 02 without leaving the page.

### 02 · Inter-agency cluster tour
A curated walk through eleven sites where two or more agencies have
capital work converging. The cluster tour offers two sub-modes:

| Sub-mode | Behavior |
|---|---|
| **Guided** | Step through the eleven clusters in order with prev/next buttons, keyboard navigation (← →), spacebar to toggle auto-play (5 s per cluster), or click any progress dot to jump. The cluster description popup **pins** to the top-right corner so it stays visible while the map flies between sites. **Click** any capital project (point/line/polygon/block) on the map to read its details in a secondary popup at the bottom-right — the cluster description stays pinned for context. |
| **Explore** | The map frames the whole watershed. Click any cluster marker on the map to read its description. No automatic narrative — explore at your own pace. |

The same five capital infrastructure layers (points, lines, polygons,
block concentration, boundary) remain available in cluster mode and can
be toggled in the legend. A **Back to overall project locations** link
at the top of the tour panel returns to mode 01 at any time.

#### Two popups, two contexts

During a guided tour the screen holds two reading contexts at once:

- **Top-right** — the **pinned cluster popup** with a clay top-border:
  cluster name, agencies presented, and the opportunity description.
  It does not move as you mouse around.
- **Bottom-right** — the **secondary project popup** with a teal
  top-border, only appears when you click a capital project. It carries
  the project's title, managing agency pill, FMS ID, and completion date.
  A `×` close button dismisses it, and it auto-hides whenever the tour
  advances (prev / next / auto-play / progress-dot / cluster-marker click)
  or when you switch sub-modes or leave cluster mode.

This split keeps the tour narrative readable while letting you inspect
the surrounding infrastructure on demand. Hover popups are intentionally
disabled while the cluster popup is pinned — interaction during the
guided tour is **click only**, so the calm narrative isn't broken by
incidental cursor movement.

---

## Project structure

```
jamaica_bay_map/
├── index.html                       ← entry point
├── css/
│   └── style.css                    ← all styling
├── js/
│   ├── map.js                       ← Mapbox, modes, tour, secondary panel
│   └── popup-content.js             ← popup HTML templates (incl. clusters)
├── data/
│   ├── pts_capitalproj_jmb_simp.geojson      — capital project points
│   ├── line_capitalproj_jmb_simp.geojson     — capital project lines
│   ├── polygon_capitalproj_jmb_simp.geojson  — capital project polygons
│   ├── nycblock_sumwithin.geojson            — block-level concentration
│   ├── jmb_boundary_shapesimp.json           — study-area outline
│   └── cluster_desc_simp.geojson             — 11 inter-agency clusters
└── README.md
```
---

## Map composition

### Layer stack (top → bottom)

1. **Cluster markers + halo + numeric label** *(cluster mode only)*
2. `pts_capitalproj_jmb_simp.geojson` — capital project points
3. `line_capitalproj_jmb_simp.geojson` — capital project lines
4. `polygon_capitalproj_jmb_simp.geojson` — capital project polygons
5. `nycblock_sumwithin.geojson` — block-level concentration
   *(hidden in cluster mode for visual calm)*
6. `jmb_boundary_shapesimp.json` — Jamaica Bay study area outline

In Mapbox GL JS the visual order is built **bottom-up**: the boundary
loads first, the cluster overlay loads last. See `js/map.js → buildLayers()`.

### Symbology

**Capital projects** are classified by **managing agency** (`magency`):

| Agency | Color | Use |
|---|---|---|
| DEP | `#1d4e89` (deep harbor blue) | wastewater, stormwater, sewer |
| DOT | `#c97b1f` (clay) | roadway, drainage |
| DDC | `#5b6770` (slate) | integrated infrastructure |
| DPR | `#5a8a3a` (marsh green) | parks, shoreline, restoration |

**Block-level capital infrastructure concentration** uses a 5-class
sequential ramp:

| Class | Range | Hex |
|---|---|---|
| Very low | 0 – 0.415 | `#F0F9E8` |
| Low | 0.415 – 3.288 | `#BAE4BC` |
| Moderate | 3.288 – 23.16 | `#7BCCC4` |
| High | 23.16 – 160.586 | `#43A2CA` |
| Very high | 160.586 + | `#9868AC` |

### Cluster popup contents (top-right, pinned)

1. **Eyebrow** — `Inter-agency cluster · N of 11` (in guided tour) or
   `Inter-agency cluster` (in explore mode).
2. **Cluster name** — e.g. *Rufus King Park*, *Bildersee Playground*.
3. **Agencies presented** — color-coded chips matching the existing
   agency palette, ordered DEP · DDC · DOT · DPR for visual consistency
   regardless of input order.
4. **Description** — a paragraph describing the integration opportunity.

### Secondary project popup (bottom-right, clicked during guided tour)

Carries the same template as the overview mode hover popup, with a teal
top-border to mark it as a secondary reading context:

- Capital project · point / line / polygon
- Project title
- Managing agency pill (DEP / DOT / DDC / DPR)
- FMS ID, completion date, budget if available
- Block popups show concentration class + range

A small circular `×` button in the top-right corner of the panel closes it.

### Interactive elements

- **Welcome modal** — first-touch chooser between Overview and Cluster Tour.
- **Hover popup** for every capital project showing title, agency,
  FMS ID, completion date (overview mode only — disabled while the
  cluster popup is pinned).
- **Hover popup on blocks** showing the level of capital infrastructure
  concentration (overview mode only).
- **Layer toggles** in the legend for each capital project geometry,
  the block surface, and (in cluster mode) the cluster overlay.
- **Agency filter chips** — click an agency chip in the legend to toggle
  visibility of that agency's projects across all geometry types.
- **Time slider** (overview mode) — filters projects by completion year,
  with a play control to animate forward.
- **Tour controls** (cluster mode, guided sub-mode):
  - `← Prev` / `Next →` buttons
  - `▶ Auto` — auto-play through the 11 clusters every 5 s
  - **Progress dots** — click any to jump
  - **Keyboard**: `←` `→` to navigate, spacebar to toggle auto-play
- **Click any cluster marker** — moves the tour to that cluster
  (works in both sub-modes).
- **Click any capital project during the guided tour** — opens a
  secondary popup at the bottom-right with the project's details. The
  pinned cluster popup stays put. Close the secondary popup with its
  `×` button, or advance the tour to clear it automatically.
- **Title block / tour header** collapses so the watershed reads cleanly.
- **Reset view** button (top-right) returns to the Jamaica Bay framing.

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

### Inter-agency clusters
The eleven cluster sites in `cluster_desc_simp.geojson` were identified
by spatial inspection of the deduplicated capital project dataset —
locations where two or more of DEP, DDC, DOT, and DPR have current or
recent capital work within a small radius. Each cluster has been
characterized with a short description of the integration opportunity it
presents. Required schema for each feature:

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

1. Load borough boundaries into the project workspace.
2. Obtain the Jamaica Bay boundary file from the NYU UDS ArcGIS Online item.
3. Use **Copy Features** to extract only the Jamaica Bay study area
   polygon (`jmb_boundary`).
4. Inventory the available capital project datasets and confirm:
   - the fiscal-year-segmented dataset has temporal coverage but no
     geometry or detail;
   - the project-detail dataset has full attributes but no fiscal year
     or geometry;
   - the polygon dataset has geometry but limited attributes.
5. **Clip** every spatial dataset to the Jamaica Bay boundary.
6. **Select by Attributes** to retain only the four agencies of interest:
   `magency IN ('DEP', 'DOT', 'DDC', 'DPR')`.
7. **Clean & left-join**: filter for the lowest project number per
   fiscal year, then left-join project detail onto the fiscal-year file.

### 2 — De-duplication across sources

- **Select by Location → Intersect** identifies overlapping records.
- Duplicates are copied to a reference layer before deletion.
- Outcomes:
  - `Capital_PARKS_jmb` ↔ `jmb_capitalproj_selection`: 151 duplicates
    removed (389 → 238).
  - `IRF_Project_Joined_Clip (DDC)` ↔ `jmb_capitalproj_selection`:
    33 of 98 overlapping; removed.
  - The other two pairs had no overlap.

### 3 — Block-level concentration

- **Create Spatial Sampling Locations** converts polygon projects to
  representative points (systematic, 400 m² square bins).
- **Multipart to Singlepart** splits multipoint features.
- **Summarize Within** counts points per NYC tax block (`nyblock_jmb`)
  to produce `proj_count`, classified in the 5-class ramp above.

### 4 — Inter-agency clusters

Cluster sites were identified manually by visual inspection of the
block-level concentration surface and the underlying agency project
geometries. A site qualified as a cluster when two or more of the four
agencies had capital work within a small radius — typically a single
park, plaza, playground, or street segment.

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
