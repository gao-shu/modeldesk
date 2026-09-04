"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";

type ProviderStatus = {
  provider: string;
  ready: boolean;
  source?: string;
};

type ObjectStorageStatus = {
  enabled: boolean;
  selectedProvider: string;
  provider: string;
  configured: boolean;
  credentialSource?: string;
  providers: ProviderStatus[];
};

type StorageConfig = {
  provider: string;
  bucket: string;
  region: string;
  endpoint: string;
  accessKeyMasked: string | null;
  secretKeyMasked: string | null;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  publicBaseUrl: string;
  forcePathStyle: boolean;
  skipAcl: boolean;
  ready: boolean;
  updatedAt: string | null;
};

type AgentBinsStatus = {
    binDir: string;
    installed: boolean;
    commands: string[];
    engineDir: string | null;
    canInstall: boolean;
    desktopMode: boolean;
    mcpCommand?: string;
    mcpArgs?: string[];
    mcpConfigExample: string;
    mcpCodexTomlExample?: string;
  };

type DiskBucket = {
    id: string;
    label: string;
    bytes: number;
    files: number;
  };

type DiskUsage = {
    dataDir: string;
    totalBytes: number;
    dbBytes: number;
    artifactCount: number;
    runCount: number;
    buckets: DiskBucket[];
  };

type StorageStatus = {
    dataDir: string;
    dbPath: string;
    defaultDataDir?: string;
    usingCustomDir?: boolean;
    isDefault?: boolean;
    encryptionConfigured: boolean;
    encryptionSource?: "env" | "file" | "none";
    encryptionSecretPath?: string;
    modelCount: number;
    artifactCount: number;
    disk?: DiskUsage;
    objectStorage?: ObjectStorageStatus;
    agentBins?: AgentBinsStatus;
  };

/** UI 仅保留 S3 兼容；七牛 / MinIO / 各云 S3 网关都填这一套。 */
const STORAGE_PROVIDER = "s3" as const;

type FieldExample = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  publicBaseUrl: string;
};

/** 非密钥预填默认按七牛 S3 兼容；占位为中英对照。 */
const S3_FIELD_EXAMPLES: FieldExample = {
  bucket: "images-temp",
  region: "cn-north-1",
  endpoint: "s3.cn-north-1.qiniucs.com",
  accessKey: "你的AccessKey / YourAccessKey",
  secretKey: "你的SecretKey / YourSecretKey",
  publicBaseUrl: "https://img.example.com",
};

const FIELD_HINTS = {
  bucket: "存储桶名称 · Bucket name（例：images-temp）",
  accessKey: "访问密钥 · Access Key（七牛控制台 / AWS IAM）",
  secretKey: "密钥 · Secret Key（只保存在本机）",
  region: "区域 · Region（七牛例：cn-north-1；AWS 例：us-east-1）",
  endpoint:
    "S3 接口地址 · Endpoint（七牛例：s3.cn-north-1.qiniucs.com；勿带 https://）",
  publicBaseUrl:
    "公网访问前缀 · Public base URL（须 HTTPS，末尾不要 /）",
  forcePathStyle:
    "强制路径风格 · Force path style（七牛一般关；部分 MinIO 需开）",
  skipAcl: "跳过 ACL · Skip ACL（七牛 Kodo 建议开）",
} as const;

type FormState = {
  bucket: string;
  region: string;
  endpoint: string;
  accessKey: string;
  secretKey: string;
  publicBaseUrl: string;
  forcePathStyle: boolean;
  skipAcl: boolean;
};

function emptyForm(): FormState {
  return {
    bucket: "",
    region: "",
    endpoint: "",
    accessKey: "",
    secretKey: "",
    publicBaseUrl: "",
    forcePathStyle: false,
    skipAcl: true,
  };
}

/** Prefill non-secret infra fields for faster new-machine setup (never real keys). */
function formFromExamples(): FormState {
  const ex = S3_FIELD_EXAMPLES;
  return {
    ...emptyForm(),
    bucket: ex.bucket,
    region: ex.region,
    endpoint: ex.endpoint,
    publicBaseUrl: ex.publicBaseUrl,
  };
}

function configLooksReady(cfg: StorageConfig | null | undefined): boolean {
  if (!cfg) return false;
  return (
    Boolean(cfg.bucket?.trim()) ||
    Boolean(cfg.region?.trim()) ||
    Boolean(cfg.endpoint?.trim()) ||
    Boolean(cfg.publicBaseUrl?.trim()) ||
    Boolean(cfg.hasAccessKey) ||
    Boolean(cfg.hasSecretKey) ||
    Boolean(cfg.updatedAt)
  );
}

/** Prefer s3 row; otherwise reuse legacy qiniu/tos/… values into the S3 form. */
function pickStorageConfig(list: StorageConfig[]): StorageConfig | null {
  const order = ["s3", "qiniu", "tos", "oss", "cos", "bos"];
  for (const id of order) {
    const cfg = list.find((c) => c.provider === id) ?? null;
    if (configLooksReady(cfg)) return cfg;
  }
  return list.find((c) => c.provider === STORAGE_PROVIDER) ?? null;
}

function formFromConfig(cfg: StorageConfig | null | undefined): FormState {
  if (!cfg) return emptyForm();
  if (!configLooksReady(cfg)) return formFromExamples();
  return {
    bucket: cfg.bucket ?? "",
    region: cfg.region ?? "",
    endpoint: cfg.endpoint ?? "",
    accessKey: "",
    secretKey: "",
    publicBaseUrl: cfg.publicBaseUrl ?? "",
    forcePathStyle: Boolean(cfg.forcePathStyle),
    skipAcl: Boolean(cfg.skipAcl),
  };
}

function fieldClass() {
  return "md-control";
}

export default function SettingsPage() {
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState<string>(STORAGE_PROVIDER);
  const [configs, setConfigs] = useState<StorageConfig[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saveBusy, setSaveBusy] = useState(false);
  const [objectError, setObjectError] = useState<string | null>(null);

  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testUrl, setTestUrl] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);

  const [openDirBusy, setOpenDirBusy] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [nextDataDir, setNextDataDir] = useState("");
  const [migrateData, setMigrateData] = useState(true);
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeMessage, setChangeMessage] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [mcpCopied, setMcpCopied] = useState(false);
  const [codexCopied, setCodexCopied] = useState(false);
  const [gatewayCopied, setGatewayCopied] = useState<string | null>(null);
  const [clearRunsToo, setClearRunsToo] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const applyStorageForm = useCallback((list: StorageConfig[]) => {
    const cfg = pickStorageConfig(list);
    if (!cfg) {
      setForm(formFromExamples());
      return;
    }
    setForm(formFromConfig(cfg));
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const [statusRes, settingsRes] = await Promise.all([
      fetch("/api/storage/status"),
      fetch("/api/storage/object-settings"),
    ]);
    const statusData = (await statusRes.json()) as {
      ok: boolean;
      storage?: StorageStatus;
      error?: string;
    };
    const settingsData = (await settingsRes.json()) as {
      ok: boolean;
      objectStorage?: ObjectStorageStatus;
      configs?: StorageConfig[];
      error?: string;
    };

    if (!statusData.ok || !statusData.storage) {
      setError(statusData.error ?? "加载存储状态失败");
      setStatus(null);
      return;
    }
    setStatus(statusData.storage);

    const os =
      settingsData.objectStorage ?? statusData.storage.objectStorage;
    const list = settingsData.configs ?? [];
    setConfigs(list);
    if (os) {
      setEnabled(Boolean(os.enabled));
    }
    setProvider(STORAGE_PROVIDER);
    applyStorageForm(list);
  }, [applyStorageForm]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const currentConfig = pickStorageConfig(configs);

  async function savePrefs(nextEnabled: boolean, _nextProvider?: string) {
    setSaveBusy(true);
    setObjectError(null);
    setTestMessage(null);
    setTestOk(null);
    setTestUrl(null);
    try {
      const res = await fetch("/api/storage/object-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: nextEnabled,
          provider: STORAGE_PROVIDER,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        configs?: StorageConfig[];
        objectStorage?: ObjectStorageStatus;
      };
      if (!data.ok) {
        setObjectError(data.error ?? "保存失败");
        return;
      }
      setEnabled(nextEnabled);
      setProvider(STORAGE_PROVIDER);
      if (data.configs) {
        setConfigs(data.configs);
        applyStorageForm(data.configs);
      }
      if (nextEnabled && data.objectStorage && !data.objectStorage.configured) {
        setObjectError("密钥未配齐，请先填写并保存配置");
      }
      await refresh();
    } finally {
      setSaveBusy(false);
    }
  }

  async function saveConfig() {
    setSaveBusy(true);
    setObjectError(null);
    setTestMessage(null);
    setTestOk(null);
    setTestUrl(null);
    try {
      const res = await fetch("/api/storage/object-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          provider: STORAGE_PROVIDER,
          config: {
            bucket: form.bucket,
            region: form.region,
            endpoint: form.endpoint,
            accessKey: form.accessKey.trim() || null,
            secretKey: form.secretKey.trim() || null,
            publicBaseUrl: form.publicBaseUrl,
            forcePathStyle: form.forcePathStyle,
            skipAcl: form.skipAcl,
          },
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        configs?: StorageConfig[];
      };
      if (!data.ok) {
        setObjectError(data.error ?? "保存失败");
        return;
      }
      if (data.configs) {
        setConfigs(data.configs);
        applyStorageForm(data.configs);
      }
      await refresh();
    } finally {
      setSaveBusy(false);
    }
  }

  async function testObjectStorage() {
    setTestBusy(true);
    setTestMessage(null);
    setTestOk(null);
    setTestUrl(null);
    setObjectError(null);
    try {
      const res = await fetch("/api/storage/object-test", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string | null;
        message?: string | null;
        url?: string | null;
      };
      setTestOk(Boolean(data.ok));
      setTestMessage(
        data.ok ? "测试成功" : (data.error ?? data.message ?? "测试失败"),
      );
      setTestUrl(data.url?.trim() || null);
    } catch (e) {
      setTestOk(false);
      setTestMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setTestBusy(false);
    }
  }

  async function generateEncryptionSecret() {
    setGenBusy(true);
    setGenMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/storage/encryption-setup", {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok: boolean;
        created?: boolean;
        message?: string;
        error?: string;
      };
      if (!data.ok) {
        setGenMessage(data.error ?? "生成失败");
        return;
      }
      setGenMessage(data.message ?? "已就绪");
      await refresh();
    } catch (e) {
      setGenMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusy(false);
    }
  }

  async function openDataDir() {
    setOpenDirBusy(true);
    setChangeError(null);
    try {
      const res = await fetch("/api/storage/open-data-dir", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        setChangeError(data.error ?? "无法打开数据目录");
      }
    } catch (e) {
      setChangeError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpenDirBusy(false);
    }
  }

  async function applyDataDirChange(resetToDefault: boolean) {
    const target = resetToDefault
      ? status?.defaultDataDir ?? ""
      : nextDataDir.trim();
    if (!resetToDefault && !target) {
      setChangeError("请填写新的数据目录路径");
      return;
    }

    const migrateHint = migrateData
      ? "并将尽量迁移现有数据库、密钥与生成结果"
      : "且不会迁移旧数据";
    const where = resetToDefault ? "默认位置" : target;
    if (
      !window.confirm(
        `确认将数据目录改为：\n${where}\n\n${migrateHint}。\n原目录不会被删除。切换后建议重启应用。`,
      )
    ) {
      return;
    }

    setChangeBusy(true);
    setChangeError(null);
    setChangeMessage(null);
    try {
      const res = await fetch("/api/storage/data-dir", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataDir: resetToDefault ? null : target,
          migrate: migrateData,
          resetToDefault,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        dataDir?: string;
      };
      if (!data.ok) {
        setChangeError(data.error ?? "更改失败");
        return;
      }
      setChangeMessage(data.message ?? "已更新");
      if (data.dataDir) setNextDataDir(data.dataDir);
      await refresh();
    } catch (e) {
      setChangeError(e instanceof Error ? e.message : String(e));
    } finally {
      setChangeBusy(false);
    }
  }

  async function installAgentBins() {
    setAgentBusy(true);
    setAgentError(null);
    setAgentMessage(null);
    try {
      const res = await fetch("/api/storage/agent-bins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addPath: true }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        agentBins?: AgentBinsStatus;
      };
      if (!data.ok) {
        setAgentError(data.error ?? "安装失败");
        return;
      }
      setAgentMessage(
        `已安装到 ${data.agentBins?.binDir ?? "ModelDesk\\bin"}。新开终端后可用 modeldesk / modeldesk-mcp。`,
      );
      await refresh();
    } catch (e) {
      setAgentError(e instanceof Error ? e.message : String(e));
    } finally {
      setAgentBusy(false);
    }
  }

  async function copyMcpConfig(kind: "json" | "codex" = "json") {
    const text =
      kind === "codex"
        ? status?.agentBins?.mcpCodexTomlExample
        : status?.agentBins?.mcpConfigExample;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (kind === "codex") {
        setCodexCopied(true);
        window.setTimeout(() => setCodexCopied(false), 2000);
      } else {
        setMcpCopied(true);
        window.setTimeout(() => setMcpCopied(false), 2000);
      }
    } catch {
      setAgentError("复制失败，请手动选中下方配置");
    }
  }

  function gatewaySnippets(dataDir: string) {
    const dataDirPosix = dataDir.replace(/\\/g, "/");
    const aliases = `curl -s -X PUT http://127.0.0.1:3300/v1/aliases \\
  -H "Content-Type: application/json" \\
  -d "{\\"llm-default\\":\\"<text-registry-id>\\",\\"image-default\\":\\"<image-registry-id>\\"}"`;
    const chat = `curl -s http://127.0.0.1:3300/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d "{\\"model\\":\\"llm-default\\",\\"messages\\":[{\\"role\\":\\"user\\",\\"content\\":\\"hi\\"}]}"`;
    const image = `curl -s http://127.0.0.1:3300/v1/images/generations \\
  -H "Content-Type: application/json" \\
  -d "{\\"model\\":\\"image-default\\",\\"prompt\\":\\"a cat\\"}"`;
    const client = `import { createGatewayClient } from "@modeldesk/gateway-client";

const md = createGatewayClient(); // 默认 http://127.0.0.1:3300
// 可选: token: process.env.MODELDESK_GATEWAY_TOKEN

await md.chatCompletions({
  model: "llm-default",
  messages: [{ role: "user", content: "hi" }],
});
await md.imagesGenerations({
  model: "image-default",
  prompt: "a cat",
});`;
    const env = `# 默认：打开 Web/桌面后直接调 :3300/v1（无需另起进程）
# 数据目录（须与本页一致）: ${dataDirPosix}
# 可选口令: MODELDESK_GATEWAY_TOKEN
# 可选无头（仅 API、不开 UI）: modeldesk-gateway → :3310`;
    return { aliases, chat, image, client, env };
  }

  async function copyGatewaySnippet(
    key: "env" | "aliases" | "chat" | "image" | "client",
  ) {
    const dataDir = status?.dataDir?.trim();
    if (!dataDir) return;
    const snippets = gatewaySnippets(dataDir);
    const text = snippets[key];
    try {
      await navigator.clipboard.writeText(text);
      setGatewayCopied(key);
      window.setTimeout(() => setGatewayCopied(null), 2000);
    } catch {
      setAgentError("复制失败，请手动选中下方示例");
    }
  }

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  async function cleanupDisk() {
    const runsHint = clearRunsToo
      ? "并将删除全部运行历史记录"
      : "运行历史会保留（仅清生成文件与产物库）";
    if (
      !window.confirm(
        `确认清理本机生成结果？\n\n将删除图 / 视 / 音等产物文件与缩略图缓存，${runsHint}。\n模型配置与 API Key 不会被改动。此操作不可恢复。`,
      )
    ) {
      return;
    }
    setCleanupBusy(true);
    setCleanupError(null);
    setCleanupMessage(null);
    try {
      const res = await fetch("/api/storage/disk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearRuns: clearRunsToo }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        deletedArtifacts?: number;
        deletedRuns?: number;
        freedEstimateBytes?: number;
      };
      if (!data.ok) {
        setCleanupError(data.error ?? "清理失败");
        return;
      }
      const freed = formatBytes(data.freedEstimateBytes ?? 0);
      setCleanupMessage(
        `已清理 ${data.deletedArtifacts ?? 0} 个产物` +
          (clearRunsToo ? `、${data.deletedRuns ?? 0} 条运行` : "") +
          `，约释放 ${freed}`,
      );
      await refresh();
    } catch (e) {
      setCleanupError(e instanceof Error ? e.message : String(e));
    } finally {
      setCleanupBusy(false);
    }
  }

  async function clearConfig() {
    if (!window.confirm("清除该厂商已保存的配置？")) return;
    setSaveBusy(true);
    setObjectError(null);
    setTestMessage(null);
    setTestOk(null);
    setTestUrl(null);
    try {
      const res = await fetch("/api/storage/object-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          provider: STORAGE_PROVIDER,
          clearConfig: true,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        configs?: StorageConfig[];
      };
      if (!data.ok) {
        setObjectError(data.error ?? "清除失败");
        return;
      }
      if (data.configs) {
        setConfigs(data.configs);
        applyStorageForm(data.configs);
      } else {
        setForm(formFromExamples());
      }
      await refresh();
    } finally {
      setSaveBusy(false);
    }
  }

  const providers = status?.objectStorage?.providers ?? [];
  const selectedStatus = providers.find((row) => row.provider === provider);
  const selectedSource = selectedStatus?.source ?? "none";
  const sourceLabel =
    selectedSource === "db"
      ? "页面配置"
      : selectedSource === "env"
        ? "环境变量"
        : null;
  const gwSnippets = status?.dataDir
    ? gatewaySnippets(status.dataDir)
    : null;
  const examples = S3_FIELD_EXAMPLES;

  return (
    <div>
      <PageHeader title="系统设置" />

      <div className="space-y-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="text-sm font-medium text-zinc-800">存储</div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
            数据目录内含 <span className="font-mono">modeldesk.db</span>
            （模型与 Key）、<span className="font-mono">artifacts/</span>{" "}
            与加密密钥文件。开发默认多用仓库{" "}
            <span className="font-mono">data/</span>
            ；桌面默认为{" "}
            <span className="font-mono">%LOCALAPPDATA%\ModelDesk</span>
            。MCP/CLI 须与此目录一致。详见 README「数据目录」。
          </p>
          {error ? (
            <p className="mt-2 text-sm text-red-600">{error}</p>
          ) : null}
          {status ? (
            <dl className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
              <div>
                <dt className="text-zinc-400">数据目录</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">
                  {status.dataDir}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">数据库</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">
                  {status.dbPath}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">ENCRYPTION_SECRET</dt>
                <dd>
                  {status.encryptionConfigured
                    ? status.encryptionSource === "file"
                      ? "已配置（数据目录）"
                      : "已配置（环境变量）"
                    : "未配置"}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">数量</dt>
                <dd>
                  {status.modelCount} 个模型 · {status.artifactCount} 个结果
                </dd>
              </div>
            </dl>
          ) : !error ? (
            <p className="mt-2 text-sm text-zinc-500">加载中…</p>
          ) : null}

          {!status?.encryptionConfigured ? (
            <p className="mt-3 text-sm text-amber-800">
              尚未配置加密密钥。保存模型密钥或对象存储前，请先生成。
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              刷新
            </button>
            <button
              type="button"
              disabled={openDirBusy || !status?.dataDir}
              onClick={() => void openDataDir()}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              {openDirBusy ? "打开中…" : "打开数据目录"}
            </button>
            <button
              type="button"
              onClick={() => {
                setChangeError(null);
                setChangeMessage(null);
                setMigrateData(true);
                setNextDataDir(status?.dataDir ?? "");
                setChangeOpen((v) => !v);
              }}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50"
            >
              {changeOpen ? "收起" : "更改位置…"}
            </button>
            {!status?.encryptionConfigured ? (
              <button
                type="button"
                disabled={genBusy}
                onClick={() => void generateEncryptionSecret()}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {genBusy ? "生成中…" : "生成加密密钥"}
              </button>
            ) : null}
            {genMessage ? (
              <span className="text-sm text-zinc-600">{genMessage}</span>
            ) : null}
          </div>

          {changeOpen ? (
            <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <p className="text-sm text-zinc-600">
                默认位置：{" "}
                <span className="break-all font-mono text-xs text-zinc-800">
                  {status?.defaultDataDir ?? "（加载中）"}
                </span>
                {status?.usingCustomDir ? (
                  <span className="ml-2 text-amber-700">· 当前为自定义目录</span>
                ) : null}
              </p>
              <label className="mt-3 block text-sm text-zinc-700">
                新数据目录（绝对路径）
                <input
                  type="text"
                  value={nextDataDir}
                  onChange={(e) => setNextDataDir(e.target.value)}
                  placeholder="例如 D:\ModelDeskData"
                  className="md-control mt-1 w-full font-mono text-xs"
                />
              </label>
              <label className="mt-3 flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={migrateData}
                  onChange={(e) => setMigrateData(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  迁移现有数据（数据库、加密密钥、生成结果）。不会删除原目录。
                </span>
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={changeBusy || !nextDataDir.trim()}
                  onClick={() => void applyDataDirChange(false)}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {changeBusy ? "处理中…" : "确认更改"}
                </button>
                {status && !status.isDefault ? (
                  <button
                    type="button"
                    disabled={changeBusy}
                    onClick={() => void applyDataDirChange(true)}
                    className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    恢复默认位置
                  </button>
                ) : null}
              </div>
              {changeError ? (
                <p className="mt-2 text-sm text-red-600">{changeError}</p>
              ) : null}
              {changeMessage ? (
                <p className="mt-2 text-sm text-amber-800">{changeMessage}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="text-sm font-medium text-zinc-800">磁盘占用</div>
          <p className="mt-1 text-sm text-zinc-500">
            生成结果会占本地磁盘。可按需清理产物（不删模型与 Key）。
          </p>
          {status?.disk ? (
            <>
              <dl className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-400">合计（产物 + 库）</dt>
                  <dd className="font-medium text-zinc-800">
                    {formatBytes(status.disk.totalBytes)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-400">数据库</dt>
                  <dd>
                    {formatBytes(status.disk.dbBytes)} ·{" "}
                    {status.disk.runCount} 条运行 ·{" "}
                    {status.disk.artifactCount} 个产物
                  </dd>
                </div>
              </dl>
              <ul className="mt-3 grid gap-1 text-sm text-zinc-600 sm:grid-cols-2">
                {status.disk.buckets.map((b) => (
                  <li key={b.id} className="flex justify-between gap-2">
                    <span>{b.label}</span>
                    <span className="font-mono text-xs text-zinc-800">
                      {formatBytes(b.bytes)}
                      {b.files ? ` · ${b.files}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="mt-4 flex items-start gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={clearRunsToo}
                  onChange={(e) => setClearRunsToo(e.target.checked)}
                  className="mt-1"
                />
                <span>同时清空运行历史（历史表里的记录一并删除）</span>
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={cleanupBusy}
                  onClick={() => void cleanupDisk()}
                  className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {cleanupBusy ? "清理中…" : "清理生成结果"}
                </button>
              </div>
              {cleanupError ? (
                <p className="mt-2 text-sm text-red-600">{cleanupError}</p>
              ) : null}
              {cleanupMessage ? (
                <p className="mt-2 text-sm text-emerald-700">{cleanupMessage}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">加载中…</p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="text-sm font-medium text-zinc-800">
            外部调用（CLI / MCP / Gateway）
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            与上方数据目录共用同一套模型与密钥。CLI / MCP 给脚本与编辑器；业务 HTTP
            默认走 Web/桌面同端口（
            <span className="font-mono text-xs">:3300/v1</span>
            ），不必另起进程。桌面安装后会自动写入命令；也可在此修复。
          </p>
          {status?.agentBins ? (
            <dl className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2">
              <div>
                <dt className="text-zinc-400">命令目录</dt>
                <dd className="break-all font-mono text-xs text-zinc-800">
                  {status.agentBins.binDir}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-400">状态</dt>
                <dd>
                  {status.agentBins.installed
                    ? "已安装 modeldesk / modeldesk-mcp / modeldesk-gateway"
                    : "未检测到命令（可安装或检查 PATH）"}
                </dd>
              </div>
            </dl>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={agentBusy || !status?.agentBins?.canInstall}
              onClick={() => void installAgentBins()}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              title={
                status?.agentBins?.canInstall
                  ? undefined
                  : "需要 Desktop engine（安装包或 desktop:prepare）"
              }
            >
              {agentBusy ? "安装中…" : "安装 / 修复命令行"}
            </button>
            <button
              type="button"
              disabled={!status?.agentBins?.mcpConfigExample}
              onClick={() => void copyMcpConfig("json")}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              {mcpCopied ? "已复制" : "复制 MCP（JSON）"}
            </button>
            <button
              type="button"
              disabled={!status?.agentBins?.mcpCodexTomlExample}
              onClick={() => void copyMcpConfig("codex")}
              className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              {codexCopied ? "已复制" : "复制 Codex（TOML）"}
            </button>
          </div>
          {agentError ? (
            <p className="mt-2 text-sm text-red-600">{agentError}</p>
          ) : null}
          {agentMessage ? (
            <p className="mt-2 text-sm text-emerald-800">{agentMessage}</p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-500">
            MCP 使用绝对路径启动，默认跟随本机已打开的 Desk（
            <span className="font-mono text-xs">:3300/healthz</span>{" "}
            的数据目录），与界面模型一致。请保持 Desk 开着；粘贴到 Trae / Cursor /
            WorkBuddy（JSON）或 Codex（TOML）。改完后请在编辑器里重载 MCP。
          </p>
          {!status?.agentBins?.canInstall ? (
            <p className="mt-2 text-sm text-zinc-500">
              开发仓可用：
              <code className="font-mono text-xs">
                pnpm install:bins -- --add-path
              </code>
            </p>
          ) : null}
          {status?.agentBins?.mcpConfigExample ? (
            <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
              {status.agentBins.mcpConfigExample}
            </pre>
          ) : null}

          <div className="mt-6 border-t border-zinc-100 pt-5">
            <div className="text-sm font-medium text-zinc-800">
              Gateway API（本机业务 · 默认 :3300）
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
              打开本应用后即可调用{" "}
              <span className="font-mono text-xs text-zinc-700">
                http://127.0.0.1:3300/v1/…
              </span>
              （勿对公网开放）。先绑稳定别名（
              <span className="font-mono text-xs">llm-default</span> /
              <span className="font-mono text-xs"> image-default</span>
              …），业务里写死别名即可换模型。可选{" "}
              <span className="font-mono text-xs">MODELDESK_GATEWAY_TOKEN</span>
              （Bearer；多值逗号分隔）。不开 UI 时才需要{" "}
              <span className="font-mono text-xs">modeldesk-gateway</span>（
              <span className="font-mono text-xs">:3310</span>
              ）。契约：
              <span className="font-mono text-xs">/openapi.yaml</span>、
              <span className="font-mono text-xs">@modeldesk/gateway-client</span>
              。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {(
                [
                  ["env", "复制启动环境"],
                  ["aliases", "复制绑别名"],
                  ["chat", "复制文 curl"],
                  ["image", "复制图 curl"],
                  ["client", "复制 Client"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={!status?.dataDir}
                  onClick={() => void copyGatewaySnippet(key)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {gatewayCopied === key ? "已复制" : label}
                </button>
              ))}
            </div>
            {gwSnippets ? (
              <pre className="mt-3 max-h-56 overflow-auto rounded-md bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
                {`# 1) 打开 Web/桌面（:3300）即可，无需 modeldesk-gateway
# 2) 绑别名（registry id 在「模型配置」或 GET /v1/models）
${gwSnippets.aliases}

# 3) 业务调用（只写别名）
${gwSnippets.chat}

${gwSnippets.image}

# 可选鉴权头: -H "Authorization: Bearer <MODELDESK_GATEWAY_TOKEN>"
# 详解见仓库 docs/gateway-business.md`}
              </pre>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">加载数据目录后可复制示例…</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-zinc-800">对象存储</div>
              <p className="mt-1 text-sm text-zinc-500">
                {enabled
                  ? status?.objectStorage?.configured
                    ? `已启用 · S3 兼容可用${sourceLabel ? `（${sourceLabel}）` : ""}`
                    : "已启用 · 请填写并保存下方 S3 兼容配置"
                  : "默认关闭 · 开启后可配置七牛 / MinIO / AWS 等 S3 兼容存储"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={saveBusy}
              onClick={() => void savePrefs(!enabled, STORAGE_PROVIDER)}
              className={`relative h-7 w-12 rounded-full transition-colors disabled:opacity-50 ${
                enabled ? "bg-zinc-900" : "bg-zinc-300"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {!enabled ? (
            <p className="mt-4 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-3 text-sm leading-relaxed text-zinc-600">
              多数模型可直接使用本地上传的图片 / 视频文件。部分图片或视频接口
              <span className="font-medium text-zinc-800">不支持本地文件</span>
              ，只接受公网可访问的{" "}
              <span className="font-medium text-zinc-800">URL</span>
              。若你用到这类模型，请开启对象存储，把临时文件上传到云端后再把链接交给接口。
            </p>
          ) : (
            <>
              <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                用于把本地媒体上传为公网 URL。统一使用{" "}
                <span className="font-medium text-zinc-700">S3 兼容</span>
                协议（七牛 Kodo / MinIO / AWS / 各云 S3 网关）。未保存过时预填七牛常见示例；占位为中英对照。
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={saveBusy}
                  onClick={() => void saveConfig()}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {saveBusy ? "保存中…" : "保存配置"}
                </button>
                <button
                  type="button"
                  disabled={testBusy || saveBusy || !enabled}
                  onClick={() => void testObjectStorage()}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {testBusy ? "测试中…" : "测试"}
                </button>
                <button
                  type="button"
                  disabled={
                    saveBusy ||
                    !(
                      currentConfig?.updatedAt ||
                      currentConfig?.hasAccessKey ||
                      currentConfig?.hasSecretKey ||
                      currentConfig?.bucket
                    )
                  }
                  onClick={() => void clearConfig()}
                  className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  清除配置
                </button>
                {testMessage ? (
                  <span
                    className={`text-sm ${
                      testOk ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {testMessage}
                  </span>
                ) : null}
              </div>

              {testUrl ? (
                <p className="mt-2 break-all text-sm text-zinc-600">
                  测试 URL：{" "}
                  <a
                    href={testUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
                  >
                    {testUrl}
                  </a>
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="md-field">
                  <span className="md-label">存储桶 · Bucket</span>
                  <input
                    value={form.bucket}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, bucket: e.target.value }))
                    }
                    placeholder={examples.bucket}
                    className={fieldClass()}
                    autoComplete="off"
                  />
                  <span className="mt-1 text-[11px] text-zinc-400">
                    {FIELD_HINTS.bucket}
                  </span>
                </label>
                <label className="md-field">
                  <span className="md-label">访问密钥 · Access Key</span>
                  <input
                    value={form.accessKey}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, accessKey: e.target.value }))
                    }
                    placeholder={
                      currentConfig?.hasAccessKey
                        ? (currentConfig.accessKeyMasked ??
                          "已保存，留空不改 / Saved — leave blank")
                        : examples.accessKey
                    }
                    className={fieldClass()}
                    autoComplete="off"
                  />
                  <span className="mt-1 text-[11px] text-zinc-400">
                    {FIELD_HINTS.accessKey}
                  </span>
                </label>
                <label className="md-field">
                  <span className="md-label">密钥 · Secret Key</span>
                  <input
                    type="password"
                    value={form.secretKey}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, secretKey: e.target.value }))
                    }
                    placeholder={
                      currentConfig?.hasSecretKey
                        ? (currentConfig.secretKeyMasked ??
                          "已保存，留空不改 / Saved — leave blank")
                        : examples.secretKey
                    }
                    className={fieldClass()}
                    autoComplete="new-password"
                  />
                  <span className="mt-1 text-[11px] text-zinc-400">
                    {FIELD_HINTS.secretKey}
                  </span>
                </label>
                <label className="md-field">
                  <span className="md-label">区域 · Region</span>
                  <input
                    value={form.region}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, region: e.target.value }))
                    }
                    placeholder={examples.region}
                    className={fieldClass()}
                    autoComplete="off"
                  />
                  <span className="mt-1 text-[11px] text-zinc-400">
                    {FIELD_HINTS.region}
                  </span>
                </label>
                <label className="md-field">
                  <span className="md-label">接口地址 · Endpoint</span>
                  <input
                    value={form.endpoint}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endpoint: e.target.value }))
                    }
                    placeholder={examples.endpoint}
                    className={fieldClass()}
                    autoComplete="off"
                  />
                  <span className="mt-1 text-[11px] text-zinc-400">
                    {FIELD_HINTS.endpoint}
                  </span>
                </label>
                <label className="md-field sm:col-span-2">
                  <span className="md-label">公网访问域名 · Public Base URL</span>
                  <input
                    value={form.publicBaseUrl}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        publicBaseUrl: e.target.value,
                      }))
                    }
                    placeholder={examples.publicBaseUrl}
                    className={fieldClass()}
                    autoComplete="off"
                  />
                  <span className="mt-1 text-[11px] text-zinc-400">
                    {FIELD_HINTS.publicBaseUrl}
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-zinc-600">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.forcePathStyle}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        forcePathStyle: e.target.checked,
                      }))
                    }
                  />
                  <span>{FIELD_HINTS.forcePathStyle}</span>
                </label>
                <label className="flex items-start gap-2 text-sm text-zinc-600">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={form.skipAcl}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        skipAcl: e.target.checked,
                      }))
                    }
                  />
                  <span>{FIELD_HINTS.skipAcl}</span>
                </label>
              </div>
            </>
          )}

          {objectError ? (
            <p className="mt-2 text-sm text-red-600">{objectError}</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-500">
          加密密钥：设置页生成（写入数据目录）或{" "}
          <code className="text-zinc-800">.env.local</code> 的{" "}
          <code className="text-zinc-800">ENCRYPTION_SECRET</code>
          。对象存储与模型密钥加密落库，界面仅显示掩码。
        </div>
      </div>
    </div>
  );
}
