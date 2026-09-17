# ModelDesk · Product Freeze

> **Status:** frozen 2026-09-16 · **implementation sync:** 2026-09-16  
> **Scope:** product definition. Keeps boundaries; reflects what the desk already ships.  
> **Not in scope here:** Gateway rewrite, MCP rewrite, DB schema changes, new product modules.

---

## 1. Positioning (frozen)

**ModelDesk**

**Test. Compare. Use.**

Local multimodal AI playground + comparison + OpenAI-compatible gateway.

中文：本机多模态 AI 配测台：测试、对比模型，并直接生成可用的 Gateway 调用代码。

**Audience:** developers.

**Problem:** when using multiple AI models/APIs you must configure keys, test modalities, compare quality/latency, pick one, then wire it into your app.

**Loop:**

```text
Configure → Test → Compare → Use
```

---

## 2. Navigation

```text
ModelDesk

WORKSPACE
├── Playground
│   ├── Text      → /runs/text
│   ├── Image     → /runs/image
│   ├── Audio     → /runs/audio
│   └── Video     → /runs/video
├── Compare       → /runs/compare   (Available)
└── History       → /gallery        (label target: History; page kept)

MODELS
└── Models        → /models

TOOLS (surface existing Settings copy; optional thin pages later)
├── Gateway       → Settings → 外部调用 / aliases
└── MCP           → Settings → 外部调用

SETTINGS
└── Settings      → /settings
```

**No top-level “Use” page.** Use = result action: **Use this model**.

### Current nav (`packages/shared/src/nav.ts`)

| Today | Role |
|-------|------|
| 实测 → 文本 / 图片 / 视频 / 语音 | Playground |
| 实测 → **Compare** | Compare (Available) |
| 管理 → 生成结果 | History / gallery |
| 管理 → 模型配置 | Models |
| 管理 → 系统设置 | Settings (+ Gateway / MCP copy) |
| 管理 → 项目说明 `/about` | Internal; prefer hide from primary pitch |

Dead redirects (keep, no nav): `/`, `/bench`, `/runs/single`.

---

## 3. Page responsibilities

| Page | Job (one sentence) | Status |
|------|--------------------|--------|
| **Playground (4)** | Test **one** model for one modality. | Available |
| **Compare** | Same input → run **2–3** models → side-by-side inspect. | Available |
| **History** | Browse past artifacts / generations. | Available |
| **Models** | Register providers, keys (encrypted), connectivity. | Available |
| **Gateway (Tools)** | Explain + manage aliases / copy Gateway usage (`:3300/v1`). | Available (via Settings) |
| **MCP (Tools)** | Copy Cursor/MCP config. | Available (via Settings) |
| **Settings** | Data dir, storage, disk, encryption, misc. | Available |
| **About** | Deep docs for contributors; not first-run path. | Available (route) |

---

## 4. User path: Playground → Compare → Use

```text
Configure Model (Models)
        ↓
Playground — Test one model
        ↓
Compare — Run All (2–3 models, same input)
        ↓
Inspect response / latency / tokens / errors / artifacts
        ↓
[ Use this model ]   ← Compare result cards
        ↓
curl · Python · Java
        ↓
OpenAI-compatible Gateway  http://127.0.0.1:3300/v1
        ↓
Cursor / MCP / your app
```

---

## 5. Compare (Available)

Path: `/runs/compare`.

```text
Compare
├── Modality select (Text | Image | Audio | Video)
├── Model multi-select (2–3, same modality)
├── Shared prompt + modality inputs + params
├── [ Run All ]
└── Result columns (one per model)
    ├── Response / artifact
    ├── Latency
    ├── TTFT (when available)
    ├── Tokens (when upstream provides)
    ├── Error / partial failure
    └── [ Use this model ]
```

**Out of scope (do not build as product):** AI judge, scores, winner, ranking, benchmark dashboard, eval suites, dedicated score DB.

---

## 6. “Use this model” (Available)

```text
Use this model
├── Model (display name)
├── Gateway model id
├── Endpoint: http://127.0.0.1:3300/v1
├── Language tabs: curl | Python | Java
├── Code preview
└── [ Copy ]
```

**Implemented on Compare result cards.** Settings also ships Gateway curl / client / MCP snippets.  
Playground single-run entry for the same dialog is optional polish — not required to claim the Use path.

---

## 7. Gateway / MCP (product roles — no rewrite)

| Piece | Role | Status |
|-------|------|--------|
| **Gateway** | Infrastructure for **Use**. Default `http://127.0.0.1:3300/v1`. Optional headless `:3310`. | Available |
| **MCP** | One **Use** path for editors (Cursor). | Available |

**Do not:** rebuild Gateway, Agent framework, workflows, multi-agent orchestration.

---

## 8. README TOC (aligned)

See root `README.md`:

1. Hero — Test. Compare. Use.  
2. Path diagram  
3. Why ModelDesk  
4. What you can do  
5. Demo  
6. Quick Start  
7. Compare models  
8. Use this model  
9. Gateway  
10. MCP / Cursor  
11. Architecture  
12. Security / Local-first  
13. Documentation  
14. Development  
15. Contributing / License  

---

## 9. GitHub packaging

**Description:**

```text
Local multimodal AI playground to test, compare & use APIs via an OpenAI-compatible local gateway.
```

**Topics (examples):**

`openai-compatible` · `llm-gateway` · `local-first` · `mcp-server` · `typescript` · `nextjs` · `desktop-app` · `ai-gateway` · `self-hosted`

**Version note (as of 2026-09-16):** source / `package.json` is **0.2.3**. Latest GitHub Release **with installer assets** is **v0.2.1** (`ModelDesk_0.2.1_x64-setup.exe`). There is **no** `v0.2.3` GitHub Release page yet — README download links must follow published assets, not the source version alone.

---

## 10. Hide / keep / never build

### Hide from product narrative (keep code if still used)

- Internal roadmaps as README pitch  
- `/about` as primary nav item  
- Music modality, Radar  
- Eval suite / scores as product  
- Dense capability tables / screenshot walls  
- Platform / multi-tenant future design  

### Keep (main or support path)

- Text / Image / Audio / Video playground  
- Compare (2–3 models)  
- Use this model (curl / Python / Java)  
- Models + encrypted keys + connectivity test  
- History/gallery + in-page run history  
- Gateway `:3300/v1` (+ optional headless)  
- MCP + CLI + desktop  
- S3 object storage (when public URL required)  
- Community relay formats (opt-in)  
- Adapter docs  

### Explicitly do **not** build

- SaaS, login, cloud sync, multi-tenant, billing  
- RAG, Agent platform, workflow / multi-agent  
- Large adapter refactors for cosmetics  
- Compare AI judge / ranking / benchmark product  
- Fifth modality / restore Music  
- Feature sprawl for stars  

---

## 11. Remaining polish (not blockers for the story)

| Item | Note |
|------|------|
| Nav label renames (Playground / History EN) | Optional UX |
| Dedicated Tools pages for Gateway / MCP | Optional; Settings copy is enough |
| Playground **Use this model** button | Optional; Compare already covers Use |
| Project-page Demo GIF refresh | Media only — Test → Compare → Use |

---

## 12. Success criterion

A stranger opening ModelDesk / GitHub understands in **≤10 seconds**:

> Local tool to **test** and **compare** multimodal AI models with your own keys, then **use** the chosen model through an OpenAI-compatible gateway in your own programs.
