"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  API_FORMATS,
  MODALITIES,
  MODALITY_LABELS,
  type ApiFormatDef,
  type Modality,
  type RunParamField,
} from "@modeldesk/shared";
import { HistoryPager } from "@/components/HistoryPager";
import { PageHeader } from "@/components/PageHeader";

/** Formats list is denser on desktop when rows expand; keep pages short. */
const FORMAT_PAGE_SIZE = 8;

const TABS = [
  { id: "position", label: "定位" },
  { id: "tech", label: "技术" },
  { id: "formats", label: "接入模型" },
  { id: "access", label: "对外调用" },
  { id: "roadmap", label: "规划" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const FIELD_TYPE_LABEL: Record<RunParamField["type"], string> = {
  number: "数字",
  range: "滑轨",
  select: "选择",
  text: "文本",
  textarea: "多行",
  boolean: "开关",
  image: "参考图",
  image_list: "多图",
  image_pair: "图/首尾帧",
};

function listFormats(): ApiFormatDef[] {
  return API_FORMATS.filter((f) => !f.id.endsWith(".mock"));
}

function fieldSummary(field: RunParamField): string {
  const parts: string[] = [];
  if (field.defaultValue) parts.push(`默认 ${field.defaultValue}`);
  if (field.type === "number" || field.type === "range") {
    if (field.min != null || field.max != null) {
      parts.push(`${field.min ?? "…"}–${field.max ?? "…"}`);
    }
  }
  if (field.options?.length) {
    const labels = field.options.slice(0, 6).map((o) => o.label || o.value);
    const more =
      field.options.length > 6 ? ` 等 ${field.options.length} 项` : "";
    parts.push(labels.join(" · ") + more);
  }
  if (field.type === "image_list" && field.max != null) {
    parts.push(`最多 ${field.max} 张`);
  }
  if (field.type === "image_pair") {
    if (field.listKey) parts.push(`多参考 → ${field.listKey}`);
    if (field.allowPair === false) parts.push("无首尾帧");
  }
  return parts.join(" · ");
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 text-sm leading-relaxed text-zinc-600">
      {children}
    </div>
  );
}

function H({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-sm font-medium text-zinc-800 ${className}`.trim()}>
      {children}
    </div>
  );
}

function PositionPanel() {
  return (
    <Panel>
      <H>一句话</H>
      <p className="mt-2 text-zinc-800">
        帮本机开发者与业务系统统一管理模型配置与调用，避免 Key 散落、各写一套厂商适配。
      </p>

      <H className="mt-5">用户是谁</H>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>
          <span className="text-zinc-800">第一用户</span>
          ：本机开发者 / Agent 使用者——在 Desk 配 Key、实测通不通，再用 CLI /
          MCP 调用。
        </li>
        <li>
          <span className="text-zinc-800">第二用户</span>
          ：业务系统（漫剧、口播等）——只依赖「模型中心」入口，不自己存各家
          Key、不各自写适配。
        </li>
        <li>
          <span className="text-zinc-800">不是</span>
          ：面向公众的多租户 SaaS、也不是某个业务 App 里的设置页。
        </li>
      </ul>

      <H className="mt-5">最痛的 3 件事 → 需求</H>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-1.5 pr-3 font-medium">痛点</th>
              <th className="py-1.5 font-medium">因此需要</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-100">
              <td className="py-1.5 pr-3 align-top">
                文 / 图 / 音 / 视各家控制台来回跳，参数与 Key 难对照
              </td>
              <td className="py-1.5 align-top text-zinc-800">
                统一台账 + 本机实测闭环
              </td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-1.5 pr-3 align-top">
                业务项目各自存 Key、各自写厂商 HTTP，换模型要改多处
              </td>
              <td className="py-1.5 align-top text-zinc-800">
                单一调用入口（CLI / MCP / Gateway → 未来全模态中心）
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 align-top">
                协议差异大，中转与官方行为不一致，踩坑难复盘
              </td>
              <td className="py-1.5 align-top text-zinc-800">
                api_format 适配层 + 对照档案，而不是业务里 if-else
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <H className="mt-5">背景（为什么做）</H>
      <pre className="mt-2 overflow-x-auto rounded-md bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
{`各家控制台散落  →  Key / 地址乱配  →  业务各自写适配
                                              ↓
                         需要：本机工作台（人配、人测）
                              + 模型中心入口（机调、统一）`}
      </pre>
      <p className="mt-2">
        所以做 ModelDesk：先当本机 desk 把配置与实测收住；再演进成可被各业务依赖的模型中心——与用户中心同级的基础设施。
      </p>

      <H className="mt-5">现在 / 目标 / 形态</H>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>
          <span className="text-zinc-800">现在</span>
          ：本机 / 单用户 desk——登记协议、地址与 Key，实测五模态。
        </li>
        <li>
          <span className="text-zinc-800">目标</span>
          ：共享能力中心——业务只认中心，不散落 Key、不各自适配。
        </li>
        <li>
          <span className="text-zinc-800">形态</span>
          ：独立进程 + 对外入口；先本机平台服务，多人多机再升级（非默认路径）。
        </li>
      </ul>

      <H className="mt-5">对照（用户中心）</H>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left text-sm text-zinc-600">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-1.5 pr-3 font-medium">用户中心</th>
              <th className="py-1.5 font-medium">ModelDesk（模型中心）</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-100">
              <td className="py-1.5 pr-3 align-top">管账号、登录、权限</td>
              <td className="py-1.5 align-top">管模型配置、Key、连通性</td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-1.5 pr-3 align-top">业务不自己存密码</td>
              <td className="py-1.5 align-top">业务不自己散落各家 Key</td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-1.5 pr-3 align-top">统一发 token / 查用户</td>
              <td className="py-1.5 align-top">
                统一调用入口（目标：全模态 Gateway + 别名）
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 align-top">各服务都依赖它</td>
              <td className="py-1.5 align-top">漫剧、其它工具都依赖它</td>
            </tr>
          </tbody>
        </table>
      </div>

      <H className="mt-5">已实现（摘要）</H>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>模型台账、Key 加密、连通性测试、多厂商 / 中转适配</li>
        <li>五模态实测与本机产物；同一 run-core 供 Web / CLI / MCP / Gateway</li>
        <li>桌面安装包；Radar 摸底；细节见「技术 / 接入模型 / 对外调用」</li>
      </ul>
    </Panel>
  );
}

function TechPanel() {
  return (
    <Panel>
      <H>技术栈</H>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-zinc-400">语言 / 运行时</dt>
          <dd className="mt-0.5 text-zinc-800">
            TypeScript · Node.js 22 · pnpm monorepo
          </dd>
        </div>
        <div>
          <dt className="text-zinc-400">Web 界面</dt>
          <dd className="mt-0.5 text-zinc-800">
            Next.js（App Router）· React 19 · Tailwind CSS
          </dd>
        </div>
        <div>
          <dt className="text-zinc-400">桌面端</dt>
          <dd className="mt-0.5 text-zinc-800">
            Tauri 2（Rust 壳 + 内置 Web 引擎）
          </dd>
        </div>
        <div>
          <dt className="text-zinc-400">数据与安全</dt>
          <dd className="mt-0.5 text-zinc-800">
            SQLite（better-sqlite3）· Key / 密钥本地加密
          </dd>
        </div>
        <div>
          <dt className="text-zinc-400">探测服务</dt>
          <dd className="mt-0.5 text-zinc-800">
            Radar API（Fastify）· 连通性 / 目录摸底
          </dd>
        </div>
        <div>
          <dt className="text-zinc-400">对外入口</dt>
          <dd className="mt-0.5 text-zinc-800">
            CLI · MCP（stdio）· OpenAI 兼容 Gateway（HTTP）
          </dd>
        </div>
      </dl>

      <H className="mt-5">架构</H>
      <p className="mt-2">
        以 <code className="font-mono text-xs text-zinc-800">api_format</code>{" "}
        描述「怎么调厂商」；配置在 registry，执行走统一 run-core，避免各入口各写一套。
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
{`UI / CLI / MCP / Gateway
        │
        ▼
   run-core（apps/web）
        │
        ├─ model-registry（配置 CRUD / resolve）
        ├─ execute-job → @modeldesk/adapters（按 api_format 发请求）
        └─ SQLite + 本机产物（MODELDESK_DATA_DIR）

packages/shared     · 协议字段、导航、类型
packages/adapters   · 厂商 HTTP 适配
docs/adapters       · 对照档案（能力矩阵 / 校验）`}
      </pre>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>
          <span className="text-zinc-800">配置层</span>
          ：<code className="font-mono text-xs">@modeldesk/model-registry</code>{" "}
          + Web 存储实现
        </li>
        <li>
          <span className="text-zinc-800">执行层</span>
          ：<code className="font-mono text-xs">run-core</code> →{" "}
          <code className="font-mono text-xs">execute-job</code> → adapters
        </li>
        <li>
          <span className="text-zinc-800">协议层</span>
          ：每个厂商一条{" "}
          <code className="font-mono text-xs">api_format</code>
          （UI 参数与请求体同源）
        </li>
      </ul>
    </Panel>
  );
}

function FormatsPanel() {
  const formats = useMemo(() => listFormats(), []);
  const [modalityFilter, setModalityFilter] = useState<Modality | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    if (modalityFilter === "all") return formats;
    return formats.filter((f) => f.modality === modalityFilter);
  }, [formats, modalityFilter]);

  const totalPages = Math.max(1, Math.ceil(visible.length / FORMAT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * FORMAT_PAGE_SIZE;
    return visible.slice(start, start + FORMAT_PAGE_SIZE);
  }, [visible, safePage]);

  const counts = useMemo(() => {
    const map = new Map<Modality, number>();
    for (const m of MODALITIES) map.set(m, 0);
    for (const f of formats) {
      map.set(f.modality, (map.get(f.modality) ?? 0) + 1);
    }
    return map;
  }, [formats]);

  function changeFilter(next: Modality | "all") {
    setModalityFilter(next);
    setPage(1);
    setExpandedId(null);
  }

  function changePage(next: number) {
    setPage(next);
    setExpandedId(null);
  }

  return (
    <Panel>
      <p className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-zinc-700">
        <span className="font-medium text-zinc-800">方向：</span>
        ModelDesk → 各家厂商 / 中转（上游怎么接模型进来）。参数与实测页同源（
        <code className="font-mono text-[11px] text-zinc-800">
          API_FORMATS.fields
        </code>
        ）。
      </p>

      <div
        className="mt-4 flex flex-wrap gap-1"
        role="tablist"
        aria-label="按模态筛选"
      >
        <button
          type="button"
          role="tab"
          aria-selected={modalityFilter === "all"}
          onClick={() => changeFilter("all")}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
            modalityFilter === "all"
              ? "bg-zinc-900 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          全部 {formats.length}
        </button>
        {MODALITIES.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modalityFilter === m}
            onClick={() => changeFilter(m)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              modalityFilter === m
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {MODALITY_LABELS[m]} {counts.get(m) ?? 0}
          </button>
        ))}
      </div>

      <p className="mt-3 text-zinc-500">
        点开查看 UI 参数详情。具体型号在「模型配置」里选协议后填写。
      </p>

      <ul className="mt-3 space-y-2">
        {pageItems.map((fmt) => {
          const open = expandedId === fmt.id;
          const keys = fmt.fields.map((f) => f.key);
          return (
            <li
              key={fmt.id}
              className="overflow-hidden rounded-md border border-zinc-200"
            >
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setExpandedId(open ? null : fmt.id)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-zinc-50"
              >
                <span
                  className={`mt-0.5 shrink-0 text-zinc-400 transition-transform ${
                    open ? "rotate-90" : ""
                  }`}
                  aria-hidden
                >
                  ▸
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium text-zinc-800">
                      {fmt.label}
                    </span>
                    <code className="font-mono text-[11px] text-zinc-400">
                      {fmt.id}
                    </code>
                    {fmt.tier === "relay" ? (
                      <span className="text-[11px] text-amber-700">中转</span>
                    ) : fmt.tier === "extended" ? (
                      <span className="text-[11px] text-zinc-400">扩展</span>
                    ) : null}
                  </span>
                  {fmt.hint ? (
                    <span className="mt-0.5 block text-xs text-zinc-500">
                      {fmt.hint}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-zinc-400">
                    {fmt.fields.length === 0
                      ? "无额外 UI 参数"
                      : `参数：${keys.join(" · ")}`}
                  </span>
                </span>
              </button>

              {open ? (
                <div className="border-t border-zinc-100 bg-zinc-50/80 px-3 py-3">
                  {(fmt.suggestedBaseUrl || fmt.suggestedModelId) && (
                    <dl className="mb-3 grid gap-1 text-xs text-zinc-600 sm:grid-cols-2">
                      {fmt.suggestedBaseUrl ? (
                        <div>
                          <dt className="text-zinc-400">建议 Base URL</dt>
                          <dd className="break-all font-mono text-[11px] text-zinc-800">
                            {fmt.suggestedBaseUrl}
                          </dd>
                        </div>
                      ) : null}
                      {fmt.suggestedModelId ? (
                        <div>
                          <dt className="text-zinc-400">建议 Model ID</dt>
                          <dd className="break-all font-mono text-[11px] text-zinc-800">
                            {fmt.suggestedModelId}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  )}

                  {fmt.fields.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      该协议未注册额外 UI 字段（实测页仅 prompt 等通用输入）。
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-500">
                            <th className="py-1.5 pr-2 font-medium">字段</th>
                            <th className="py-1.5 pr-2 font-medium">名称</th>
                            <th className="py-1.5 pr-2 font-medium">类型</th>
                            <th className="py-1.5 font-medium">默认 / 选项</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fmt.fields.map((field) => (
                            <tr
                              key={field.key}
                              className="border-b border-zinc-100 align-top"
                            >
                              <td className="py-1.5 pr-2 font-mono text-[11px] text-zinc-800">
                                {field.key}
                              </td>
                              <td className="py-1.5 pr-2 text-zinc-800">
                                {field.label}
                                {field.hint ? (
                                  <span className="mt-0.5 block text-[11px] font-normal text-zinc-400">
                                    {field.hint}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-1.5 pr-2 text-zinc-600">
                                {FIELD_TYPE_LABEL[field.type] ?? field.type}
                              </td>
                              <td className="py-1.5 text-zinc-600">
                                {fieldSummary(field) || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {fmt.modelOptions && fmt.modelOptions.length > 0 ? (
                    <p className="mt-3 text-xs text-zinc-500">
                      <span className="text-zinc-400">常用 Model ID：</span>
                      {fmt.modelOptions.slice(0, 8).map((id, i) => (
                        <span key={id}>
                          {i > 0 ? " · " : ""}
                          <code className="font-mono text-[11px] text-zinc-700">
                            {fmt.modelOptionLabels?.[id] ?? id}
                          </code>
                        </span>
                      ))}
                      {fmt.modelOptions.length > 8
                        ? ` 等 ${fmt.modelOptions.length} 个`
                        : null}
                    </p>
                  ) : null}

                  <p className="mt-3 text-xs text-zinc-500">
                    <Link
                      href="/models"
                      className="font-medium text-zinc-800 underline-offset-2 hover:underline"
                    >
                      在模型配置中选用
                    </Link>
                    <span className="text-zinc-400">
                      {" "}
                      · 对照档案见 docs/adapters/
                    </span>
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <HistoryPager
        page={safePage}
        total={visible.length}
        pageSize={FORMAT_PAGE_SIZE}
        onPageChange={changePage}
      />
    </Panel>
  );
}

function AccessPanel() {
  return (
    <Panel>
      <p className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-zinc-700">
        <span className="font-medium text-zinc-800">方向：</span>
        业务 / Agent / 脚本 → ModelDesk（下游怎么调本软件）。
      </p>
      <H className="mt-4">谁用哪种入口</H>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[28rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-zinc-200 text-zinc-500">
              <th className="py-1.5 pr-3 font-medium">调用方</th>
              <th className="py-1.5 pr-3 font-medium">入口</th>
              <th className="py-1.5 font-medium">说明</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-zinc-100">
              <td className="py-1.5 pr-3 align-top">人（配置 / 实测）</td>
              <td className="py-1.5 pr-3 align-top text-zinc-800">Web / Desktop</td>
              <td className="py-1.5 align-top">配 Key、跑通、看历史与产物</td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-1.5 pr-3 align-top">脚本 / CI</td>
              <td className="py-1.5 pr-3 align-top">
                <code className="font-mono text-xs text-zinc-800">modeldesk</code>{" "}
                CLI
              </td>
              <td className="py-1.5 align-top">list + run 多模态，JSON 输出</td>
            </tr>
            <tr className="border-b border-zinc-100">
              <td className="py-1.5 pr-3 align-top">Cursor / Agent</td>
              <td className="py-1.5 pr-3 align-top">
                <code className="font-mono text-xs text-zinc-800">
                  modeldesk-mcp
                </code>
              </td>
              <td className="py-1.5 align-top">
                list_models / run_*（stdio MCP）
              </td>
            </tr>
            <tr>
              <td className="py-1.5 pr-3 align-top">OpenAI 兼容客户端</td>
              <td className="py-1.5 pr-3 align-top">
                <code className="font-mono text-xs text-zinc-800">
                  modeldesk-gateway
                </code>
              </td>
              <td className="py-1.5 align-top">
                目前主要文本 chat；目标收口全模态
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <H className="mt-5">调用前提</H>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>
          与界面共用{" "}
          <code className="font-mono text-xs text-zinc-800">MODELDESK_DATA_DIR</code>
          （及加密密钥文件）
        </li>
        <li>模型与 Key 先在本机配好；外部入口主要 list + run，不替代配置台</li>
        <li>
          一键复制 MCP：{" "}
          <Link
            href="/settings"
            className="font-medium text-zinc-800 underline-offset-2 hover:underline"
          >
            系统设置 → 外部调用
          </Link>
        </li>
      </ul>

      <H className="mt-5">安全边界</H>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>本机单用户信任模型；默认 loopback，请勿公网暴露</li>
        <li>能 spawn CLI / MCP / Gateway ≈ 能花掉已存 API Key</li>
        <li>
          详情见仓库{" "}
          <code className="font-mono text-xs text-zinc-800">SECURITY.md</code>、
          <code className="font-mono text-xs text-zinc-800">
            docs/external-access.md
          </code>
        </li>
      </ul>
    </Panel>
  );
}

function RoadmapPanel() {
  return (
    <Panel>
      <H>规划（模型中心）</H>
      <p className="mt-2">
        结构上已有种子（registry + adapters + run-core）。缺的是「作为中心服务该有的那一层」，而不是再多一个配置页。
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          <span className="text-zinc-800">Phase A · 本机多业务</span>
          ：全模态 Gateway（图 / 音 / 视收口）；稳定别名（如{" "}
          <code className="font-mono text-xs text-zinc-800">llm-default</code>
          ）；冻结 OpenAPI + 官方 Client；可选调用方 token。
        </li>
        <li>
          <span className="text-zinc-800">Phase B · 内网共享</span>
          ：Center 可独立常驻；远程配置 API；capability 可发现；按调用方限流与审计。
        </li>
        <li>
          <span className="text-zinc-800">Phase C · 远程多人</span>
          ：登录 / 多租户 / 计费——另立边界，不与本机 desk 默认路径混用。
        </li>
      </ol>

      <H className="mt-5">当前缺口（相对「用户中心」）</H>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>全模态、稳定 HTTP 服务面（Gateway 仍偏文本）</li>
        <li>业务友好别名 / 环境绑定（多靠 registry UUID）</li>
        <li>Remote registry 服务化、多调用方治理</li>
        <li>冻结契约 + 官方 Client；capability 对业务可发现</li>
      </ul>

      <p className="mt-4 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-3">
        一句话：是「模型中心」服务，不是业务微服务。最终形态 ≈ Desk（人配）+ Center
        Service（机调），业务只依赖后者。
      </p>
    </Panel>
  );
}

export default function AboutPage() {
  const [tab, setTab] = useState<TabId>("position");

  return (
    <div>
      <PageHeader
        title="项目说明"
        description="定位 · 技术 · 接入模型 · 对外调用 · 规划"
      />

      <div
        role="tablist"
        aria-label="项目说明分区"
        className="mb-4 flex flex-wrap gap-1 border-b border-zinc-200"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                active
                  ? "border-zinc-900 font-medium text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">
        {tab === "position" ? <PositionPanel /> : null}
        {tab === "tech" ? <TechPanel /> : null}
        {tab === "formats" ? <FormatsPanel /> : null}
        {tab === "access" ? <AccessPanel /> : null}
        {tab === "roadmap" ? <RoadmapPanel /> : null}
      </div>
    </div>
  );
}
