# Black Box dashboard design

Black Box is a personal CI control plane for trusted GitHub Actions. The primary task is to answer three questions quickly: what ran, where it ran, and what failed. The dashboard keeps a dense operational layout so a run list or log table remains visible beside its filters.

## Direction

The supplied Blacksmith screens informed the information hierarchy: a slim utility rail, a grouped context sidebar, a time-range toolbar, a chart, and a dense result surface. Black Box owns the branding, copy, icon usage, colors, and interaction details. The layout is an inspiration for scanning, not a copy of the source product.

## Tokens

| Role | Value | Use |
| --- | --- | --- |
| `--bg` | `#080a0b` | page canvas and browser background |
| `--rail` | `#141719` | utility rail |
| `--side` | `#1a1d1f` | context navigation and filters |
| `--canvas` | `#0c1012` | main work surface |
| `--line` | `#2a2f32` | persistent boundaries |
| `--line-soft` | `#202528` | row separators |
| `--text` | `#e9edef` | primary content |
| `--muted` | `#8a9499` | supporting content |
| `--blue` | `#5ba6ff` | selection and active runner data |
| `--cyan` | `#6de3e6` | cache and host signals |
| `--lime` | `#b9f42b` | Black Box identity and connected state |
| `--green` | `#58d99a` | success and healthy runner state |
| `--red` | `#ff7187` | failed and error state |
| `--yellow` | `#e9c464` | warning state |

## Type and density

- System sans stack, with `13px` body text and compact `10px` uppercase eyebrow labels.
- Main headings use `22px` to `23px` at `font-weight: 510` to `560` with restrained negative tracking.
- Operational rows use `10px` to `13px` text. Metadata stays readable and does not carry primary meaning alone.
- Desktop layout uses a `58px` utility rail, a `252px` context sidebar, and a flexible main column.
- At narrow widths the rail becomes a top strip, the context sidebar becomes horizontal navigation, and tables keep a deliberate horizontal scroll rather than clipping log content.

## Components and behavior

- Navigation sections are real buttons with `aria-current` and a visible selected state.
- Run and log search fields filter the local data set while the API adapter is being connected.
- The connection notice can be dismissed without removing the dashboard context.
- Status always has text and an icon. Color reinforces success, failure, warning, or running state.
- The generated Black Box mark is functional identity, not a status signal. It lives at `public/black-box-mark.png` and has transparent background.
- Icons come from the editable `ynrlib/icons` Lucide entry point. Icon-only buttons carry an accessible label.
- The chart is supporting context. Run and log rows remain the primary work surface.
- Motion is intentionally absent in the first shell; `prefers-reduced-motion` is still respected for future transitions.

## Data boundary

The dashboard reads normalized repositories, workflow runs, jobs, selected job logs, and optional WSL host telemetry from the authenticated Worker. It keeps unavailable values explicit and displays partial GitHub API warnings instead of filling gaps with fixture records. Local cache history and detailed test evidence remain agent-owned until the WSL host reports them.
