import type { ProbeReportSnapshot } from "./probe-report-snapshot.js";
import { authenticityHero, overallView, statusMark } from "./probe-report-labels.js";
import { esc, renderShell } from "./shell.js";

export { authenticityHero, overallView, statusMark } from "./probe-report-labels.js";
export type { OverallLabel as OverallView } from "./probe-report-labels.js";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function reportPageStyles(): string {
  return `
    .report-wrap { max-width: 560px; margin: 0 auto; }
    .report-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
      padding: 20px 18px 16px;
    }
    .report-card h1 {
      margin: 0 0 14px;
      font-size: 1.15rem;
      letter-spacing: -0.01em;
    }
    .report-meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
      font-size: 0.86rem;
      margin-bottom: 18px;
    }
    .report-meta .k { color: var(--muted); }
    .report-meta .v { color: var(--text); word-break: break-all; }
    .report-center {
      text-align: center;
      padding: 8px 0 18px;
    }
    .report-ring {
      width: 148px; height: 148px;
      margin: 0 auto 12px;
      border-radius: 999px;
      border: 3px solid var(--line);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 2px;
      background: #0b1220;
    }
    .report-ring.ok { border-color: #3ddc8488; box-shadow: 0 0 24px #3ddc8422; }
    .report-ring.warn { border-color: #e8b84a88; box-shadow: 0 0 24px #e8b84a22; }
    .report-ring.bad { border-color: #ff6b6b88; box-shadow: 0 0 24px #ff6b6b22; }
    .report-ring.mute { border-color: #5a6a8088; }
    .report-ring .glyph {
      font-size: 1.85rem; font-weight: 700; line-height: 1;
      color: var(--muted);
    }
    .report-ring.ok .glyph { color: var(--ok); }
    .report-ring.warn .glyph { color: var(--warn); }
    .report-ring.bad .glyph { color: var(--bad); }
    .report-ring .pct {
      font-size: 1.55rem; font-weight: 750; line-height: 1.1;
      letter-spacing: -0.03em;
      font-variant-numeric: tabular-nums;
    }
    .report-ring.ok .pct { color: var(--ok); }
    .report-ring.warn .pct { color: var(--warn); }
    .report-ring.bad .pct { color: var(--bad); }
    .report-ring.mute .pct { color: var(--muted); }
    .report-ring .pct-unit {
      font-size: 0.72rem; font-weight: 500; color: var(--muted); margin-top: 2px;
    }
    .report-ring .ring-label {
      font-size: 0.95rem; font-weight: 650;
      padding: 0 10px; margin-top: 4px;
    }
    .report-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      font-size: 0.8rem;
      color: var(--muted);
    }
    .report-badge.ok { color: var(--ok); border-color: #3ddc8455; }
    .report-badge.warn { color: var(--warn); border-color: #e8b84a55; }
    .report-badge.bad { color: var(--bad); border-color: #ff6b6b55; }
    .report-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.88rem;
      margin: 4px 0 12px;
    }
    .report-table th, .report-table td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid #1a2433;
    }
    .report-table th { color: var(--muted); font-weight: 500; }
    .report-table td.mark {
      text-align: center;
      width: 3.2rem;
      font-weight: 700;
      font-size: 1.05rem;
    }
    .report-table td.mark.ok { color: var(--ok); }
    .report-table td.mark.weak { color: var(--warn); }
    .report-table td.mark.bad { color: var(--bad); }
    .report-table td.mark.skip { color: var(--muted); }
    .report-note {
      font-size: 0.8rem;
      color: var(--muted);
      line-height: 1.5;
      margin: 0 0 4px;
      white-space: pre-wrap;
    }
    .report-extra {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #1a2433;
      font-size: 0.75rem;
      color: var(--muted);
    }
    .report-extra pre {
      margin: 6px 0 0;
      padding: 8px;
      background: #0b1220;
      border-radius: 8px;
      overflow: auto;
      max-height: 160px;
      white-space: pre-wrap;
      word-break: break-word;
      color: #8b9bb4;
    }
    .report-actions {
      display: flex; flex-wrap: wrap; gap: 10px;
      margin-top: 16px;
    }
    .report-actions .btn, .report-actions .btn-ghost {
      flex: 1;
      min-width: 140px;
      text-align: center;
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
    .btn-ghost:hover { border-color: var(--accent); color: var(--accent); }
    .report-empty {
      text-align: center;
      padding: 48px 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--panel);
    }
    .report-empty h1 { margin: 0 0 8px; font-size: 1.2rem; }
    .report-empty p { color: var(--muted); margin: 0 0 16px; }
    @media (max-width: 520px) {
      .report-meta { grid-template-columns: 1fr; }
    }
  `;
}

export function renderReportMissingPage(kind: "not_found" | "expired"): string {
  const title = kind === "expired" ? "报告已过期" : "报告不存在";
  const msg =
    kind === "expired"
      ? "该检测报告已超过保留期限（默认 14 天），无法继续查看。"
      : "未找到对应的检测报告，链接可能无效或已被清理。";
  const body = `
    <style>${reportPageStyles()}</style>
    <div class="report-wrap">
      <div class="report-empty">
        <h1>${esc(title)}</h1>
        <p>${esc(msg)}</p>
        <a class="btn" href="/verify">去检测页</a>
      </div>
    </div>`;
  return renderShell({
    nav: "verify",
    title,
    updatedLabel: "公开报告",
    body,
  });
}

export function renderReportPage(opts: {
  id: string;
  snapshot: ProbeReportSnapshot;
  shareUrl: string;
}): string {
  const s = opts.snapshot;
  const ov = overallView(s.overall);
  const hero = authenticityHero(s.overall, s.score);
  const modelCol = s.requestedModel || "—";
  const dims = (s.dimensions || []).filter((d) => d.id !== "summary");
  const rows = dims
    .map((d) => {
      const m = statusMark(d.status);
      return `<tr>
        <td>${esc(d.title || d.id)}</td>
        <td class="mark ${m.cls}" title="${esc(d.summary || d.status)}">${m.mark}</td>
      </tr>`;
    })
    .join("");

  const scoreTxt =
    s.score != null ? `<div class="k">综合分</div><div class="v">${esc(String(s.score))}</div>` : "";

  const suiteBlock =
    Array.isArray(s.suiteIds) && s.suiteIds.length
      ? `<div class="report-extra"><div>抽题 ID</div><div>${esc(s.suiteIds.join(", "))}</div></div>`
      : "";
  const previewBlock =
    s.rawPreviewSnippet
      ? `<div class="report-extra"><div>响应预览（已脱敏）</div><pre>${esc(s.rawPreviewSnippet)}</pre></div>`
      : "";

  const pctBlock =
    hero.probability == null
      ? `<div class="pct">—</div><div class="pct-unit">真货概率</div>`
      : `<div class="pct">${hero.probability}%</div><div class="pct-unit">真货概率</div>`;

  const desc = `${ov.ring}${hero.probability != null ? ` ${hero.probability}%` : ""} · ${s.requestedModel} @ ${s.testedHost}`;
  const ogTitle = `模型检测报告 · ${s.requestedModel}`;
  const extraHead = `
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(ogTitle)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(opts.shareUrl)}" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(ogTitle)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <link rel="canonical" href="${esc(opts.shareUrl)}" />`;

  const body = `
    <style>${reportPageStyles()}</style>
    <div class="report-wrap">
      <div class="report-card" id="reportCard">
        <h1>模型检测报告</h1>
        <div class="report-meta">
          <div><div class="k">被检方</div><div class="v">${esc(s.testedHost)}</div></div>
          <div><div class="k">检测方</div><div class="v">${esc(s.testerLabel || "api-radar")}</div></div>
          <div><div class="k">检测模型</div><div class="v">${esc(s.requestedModel)}</div></div>
          <div><div class="k">检测时间</div><div class="v">${esc(formatTime(s.testedAt))}</div></div>
          ${scoreTxt}
          <div><div class="k">模式</div><div class="v">${esc(s.mode)}</div></div>
        </div>
        <div class="report-center">
          <div class="report-ring ${ov.tone}">
            <div class="glyph">${hero.glyph}</div>
            ${pctBlock}
            <div class="ring-label">${esc(ov.ring)}</div>
          </div>
          <span class="report-badge ${ov.tone}">${esc(ov.badge)}</span>
        </div>
        <table class="report-table">
          <thead>
            <tr><th>检测项</th><th style="text-align:center">${esc(modelCol)}</th></tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="2" style="color:var(--muted)">暂无分项</td></tr>`}
          </tbody>
        </table>
        <p class="report-note">${esc(s.message || "")}</p>
        ${suiteBlock}
        ${previewBlock}
      </div>
      <div class="report-actions">
        <button type="button" class="btn" id="shareBtn">分享</button>
        <button type="button" class="btn-ghost" id="copyBtn">复制报告地址</button>
      </div>
      <p class="meta" style="margin-top:12px;text-align:center" id="copyHint"></p>
      <p class="meta" style="margin-top:8px;text-align:center">
        <a href="/verify">自行再测</a>
        · probe ${esc(s.probeVersion)}
        · 报告 ${esc(opts.id)}
      </p>
    </div>`;

  const scripts = `
    <script>
      (function () {
        var url = ${JSON.stringify(opts.shareUrl)};
        var hint = document.getElementById('copyHint');
        function flash(msg) {
          if (!hint) return;
          hint.textContent = msg;
          setTimeout(function () { hint.textContent = ''; }, 2200);
        }
        async function copy() {
          try {
            await navigator.clipboard.writeText(url);
            flash('已复制报告地址');
          } catch (e) {
            flash(url);
          }
        }
        document.getElementById('copyBtn').addEventListener('click', copy);
        document.getElementById('shareBtn').addEventListener('click', async function () {
          if (navigator.share) {
            try {
              await navigator.share({ title: ${JSON.stringify(ogTitle)}, text: ${JSON.stringify(desc)}, url: url });
              return;
            } catch (e) { /* fallthrough */ }
          }
          copy();
        });
      })();
    </script>`;

  return renderShell({
    nav: "verify",
    title: "模型检测报告",
    updatedLabel: `${s.testedHost} · ${s.requestedModel}`,
    description: desc,
    extraHead,
    body,
    scripts,
  });
}
