export function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ShellNav = "radar" | "verify";

export function sharedStyles(): string {
  return `
    :root {
      color-scheme: dark;
      --bg: #0b0f14;
      --panel: #121a24;
      --line: #1e2a3a;
      --text: #e8eef6;
      --muted: #8b9bb0;
      --accent: #00d4aa;
      --accent-dim: #00d4aa22;
      --ok: #3ddc84;
      --warn: #e8b84a;
      --bad: #ff6b6b;
      --chip: #1a2433;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;
      background:
        radial-gradient(900px 420px at 8% -8%, #00d4aa18, transparent),
        radial-gradient(700px 380px at 92% 0%, #1e3a5f33, transparent),
        var(--bg);
      color: var(--text);
      line-height: 1.55;
      min-height: 100vh;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .top {
      border-bottom: 1px solid var(--line);
      background: #0b0f14cc;
      backdrop-filter: blur(8px);
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .top-inner {
      max-width: 1100px;
      margin: 0 auto;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: var(--text);
      text-decoration: none;
    }
    .brand:hover { text-decoration: none; }
    .dot {
      width: 10px; height: 10px; border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 14px var(--accent);
    }
    nav { display: flex; gap: 6px; }
    nav a {
      color: var(--muted);
      padding: 8px 14px;
      border-radius: 10px;
      font-weight: 600;
      text-decoration: none;
    }
    nav a:hover { color: var(--text); background: var(--chip); text-decoration: none; }
    nav a.active {
      color: var(--bg);
      background: var(--accent);
    }
    .top-meta { color: var(--muted); font-size: 0.85rem; }
    main { max-width: 1100px; margin: 0 auto; padding: 28px 20px 40px; }
    .hero h1 { font-size: 1.7rem; margin: 0 0 8px; letter-spacing: -0.02em; }
    .hero .sub { color: var(--muted); max-width: 640px; margin: 0; }
    .stats {
      display: flex; flex-wrap: wrap; gap: 10px;
      margin: 20px 0 8px;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 14px;
      min-width: 110px;
    }
    .stat b { display: block; font-size: 1.2rem; color: var(--accent); }
    .stat span { color: var(--muted); font-size: 0.82rem; }
    section { margin-top: 28px; }
    h2 { font-size: 1.1rem; margin: 0 0 12px; }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0 4px; align-items: center; }
    .filter-chip, .model-chip, .family-chip, .latest-chip, .popular-chip {
      border: 1px solid var(--line);
      background: var(--chip);
      color: var(--muted);
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .filter-chip.active, .model-chip.active, .family-chip.active, .latest-chip.active, .popular-chip.active {
      color: var(--bg);
      background: var(--accent);
      border-color: var(--accent);
    }
    .picker-block { margin-bottom: 14px; }
    .picker-label {
      display: block;
      font-size: 0.8rem;
      color: var(--muted);
      margin: 0 0 8px;
      letter-spacing: 0.02em;
    }
    .picker-block .filters { margin: 0; }
    .family-chip.active {
      color: var(--accent);
      background: var(--accent-dim);
      border-color: #00d4aa66;
    }
    .combo-wrap {
      position: relative;
      display: flex;
      gap: 0;
      align-items: stretch;
    }
    .combo-wrap input {
      border-radius: 10px 0 0 10px;
      flex: 1;
    }
    .combo-toggle {
      border: 1px solid var(--line);
      border-left: none;
      border-radius: 0 10px 10px 0;
      background: var(--chip);
      color: var(--muted);
      padding: 0 14px;
      cursor: pointer;
      font-size: 0.85rem;
    }
    .combo-toggle:hover { color: var(--text); background: #243044; }
    .combo-menu {
      position: absolute;
      left: 0; right: 0; top: calc(100% + 4px);
      max-height: 240px;
      overflow: auto;
      background: #0d1520;
      border: 1px solid var(--line);
      border-radius: 10px;
      z-index: 30;
      display: none;
      margin: 0; padding: 6px;
      list-style: none;
    }
    .combo-menu.open { display: block; }
    .combo-menu li {
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      color: var(--text);
      font-size: 0.9rem;
    }
    .combo-menu li:hover, .combo-menu li.active {
      background: var(--accent-dim);
      color: var(--accent);
    }
    .combo-menu li .mid {
      display: block;
      color: var(--muted);
      font-size: 0.75rem;
    }
    .combo-menu .empty-opt {
      color: var(--muted);
      padding: 10px;
      font-size: 0.85rem;
    }
    .toggle {
      display: inline-flex; align-items: center; gap: 6px;
      color: var(--muted); font-size: 0.85rem; margin-left: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 12px;
    }
    .card {
      background: linear-gradient(180deg, #152033, var(--panel));
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
    }
    .card h3 { margin: 8px 0 6px; font-size: 1rem; }
    .card p { margin: 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .score { font-variant-numeric: tabular-nums; color: var(--accent); font-weight: 700; }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    .tag, .badge {
      font-size: 0.75rem;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid var(--line);
      color: var(--muted);
    }
    .tag.pass, .tag.ok { color: var(--ok); border-color: #3ddc8455; }
    .tag.fail { color: var(--bad); border-color: #ff6b6b55; }
    .tag.unknown, .tag.inconclusive { color: var(--warn); border-color: #e8b84a55; }
    .badge { color: #9ae6d0; border-color: #00d4aa44; background: var(--accent-dim); }
    .meta { color: var(--muted); font-size: 0.85rem; margin: 4px 0; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      border: none; border-radius: 10px;
      padding: 10px 16px;
      font-weight: 700;
      cursor: pointer;
      background: var(--accent);
      color: #06241c;
      font-size: 0.95rem;
    }
    .btn:disabled { opacity: 0.55; cursor: not-allowed; }
    .btn.ghost {
      background: transparent;
      color: var(--accent);
      border: 1px solid #00d4aa55;
    }
    .form {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px;
      max-width: 720px;
    }
    label { display: block; font-size: 0.85rem; color: var(--muted); margin: 12px 0 6px; }
    input[type="text"], input[type="password"] {
      width: 100%;
      background: #0b1220;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      color: var(--text);
      font-size: 0.95rem;
    }
    input:focus { outline: 1px solid #00d4aa66; }
    .hint { color: var(--muted); font-size: 0.8rem; margin-top: 6px; }
    .result {
      margin-top: 18px;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      background: #0d1520;
      display: none;
    }
    .result.show { display: block; }
    .result.pass, .result.likely_genuine { border-color: #3ddc8455; }
    .result.fail, .result.unreachable, .result.likely_fake { border-color: #ff6b6b55; }
    .result.inconclusive, .result.suspicious { border-color: #e8b84a55; }
    .result h3 { margin: 0 0 8px; }
    .verdict-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 20px 16px 16px;
      margin: 0 0 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: #0b1220;
    }
    .verdict-hero.ok { border-color: #3ddc8488; background: #0f1a14; }
    .verdict-hero.warn { border-color: #e8b84a88; background: #1a160c; }
    .verdict-hero.bad { border-color: #ff6b6b88; background: #1a1010; }
    .verdict-hero.mute { border-color: #5a6a8088; }
    .verdict-glyph {
      font-size: 2.4rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .verdict-hero.ok .verdict-glyph { color: var(--ok); }
    .verdict-hero.warn .verdict-glyph { color: var(--warn); }
    .verdict-hero.bad .verdict-glyph { color: var(--bad); }
    .verdict-hero.mute .verdict-glyph { color: var(--muted); }
    .verdict-pct {
      margin-top: 8px;
      font-size: 2.25rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      letter-spacing: -0.03em;
    }
    .verdict-hero.ok .verdict-pct { color: var(--ok); }
    .verdict-hero.warn .verdict-pct { color: var(--warn); }
    .verdict-hero.bad .verdict-pct { color: var(--bad); }
    .verdict-hero.mute .verdict-pct { color: var(--muted); }
    .verdict-unit {
      margin-top: 6px;
      font-size: 0.8rem;
      color: var(--muted);
      letter-spacing: 0.04em;
    }
    .verdict-label {
      margin-top: 10px;
      font-size: 1.05rem;
      font-weight: 700;
    }
    .dims { display: grid; gap: 8px; margin: 12px 0; }
    .dim {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 10px;
      background: #0b1220;
    }
    .dim .dim-top {
      display: flex; justify-content: space-between; gap: 8px; align-items: center;
      font-size: 0.85rem; font-weight: 600;
    }
    .dim .dim-sum { color: var(--muted); font-size: 0.8rem; margin-top: 4px; }
    .dim .dim-ev {
      margin-top: 6px;
      font-size: 0.75rem;
      color: #8b9bb4;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .dim-st { font-size: 0.75rem; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
    .dim-st.pass { color: var(--ok); border-color: #3ddc8455; }
    .dim-st.fail { color: var(--bad); border-color: #ff6b6b55; }
    .dim-st.weak, .dim-st.skip { color: var(--warn); border-color: #e8b84a55; }
    .evidence {
      margin: 14px 0 8px;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      background: #0b1220;
    }
    .evidence h4 { margin: 0 0 8px; font-size: 0.9rem; }
    .score-row {
      display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
    }
    .score-num {
      font-size: 1.6rem; font-weight: 700; color: var(--accent);
      font-variant-numeric: tabular-nums; min-width: 3.2rem;
    }
    .score-bar {
      flex: 1; height: 8px; border-radius: 999px; background: #1a2433; overflow: hidden;
    }
    .score-bar > i {
      display: block; height: 100%; background: var(--accent);
    }
    .score-table {
      width: 100%; border-collapse: collapse; font-size: 0.78rem;
    }
    .score-table th, .score-table td {
      text-align: left; padding: 4px 6px; border-bottom: 1px solid #1a2433;
    }
    .score-table th { color: var(--muted); font-weight: 500; }
    .suite-ids { color: var(--muted); font-size: 0.75rem; margin-top: 8px; word-break: break-all; }
    .probe-panel {
      margin-top: 16px;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      background: #0d1520;
      display: none;
    }
    .probe-panel.show { display: block; }
    .probe-head {
      display: flex; justify-content: space-between; align-items: center;
      gap: 10px; margin-bottom: 10px;
    }
    .probe-head strong { font-size: 0.95rem; }
    .probe-pct { color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 700; }
    .probe-bar {
      height: 6px; border-radius: 999px; background: #1a2433; overflow: hidden; margin-bottom: 12px;
    }
    .probe-bar > i {
      display: block; height: 100%; width: 0%;
      background: var(--accent);
      transition: width 0.35s ease;
    }
    .probe-steps { list-style: none; margin: 0; padding: 0; }
    .probe-steps li {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 8px 0; border-bottom: 1px solid #1a2433;
      font-size: 0.88rem; color: var(--muted);
    }
    .probe-steps li:last-child { border-bottom: none; }
    .probe-steps li.run { color: var(--text); }
    .probe-steps li.ok { color: var(--ok); }
    .probe-steps li.bad { color: var(--bad); }
    .probe-steps li.weak { color: var(--warn); }
    .probe-dot {
      width: 10px; height: 10px; border-radius: 999px; margin-top: 5px;
      background: #334155; flex-shrink: 0;
    }
    .probe-steps li.run .probe-dot { background: var(--accent); box-shadow: 0 0 8px var(--accent); }
    .probe-steps li.ok .probe-dot { background: var(--ok); }
    .probe-steps li.bad .probe-dot { background: var(--bad); }
    .probe-steps li.weak .probe-dot { background: var(--warn); }
    .probe-note { color: var(--muted); font-size: 0.8rem; margin-top: 10px; }
    .probe-details { margin-top: 8px; }
    .probe-details > summary {
      cursor: pointer;
      color: var(--accent);
      font-size: 0.85rem;
      list-style: none;
    }
    .probe-details > summary::-webkit-details-marker { display: none; }
    .share-panel {
      margin-top: 14px;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 12px;
      background: #0b1220;
      display: none;
    }
    .share-panel.show { display: block; }
    .share-panel h4 { margin: 0 0 8px; font-size: 0.9rem; }
    .share-url {
      font-size: 0.78rem;
      color: var(--muted);
      word-break: break-all;
      margin: 0 0 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .share-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .share-actions .btn, .share-actions .btn-ghost {
      flex: 1;
      min-width: 120px;
      text-align: center;
      text-decoration: none;
    }
    .btn-ghost {
      display: inline-block;
      background: transparent;
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 16px;
      font-weight: 600;
      cursor: pointer;
      font: inherit;
    }
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent); text-decoration: none; }
    .mode-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
    .mode-row label { margin: 0; color: var(--text); font-size: 0.9rem; display: inline-flex; align-items: center; gap: 6px; }
    pre {
      background: #070b12;
      border-radius: 10px;
      padding: 10px;
      overflow: auto;
      font-size: 0.78rem;
      color: #cbd5e1;
      max-height: 220px;
    }
    details { margin-top: 10px; color: var(--muted); font-size: 0.85rem; }
    footer.page-foot {
      max-width: 1100px;
      margin: 0 auto;
      padding: 0 20px 36px;
      color: var(--muted);
      font-size: 0.82rem;
    }
    .empty { color: var(--muted); padding: 12px 0; }
    .provider-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    .provider-table th, .provider-table td {
      text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line);
    }
    .provider-table th { color: var(--muted); font-weight: 600; }
    .catalog-toc {
      display: flex; flex-wrap: wrap; gap: 8px;
      margin: 0;
    }
    .catalog-toc a, .catalog-tab {
      border: 1px solid var(--line);
      background: var(--chip);
      color: var(--muted);
      padding: 8px 14px;
      border-radius: 999px;
      font-weight: 600;
      text-decoration: none;
      font: inherit;
      cursor: pointer;
    }
    .catalog-toc a:hover, .catalog-toc a.active,
    .catalog-tab:hover, .catalog-tab.active {
      color: var(--bg);
      background: var(--accent);
      border-color: transparent;
      text-decoration: none;
    }
    .module-block { margin-top: 28px; }
    .module-block.hidden { display: none; }
    .catalog-panel { margin-top: 14px; }
    .catalog-hero h1 { font-size: 1.45rem; margin-bottom: 4px; }
    .catalog-hero .sub { font-size: 0.9rem; }
    .catalog-hero-top {
      display: flex; flex-wrap: wrap; align-items: flex-start;
      justify-content: space-between; gap: 12px 16px;
      margin-bottom: 4px;
    }
    .catalog-hero-top .sub { margin: 0; max-width: 520px; }
    .catalog-source-btn {
      flex-shrink: 0;
      padding: 8px 14px;
      font-size: 0.85rem;
    }
    .catalog-dialog {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      color: var(--text);
      padding: 0;
      max-width: min(640px, calc(100vw - 32px));
      width: 100%;
      box-shadow: 0 20px 50px #0008;
    }
    .catalog-dialog::backdrop {
      background: #000a;
    }
    .catalog-dialog-inner { margin: 0; }
    .catalog-dialog-head {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 16px 18px 10px;
      border-bottom: 1px solid var(--line);
    }
    .catalog-dialog-head h2 { margin: 0; font-size: 1.05rem; }
    .catalog-dialog-close {
      border: none; background: transparent; color: var(--muted);
      font-size: 1.4rem; line-height: 1; cursor: pointer; padding: 4px 8px;
    }
    .catalog-dialog-close:hover { color: var(--text); }
    .catalog-dialog-body {
      padding: 14px 18px 8px;
      max-height: min(60vh, 480px);
      overflow: auto;
      font-size: 0.9rem;
    }
    .catalog-dialog-body h3 {
      margin: 14px 0 6px; font-size: 0.92rem; color: var(--accent);
    }
    .catalog-dialog-body h3:first-child { margin-top: 0; }
    .catalog-dialog-body p { margin: 0 0 8px; color: #c5d0de; }
    .catalog-dialog-body ul, .catalog-dialog-body ol {
      margin: 0 0 8px; padding-left: 1.2em; color: #c5d0de;
    }
    .catalog-dialog-body li { margin: 4px 0; }
    .catalog-dialog-body code {
      font-size: 0.82em; background: #0b1220; padding: 1px 6px; border-radius: 6px;
    }
    .catalog-dialog-foot {
      padding: 10px 18px 16px;
      display: flex; justify-content: flex-end;
      border-top: 1px solid var(--line);
    }
    .linkish {
      border: none; background: none; color: var(--accent);
      font: inherit; font-size: inherit; cursor: pointer; padding: 0;
      text-decoration: underline;
    }
    .catalog-models { margin-bottom: 4px; }
    .catalog-models .filters { max-height: 72px; overflow: auto; }
    .platform-head {
      display: flex; flex-wrap: wrap; align-items: center;
      justify-content: space-between; gap: 10px 16px;
      margin: 12px 0 10px;
    }
    .platform-head-left { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 12px; }
    .platform-head h2 { margin: 0; font-size: 1.05rem; }
    .catalog-search input {
      width: min(280px, 100%);
      background: #0b1220;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 12px;
      color: var(--text);
      font-size: 0.88rem;
    }
    .catalog-search input:focus { outline: 1px solid #00d4aa66; }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
      overflow: hidden; clip: rect(0,0,0,0); border: 0;
    }
    .platform-list { display: grid; gap: 10px; }
    .plat-row {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--panel);
      padding: 14px 16px;
      display: flex;
      justify-content: space-between;
      gap: 14px;
      align-items: center;
      min-height: 56px;
    }
    .plat-main {
      min-width: 0; flex: 1;
      display: flex; flex-direction: column; gap: 6px;
    }
    .plat-top {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px;
    }
    .plat-name {
      font-weight: 650; font-size: 0.95rem;
      white-space: nowrap; flex-shrink: 0;
    }
    .plat-tag {
      font-size: 0.74rem;
      color: #9ae6d0;
      border: 1px solid #00d4aa44;
      background: var(--accent-dim);
      border-radius: 999px;
      padding: 2px 9px;
      flex-shrink: 0;
    }
    .plat-chip {
      font-size: 0.74rem;
      color: var(--muted);
      border: 1px solid var(--line);
      background: #0b1220;
      border-radius: 999px;
      padding: 2px 9px;
      flex-shrink: 0;
    }
    .plat-plan {
      color: var(--text);
      font-size: 0.84rem;
      line-height: 1.4;
      font-variant-numeric: tabular-nums;
    }
    .plat-reason {
      margin: 0;
      color: var(--muted);
      font-size: 0.8rem;
      line-height: 1.45;
    }
    .plat-actions {
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    }
    .plat-link {
      color: var(--accent);
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
    }
    .plat-link:hover { text-decoration: underline; }
    .pager {
      display: flex; align-items: center; justify-content: center;
      gap: 14px; margin-top: 12px;
    }
    .pager-btn {
      border: 1px solid var(--line);
      background: var(--chip);
      color: var(--text);
      border-radius: 8px;
      padding: 6px 12px;
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }
    .pager-btn:disabled {
      opacity: 0.4; cursor: not-allowed;
    }
    .pager-btn:not(:disabled):hover {
      border-color: var(--accent); color: var(--accent);
    }
    .pager-info { color: var(--muted); font-size: 0.85rem; font-variant-numeric: tabular-nums; }
    .catalog-foot { margin: 16px 0 0; font-size: 0.78rem; }

    .badge {
      font-size: 0.72rem;
      border-radius: 999px;
      padding: 2px 8px;
      border: 1px solid #00d4aa44;
      color: var(--accent);
      background: var(--accent-dim);
    }
    .model-list { display: grid; gap: 10px; }
    .model-row {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--panel);
      padding: 14px 16px;
      display: grid;
      grid-template-columns: minmax(140px, 200px) 1fr auto;
      gap: 12px 16px;
      align-items: start;
    }
    .model-row .model-name {
      font-weight: 700;
      font-size: 0.98rem;
    }
    .merchant-list {
      display: flex; flex-wrap: wrap; gap: 8px;
      align-items: center;
      min-height: 32px;
    }
    .merchant-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--line);
      background: #0b1220;
      color: var(--text);
      border-radius: 999px;
      padding: 5px 11px;
      font-size: 0.82rem;
      text-decoration: none;
    }
    .merchant-chip:hover {
      border-color: var(--accent);
      color: var(--accent);
      text-decoration: none;
    }
    .merchant-chip .note { color: var(--muted); font-size: 0.75rem; }
    .merchant-empty {
      color: var(--muted);
      font-size: 0.84rem;
    }
    .model-actions {
      display: flex; flex-wrap: wrap; gap: 8px;
      justify-content: flex-end;
      align-items: center;
    }
    .verify-link {
      color: var(--muted);
      font-size: 0.78rem;
      text-decoration: none;
      padding: 2px 0;
      white-space: nowrap;
    }
    .verify-link:hover {
      color: var(--accent);
      text-decoration: underline;
    }
    @media (max-width: 720px) {
      .provider-table .hide-sm { display: none; }
      .model-row, .plat-row {
        grid-template-columns: 1fr;
        flex-wrap: wrap;
      }
      .plat-main { flex-wrap: wrap; }
      .catalog-search input { width: 100%; }
      .model-actions, .plat-actions { justify-content: flex-start; }
    }
  `;
}

export function renderShell(opts: {
  nav: ShellNav;
  title: string;
  updatedLabel?: string;
  body: string;
  scripts?: string;
  /** 额外 head（如 OG meta） */
  extraHead?: string;
  description?: string;
}): string {
  const radarActive = opts.nav === "radar" ? "active" : "";
  const verifyActive = opts.nav === "verify" ? "active" : "";
  const desc = esc(opts.description || `${opts.title} · API 雷达`);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(opts.title)} · API 雷达</title>
  <meta name="description" content="${desc}" />
  ${opts.extraHead ?? ""}
  <style>${sharedStyles()}</style>
</head>
<body>
  <div class="top">
    <div class="top-inner">
      <a class="brand" href="/radar"><span class="dot"></span> API 雷达</a>
      <nav>
        <a class="${radarActive}" href="/radar">目录</a>
        <a class="${verifyActive}" href="/verify">检测</a>
      </nav>
      <div class="top-meta">${esc(opts.updatedLabel ?? "")}</div>
    </div>
  </div>
  <main>
    ${opts.body}
  </main>
  <footer class="page-foot">
    第三方信息导航 · 非官方认证 · 检测结论仅供参考 ·
    <a href="/api/v1/meta">meta</a> ·
    <a href="/health">health</a>
  </footer>
  ${opts.scripts ?? ""}
</body>
</html>`;
}
