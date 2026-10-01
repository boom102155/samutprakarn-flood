---
name: น้ำสมุทรปราการ
description: Thai-language flood bulletin for scanning local water conditions and reporting from the field.
colors:
  navy-950: "#102a49"
  navy-900: "#14375f"
  navy-800: "#184774"
  blue-700: "#1769dc"
  blue-600: "#287bea"
  blue-100: "#e7f0ff"
  blue-50: "#f3f7ff"
  canvas: "#f2f6fa"
  paper: "#ffffff"
  ink: "#162b42"
  ink-soft: "#52667c"
  muted: "#708195"
  line: "#dce5ee"
  line-light: "#eaf0f5"
  teal: "#15946a"
  amber: "#e4b932"
  red: "#d94d48"
  severity-shallow: "#dfb72e"
  severity-below-ankle: "#a7c83b"
  severity-knee: "#ed8933"
  severity-chest: "#e6534c"
  severity-deep: "#956341"
  severity-submerged: "#8b6bc4"
typography:
  display:
    fontFamily: 'var(--font-anuphan), "Leelawadee UI", Tahoma, Arial, sans-serif'
    fontSize: "clamp(32px, 3.1vw, 42px)"
    fontWeight: 760
    lineHeight: 1.27
    letterSpacing: "-0.05em"
  headline:
    fontFamily: 'var(--font-anuphan), "Leelawadee UI", Tahoma, Arial, sans-serif'
    fontSize: "32px"
    fontWeight: 760
    lineHeight: 1.35
    letterSpacing: "-0.045em"
  title:
    fontFamily: 'var(--font-anuphan), "Leelawadee UI", Tahoma, Arial, sans-serif'
    fontSize: "20px"
    fontWeight: 750
  body:
    fontFamily: 'var(--font-anuphan), "Leelawadee UI", Tahoma, Arial, sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'var(--font-anuphan), "Leelawadee UI", Tahoma, Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 700
  button:
    fontFamily: 'var(--font-anuphan), "Leelawadee UI", Tahoma, Arial, sans-serif'
    fontSize: "15px"
    fontWeight: 700
  reportAction:
    fontFamily: 'var(--font-anuphan), "Leelawadee UI", Tahoma, Arial, sans-serif'
    fontSize: "18px"
    fontWeight: 800
    letterSpacing: "-0.01em"
rounded:
  sm: "9px"
  md: "13px"
  lg: "18px"
components:
  button-primary:
    backgroundColor: "{colors.blue-600}"
    textColor: "#ffffff"
    typography: "{typography.button}"
    rounded: "8px"
    padding: "0 15px"
    height: "40px"
  button-report-main:
    backgroundColor: "{colors.blue-600}"
    textColor: "#ffffff"
    typography: "{typography.reportAction}"
    rounded: "{rounded.sm}"
    padding: "0 24px"
    height: "56px"
  surface-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "17px"
  severity-rack:
    backgroundColor: "#123153"
    textColor: "#f1f6fc"
    rounded: "10px"
    padding: "12px"
---

# Design System: น้ำสมุทรปราการ

## Overview

**Creative North Star: "The Field Bulletin Rack"**

The Field Bulletin Rack turns local flood observations into a calm operational bulletin: navy navigation and blue controls establish the working frame, while clear white sheets keep Thai reports and map details easy to read. Its signature severity rack presents six water states as compact ivory slides with exposed color tabs and narrow tracks, rather than a wall of interchangeable dashboard cards.

The interface favors fast scanning over ornament. Anuphan supports Thai-first reading, while concise labels, visible recency, and distinct severity marks help people compare reports. On narrow screens the persistent navigation changes from a left rail to a bottom bar; the map, report rows, and bulletin sheets remain the working content.

**Key Characteristics:**
- Navy operating frame with bright blue action cues and white reading sheets.
- Six reserved water-level hues, repeated consistently in the rack, legend, and map markers.
- Clearly stepped Thai typography, rounded panels, and small, restrained offset shadows.
- Desktop sidebar navigation becomes a five-destination mobile bottom navigation.

## Colors

The palette pairs deep field navy and practical blue controls with cool white-and-blue reading surfaces; six distinct hues communicate water severity.

### Primary
- **Field Blue** (`{colors.blue-600}`): Primary actions and selected controls, including the main report action.
- **Deep Field Navy** (`{colors.navy-950}`): Persistent desktop navigation and the darkest operating surface.

### Secondary
- **Signal Blue** (`{colors.blue-700}`): Links, map actions, and secondary emphasis.
- **Bulletin Navy** (`{colors.navy-900}`): Large blue operating panels, including the opening bulletin.
- **Pale Blue Washes** (`{colors.blue-100}` and `{colors.blue-50}`): Selected controls and quiet blue-tinted backgrounds.

### Tertiary
- **Dry Teal** (`{colors.teal}`): Dry conditions in the severity legend, rack, and report marks.
- **Shallow Amber** (`{colors.severity-shallow}`): The first shallow-water category.
- **Ankle Lime** (`{colors.severity-below-ankle}`): Below-ankle marker category before the knee-depth group.
- **Knee-Depth Orange** (`{colors.severity-knee}`): Knee-to-waist water reports.
- **Chest-Depth Red** (`{colors.severity-chest}`): Waist-to-chest water reports.
- **Deep Water Brown** (`{colors.severity-deep}`): Above-chest water reports.
- **Submerged Violet** (`{colors.severity-submerged}`): The deepest water category.
- **Status Amber** (`{colors.amber}`): Connection and waiting indicators.
- **Alert Red** (`{colors.red}`): Required-field and error emphasis.

### Neutral
- **Cool Canvas** (`{colors.canvas}`): The app-wide background around white bulletin sheets.
- **Reading White** (`{colors.paper}`): Report, map, and bulletin surfaces.
- **Report Ink** (`{colors.ink}`): Primary text on light surfaces.
- **Soft Ink** (`{colors.ink-soft}`) and **Muted Ink** (`{colors.muted}`): Secondary copy, descriptions, and supporting labels.
- **Quiet Divider** (`{colors.line}`): Panel outlines and structural separators.
- **Light Divider** (`{colors.line-light}`): Fine row separators and internal rules.

### Named Rules
**The Severity Reservation Rule.** The six water-level hues belong to water-status data: keep them consistent across the rack, legend, report marks, and map markers.

## Typography

**Display Font:** Anuphan variable (with Leelawadee UI, Tahoma, Arial, sans-serif fallbacks)
**Body Font:** Anuphan variable (with Leelawadee UI, Tahoma, Arial, sans-serif fallbacks)
**Label/Mono Font:** No separate label or monospaced family is used.

**Character:** Anuphan keeps Thai interface copy open and highly legible without introducing a second display voice. The variable face carries the hierarchy through weight, size, and line spacing rather than a decorative type pairing.

### Hierarchy
- **Display** (760, `clamp(32px, 3.1vw, 42px)`, 1.27): Opening home bulletin headline; it reduces to 32px on phones and 30px at the narrowest breakpoint.
- **Headline** (760, 32px, 1.35): Page titles; the mobile page title is 28px.
- **Title** (750, 20px): Section headings, with form section headings at 18px.
- **Body** (400, 16px, 1.55): Default reading size; the same base size remains on small screens.
- **Label** (700, 13px): Field labels and compact controls; supporting metadata uses 12px as its minimum reading step.

### Named Rules
**The Thai-First Variable Rule.** Use the self-hosted Anuphan variable face for interface text and preserve its fallback sequence; create hierarchy through the observed size and weight changes.

## Layout

The desktop shell anchors a fixed left navigation beside a centered content column. The content area uses a broad opening bulletin, then working map and latest-report panels; the severity rack sits inside the bulletin as a compact status index. Report lists prioritize location, severity, and time, with supporting detail following those scan-critical values.

At 1180px the sidebar and gutters tighten. At 900px the rail becomes an icon-only strip and the working columns stack. At 640px the rail gives way to a sticky white header and fixed five-destination bottom navigation; the opening bulletin and rack stack vertically. At 380px the page gutters tighten again. These observed CSS breakpoints define the responsive changes; no extra breakpoint is implied.

## Elevation & Depth

Depth is mostly structural: navy and white surfaces contrast against the pale canvas, with fine cool borders separating sheets. Small offset shadows lift selected controls, the severity rack, and map overlays without turning the UI into a floating-card field.

### Shadow Vocabulary
- **Soft Surface (`--shadow-soft`)** (`0 9px 28px rgba(21, 52, 87, .07)`): Loading and map-empty overlays.
- **Primary Action** (`0 4px 12px rgba(9, 47, 101, .2)`): The standard blue primary button.
- **Rack Lift** (`inset 0 1px rgba(255,255,255,.05), 0 7px 18px rgba(8,25,44,.16)`): The inset bulletin rack on the navy intro panel.
- **Map Surface** (`0 8px 22px rgba(23,50,79,.07)`): The full map boundary.

### Named Rules
**The Small-Offset Rule.** Use shadows as restrained separation for controls and overlays; let the white sheet, pale canvas, and fine borders do most of the depth work.

## Shapes

Panels use gently rounded corners (13px for common cards and 18px for the opening bulletin), with smaller controls and nested surfaces stepping down to compact radii. White sheets generally use a fine cool border; the severity slides are intentionally tighter and tabular, while map reports use filled circles with a dark outline. Keep the recurring forms rounded and functional rather than turning them into decorative pills; the mobile live indicator is the observed pill-shaped exception.

## Components

### Buttons
- **Character:** Compact, direct controls with a clear blue action or quiet outlined alternative.
- **Shape:** Gently rounded corners (8px primary button radius; secondary UI radii vary by component).
- **Primary:** Blue field surface with white text. The home report action is intentionally dominant (56px desktop height, 54px mobile height, 18px desktop text, 24px horizontal padding) and remains the first, strongest action on phones; secondary buttons remain quieter.
- **Hover / Focus:** Hover lifts the button by 1px; color shifts by variant. Keyboard focus uses a 3px translucent blue outline with a 2px offset.
- **Quiet / Secondary:** Quiet actions use translucent white on navy; secondary actions use pale blue fill and a cool-blue border.

### Chips
- **Style:** Severity choices and vehicle choices use compact white controls with a fine cool border; selected choices receive a pale blue fill and stronger blue border.
- **State:** Water state is identified by its six-color marker as well as its label; selected form choices add a check mark or stronger type weight.

### Cards / Containers
- **Character:** White bulletin sheets are practical reading surfaces, not ornamental cards.
- **Corner Style:** Common map and latest panels use 13px corners; larger feature panels use 18px.
- **Background:** White sheets sit on the cool canvas; the intro bulletin and severity rack use layered navy surfaces.
- **Shadow Strategy:** Prefer border and tonal separation; use the restrained roles in Elevation & Depth where the implementation already lifts a surface.
- **Border:** Fine cool-blue-gray outlines separate sheets and nested map surfaces.
- **Internal Padding:** Common map panels use 17px top/side padding; the compact severity rack uses 12px, with responsive values reduced on phones.

### Inputs / Fields
- **Style:** White fields use a 1px cool border, 7px corners, and compact internal padding.
- **Focus:** Focus changes the border to blue and adds a subtle 3px blue halo; keyboard focus remains visibly outlined.
- **Error / Disabled:** Errors use red text and pale red callouts; disabled selects use muted text and a pale gray-blue fill.

### Navigation
- **Style:** A deep navy desktop sidebar holds the five destinations; the active item receives a brighter navy fill and blue edge marker. On phones, a white sticky header pairs with a fixed five-item bottom bar whose active destination uses blue text and a pale blue backing.
- **Typography:** Destination labels are compact and bold enough to stay legible; the active item is brighter than inactive items.
- **Behavior:** The navigation structure remains five destinations at both desktop and mobile sizes, changing arrangement rather than dropping destinations.

### Severity Rack
Six ivory report slides sit within an inset navy panel. Each slide exposes its severity hue as a narrow tab and repeats that hue in a thin status track; category text and a right-aligned count remain visible on each row.

### Flood Map Marker
The map uses filled circular severity dots with a dark outline, matching the report colors. The selected province remains bright within its red boundary while the surrounding map is dimmed. Older reports fade, and a dashed circle distinguishes a report marked receded.

### Report Row
Rows begin with a small severity dot, then location and area; severity and elapsed time align at the trailing edge. Dividers and generous row height keep dense local reports separable.

### White Bulletin Sheet
Map, latest-report, and emergency-contact sections use white sheets with cool dividers and restrained headings so map and report information remain the focus.

### Named Rules
**The Bulletin Sheet Rule.** Keep the severity summary as tabbed ivory slides with slim status tracks inside its navy operating surface.
**The Age-and-State Rule.** Preserve the implementation's age fade, dashed receded marker, and 36-hour report window wherever the corresponding map state is presented.

## Do's and Don'ts

### Do:
- **Do** reserve the six severity colors for water status and repeat each hue consistently between the rack, legend, report rows, and map.
- **Do** keep location, water severity, and report time easy to scan before secondary detail.
- **Do** use Anuphan variable for the Thai interface and preserve the mobile size reductions that are present in the implementation.
- **Do** keep the white reading sheets distinct from the pale canvas with their cool borders and restrained shadows.
- **Do** retain all five navigation destinations when switching from the desktop rail to the mobile bottom bar.

### Don't:
- **Don't** replace the six-state rack with a wall of interchangeable dashboard cards.
- **Don't** use severity hues as generic navigation or action colors.
- **Don't** hide report recency or the receded state when rendering report markers and rows.
- **Don't** let decorative type or tilt compromise Thai reading clarity.
