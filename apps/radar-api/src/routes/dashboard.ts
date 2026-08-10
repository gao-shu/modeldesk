import type { FastifyInstance } from "fastify";
import type { AppDb } from "../db/client.js";
import { CATALOG_MODULES } from "../data/catalog.js";
import {
  DEFAULT_VERIFY_MODEL_ID,
  VERIFY_FAMILY_LABELS,
  VERIFY_FAMILY_ORDER,
  VERIFY_MODELS,
} from "../data/verify-models.js";
import { labelsForClient } from "../lib/probe-report-labels.js";
import { esc, renderShell } from "../lib/shell.js";

export async function registerDashboardRoutes(
  app: FastifyInstance,
  _db: AppDb,
) {
  app.get("/", async (_req, reply) => {
    reply.redirect("/radar");
  });

  app.get("/radar", async (_req, reply) => {
    const tabs = [
      `<button type="button" class="catalog-tab active" data-mod="all" role="tab" aria-selected="true">全部</button>`,
      ...CATALOG_MODULES.map(
        (m) =>
          `<button type="button" class="catalog-tab" data-mod="${esc(m.id)}" role="tab" aria-selected="false">${esc(m.title)}</button>`,
      ),
    ].join("\n");

    const catalogJson = JSON.stringify(CATALOG_MODULES).replace(/</g, "\\u003c");

    const body = `
    <div class="hero catalog-hero">
      <div class="catalog-hero-top">
        <div>
          <h1>高性价比 API 中转站</h1>
          <p class="sub">选模块 → 选模型 → 找便宜平台。可搜索；「检测」验证 Key。</p>
        </div>
        <button type="button" class="btn ghost catalog-source-btn" id="openSourceDlg">来源及入选方式</button>
      </div>
    </div>

    <dialog class="catalog-dialog" id="sourceDialog">
      <form method="dialog" class="catalog-dialog-inner">
        <header class="catalog-dialog-head">
          <h2>来源及入选方式</h2>
          <button type="submit" class="catalog-dialog-close" value="close" aria-label="关闭">×</button>
        </header>
        <div class="catalog-dialog-body">
          <h3>我们收录什么</h3>
          <p>第三方 API 中转 / 聚合站：能用常见模型（GPT、Claude、Gemini、Flux 等），价格相对官方更便宜，或有可用额度。</p>

          <h3>入选标准（需尽量满足）</h3>
          <ul>
            <li><strong>可访问</strong>：官网能打开，有充值/Key/文档说明</li>
            <li><strong>可实测</strong>：用本站「检测」填 Base URL + Key，至少握手/调用能通</li>
            <li><strong>价有优势</strong>：同模型单价低于官方，或有注册送额 / 低起充</li>
            <li><strong>信息可核对</strong>：公开价目或社区近期反馈，避免纯广告站</li>
            <li><strong>风险可控</strong>：疑似跑路、假免费、盗刷投诉集中的不收</li>
          </ul>

          <h3>主要寻找途径</h3>
          <ul>
            <li><strong>GitHub</strong>：搜 <code>one-api</code> / <code>new-api</code> / <code>openai proxy</code> / <code>api relay</code>，看 README、Issues、自建部署讨论里提到的公开站</li>
            <li><strong>Telegram / Discord</strong>：API 中转、ChatGPT、Claude、Stable Diffusion 交流群；关注置顶价目与用户实测</li>
            <li><strong>国内社区</strong>：V2EX、即刻、小红书、贴吧等搜「API 中转」「便宜 GPT」「claude api」</li>
            <li><strong>Reddit / 海外论坛</strong>：r/ChatGPT、r/LocalLLaMA、r/StableDiffusion 等里的 provider 推荐帖</li>
            <li><strong>竞品导航站</strong>：同类「API 导航 / 模型比价」站点，交叉验证后再收录</li>
            <li><strong>官网与文档</strong>：OpenAI / Anthropic / Google / DeepSeek 等官方渠道作价格对照基线</li>
            <li><strong>用户投稿</strong>：后续可开放提交链接，人工抽检后再上架</li>
          </ul>

          <h3>上架流程（建议）</h3>
          <ol>
            <li>收集候选站 → 记官网、支持模型、标价</li>
            <li>本站「检测」跑通关键模型</li>
            <li>写清入选原因（为什么便宜 / 稳定）</li>
            <li>写入 <code>server/src/data/catalog.ts</code> 对应模型的 merchants</li>
          </ol>

          <p class="hint">免责声明：本站为第三方信息导航，非官方认证；价格与可用性随时变化，请自行核实后再充值。</p>
        </div>
        <footer class="catalog-dialog-foot">
          <button type="submit" class="btn" value="ok">知道了</button>
        </footer>
      </form>
    </dialog>

    <section class="catalog-panel">
      <div class="picker-block">
        <span class="picker-label">模块分类</span>
        <div class="catalog-toc" id="catalogTabs" role="tablist">${tabs}</div>
      </div>
      <div class="picker-block catalog-models">
        <span class="picker-label">热门模型</span>
        <div class="filters" id="modelChips"></div>
      </div>

      <div class="platform-head">
        <div class="platform-head-left">
          <h2>便宜平台</h2>
          <p class="meta" id="platformMeta"></p>
        </div>
        <label class="catalog-search">
          <span class="sr-only">搜索平台</span>
          <input type="search" id="catalogSearch" placeholder="搜索平台 / 模型 / 原因" autocomplete="off" />
        </label>
      </div>
      <div class="platform-list" id="platformList"></div>
      <div class="pager" id="platformPager" hidden>
        <button type="button" class="pager-btn" id="pagerPrev">上一页</button>
        <span class="pager-info" id="pagerInfo"></span>
        <button type="button" class="pager-btn" id="pagerNext">下一页</button>
      </div>
    </section>

    <p class="meta catalog-foot">渠道：catalog.ts · DEMO 数据 · <button type="button" class="linkish" id="openSourceDlgFoot">来源及入选方式</button></p>
    <script type="application/json" id="catalogData">${catalogJson}</script>`;

    const scripts = `
    <script>
      (function () {
        const PAGE_SIZE = 10;
        const modules = JSON.parse(document.getElementById('catalogData').textContent);
        const tabs = [...document.querySelectorAll('#catalogTabs .catalog-tab')];
        const chipBox = document.getElementById('modelChips');
        const listEl = document.getElementById('platformList');
        const metaEl = document.getElementById('platformMeta');
        const pagerEl = document.getElementById('platformPager');
        const pagerInfo = document.getElementById('pagerInfo');
        const prevBtn = document.getElementById('pagerPrev');
        const nextBtn = document.getElementById('pagerNext');
        const searchEl = document.getElementById('catalogSearch');
        const validMod = new Set(['all', ...modules.map((m) => m.id)]);

        let modId = 'all';
        let modelId = 'all';
        let page = 1;
        let query = '';
        let pageSize = PAGE_SIZE;

        function esc(s) {
          return String(s ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        }

        function visibleModels() {
          if (modId === 'all') {
            return modules.flatMap((mod) =>
              mod.models.map((m) => ({ ...m, moduleId: mod.id, moduleTitle: mod.title })),
            );
          }
          const mod = modules.find((m) => m.id === modId);
          if (!mod) return [];
          return mod.models.map((m) => ({ ...m, moduleId: mod.id, moduleTitle: mod.title }));
        }

        function flatPlatforms() {
          const rows = [];
          for (const mod of modules) {
            if (modId !== 'all' && mod.id !== modId) continue;
            for (const model of mod.models) {
              if (modelId !== 'all' && model.id !== modelId) continue;
              for (const mer of model.merchants || []) {
                const planParts = [
                  mer.plan?.price,
                  mer.plan?.quota,
                  mer.plan?.daily,
                  mer.plan?.concurrency,
                ].filter(Boolean);
                rows.push({
                  name: mer.name,
                  url: mer.url,
                  note: mer.note || '',
                  reason: mer.reason || '同档更便宜',
                  planText: planParts.join(' · '),
                  moduleId: mod.id,
                  moduleTitle: mod.title,
                  modelId: model.id,
                  modelName: model.name,
                  verifyModelId: model.verifyModelId || '',
                });
              }
            }
          }
          const q = query.trim().toLowerCase();
          if (!q) return rows;
          return rows.filter((r) =>
            [r.name, r.note, r.reason, r.planText, r.moduleTitle, r.modelName]
              .join(' ')
              .toLowerCase()
              .includes(q),
          );
        }

        function setHash() {
          const next = '#' + modId + '/' + modelId;
          if (location.hash !== next) history.replaceState(null, '', next);
        }

        function filterLabel() {
          const modLabel = modId === 'all'
            ? '全部模块'
            : (modules.find((m) => m.id === modId)?.title || '');
          if (modelId === 'all') return modLabel + ' · 全部模型';
          const hit = visibleModels().find((m) => m.id === modelId);
          return modLabel + ' · ' + (hit?.name || modelId);
        }

        function renderChips() {
          const models = visibleModels();
          if (modelId !== 'all' && !models.some((m) => m.id === modelId)) {
            modelId = 'all';
          }
          chipBox.innerHTML = [
            '<button type="button" class="popular-chip' + (modelId === 'all' ? ' active' : '') + '" data-model="all">全部</button>',
            ...models.map((m) => {
              const on = m.id === modelId ? ' active' : '';
              return '<button type="button" class="popular-chip' + on + '" data-model="' + esc(m.id) + '">' + esc(m.name) + '</button>';
            }),
          ].join('');
          chipBox.querySelectorAll('.popular-chip').forEach((btn) => {
            btn.addEventListener('click', () => {
              modelId = btn.dataset.model;
              page = 1;
              render();
            });
          });
        }

        function renderList() {
          pageSize = PAGE_SIZE;
          const rows = flatPlatforms();
          const total = rows.length;
          const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
          if (page > pages) page = pages;
          const start = (page - 1) * pageSize;
          const slice = rows.slice(start, start + pageSize);

          const shown = slice.length;
          metaEl.textContent = filterLabel() +
            ' · 本页 ' + shown + ' 个' +
            ' · 共 ' + total + ' 个' +
            (query.trim() ? '（已筛选）' : '');

          if (!total) {
            listEl.innerHTML = '<p class="empty">' +
              (query.trim() ? '没有匹配的平台，换个关键词试试' : '暂无便宜平台 · 发现后补链接即可') +
              '</p>';
            pagerEl.hidden = true;
            return;
          }

          listEl.innerHTML = slice.map((row) => {
            const note = row.note
              ? '<span class="plat-tag">' + esc(row.note) + '</span>'
              : '';
            const verifyHref = row.verifyModelId
              ? '/verify?model=' + encodeURIComponent(row.verifyModelId)
              : '/verify';
            const plan = row.planText
              ? '<div class="plat-plan">' + esc(row.planText) + '</div>'
              : '';
            const reason = row.reason
              ? '<div class="plat-reason">' + esc(row.reason) + '</div>'
              : '';
            return (
              '<article class="plat-row">' +
                '<div class="plat-main">' +
                  '<div class="plat-top">' +
                    '<span class="plat-name">' + esc(row.name) + '</span>' +
                    note +
                    '<span class="plat-chip">' + esc(row.modelName) + '</span>' +
                  '</div>' +
                  plan +
                  reason +
                '</div>' +
                '<div class="plat-actions">' +
                  '<a class="plat-link" href="' + esc(row.url) + '" target="_blank" rel="noopener noreferrer">打开</a>' +
                  '<a class="verify-link" href="' + esc(verifyHref) + '">检测</a>' +
                '</div>' +
              '</article>'
            );
          }).join('');

          if (total > pageSize) {
            pagerEl.hidden = false;
            pagerInfo.textContent = page + ' / ' + pages;
            prevBtn.disabled = page <= 1;
            nextBtn.disabled = page >= pages;
          } else {
            pagerEl.hidden = true;
          }
        }

        function renderTabs() {
          tabs.forEach((t) => {
            const on = t.dataset.mod === modId;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
          });
        }

        function render() {
          renderTabs();
          renderChips();
          renderList();
          setHash();
        }

        tabs.forEach((t) => {
          t.addEventListener('click', () => {
            modId = t.dataset.mod;
            modelId = 'all';
            page = 1;
            render();
          });
        });
        prevBtn.addEventListener('click', () => {
          if (page > 1) { page -= 1; renderList(); }
        });
        nextBtn.addEventListener('click', () => {
          const total = flatPlatforms().length;
          const pages = Math.max(1, Math.ceil(total / pageSize) || 1);
          if (page < pages) { page += 1; renderList(); }
        });

        let searchTimer = 0;
        searchEl.addEventListener('input', () => {
          clearTimeout(searchTimer);
          searchTimer = setTimeout(() => {
            query = searchEl.value || '';
            page = 1;
            renderList();
          }, 120);
        });

        const raw = (location.hash || '').replace(/^#/, '');
        const parts = raw.split('/');
        if (validMod.has(parts[0])) modId = parts[0];
        if (parts[1]) {
          if (parts[1] === 'all') modelId = 'all';
          else if (visibleModels().some((m) => m.id === parts[1])) modelId = parts[1];
          else modelId = 'all';
        }
        render();

        const dlg = document.getElementById('sourceDialog');
        function openSource() {
          if (typeof dlg.showModal === 'function') dlg.showModal();
          else dlg.setAttribute('open', '');
        }
        document.getElementById('openSourceDlg')?.addEventListener('click', openSource);
        document.getElementById('openSourceDlgFoot')?.addEventListener('click', openSource);
        dlg?.addEventListener('click', (e) => {
          if (e.target === dlg) dlg.close();
        });
      })();
    </script>`;

    reply
      .type("text/html; charset=utf-8")
      .send(
        renderShell({
          nav: "radar",
          title: "目录",
          updatedLabel: "大模型 · 生图 · 生视频 · TTS",
          body,
          scripts,
        }),
      );
  });

  app.get("/verify", async (req, reply) => {
    const q = req.query as Record<string, unknown>;
    const preModel = typeof q.model === "string" ? q.model : "";
    const preBase = typeof q.baseUrl === "string" ? q.baseUrl : "";

    const byId = Object.fromEntries(VERIFY_MODELS.map((m) => [m.id, m]));
    const defaultModel =
      (preModel && (byId[preModel]?.id || preModel)) ||
      DEFAULT_VERIFY_MODEL_ID;
    const defaultFamily =
      byId[defaultModel]?.family ??
      VERIFY_MODELS.find((m) => m.id === defaultModel)?.family ??
      "openai";

    const popularList = VERIFY_MODELS.filter((m) => m.popular);

    const popularChips = popularList
      .map((m) => {
        const active = m.id === defaultModel ? "active" : "";
        return `<button type="button" class="popular-chip ${active}" data-model="${esc(m.id)}" data-family="${esc(m.family)}">${esc(m.name)}</button>`;
      })
      .join("\n");

    const familyChips = VERIFY_FAMILY_ORDER.filter((f) =>
      VERIFY_MODELS.some((m) => m.family === f),
    )
      .map((f) => {
        const active = f === defaultFamily ? "active" : "";
        return `<button type="button" class="family-chip ${active}" data-family="${esc(f)}">${esc(VERIFY_FAMILY_LABELS[f] ?? f)}</button>`;
      })
      .join("\n");

    const modelsJson = JSON.stringify(
      VERIFY_MODELS.map((m) => ({
        id: m.id,
        name: m.name,
        family: m.family,
      })),
    ).replace(/</g, "\\u003c");
    const labelsJson = JSON.stringify(labelsForClient()).replace(
      /</g,
      "\\u003c",
    );

    const body = `
    <div class="hero">
      <h1>测一下你的 Key</h1>
      <p class="sub">通道真假检测：给出最终结论（倾向真货 / 存疑 / 高度可疑 / 无法检测）。官方直连只验可用性；中转站跑掉包鉴真套题。Key 不落库。</p>
    </div>
    <div class="form">
      <div class="picker-block">
        <span class="picker-label">热门模型</span>
        <div class="filters" id="popularChips">${popularChips}</div>
      </div>
      <div class="picker-block">
        <span class="picker-label">厂商</span>
        <div class="filters" id="familyChips">${familyChips}</div>
      </div>
      <label for="baseUrl">请求地址</label>
      <input id="baseUrl" type="text" placeholder="https://api.example.com/v1" value="${esc(preBase)}" autocomplete="off" />
      <p class="hint">填写 OpenAI 兼容 Base URL（通常以 /v1 结尾）</p>
      <label for="apiKey">API Key</label>
      <input id="apiKey" type="password" placeholder="sk-..." autocomplete="off" />
      <p class="hint">Key 不会写入数据库；请勿使用主密钥</p>
      <label for="modelCustom">模型 ID</label>
      <div class="combo-wrap" id="modelCombo">
        <input id="modelCustom" type="text" value="${esc(defaultModel)}" placeholder="选择或输入模型 ID" autocomplete="off" />
        <button type="button" class="combo-toggle" id="modelToggle" aria-label="打开模型列表">▾</button>
        <ul class="combo-menu" id="modelMenu" role="listbox"></ul>
      </div>
      <p class="hint">先选厂商，下拉列出该厂商主流模型；也可直接填写/粘贴中转站模型名</p>
      <div class="mode-row">
        <label><input type="checkbox" id="deepMode" /> 深测（多 1 道计算 + 缓存双请求，更慢更费）</label>
      </div>
      <div class="mode-row">
        <label><input type="checkbox" id="includeSuiteIds" checked /> 报告含抽题 ID</label>
        <label><input type="checkbox" id="includeRawPreview" /> 报告含脱敏响应预览</label>
      </div>
      <div class="actions" style="margin-top:16px">
        <button class="btn" id="startBtn" type="button">开始检测</button>
        <span class="meta" id="statusHint">标准约 30–45 秒 · 深测约 40–60 秒</span>
      </div>
      <div class="probe-panel" id="probePanel">
        <div class="probe-head">
          <strong id="probeTitle">检测进度</strong>
          <span class="probe-pct" id="probePct">0%</span>
        </div>
        <div class="probe-bar"><i id="probeBar"></i></div>
        <details class="probe-details" id="probeDetails" open>
          <summary id="probeDetailsSummary">展开过程明细</summary>
          <ul class="probe-steps" id="probeSteps"></ul>
        </details>
        <p class="probe-note" id="probeNote">检测中，请勿关闭页面…</p>
      </div>
      <div class="result" id="resultBox">
        <div class="verdict-hero" id="verdictHero">
          <div class="verdict-glyph" id="verdictGlyph">—</div>
          <div class="verdict-pct" id="verdictPct">—</div>
          <div class="verdict-unit">真货概率</div>
          <div class="verdict-label" id="verdictLabel"></div>
        </div>
        <p class="meta" id="resultMsg"></p>
        <p class="meta" id="resultMeta"></p>
        <div class="share-panel" id="sharePanel">
          <h4>模型检测报告</h4>
          <p class="share-url" id="shareUrl"></p>
          <div class="share-actions">
            <a class="btn" id="openReportBtn" href="#" target="_blank" rel="noopener">打开报告</a>
            <button type="button" class="btn-ghost" id="shareReportBtn">分享</button>
            <button type="button" class="btn-ghost" id="copyReportBtn">复制报告地址</button>
          </div>
          <p class="meta" id="shareHint" style="margin-top:8px"></p>
        </div>
        <div class="evidence" id="resultEvidence" style="display:none"></div>
        <div class="dims" id="resultDims"></div>
        <details>
          <summary>原始响应预览</summary>
          <pre id="resultRaw"></pre>
        </details>
      </div>
    </div>
    <script type="application/json" id="modelsData">${modelsJson}</script>
    <script type="application/json" id="labelsData">${labelsJson}</script>`;

    const scripts = `
    <script>
      (function () {
        const MODELS = JSON.parse(document.getElementById('modelsData').textContent || '[]');
        const LABELS = JSON.parse(document.getElementById('labelsData').textContent || '{}');
        const OVERALL_LABEL = Object.fromEntries(
          Object.entries(LABELS.overall || {}).map(function (e) { return [e[0], e[1].short]; })
        );
        const ST_LABEL = Object.fromEntries(
          Object.entries(LABELS.status || {}).map(function (e) { return [e[0], e[1].label]; })
        );
        const modelInput = document.getElementById('modelCustom');
        const modelMenu = document.getElementById('modelMenu');
        const modelToggle = document.getElementById('modelToggle');
        const popularChips = [...document.querySelectorAll('#popularChips .popular-chip')];
        const familyChips = [...document.querySelectorAll('#familyChips .family-chip')];
        const allQuick = [...popularChips];
        const baseUrl = document.getElementById('baseUrl');
        const apiKey = document.getElementById('apiKey');
        const startBtn = document.getElementById('startBtn');
        const statusHint = document.getElementById('statusHint');
        const box = document.getElementById('resultBox');
        const verdictHero = document.getElementById('verdictHero');
        const verdictGlyph = document.getElementById('verdictGlyph');
        const verdictPct = document.getElementById('verdictPct');
        const verdictLabel = document.getElementById('verdictLabel');
        const msg = document.getElementById('resultMsg');
        const meta = document.getElementById('resultMeta');
        const raw = document.getElementById('resultRaw');
        let currentFamily = ${JSON.stringify(defaultFamily)};

        function syncQuick(modelId) {
          allQuick.forEach((b) => b.classList.toggle('active', b.dataset.model === modelId));
        }

        function openMenu(opts) {
          const browsing = !!(opts && opts.browsing);
          modelMenu.dataset.browsing = browsing ? '1' : '0';
          modelMenu.classList.add('open');
          renderMenu();
        }
        function closeMenu() {
          modelMenu.classList.remove('open');
          modelMenu.dataset.browsing = '0';
        }

        function renderMenu() {
          const q = modelInput.value.trim().toLowerCase();
          const browsing = modelMenu.dataset.browsing === '1';
          const exactKnown = MODELS.some((m) => m.id.toLowerCase() === q && m.family === currentFamily);
          // 已选中某模型时展开列表：展示该厂商全部，避免被当前 id 过滤掉其它项（如 grok-4.5）
          const applyFilter = q && !browsing && !exactKnown;
          const list = MODELS.filter((m) => m.family === currentFamily).filter((m) => {
            if (!applyFilter) return true;
            return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
          });
          if (!list.length) {
            modelMenu.innerHTML = '<div class="empty-opt">无匹配，可直接填写自定义模型 ID</div>';
            return;
          }
          modelMenu.innerHTML = list.map((m) =>
            '<li data-id="' + m.id + '" data-family="' + m.family + '"' +
              (m.id === modelInput.value.trim() ? ' class="active"' : '') + '>' +
              m.name + '<span class="mid">' + m.id + '</span></li>'
          ).join('');
          modelMenu.querySelectorAll('li').forEach((li) => {
            li.addEventListener('mousedown', (e) => {
              e.preventDefault();
              selectModel(li.dataset.id, li.dataset.family);
              closeMenu();
            });
          });
        }

        function setFamily(family, keepModel) {
          currentFamily = family;
          familyChips.forEach((b) => b.classList.toggle('active', b.dataset.family === family));
          if (!keepModel) {
            const first = MODELS.find((m) => m.family === family);
            if (first) modelInput.value = first.id;
          }
          syncQuick(modelInput.value);
          if (modelMenu.classList.contains('open')) renderMenu();
        }

        function selectModel(modelId, family) {
          modelInput.value = modelId;
          if (family) setFamily(family, true);
          syncQuick(modelId);
        }

        allQuick.forEach((btn) => btn.addEventListener('click', () => {
          selectModel(btn.dataset.model, btn.dataset.family);
          closeMenu();
        }));
        familyChips.forEach((btn) => btn.addEventListener('click', () => {
          setFamily(btn.dataset.family, false);
          openMenu({ browsing: true });
        }));

        modelToggle.addEventListener('click', () => {
          if (modelMenu.classList.contains('open')) closeMenu();
          else openMenu({ browsing: true });
        });
        modelInput.addEventListener('focus', () => openMenu({ browsing: true }));
        modelInput.addEventListener('input', () => {
          allQuick.forEach((b) => b.classList.remove('active'));
          modelMenu.dataset.browsing = '0';
          openMenu({ browsing: false });
        });
        document.addEventListener('click', (e) => {
          if (!document.getElementById('modelCombo').contains(e.target)) closeMenu();
        });

        const dimsEl = document.getElementById('resultDims');
        const evidenceEl = document.getElementById('resultEvidence');
        const sharePanel = document.getElementById('sharePanel');
        const shareUrlEl = document.getElementById('shareUrl');
        const shareHint = document.getElementById('shareHint');
        const openReportBtn = document.getElementById('openReportBtn');
        const shareReportBtn = document.getElementById('shareReportBtn');
        const copyReportBtn = document.getElementById('copyReportBtn');
        const deepMode = document.getElementById('deepMode');
        const includeSuiteIdsEl = document.getElementById('includeSuiteIds');
        const includeRawPreviewEl = document.getElementById('includeRawPreview');
        const probePanel = document.getElementById('probePanel');
        const probePct = document.getElementById('probePct');
        const probeBar = document.getElementById('probeBar');
        const probeSteps = document.getElementById('probeSteps');
        const probeNote = document.getElementById('probeNote');
        const probeTitle = document.getElementById('probeTitle');
        const probeDetails = document.getElementById('probeDetails');
        const probeDetailsSummary = document.getElementById('probeDetailsSummary');
        let lastShareUrl = '';

        const STEP_ORDER = [
          { id: 'handshake', title: 'API 握手与协议探测' },
          { id: 'metadata', title: '元数据指纹采集' },
          { id: 'style', title: '输出风格特征比对' },
          { id: 'cutoff', title: '知识 cutoff 边界探测' },
          { id: 'capability', title: 'R1 动态题（身份穿透+精确计算）' },
          { id: 'cache', title: '缓存命中行为深测' },
          { id: 'client', title: '客户端兼容（轻量）' },
          { id: 'summary', title: '汇总判定与评分' },
        ];

        const DIM_LABEL = {
          handshake: '握手', metadata: '元数据', style: '风格', cutoff: 'cutoff',
          capability: '动态题', cache: '缓存', client: '客户端',
        };

        function overallShort(overall) {
          return (OVERALL_LABEL && OVERALL_LABEL[overall]) || overall || '结果不确定';
        }

        function statusLabel(st) {
          return (ST_LABEL && ST_LABEL[st]) || st || '跳过';
        }

        function initSteps() {
          probeSteps.innerHTML = STEP_ORDER.map((s) =>
            '<li data-step="' + s.id + '"><span class="probe-dot"></span><div><div>' + s.title +
            '</div><div class="meta" data-msg style="font-size:0.78rem"></div></div></li>'
          ).join('');
        }

        function setProgress(p) {
          const n = Math.max(0, Math.min(100, Math.round(p || 0)));
          probePct.textContent = n + '%';
          probeBar.style.width = n + '%';
        }

        function markStep(step, kind, msg) {
          const li = probeSteps.querySelector('li[data-step="' + step + '"]');
          if (!li) return;
          li.classList.remove('run', 'ok', 'bad', 'weak');
          if (kind) li.classList.add(kind);
          const m = li.querySelector('[data-msg]');
          if (m && msg) m.textContent = msg;
        }

        function hostFromBase(base) {
          try {
            const raw = String(base || '').trim();
            const withProto = /:\/\//.test(raw) ? raw : 'https://' + raw;
            return new URL(withProto).hostname || '';
          } catch (e) {
            return '';
          }
        }

        function flashShare(msg) {
          shareHint.textContent = msg || '';
          if (msg) setTimeout(function () { shareHint.textContent = ''; }, 2200);
        }

        async function copyShareUrl() {
          if (!lastShareUrl) return;
          try {
            await navigator.clipboard.writeText(lastShareUrl);
            flashShare('已复制报告地址');
          } catch (e) {
            flashShare(lastShareUrl);
          }
        }

        function hideShare() {
          lastShareUrl = '';
          sharePanel.classList.remove('show');
          shareUrlEl.textContent = '';
          openReportBtn.href = '#';
          shareHint.textContent = '';
        }

        function showShare(url) {
          lastShareUrl = url;
          shareUrlEl.textContent = url;
          openReportBtn.href = url;
          sharePanel.classList.add('show');
        }

        async function publishReport(data, base) {
          // 不传 apiKey；details 不上传
          const payload = {
            testedHost: hostFromBase(base) || undefined,
            includeSuiteIds: !!(includeSuiteIdsEl && includeSuiteIdsEl.checked),
            includeRawPreview: !!(includeRawPreviewEl && includeRawPreviewEl.checked),
            report: {
              probeVersion: data.probeVersion,
              mode: data.mode,
              overall: data.overall,
              message: data.message,
              result: data.result,
              score: data.score,
              suiteSeed: data.suiteSeed,
              suiteIds: data.suiteIds,
              scored: data.scored,
              httpStatus: data.httpStatus,
              latencyMs: data.latencyMs,
              requestedModel: data.requestedModel,
              returnedModel: data.returnedModel,
              endpoint: data.endpoint,
              rawPreview: (includeRawPreviewEl && includeRawPreviewEl.checked) ? (data.rawPreview || null) : null,
              dimensions: Array.isArray(data.dimensions)
                ? data.dimensions.map(function (d) {
                    return {
                      id: d.id,
                      status: d.status,
                      title: d.title,
                      summary: d.summary,
                    };
                  })
                : [],
            },
          };
          const res = await fetch('/api/v1/probe/reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const json = await res.json().catch(function () { return null; });
          if (!res.ok || !json || !json.data || !json.data.url) {
            throw new Error((json && json.error && json.error.message) || ('保存报告失败 HTTP ' + res.status));
          }
          return json.data.url;
        }

        function fmtEvidence(d) {
          const det = d.details || {};
          const bits = [];
          if (det.questionId) bits.push('题 ' + det.questionId);
          if (det.answer) bits.push('答: ' + String(det.answer).slice(0, 80));
          if (det.styleScore) bits.push('风格: ' + det.styleScore);
          if (det.styleAnswer) bits.push('答: ' + String(det.styleAnswer).slice(0, 60));
          if (Array.isArray(det.results)) {
            bits.push(det.results.map((r) => r.id + '=' + r.status + (r.answer ? '(' + String(r.answer).slice(0, 24) + ')' : '')).join(' · '));
          }
          if (det.modelListed != null) bits.push('models 含目标: ' + det.modelListed);
          if (det.messagesHttp != null) bits.push('messages HTTP ' + det.messagesHttp);
          if (det.promptTokens != null) bits.push('prompt_tokens=' + det.promptTokens);
          if (det.returnedModel) bits.push('returned=' + det.returnedModel);
          if (det.first != null && det.second != null) bits.push('cache 双请求已比对');
          return bits.filter(Boolean).join(' · ');
        }

        function authenticityHero(overall, score) {
          const row = (LABELS.overall && LABELS.overall[overall]) || (LABELS.overall && LABELS.overall.inconclusive) || {};
          const tone = row.tone || 'warn';
          const glyph = tone === 'ok' ? '✓' : tone === 'bad' ? '✗' : tone === 'mute' ? '—' : '!';
          let probability = null;
          if (overall === 'unreachable') {
            probability = null;
          } else if (typeof score === 'number' && isFinite(score)) {
            probability = Math.max(0, Math.min(100, Math.round(score)));
          } else if (overall === 'likely_genuine') {
            probability = 85;
          } else if (overall === 'suspicious') {
            probability = 45;
          } else if (overall === 'likely_fake') {
            probability = 15;
          }
          return {
            glyph: glyph,
            label: row.short || overallShort(overall),
            tone: tone,
            probability: probability,
          };
        }

        function show(data) {
          const overall = data.overall || 'inconclusive';
          box.className = 'result show ' + overall;
          const hero = authenticityHero(overall, data.score);
          verdictHero.className = 'verdict-hero ' + hero.tone;
          verdictGlyph.textContent = hero.glyph;
          verdictPct.textContent = hero.probability == null ? '—' : (hero.probability + '%');
          verdictLabel.textContent = hero.label;
          msg.textContent = data.message || '';
          meta.textContent = [
            data.probeVersion ? 'probe ' + data.probeVersion : null,
            data.mode ? 'mode=' + data.mode : null,
            data.suiteSeed != null ? 'seed=' + data.suiteSeed : null,
            data.httpStatus != null ? 'HTTP ' + data.httpStatus : null,
            data.latencyMs != null ? data.latencyMs + 'ms' : null,
            data.returnedModel ? '返回 model: ' + data.returnedModel : null,
          ].filter(Boolean).join(' · ');

          if (data.score != null && Array.isArray(data.scored) && data.scored.length) {
            const rows = data.scored.map((r) =>
              '<tr><td>' + (DIM_LABEL[r.id] || r.id) + '</td><td>' + statusLabel(r.status) +
              '</td><td>w=' + r.weight + '</td></tr>'
            ).join('');
            evidenceEl.style.display = 'block';
            evidenceEl.innerHTML =
              '<h4>分项明细</h4>' +
              '<table class="score-table"><thead><tr><th>维度</th><th>结果</th><th>权重</th></tr></thead><tbody>' +
              rows + '</tbody></table>' +
              (Array.isArray(data.suiteIds) && data.suiteIds.length
                ? '<div class="suite-ids">抽题: ' + data.suiteIds.join(', ') + '</div>'
                : '');
          } else {
            evidenceEl.style.display = 'none';
            evidenceEl.innerHTML = '';
          }

          const dims = Array.isArray(data.dimensions) ? data.dimensions : [];
          dimsEl.innerHTML = dims.map((d) => {
            const ev = fmtEvidence(d);
            return '<div class="dim"><div class="dim-top"><span>' + (d.title || d.id) +
              '</span><span class="dim-st ' + d.status + '">' + statusLabel(d.status) +
              '</span></div><div class="dim-sum">' + (d.summary || '') + '</div>' +
              (ev ? '<div class="dim-ev">' + ev + '</div>' : '') + '</div>';
          }).join('');
          raw.textContent = data.rawPreview || '(无)';
        }

        copyReportBtn.addEventListener('click', copyShareUrl);
        shareReportBtn.addEventListener('click', async function () {
          if (!lastShareUrl) return;
          if (navigator.share) {
            try {
              await navigator.share({ title: '模型检测报告', url: lastShareUrl });
              return;
            } catch (e) { /* fallthrough */ }
          }
          copyShareUrl();
        });

        async function runProbeStream(model, key, base, mode) {
          const res = await fetch('/api/v1/probe/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
            body: JSON.stringify({ baseUrl: base, apiKey: key, model, mode }),
          });
          if (!res.ok) {
            const t = await res.text();
            throw new Error('启动检测失败 HTTP ' + res.status + ' ' + t.slice(0, 120));
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          let report = null;
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split('\\n\\n');
            buf = parts.pop() || '';
            for (const chunk of parts) {
              const line = chunk.split('\\n').find((l) => l.startsWith('data: '));
              if (!line) continue;
              let ev;
              try { ev = JSON.parse(line.slice(6)); } catch { continue; }
              if (ev.type === 'error') throw new Error(ev.message || '检测错误');
              if (ev.type === 'done') {
                report = ev.report;
                setProgress(100);
                continue;
              }
              if (ev.type === 'step_start') {
                markStep(ev.step, 'run', '进行中…');
                if (ev.progress != null) setProgress(ev.progress);
                probeTitle.textContent = '正在检测：' + (ev.title || ev.step);
              }
              if (ev.type === 'step_done') {
                const st = ev.status || (ev.dimension && ev.dimension.status) || 'skip';
                const kind = st === 'pass' ? 'ok' : st === 'fail' ? 'bad' : st === 'weak' ? 'weak' : 'weak';
                markStep(ev.step, kind, ev.message || (ev.dimension && ev.dimension.summary) || st);
                if (ev.progress != null) setProgress(ev.progress);
              }
            }
          }
          if (!report) throw new Error('未收到完整检测报告');
          return report;
        }

        startBtn.addEventListener('click', async () => {
          const model = modelInput.value.trim();
          const key = apiKey.value.trim();
          const base = baseUrl.value.trim();
          const mode = deepMode.checked ? 'deep' : 'standard';
          if (!base || !key || !model) {
            show({ overall: 'inconclusive', message: '请填写请求地址、API Key 和模型', dimensions: [] });
            hideShare();
            return;
          }
          startBtn.disabled = true;
          startBtn.textContent = '检测中…';
          statusHint.textContent = mode === 'deep' ? '深测约 40–60 秒' : '标准约 30–45 秒';
          box.className = 'result';
          dimsEl.innerHTML = '';
          evidenceEl.style.display = 'none';
          evidenceEl.innerHTML = '';
          raw.textContent = '';
          hideShare();
          initSteps();
          setProgress(0);
          probePanel.classList.add('show');
          if (probeDetails) {
            probeDetails.open = true;
            probeDetailsSummary.textContent = '过程明细（检测中）';
          }
          probeNote.textContent = '检测中，请勿关闭页面…';
          probeTitle.textContent = '检测进度 · ' + model.toUpperCase();
          try {
            const data = await runProbeStream(model, key, base, mode);
            show(data);
            probeNote.textContent = '检测完成';
            if (probeDetailsSummary) probeDetailsSummary.textContent = '展开过程明细';
            statusHint.textContent = '完成 · 正在生成报告…';
            try {
              const url = await publishReport(data, base);
              showShare(url);
              statusHint.textContent = '完成';
            } catch (pubErr) {
              statusHint.textContent = '完成（报告未生成）';
              flashShare('报告生成失败：' + (pubErr && pubErr.message ? pubErr.message : String(pubErr)));
              sharePanel.classList.add('show');
            }
          } catch (err) {
            show({
              overall: 'inconclusive',
              message: '不确定：' + (err && err.message ? err.message : String(err)),
              dimensions: [],
            });
            hideShare();
            probeNote.textContent = '检测中断';
            if (probeDetailsSummary) probeDetailsSummary.textContent = '展开过程明细';
            statusHint.textContent = '结束';
          } finally {
            startBtn.disabled = false;
            startBtn.textContent = '开始检测';
          }
        });
      })();
    </script>`;

    reply
      .type("text/html; charset=utf-8")
      .send(
        renderShell({
          nav: "verify",
          title: "检测",
          updatedLabel: "多维鉴真 · Key 不落库",
          body,
          scripts,
        }),
      );
  });
}
