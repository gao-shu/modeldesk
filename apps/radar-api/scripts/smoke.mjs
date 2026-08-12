const base = process.env.API_BASE || 'http://127.0.0.1:8787';

async function get(path) {
  const res = await fetch(base + path);
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(json)}`);
  return json;
}

const checks = [];
function ok(name, cond, detail = '') {
  checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const health = await get('/health');
ok('health', health.status === 'ok');

const meta = await get('/api/v1/meta/updated-at');
ok('meta.updated-at', meta.data?.activeProviderCount >= 10, `count=${meta.data?.activeProviderCount}`);

const providers = await get('/api/v1/providers?pageSize=5');
ok('providers.list', providers.data?.pagination?.total >= 10, `total=${providers.data?.pagination?.total}`);
ok('providers.composite', typeof providers.data?.items?.[0]?.compositeScore === 'number');

const detail = await get('/api/v1/providers/demo-relay-alpha');
ok('providers.detail', detail.data?.id === 'demo-relay-alpha');

const models = await get('/api/v1/models');
ok('models.list', models.data?.pagination?.total >= 15, `total=${models.data?.pagination?.total}`);

const prices = await get('/api/v1/models/claude-sonnet-4/prices');
ok('models.prices', Array.isArray(prices.data?.items) && prices.data.items.length > 0);

const guides = await get('/api/v1/guides');
ok('guides.list', guides.data?.items?.length >= 3);

const radar = await fetch(base + '/radar');
const radarHtml = await radar.text();
ok('page.radar', radar.ok && radarHtml.includes('高性价比 API 中转站'));
ok('page.radar.llm', radarHtml.includes('大语言模型'));
ok('page.radar.image', radarHtml.includes('生图模型'));
ok('page.radar.video', radarHtml.includes('生视频模型'));
ok('page.radar.tts', radarHtml.includes('TTS 语音'));
ok('page.radar.modules', radarHtml.includes('模块分类'));
ok('page.radar.hot', radarHtml.includes('热门模型'));
ok('page.radar.platforms', radarHtml.includes('便宜平台'));
ok('page.radar.all', radarHtml.includes('全部'));
ok('page.radar.search', radarHtml.includes('catalogSearch'));
ok('page.radar.source', radarHtml.includes('来源及入选方式'));

const verify = await fetch(base + '/verify');
const verifyHtml = await verify.text();
ok('page.verify', verify.ok && verifyHtml.includes('测一下你的 Key') && !verifyHtml.includes('最新常用') && verifyHtml.includes('热门模型') && verifyHtml.includes('深测') && verifyHtml.includes('probeSteps') && verifyHtml.includes('resultEvidence') && verifyHtml.includes('sharePanel') && verifyHtml.includes('复制报告地址') && verifyHtml.includes('展开过程明细') && verifyHtml.includes('labelsData') && verifyHtml.includes('无法检测') && verifyHtml.includes('倾向可信') && verifyHtml.includes('真货概率') && verifyHtml.includes('verdictGlyph') && verifyHtml.includes('includeSuiteIds') && verifyHtml.includes('includeRawPreview'));

const root = await fetch(base + '/', { redirect: 'manual' });
ok('page.root-redirect', root.status >= 300 && root.status < 400 && String(root.headers.get('location') || '').includes('/radar'));

const probeValidation = await fetch(base + '/api/v1/probe/once', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ baseUrl: 'http://127.0.0.1/v1', apiKey: 'sk-test', model: 'gpt-4o' }),
});
const probeJson = await probeValidation.json();
ok(
  'probe.once.blocks-private',
  probeValidation.status === 400 && probeJson.error?.code === 'VALIDATION_ERROR',
);

const reportCreate = await fetch(base + '/api/v1/probe/reports', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    apiKey: 'sk-must-never-be-stored-abcdef123456',
    testedHost: 'api.example.com',
    report: {
      probeVersion: '0.3.5-share',
      mode: 'standard',
      overall: 'unreachable',
      message: '模型不存在或无权限',
      result: 'fail',
      score: 0,
      httpStatus: 404,
      latencyMs: 100,
      requestedModel: 'claude-fable-5',
      returnedModel: null,
      endpoint: 'https://api.example.com/v1/chat/completions',
      dimensions: [
        { id: 'handshake', status: 'fail', title: '协议层合规', summary: '404' },
        { id: 'client', status: 'fail', title: 'Claude Code 兼容', summary: '未测' },
      ],
      rawPreview: 'sk-raw-should-drop',
    },
  }),
});
const reportCreateJson = await reportCreate.json();
ok(
  'probe.reports.create',
  reportCreate.ok &&
    !!reportCreateJson.data?.id &&
    String(reportCreateJson.data?.url || '').includes('/r/') &&
    reportCreateJson.data?.snapshot?.testedHost === 'api.example.com' &&
    !JSON.stringify(reportCreateJson).includes('sk-must-never') &&
    !JSON.stringify(reportCreateJson).includes('sk-raw'),
  `id=${reportCreateJson.data?.id || reportCreate.status}`,
);

const reportId = reportCreateJson.data?.id;
const reportGet = await fetch(base + '/api/v1/probe/reports/' + reportId);
const reportGetJson = await reportGet.json();
ok(
  'probe.reports.get',
  reportGet.ok &&
    reportGetJson.data?.snapshot?.requestedModel === 'claude-fable-5' &&
    !JSON.stringify(reportGetJson).includes('sk-'),
);

const reportMissing = await fetch(base + '/api/v1/probe/reports/does-not-exist-xyz');
const reportMissingJson = await reportMissing.json();
ok(
  'probe.reports.404',
  reportMissing.status === 404 && reportMissingJson.error?.code === 'NOT_FOUND',
);

const reportPage = await fetch(base + '/r/' + reportId);
const reportPageHtml = await reportPage.text();
ok(
  'page.report',
  reportPage.ok &&
    reportPageHtml.includes('模型检测报告') &&
    reportPageHtml.includes('api.example.com') &&
    reportPageHtml.includes('claude-fable-5') &&
    reportPageHtml.includes('复制报告地址') &&
    reportPageHtml.includes('og:title') &&
    !reportPageHtml.includes('sk-must-never'),
);

const reportPage404 = await fetch(base + '/r/does-not-exist-xyz');
const reportPage404Html = await reportPage404.text();
ok(
  'page.report.404',
  reportPage404.status === 404 && reportPage404Html.includes('报告不存在'),
);

const adminPurge = await fetch(base + '/api/v1/admin/probe-reports/purge', { method: 'POST' });
const adminPurgeJson = await adminPurge.json();
ok(
  'admin.reports.no-token',
  (adminPurge.status === 503 || adminPurge.status === 401) && !!adminPurgeJson.error,
);

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) process.exit(1);