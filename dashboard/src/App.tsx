import { useMemo, useState } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  Clock3,
  Code2,
  Database,
  ExternalLink,
  FileSearch,
  Filter,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  HardDrive,
  LayoutDashboard,
  ListFilter,
  MoreHorizontal,
  Search,
  Server,
  Settings2,
  SlidersHorizontal,
  TerminalSquare,
  X,
} from "ynrlib/icons";

type Section = "history" | "logs" | "runners" | "analytics" | "storage";

type Run = {
  title: string;
  repo: string;
  branch: string;
  event: string;
  actor: string;
  age: string;
  duration: string;
  status: "success" | "failed" | "running";
  runner: string;
};

const runs: Run[] = [
  {
    title: "AMR checks",
    repo: "AMR-Fan-App",
    branch: "main",
    event: "Pull request",
    actor: "NachikethReddyY",
    age: "12 min ago",
    duration: "4m 18s",
    status: "success",
    runner: "black-box-vbook",
  },
  {
    title: "Black Box CI",
    repo: "black-box-ci",
    branch: "main",
    event: "Push",
    actor: "NachikethReddyY",
    age: "27 min ago",
    duration: "1m 42s",
    status: "success",
    runner: "black-box-vbook",
  },
  {
    title: "AMR security",
    repo: "AMR-Fan-App",
    branch: "main",
    event: "Schedule",
    actor: "NachikethReddyY",
    age: "41 min ago",
    duration: "32s",
    status: "failed",
    runner: "black-box-vbook",
  },
  {
    title: "Lint and typecheck",
    repo: "devbox",
    branch: "feature/ui",
    event: "Push",
    actor: "NachikethReddyY",
    age: "1 hour ago",
    duration: "18m 49s",
    status: "success",
    runner: "github-hosted",
  },
  {
    title: "Preview build",
    repo: "black-box-ci",
    branch: "feat/log-search",
    event: "Pull request",
    actor: "NachikethReddyY",
    age: "2 hours ago",
    duration: "2m 08s",
    status: "running",
    runner: "black-box-vbook",
  },
];

const logRows = [
  ["INFO", "6453833", "code-coverage", "Cleanup completed"],
  ["INFO", "6453833", "code-coverage", "Stopping container · black-box-postgres"],
  ["INFO", "6453833", "code-coverage", "Removing temporary files"],
  ["INFO", "6453833", "code-coverage", "Container stopped"],
  ["DEBUG", "6453833", "code-coverage", "Cache lookup · pnpm-lock-v4 hit"],
  ["INFO", "6453833", "code-coverage", "Post-job cleanup"],
  ["WARN", "6453833", "build-docker-image", "Docker layer reused from local NVMe cache"],
  ["ERROR", "6453821", "database-migrations", "Connection refused at localhost:5432"],
  ["INFO", "6453821", "database-migrations", "Retrying in 5 seconds"],
  ["INFO", "6453821", "database-migrations", "Migration container ready"],
  ["INFO", "6453812", "build", "Tests completed · 184 passed"],
];

const navItems: Array<{ id: Section; label: string; icon: typeof Activity }> = [
  { id: "history", label: "Run History", icon: LayoutDashboard },
  { id: "logs", label: "Logs", icon: FileSearch },
  { id: "runners", label: "Runners", icon: Server },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "storage", label: "Storage", icon: Archive },
];

function StatusIcon({ status }: { status: Run["status"] }) {
  if (status === "success") return <CheckCircle2 aria-hidden="true" className="status-icon success" />;
  if (status === "failed") return <CircleAlert aria-hidden="true" className="status-icon failed" />;
  return <CircleDashed aria-hidden="true" className="status-icon running" />;
}

function BlackBoxMark({ size = 32 }: { size?: number }) {
  return (
    <img
      className="brand-mark"
      src="/black-box-mark.png"
      width={size}
      height={size}
      alt="Black Box"
    />
  );
}

export function App() {
  const [section, setSection] = useState<Section>("history");
  const [query, setQuery] = useState("");
  const [showNotice, setShowNotice] = useState(true);
  const [range, setRange] = useState("1D");

  const title = navItems.find((item) => item.id === section)?.label ?? "Run History";
  const filteredRuns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter((run) => Object.values(run).some((value) => value.toLowerCase().includes(needle)));
  }, [query]);

  return (
    <div className="app-shell">
      <aside className="icon-rail" aria-label="Primary navigation">
        <button className="rail-brand" aria-label="Black Box home" onClick={() => setSection("history")}>
          <BlackBoxMark size={36} />
        </button>
        <div className="rail-actions">
          {navItems.slice(0, 3).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`rail-button ${section === id ? "is-active" : ""}`}
              aria-label={label}
              aria-pressed={section === id}
              onClick={() => setSection(id)}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="rail-spacer" />
        <button className="rail-button" aria-label="Settings" onClick={() => setSection("storage")}>
          <Settings2 size={18} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <span className="online-dot" title="Black Box host online" />
      </aside>

      <aside className="context-sidebar">
        <div className="product-heading">
          <BlackBoxMark size={26} />
          <div>
            <strong>Black Box</strong>
            <span>Personal CI control plane</span>
          </div>
          <button className="icon-button" aria-label="Search dashboard">
            <Search size={17} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <nav className="side-nav" aria-label="Dashboard sections">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`side-nav-item ${section === id ? "is-active" : ""}`}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
            >
              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
              {(id === "history" || id === "analytics" || id === "storage") && <ChevronRight size={14} aria-hidden="true" />}
            </button>
          ))}
        </nav>

        {section === "logs" ? <LogFilters /> : <HistoryFilters />}

        <div className="sidebar-user">
          <div className="avatar">NR</div>
          <div className="user-copy"><strong>Nachiketh Reddy</strong><span>GitHub connected</span></div>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="title-block">
            <span className="eyebrow"><span className="eyebrow-mark" /> Black Box / GitHub Actions</span>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            <div className="range-control" aria-label="Time range">
              {["1h", "4h", "12h", "1D", "2D", "5D"].map((item) => (
                <button key={item} className={range === item ? "is-selected" : ""} onClick={() => setRange(item)}>{item}</button>
              ))}
            </div>
            <button className="date-control"><Clock3 size={14} aria-hidden="true" /> Sep 28, 10:53 AM – Sep 29, 10:53 AM UTC</button>
          </div>
        </header>

        <div className="content-scroll">
          {showNotice && (
            <div className="migration-notice">
              <div className="notice-symbol"><Code2 size={17} strokeWidth={1.8} aria-hidden="true" /></div>
              <div><strong>Black Box is connected</strong><span>AMR-Fan-App can now run trusted workflows on black-box-vbook.</span></div>
              <button aria-label="Dismiss connection notice" onClick={() => setShowNotice(false)}><X size={16} aria-hidden="true" /></button>
            </div>
          )}

          {section === "history" && <RunHistoryView query={query} setQuery={setQuery} filteredRuns={filteredRuns} />}
          {section === "logs" && <LogsView query={query} setQuery={setQuery} />}
          {section === "runners" && <RunnersView />}
          {section === "analytics" && <AnalyticsView />}
          {section === "storage" && <StorageView />}
        </div>
      </main>
    </div>
  );
}

function HistoryFilters() {
  return (
    <div className="filter-groups">
      <FilterGroup title="Repositories" items={["AMR-Fan-App", "black-box-ci", "devbox"]} />
      <FilterGroup title="Workflows" items={["Black Box CI", "checks.yml", "security.yml"]} />
      <FilterGroup title="Runners" items={["black-box-vbook", "GitHub-hosted"]} />
    </div>
  );
}

function LogFilters() {
  return (
    <div className="filter-groups">
      <FilterGroup title="Workflows" items={["build", "build-docker-image", "code-coverage", "database-migrations"]} />
      <FilterGroup title="Levels" items={["Info", "Warn", "Error", "Debug"]} />
      <FilterGroup title="Branches" items={["main", "feature/ui"]} />
    </div>
  );
}

function FilterGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="filter-group">
      <div className="filter-heading"><span>{title}</span><ChevronDown size={14} aria-hidden="true" /></div>
      <label className="filter-search"><Search size={14} aria-hidden="true" /><input placeholder={`Filter ${title.toLowerCase()}...`} /></label>
      {items.map((item) => <label className="check-row" key={item}><input type="checkbox" /><span className="fake-check" /><span>{item}</span></label>)}
    </section>
  );
}

function RunHistoryView({ query, setQuery, filteredRuns }: { query: string; setQuery: (value: string) => void; filteredRuns: Run[] }) {
  return (
    <>
      <section className="intro-row">
        <div><span className="eyebrow">Signal over noise</span><h2>Find the run you’re looking for</h2><p>Filter by repository, workflow, branch, event, status, or runner. Open a run to inspect every job and log.</p></div>
        <div className="intro-actions"><button className="button button-light"><SlidersHorizontal size={15} aria-hidden="true" /> Configure filters</button><button className="button button-quiet"><ExternalLink size={15} aria-hidden="true" /> Docs</button></div>
      </section>
      <RunDistribution />
      <section className="work-area">
        <div className="inline-filters">
          <div className="section-caption"><Filter size={14} aria-hidden="true" /> Active filters</div>
          {['Pull request', 'Push', 'Success'].map((filter) => <button className="filter-chip" key={filter}>{filter}<X size={12} aria-hidden="true" /></button>)}
          <button className="clear-filters">Clear</button>
        </div>
        <div className="results-panel">
          <div className="results-header"><div><span className="eyebrow">Runs</span><strong>196 total</strong></div><label className="table-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search runs" /></label><button className="icon-button" aria-label="More run options"><MoreHorizontal size={18} aria-hidden="true" /></button></div>
          <div className="run-list">{filteredRuns.map((run) => <RunRow key={`${run.title}-${run.age}`} run={run} />)}</div>
        </div>
      </section>
    </>
  );
}

function RunDistribution() {
  const points = "0,90 90,72 180,82 270,54 360,72 450,37 540,58 630,18 720,47 810,22 900,54 1000,30";
  return <section className="chart-panel"><div className="section-caption"><Activity size={14} aria-hidden="true" /> Workflow run distribution <span>success · failed · running · queued</span></div><svg className="line-chart" viewBox="0 0 1000 110" preserveAspectRatio="none" aria-label="Workflow run distribution chart"><path className="chart-area" d={`M${points.replaceAll(" ", " L")} L1000,110 L0,110 Z`} /><polyline points={points} /></svg><div className="chart-legend"><span><i className="legend-dot success" /> success 184</span><span><i className="legend-dot failed" /> failed 12</span><span>wall time · 1,294 minutes</span></div></section>;
}

function RunRow({ run }: { run: Run }) {
  return <article className="run-row"><StatusIcon status={run.status} /><div className="run-main"><strong>{run.title}</strong><span><span className="avatar avatar-small">NR</span>{run.actor}<em>·</em><b>{run.repo}</b><em>·</em><GitBranch size={12} aria-hidden="true" />{run.branch}<em>·</em>{run.event}</span></div><div className="run-meta"><span>{run.age}</span><span>{run.duration}</span><i className={`duration-bar ${run.status}`} /></div><div className={`run-state ${run.status}`}>{run.status}</div></article>;
}

function LogsView({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  const filtered = logRows.filter((row) => row.join(" ").toLowerCase().includes(query.toLowerCase()));
  return <>
    <section className="intro-row">
      <div><span className="eyebrow">Trace every signal</span><h2>Debug flaky tests and bugs</h2><p>Search across Black Box logs to see what failed, when it failed, and which job or runner produced it.</p></div>
      <div className="intro-actions"><button className="button button-light"><FileSearch size={15} aria-hidden="true" /> Search all logs</button><button className="button button-quiet"><ExternalLink size={15} aria-hidden="true" /> Retention</button></div>
    </section>
    <LogVolume />
    <section className="logs-panel">
      <div className="results-header"><div><span className="eyebrow">Log events</span><strong>1,957,007 indexed</strong></div><label className="table-search wide"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search message, job, run ID..." /></label><button className="button button-quiet"><ListFilter size={15} aria-hidden="true" /> Filters</button></div>
      <div className="log-table"><div className="log-header"><span>Level</span><span>Run ID</span><span>Job name</span><span>Message</span></div>{filtered.map(([level, runId, job, message], index) => <div className="log-row" key={`${runId}-${index}`}><span className={`log-level ${level.toLowerCase()}`}>{level}</span><span className="mono">{runId}</span><span className="job-name">{job}</span><span className="log-message">{message}</span></div>)}</div>
    </section>
  </>;
}

function LogVolume() {
  const heights = [22, 28, 31, 35, 43, 49, 55, 61, 68, 75, 64, 71, 83, 89, 98, 90, 57, 48, 37, 29, 20, 13];
  return <section className="chart-panel log-volume"><div className="section-caption"><Activity size={14} aria-hidden="true" /> Log volume <span>1,957,007 logs found · 30 day retention</span></div><div className="bar-chart" aria-label="Log volume chart">{heights.map((height, index) => <i className={`volume-bar ${index === 10 ? "warn" : ""} ${index === 14 || index === 15 ? "error" : ""}`} style={{ height: `${height}%` }} key={index} />)}</div><div className="chart-legend"><span><i className="legend-dot info" /> info 1.82m</span><span><i className="legend-dot warn" /> warn 92k</span><span><i className="legend-dot failed" /> error 44k</span></div></section>;
}

function RunnersView() {
  return <section className="overview-page"><div className="page-heading"><div><span className="eyebrow">Execution capacity</span><h2>Runners</h2><p>See where work is running and whether the home computer is ready for the next job.</p></div><button className="button button-light"><Settings2 size={15} aria-hidden="true" /> Runner settings</button></div><div className="metric-grid"><Metric label="Runner status" value="Online" detail="black-box-vbook · idle" icon={<Server size={18} />} tone="success" /><Metric label="CPU" value="18%" detail="i9 · 16 logical threads" icon={<Activity size={18} />} /><Metric label="Memory" value="6.4 / 16 GB" detail="WSL2 limit · 8 GB" icon={<Database size={18} />} /><Metric label="Storage" value="742 GB" detail="available on NVMe" icon={<HardDrive size={18} />} /></div><div className="runner-card"><div className="runner-card-heading"><div><span className="eyebrow">Home runner</span><h3>black-box-vbook</h3></div><span className="status-badge success"><span /> Ready</span></div><div className="runner-details"><span><GitBranch size={15} /> self-hosted · Linux · X64</span><span><TerminalSquare size={15} /> WSL2 Ubuntu</span><span><Clock3 size={15} /> last heartbeat 18s ago</span></div><div className="capacity-track"><i style={{ width: "18%" }} /></div><div className="runner-footer"><span>1 concurrent job slot</span><button className="button button-quiet">Open host details <ChevronRight size={14} /></button></div></div></section>;
}

function AnalyticsView() {
  return <section className="overview-page"><div className="page-heading"><div><span className="eyebrow">Measure the work</span><h2>Analytics</h2><p>Use observed run history to find slow steps, failures, and the savings from home execution.</p></div><button className="button button-light"><GitCommitHorizontal size={15} aria-hidden="true" /> Compare periods</button></div><div className="metric-grid"><Metric label="Runs this week" value="196" detail="184 successful · 12 failed" icon={<GitPullRequest size={18} />} /><Metric label="Home execution" value="82%" detail="160 runs on black-box-vbook" icon={<Server size={18} />} tone="success" /><Metric label="Median runtime" value="2m 14s" detail="down 18% from last week" icon={<Clock3 size={18} />} /><Metric label="Cache hit rate" value="94%" detail="pnpm + Docker layers" icon={<Database size={18} />} tone="success" /></div><div className="insight-list"><Insight title="Docker build slowed down" detail="build-docker-image is 42% slower than its 30-run baseline." status="Investigate" /><Insight title="One test may be flaky" detail="auth.refresh.test failed 3 times and passed on rerun each time." status="Review" /><Insight title="Home runner is saving minutes" detail="160 runs avoided GitHub-hosted execution this week." status="Good" /></div></section>;
}

function StorageView() {
  return <section className="overview-page"><div className="page-heading"><div><span className="eyebrow">Local state</span><h2>Storage</h2><p>Keep the fast, reusable parts of CI close to the WSL2 runner.</p></div><button className="button button-light"><SlidersHorizontal size={15} aria-hidden="true" /> Storage policy</button></div><div className="storage-layout"><div className="storage-meter"><div className="meter-ring"><strong>38%</strong><span>used</span></div><span>742 GB available</span></div><div className="storage-list"><StorageRow icon={<Database size={17} />} label="BuildKit layers" value="96.2 GB" detail="AMR-Fan-App · black-box-ci" /><StorageRow icon={<Archive size={17} />} label="Actions cache" value="41.8 GB" detail="64 cache keys · 30 day retention" /><StorageRow icon={<GitBranch size={17} />} label="Package stores" value="12.4 GB" detail="pnpm · npm · pip" /><StorageRow icon={<HardDrive size={17} />} label="Runner images" value="8.1 GB" detail="Ubuntu WSL2 base" /></div></div></section>;
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: React.ReactNode; tone?: "success" }) {
  return <article className="metric-card"><div className="metric-icon">{icon}</div><span className="metric-label">{label}</span><strong className={tone === "success" ? "success-text" : ""}>{value}</strong><small>{detail}</small></article>;
}

function Insight({ title, detail, status }: { title: string; detail: string; status: string }) {
  return <article className="insight-row"><div className="insight-icon"><CircleAlert size={16} /></div><div><strong>{title}</strong><span>{detail}</span></div><button className="button button-quiet">{status} <ChevronRight size={14} /></button></article>;
}

function StorageRow({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="storage-row"><span className="storage-icon">{icon}</span><div><strong>{label}</strong><span>{detail}</span></div><b>{value}</b></div>;
}
