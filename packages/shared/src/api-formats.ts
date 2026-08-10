/**
 * API 格式（协议方言）：与 Base URL / 中转无关。
 * 用户注册模型时选择格式 → 决定参数 UI + 请求如何拼装。
 */

import type { RunParamField } from "./run-params";

export type ApiFormatModality = "text" | "image" | "video" | "audio" | "music";

export type ApiFormatId = string;

/** UI grouping: core = default list; extended/relay need toggles. */
export type ApiFormatTier = "core" | "extended" | "relay";

export type ApiFormatDef = {
  id: ApiFormatId;
  /** 下拉简短显示名（如 OpenAI） */
  label: string;
  /** 次要说明，显示在控件下方 */
  hint?: string;
  modality: ApiFormatModality;
  /**
   * 选中格式时建议填入的 Base URL（简单模式 = API 根）。
   * 例：https://ark.cn-beijing.volces.com/api/v3
   */
  suggestedBaseUrl?: string;
  /**
   * API 根路径（相对 host）。简单模式缺省时用于补全。
   * 文本 chat 格式不走此字段。
   */
  apiRootPath?: string;
  /**
   * 高级模式 / 请求预览用的 action 路径。
   * 例：/images/generations → …/api/v3/images/generations
   */
  apiActionPath?: string;
  suggestedModelId?: string;
  /** Model 下拉可选列表（可手改；值为实际 model id） */
  modelOptions?: readonly string[];
  /** 下拉显示文案（key = model id）；缺省则直接显示 id */
  modelOptionLabels?: Readonly<Record<string, string>>;
  /** 单测 / 模型默认值表单字段 */
  fields: readonly RunParamField[];
  /** Default core; extended/relay hidden unless UI asks. */
  tier?: ApiFormatTier;
};

const TEXT_CHAT_FIELDS: readonly RunParamField[] = [
  {
    key: "temperature",
    label: "温度",
    type: "number",
    defaultValue: "0.2",
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    key: "max_tokens",
    label: "最大长度",
    type: "select",
    defaultValue: "1024",
    options: [
      { value: "256", label: "256" },
      { value: "512", label: "512" },
      { value: "1024", label: "1024" },
      { value: "2048", label: "2048" },
      { value: "4096", label: "4096" },
      { value: "8192", label: "8192" },
    ],
  },
];

const ASPECT_COMMON: RunParamField = {
  key: "aspect_ratio",
  label: "画幅",
  type: "select",
  defaultValue: "16:9",
  options: [
    { value: "16:9", label: "16:9 横屏" },
    { value: "9:16", label: "9:16 竖屏" },
    { value: "1:1", label: "1:1 方形" },
    { value: "4:3", label: "4:3" },
    { value: "3:4", label: "3:4" },
  ],
};

const DURATION_AGNES: RunParamField = {
  key: "duration_sec",
  label: "时长",
  type: "select",
  defaultValue: "5",
  options: [
    { value: "3", label: "约 3 秒" },
    { value: "5", label: "约 5 秒" },
    { value: "10", label: "约 10 秒" },
    { value: "18", label: "约 18 秒" },
  ],
  hint: "由 num_frames / frame_rate 换算（8n+1）",
};

const DURATION_5_10: RunParamField = {
  key: "duration_sec",
  label: "时长",
  type: "select",
  defaultValue: "5",
  options: [
    { value: "5", label: "5 秒" },
    { value: "10", label: "10 秒" },
  ],
};

const RESOLUTION_TIER: RunParamField = {
  key: "resolution",
  label: "分辨率档位",
  type: "select",
  defaultValue: "720p",
  options: [
    { value: "480p", label: "480p" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
  ],
};

/** 智谱：直接选官方 size 枚举 */
const ZHIPU_SIZE: RunParamField = {
  key: "resolution",
  label: "分辨率",
  type: "select",
  defaultValue: "1920x1080",
  options: [
    { value: "720x480", label: "720×480 · 标清横屏" },
    { value: "1280x720", label: "1280×720 · 720p 16:9（X3）" },
    { value: "720x1280", label: "720×1280 · 720p 9:16（X3）" },
    { value: "1024x1024", label: "1024×1024 · 方形" },
    { value: "1280x960", label: "1280×960 · 4:3" },
    { value: "960x1280", label: "960×1280 · 3:4" },
    { value: "1920x1080", label: "1920×1080 · 1080p 16:9" },
    { value: "1080x1920", label: "1080×1920 · 1080p 9:16" },
    { value: "2048x1080", label: "2048×1080 · 2K 超宽" },
    { value: "3840x2160", label: "3840×2160 · 4K" },
  ],
};

/** 图生图参考图列表：本地上传存 data URI，也可粘贴公网 URL；UI 为可连续添加的缩略图。 */
const REFERENCE_IMAGES: RunParamField = {
  key: "reference_images",
  label: "参考图",
  type: "image_list",
  defaultValue: "",
  hint: "可连续上传多张；点击缩略图右上角删除",
  max: 4,
};

/** 单张参考图（视频图生视频等，无首尾帧模式）。 */
const REFERENCE_IMAGE: RunParamField = {
  key: "reference_image",
  label: "参考图",
  type: "image",
  defaultValue: "",
  hint: "可选。上传→base64；也可填公网 URL",
};

/**
 * 视频参考输入：无 / 参考图 / 首尾帧（UI 分段；值仍写 reference_image + endKey）。
 */
const REFERENCE_IMAGE_PAIR: RunParamField = {
  key: "reference_image",
  label: "参考输入",
  type: "image_pair",
  defaultValue: "",
  endKey: "reference_image_end",
  hint: "参考图（单张图生）或首尾帧（约束起止画面）",
};

const AUDIO_SPEED: RunParamField = {
  key: "speed",
  label: "语速",
  type: "number",
  defaultValue: "1",
  min: 0.5,
  max: 2,
  step: 0.1,
};

const AUDIO_MINIMAX_FIELDS: readonly RunParamField[] = [
  {
    key: "voice",
    label: "音色",
    type: "select",
    defaultValue: "",
    hint: "MiniMax 系统音色",
    options: [
      { value: "", label: "模型默认" },
      { value: "male-qn-qingse", label: "男 · 青涩青年" },
      { value: "male-qn-jingying", label: "男 · 精英青年" },
      { value: "male-qn-badao", label: "男 · 霸道青年" },
      { value: "male-qn-daxuesheng", label: "男 · 大学生" },
      { value: "presenter_male", label: "男 · 主持人" },
      { value: "audiobook_male_1", label: "男 · 有声书" },
      { value: "female-shaonv", label: "女 · 少女" },
      { value: "female-tianmei", label: "女 · 甜美" },
      { value: "female-yujie", label: "女 · 御姐" },
      { value: "female-chengshu", label: "女 · 成熟" },
      { value: "presenter_female", label: "女 · 主持人" },
      { value: "audiobook_female_1", label: "女 · 有声书" },
      { value: "female-yujie-jingpin", label: "女 · 御姐（精品）" },
      { value: "female-tianmei-jingpin", label: "女 · 甜美（精品）" },
      { value: "female-shaonv-jingpin", label: "女 · 少女（精品）" },
    ],
  },
  AUDIO_SPEED,
  {
    key: "emotion",
    label: "情感",
    type: "select",
    defaultValue: "",
    hint: "MiniMax 情感枚举",
    options: [
      { value: "", label: "默认" },
      { value: "happy", label: "开心 happy" },
      { value: "sad", label: "悲伤 sad" },
      { value: "angry", label: "愤怒 angry" },
      { value: "fearful", label: "恐惧 fearful" },
      { value: "disgusted", label: "厌恶 disgusted" },
      { value: "surprised", label: "惊讶 surprised" },
      { value: "calm", label: "平静 calm" },
      { value: "whisper", label: "耳语 whisper" },
    ],
  },
];

const AUDIO_QWEN_FIELDS: readonly RunParamField[] = [
  {
    key: "voice",
    label: "音色",
    type: "select",
    defaultValue: "",
    hint: "千问 TTS / CosyVoice 音色（按所选模型选用）",
    options: [
      { value: "", label: "模型默认" },
      { value: "Cherry", label: "女 · Cherry（qwen3）" },
      { value: "Serena", label: "女 · Serena（qwen3）" },
      { value: "Ethan", label: "男 · Ethan（qwen3）" },
      { value: "Chelsie", label: "女 · Chelsie（qwen3）" },
      { value: "Moon", label: "男 · Moon（qwen3）" },
      { value: "Maia", label: "女 · Maia（qwen3）" },
      { value: "Kai", label: "男 · Kai（qwen3）" },
      { value: "Vivian", label: "女 · Vivian（qwen3）" },
      { value: "Momo", label: "女 · Momo（qwen3）" },
      { value: "Neil", label: "男 · Neil（qwen3）" },
      { value: "Jennifer", label: "女 · Jennifer（qwen3）" },
      { value: "Ryan", label: "男 · Ryan（qwen3）" },
      { value: "longanhuan_v3.6", label: "女 · 龙安欢（Flash）" },
      { value: "longjielidou_v3.6", label: "男童 · 龙杰力豆（Flash）" },
      { value: "loongeva_v3.6", label: "女 · loongeva（英·Flash）" },
      { value: "loongjohn", label: "男 · loongJohn（英·Flash）" },
      {
        value: "qwen-audio-3.0-tts-flash-longluanxuanling",
        label: "女 · 龙鸾萱凌（Flash）",
      },
      {
        value: "qwen-audio-3.0-tts-flash-longhuiluling",
        label: "女 · 龙晦露凌（Flash）",
      },
      {
        value: "qwen-audio-3.0-tts-flash-longyufengmo",
        label: "女 · 龙煜枫沫（Flash）",
      },
      {
        value: "qwen-audio-3.0-tts-flash-longyinghaixuan",
        label: "女 · 龙应海轩（Flash）",
      },
      {
        value: "qwen-audio-3.0-tts-flash-longshuojizhu",
        label: "男 · 龙朔霁竹（Flash）",
      },
      {
        value: "qwen-audio-3.0-tts-flash-longsonglinwang",
        label: "男 · 龙松麟望（Flash）",
      },
      {
        value: "qwen-audio-3.0-tts-flash-longyinghaikai",
        label: "男 · 龙应海凯（Flash）",
      },
      { value: "longanlingxi", label: "女 · 灵犀（旧·Flash）" },
    ],
  },
  AUDIO_SPEED,
  {
    key: "instruction",
    label: "风格",
    type: "select",
    defaultValue: "",
    hint: "自然语言风格指令（选「自定义」可手写）",
    options: [
      { value: "", label: "默认（无指令）" },
      {
        value: "请用充满遗憾和悲伤的语气朗读。",
        label: "遗憾悲伤",
      },
      {
        value: "请用轻松愉快的心情朗读。",
        label: "轻松愉快",
      },
      {
        value: "请用愤怒和质问的语气朗读。",
        label: "愤怒质问",
      },
      {
        value: "你是悬疑剧旁白，屏住呼吸把紧张感一层层叠上去",
        label: "悬疑旁白",
      },
      {
        value:
          "你是一位年轻女性小学老师，正在课堂上耐心地给一年级学生复述。语速很慢，语调上扬带笑意。",
        label: "小学老师 · 慢速带笑",
      },
      {
        value: "新闻播报节奏，咬字清楚，地名与数字处放慢，气息均匀。",
        label: "新闻播报",
      },
      {
        value: "请用温柔、缓慢的语速，像讲睡前故事一样朗读。",
        label: "睡前故事 · 温柔",
      },
      {
        value: "说到一半忍不住扑哧笑出声",
        label: "说到一半忍不住笑",
      },
      { value: "__custom__", label: "自定义…" },
    ],
  },
  {
    key: "instruction_custom",
    label: "自定义风格",
    type: "text",
    defaultValue: "",
    hint: "风格选「自定义」时填写，将作为 instruction 传给模型",
  },
];

const AUDIO_OPENAI_FIELDS: readonly RunParamField[] = [
  {
    key: "voice",
    label: "音色",
    type: "select",
    defaultValue: "alloy",
    options: [
      { value: "", label: "模型默认" },
      { value: "alloy", label: "alloy" },
      { value: "echo", label: "echo" },
      { value: "fable", label: "fable" },
      { value: "onyx", label: "onyx" },
      { value: "nova", label: "nova" },
      { value: "shimmer", label: "shimmer" },
    ],
  },
  AUDIO_SPEED,
];

const MUSIC_COMMON_FIELDS: readonly RunParamField[] = [
  {
    key: "is_instrumental",
    label: "纯伴奏",
    type: "boolean",
    defaultValue: "false",
  },
  {
    key: "lyrics_optimizer",
    label: "自动写词",
    type: "boolean",
    defaultValue: "true",
    hint: "有声歌曲且未填歌词时先调用歌词生成",
  },
  {
    key: "duration_sec",
    label: "目标时长（秒）",
    type: "number",
    defaultValue: "",
    min: 1,
    max: 300,
    step: 1,
    hint: "部分接口支持；留空则用模型默认",
  },
  {
    key: "lyrics",
    label: "歌词",
    type: "textarea",
    defaultValue: "",
    hint: "填写后关闭自动写词，严格按歌词生成",
  },
];

export const API_FORMATS: readonly ApiFormatDef[] = [
  // ── Text（国内常用置顶 + 御三家 + 兼容）──
  {
    id: "text.deepseek",
    label: "DeepSeek",
    hint: "DeepSeek 官方 /v1/chat/completions 格式",
    modality: "text",
    tier: "core",
    suggestedBaseUrl: "https://api.deepseek.com",
    suggestedModelId: "deepseek-v4-pro",
    modelOptions: ["deepseek-v4-pro", "deepseek-v4-flash"],
    fields: TEXT_CHAT_FIELDS,
  },
  {
    id: "text.zhipu",
    label: "智谱",
    hint: "GLM · open.bigmodel.cn",
    modality: "text",
    tier: "core",
    suggestedBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    suggestedModelId: "glm-5.2",
    modelOptions: ["glm-5.2", "glm-5.1", "glm-5", "glm-4.7-flash"],
    modelOptionLabels: {
      "glm-4.7-flash": "glm-4.7-flash（免费）",
    },
    fields: TEXT_CHAT_FIELDS,
  },
  {
    id: "text.openai",
    label: "OpenAI",
    hint: "标准 /v1/chat/completions 格式",
    modality: "text",
    tier: "core",
    suggestedBaseUrl: "https://api.openai.com/v1",
    suggestedModelId: "gpt-4o",
    modelOptions: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o3-mini", "o4-mini"],
    fields: TEXT_CHAT_FIELDS,
  },
  {
    id: "text.anthropic",
    label: "Claude",
    hint: "Anthropic Claude /v1/messages 格式",
    modality: "text",
    tier: "core",
    suggestedBaseUrl: "",
    suggestedModelId: "claude-sonnet-4-20250514",
    modelOptions: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-3-5-haiku-latest",
    ],
    fields: TEXT_CHAT_FIELDS,
  },
  {
    id: "text.gemini",
    label: "Gemini",
    hint: "Google Gemini generateContent 格式",
    modality: "text",
    tier: "core",
    suggestedBaseUrl:
      "https://generativelanguage.googleapis.com/v1beta/openai",
    suggestedModelId: "gemini-2.0-flash",
    modelOptions: [
      "gemini-2.0-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
    ],
    fields: TEXT_CHAT_FIELDS,
  },
  {
    id: "text.openai-compatible",
    label: "OpenAI 兼容",
    hint: "自定义 OpenAI 兼容 endpoint",
    modality: "text",
    tier: "core",
    suggestedBaseUrl: "",
    suggestedModelId: "",
    modelOptions: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
    fields: TEXT_CHAT_FIELDS,
  },

  // ── Image（主流置顶：即梦 → 智谱 → Agnes；中转 relay 不进默认列表）──
  {
    id: "image.volcengine-seedream",
    label: "即梦 Seedream",
    hint: "火山方舟 · 下拉显示产品名，保存/调用为官方完整 doubao-seedream-* ID",
    modality: "image",
    tier: "core",
    suggestedBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiRootPath: "/api/v3",
    apiActionPath: "/images/generations",
    suggestedModelId: "doubao-seedream-5-0-pro-260628",
    modelOptions: [
      "doubao-seedream-5-0-pro-260628",
      "doubao-seedream-5-0-260128",
      "doubao-seedream-4-5-251128",
      "doubao-seedream-4-0-250828",
    ],
    modelOptionLabels: {
      "doubao-seedream-5-0-pro-260628": "Doubao-Seedream-5.0-pro",
      "doubao-seedream-5-0-260128": "Doubao-Seedream-5.0-lite",
      "doubao-seedream-4-5-251128": "Doubao-Seedream-4.5",
      "doubao-seedream-4-0-250828": "Doubao-Seedream-4.0",
    },
    fields: [
      {
        key: "size",
        label: "分辨率",
        type: "select",
        defaultValue: "2K",
        options: [
          { value: "2K", label: "2K" },
          { value: "3K", label: "3K（5.0-lite）" },
          { value: "4K", label: "4K（4.0 / 4.5）" },
        ],
        hint: "对应 API 的 size 档位；选了宽高比后会换成官方推荐像素",
      },
      {
        key: "ratio",
        label: "宽高比",
        type: "select",
        defaultValue: "1:1",
        options: [
          { value: "adaptive", label: "自适应（写进 prompt，由模型判断）" },
          { value: "1:1", label: "1:1" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
          { value: "3:2", label: "3:2" },
          { value: "2:3", label: "2:3" },
          { value: "21:9", label: "21:9" },
        ],
        hint: "官方无单独 aspect_ratio 字段：自适应=传 2K/4K；指定比例=传推荐 WxH",
      },
      {
        ...REFERENCE_IMAGES,
        hint: "可选图生图：公网 URL / 本地上传（写入 image）",
      },
    ],
  },
  {
    id: "image.zhipu-cogview",
    label: "智谱",
    hint: "CogView / GLM-Image · open.bigmodel.cn",
    modality: "image",
    tier: "core",
    suggestedBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiRootPath: "/api/paas/v4",
    apiActionPath: "/images/generations",
    suggestedModelId: "glm-image",
    modelOptions: ["glm-image", "cogview-4", "cogview-3-flash"],
    modelOptionLabels: {
      "glm-image": "glm-image",
      "cogview-4": "cogview-4",
      "cogview-3-flash": "cogview-3-flash（免费）",
    },
    fields: [
      {
        key: "size",
        label: "尺寸",
        type: "select",
        defaultValue: "1280x1280",
        options: [
          { value: "1280x1280", label: "1280×1280 · 1:1" },
          { value: "1728x960", label: "1728×960 · 16:9" },
          { value: "960x1728", label: "960×1728 · 9:16" },
          { value: "1568x1056", label: "1568×1056 · 3:2" },
          { value: "1056x1568", label: "1056×1568 · 2:3" },
          { value: "1024x1024", label: "1024×1024（CogView）" },
          { value: "1344x768", label: "1344×768 · 16:9（CogView）" },
          { value: "768x1344", label: "768×1344 · 9:16（CogView）" },
        ],
      },
      {
        key: "quality",
        label: "质量",
        type: "select",
        defaultValue: "hd",
        options: [
          { value: "hd", label: "高清 hd" },
          { value: "standard", label: "标准 standard" },
        ],
        hint: "glm-image 仅支持 hd",
      },
      {
        ...REFERENCE_IMAGES,
        hint: "可选图生图（glm-image 等）；写入 image",
      },
    ],
  },
  {
    id: "image.agnes",
    label: "Agnes",
    hint: "https://apihub.agnes-ai.com/v1 · 文生图 / 图生图",
    modality: "image",
    tier: "core",
    suggestedBaseUrl: "https://apihub.agnes-ai.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/images/generations",
    suggestedModelId: "agnes-image-2.1-flash",
    modelOptions: ["agnes-image-2.1-flash", "agnes-image-2.0-flash"],
    modelOptionLabels: {
      "agnes-image-2.1-flash": "agnes-image-2.1-flash（免费）",
      "agnes-image-2.0-flash": "agnes-image-2.0-flash（免费）",
    },
    fields: [
      {
        key: "size",
        label: "尺寸档位",
        type: "select",
        defaultValue: "1K",
        options: [
          { value: "1K", label: "1K" },
          { value: "2K", label: "2K" },
          { value: "3K", label: "3K" },
          { value: "4K", label: "4K" },
        ],
        hint: "官方推荐 1K–4K 档位；也可接受遗留 WxH",
      },
      {
        key: "ratio",
        label: "比例",
        type: "select",
        defaultValue: "16:9",
        options: [
          { value: "1:1", label: "1:1" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
          { value: "3:2", label: "3:2" },
          { value: "2:3", label: "2:3" },
          { value: "21:9", label: "21:9" },
        ],
      },
      {
        ...REFERENCE_IMAGES,
        hint: "图生图 / 多图合成：公网 URL 或本地上传；写入 extra_body.image",
      },
    ],
  },
  {
    id: "image.openai",
    label: "OpenAI",
    hint: "标准 /v1/images/generations",
    modality: "image",
    tier: "core",
    suggestedBaseUrl: "https://api.openai.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/images/generations",
    suggestedModelId: "gpt-image-2",
    modelOptions: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
    modelOptionLabels: {
      "gpt-image-2": "gpt-image-2",
      "gpt-image-1.5": "gpt-image-1.5",
      "gpt-image-1": "gpt-image-1",
    },
    fields: [
      {
        key: "size",
        label: "尺寸",
        type: "select",
        defaultValue: "1K",
        options: [
          { value: "1K", label: "1K" },
          { value: "2K", label: "2K" },
          { value: "3K", label: "3K" },
          { value: "4K", label: "4K" },
        ],
      },
      {
        key: "ratio",
        label: "比例",
        type: "select",
        defaultValue: "1:1",
        options: [
          { value: "1:1", label: "1:1" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
        ],
      },
      {
        key: "quality",
        label: "质量",
        type: "select",
        defaultValue: "high",
        options: [
          { value: "auto", label: "自动" },
          { value: "low", label: "低" },
          { value: "medium", label: "中" },
          { value: "high", label: "高" },
        ],
      },
      {
        ...REFERENCE_IMAGES,
        hint: "可选参考图",
      },
    ],
  },
  {
    id: "image.google-nano-banana",
    label: "Google（Nano Banana）",
    hint: "Gemini Image · generateContent",
    modality: "image",
    tier: "core",
    suggestedBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiRootPath: "/v1beta",
    suggestedModelId: "gemini-2.5-flash-image",
    modelOptions: [
      "gemini-2.5-flash-image",
      "gemini-3-pro-image",
      "gemini-3.1-flash-image",
      "gemini-3.1-flash-image-preview",
    ],
    modelOptionLabels: {
      "gemini-2.5-flash-image": "Nano Banana",
      "gemini-3-pro-image": "Nano Banana Pro",
      "gemini-3.1-flash-image": "Nano Banana 2",
      "gemini-3.1-flash-image-preview": "Nano Banana 2 Preview",
    },
    fields: [
      {
        key: "size",
        label: "分辨率",
        type: "select",
        defaultValue: "1K",
        options: [
          { value: "512", label: "512" },
          { value: "1K", label: "1K" },
          { value: "2K", label: "2K" },
          { value: "4K", label: "4K" },
        ],
      },
      {
        key: "ratio",
        label: "比例",
        type: "select",
        defaultValue: "1:1",
        options: [
          { value: "1:1", label: "1:1" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
          { value: "3:2", label: "3:2" },
          { value: "2:3", label: "2:3" },
          { value: "21:9", label: "21:9" },
        ],
      },
      {
        ...REFERENCE_IMAGES,
        hint: "可选图生图 / 编辑：上传或公网 URL",
      },
    ],
  },
  {
    id: "image.openai-compatible",
    label: "OpenAI 兼容",
    hint: "自定义 images/generations endpoint",
    modality: "image",
    tier: "core",
    suggestedBaseUrl: "",
    apiRootPath: "/v1",
    apiActionPath: "/images/generations",
    suggestedModelId: "gpt-image-2",
    modelOptions: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
    modelOptionLabels: {
      "gpt-image-2": "gpt-image-2",
      "gpt-image-1.5": "gpt-image-1.5",
      "gpt-image-1": "gpt-image-1",
    },
    fields: [
      {
        key: "size",
        label: "尺寸",
        type: "select",
        defaultValue: "1K",
        options: [
          { value: "1K", label: "1K" },
          { value: "2K", label: "2K" },
          { value: "3K", label: "3K" },
          { value: "4K", label: "4K" },
        ],
        hint: "换算为像素写入 size；同时附带 resolution/ratio",
      },
      {
        key: "ratio",
        label: "比例",
        type: "select",
        defaultValue: "16:9",
        options: [
          { value: "1:1", label: "1:1" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
          { value: "3:2", label: "3:2" },
          { value: "2:3", label: "2:3" },
          { value: "21:9", label: "21:9" },
        ],
      },
      {
        key: "quality",
        label: "质量",
        type: "select",
        defaultValue: "high",
        options: [
          { value: "auto", label: "自动" },
          { value: "low", label: "快速（低成本）" },
          { value: "medium", label: "平衡" },
          { value: "high", label: "高质量" },
        ],
      },
      {
        ...REFERENCE_IMAGES,
        hint: "图生图：http(s) 会先内联为 data URI 再提交",
      },
    ],
  },
  {
    id: "image.openai-async",
    label: "OpenAI 异步图",
    hint: "generations/edits → tasks 轮询 · quality auto|2k|4k",
    modality: "image",
    tier: "relay",
    suggestedBaseUrl: "",
    apiRootPath: "/v1",
    apiActionPath: "/images/generations",
    suggestedModelId: "gpt-image-2",
    modelOptions: ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"],
    modelOptionLabels: {
      "gpt-image-2": "gpt-image-2",
      "gpt-image-1.5": "gpt-image-1.5",
      "gpt-image-1": "gpt-image-1",
    },
    fields: [
      {
        key: "quality",
        label: "质量",
        type: "select",
        defaultValue: "auto",
        options: [
          { value: "auto", label: "普通" },
          { value: "2k", label: "2K" },
          { value: "4k", label: "4K" },
        ],
      },
      {
        key: "size",
        label: "比例",
        type: "select",
        defaultValue: "16:9",
        options: [
          { value: "1:1", label: "1:1" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
        ],
      },
      {
        ...REFERENCE_IMAGES,
        hint: "图生图：multipart /images/edits，字段 image（可重复）",
      },
    ],
  },
  {
    id: "image.mock",
    label: "Mock",
    hint: "本地演示",
    modality: "image",
    tier: "extended",
    suggestedBaseUrl: "mock://image",
    suggestedModelId: "mock-image",
    modelOptions: ["mock-image"],
    fields: [],
  },

  // ── Video（主流置顶：即梦 → 智谱 → Agnes）──
  {
    id: "video.volcengine-seedance",
    label: "即梦 Seedance",
    hint: "火山方舟 · 下拉显示产品名，保存/调用为官方完整 doubao-seedance-* ID",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiRootPath: "/api/v3",
    apiActionPath: "/contents/generations/tasks",
    suggestedModelId: "doubao-seedance-2-0-260128",
    modelOptions: [
      "doubao-seedance-2-5-260628",
      "doubao-seedance-2-0-mini-260615",
      "doubao-seedance-2-0-260128",
      "doubao-seedance-2-0-fast-260128",
    ],
    modelOptionLabels: {
      "doubao-seedance-2-5-260628": "Doubao-Seedance-2.5",
      "doubao-seedance-2-0-mini-260615": "Doubao-Seedance-2.0-mini",
      "doubao-seedance-2-0-260128": "Doubao-Seedance-2.0",
      "doubao-seedance-2-0-fast-260128": "Doubao-Seedance-2.0-fast",
    },
    fields: [
      {
        key: "duration_sec",
        label: "时长",
        type: "select",
        defaultValue: "5",
        options: [
          { value: "4", label: "4 秒" },
          { value: "5", label: "5 秒" },
          { value: "6", label: "6 秒" },
          { value: "8", label: "8 秒" },
          { value: "10", label: "10 秒" },
          { value: "12", label: "12 秒" },
          { value: "15", label: "15 秒" },
          {
            value: "30",
            label: "30 秒（2.5）",
            models: ["2-5", "2.5"],
          },
          { value: "-1", label: "自动（-1）" },
        ],
      },
      {
        ...ASPECT_COMMON,
        key: "aspect_ratio",
        label: "画幅 ratio",
        defaultValue: "adaptive",
        options: [
          { value: "adaptive", label: "adaptive（智能）" },
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "1:1", label: "1:1" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
          { value: "21:9", label: "21:9" },
        ],
      },
      {
        key: "resolution",
        label: "分辨率",
        type: "select",
        defaultValue: "720p",
        options: [
          { value: "480p", label: "480p" },
          { value: "720p", label: "720p" },
          {
            value: "1080p",
            label: "1080p（2.0）",
            excludeModels: [
              "2-5",
              "2.5",
              "2-0-fast",
              "2.0-fast",
              "2-0-mini",
              "2.0-mini",
            ],
          },
          {
            value: "4k",
            label: "4K（2.0）",
            excludeModels: [
              "2-5",
              "2.5",
              "2-0-fast",
              "2.0-fast",
              "2-0-mini",
              "2.0-mini",
            ],
          },
        ],
        hint: "2.5 / fast / mini：仅 480p·720p；完整 2.0 可到 1080p·4K",
      },
      {
        key: "camera_fixed",
        label: "固定镜头",
        type: "boolean",
        defaultValue: "false",
        hint: "1.0 / 1.5 支持；Seedance 2.x 不传",
        excludeModels: ["2-5", "2.5", "2-0", "2.0", "seedance-2"],
      },
      {
        key: "with_audio",
        label: "生成声音",
        type: "boolean",
        defaultValue: "false",
        hint: "顶层 generate_audio（1.5 / 2 / 2.5）",
      },
      {
        ...REFERENCE_IMAGE_PAIR,
        hint: "参考图或首尾帧；公网 URL / TOS（1.5+ first_frame / last_frame）",
      },
    ],
  },
  {
    id: "video.zhipu-cogvideox",
    label: "智谱",
    hint: "CogVideoX · open.bigmodel.cn",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiRootPath: "/api/paas/v4",
    apiActionPath: "/videos/generations",
    suggestedModelId: "cogvideox-3",
    modelOptions: ["cogvideox-3", "cogvideox-flash"],
    modelOptionLabels: {
      "cogvideox-flash": "cogvideox-flash（免费）",
    },
    fields: [
      DURATION_5_10,
      ZHIPU_SIZE,
      {
        key: "fps",
        label: "帧率",
        type: "select",
        defaultValue: "30",
        options: [
          { value: "30", label: "30 fps" },
          { value: "60", label: "60 fps" },
        ],
      },
      {
        key: "with_audio",
        label: "生成声音",
        type: "boolean",
        defaultValue: "true",
      },
      {
        ...REFERENCE_IMAGE_PAIR,
        hint: "参考图或首尾帧；上传→base64 或公网 URL（image_url，≤5MB）",
      },
    ],
  },
  {
    id: "video.agnes",
    label: "Agnes",
    hint: "https://apihub.agnes-ai.com/v1 · 文生/图生视频（异步，/agnesapi 轮询）",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://apihub.agnes-ai.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/videos",
    suggestedModelId: "agnes-video-v2.0",
    modelOptions: ["agnes-video-v2.0"],
    modelOptionLabels: {
      "agnes-video-v2.0": "agnes-video-v2.0（免费）",
    },
    fields: [
      DURATION_AGNES,
      RESOLUTION_TIER,
      ASPECT_COMMON,
      {
        ...REFERENCE_IMAGE,
        label: "参考图",
        hint: "图生视频：官方要求公网可访问 URL（字段 image）",
      },
    ],
  },
  {
    id: "video.volcengine-wan",
    label: "万相 Wan",
    hint: "火山方舟 · Wan2.1；下拉显示文生/图生，保存/调用为官方完整 wan2-1-* ID",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiRootPath: "/api/v3",
    apiActionPath: "/contents/generations/tasks",
    suggestedModelId: "wan2-1-14b-t2v-250225",
    modelOptions: ["wan2-1-14b-t2v-250225", "wan2-1-14b-i2v-250225"],
    modelOptionLabels: {
      "wan2-1-14b-t2v-250225": "Wan 文生视频",
      "wan2-1-14b-i2v-250225": "Wan 图生视频",
    },
    fields: [
      DURATION_5_10,
      {
        key: "resolution",
        label: "分辨率",
        type: "select",
        defaultValue: "720p",
        options: [
          { value: "480p", label: "480p" },
          { value: "720p", label: "720p" },
        ],
      },
      {
        ...REFERENCE_IMAGE,
        label: "参考图（图生视频）",
        hint: "文生视频可留空；图生用 wan2-1-14b-i2v-*，需公网可访问 URL",
      },
    ],
  },
  {
    id: "video.openai-videos",
    label: "OpenAI",
    hint: "sora-2 · /videos",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://api.openai.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/videos",
    suggestedModelId: "sora-2",
    modelOptions: ["sora-2"],
    fields: [
      DURATION_5_10,
      {
        ...ASPECT_COMMON,
        options: [
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "1:1", label: "1:1" },
        ],
      },
    ],
  },
  {
    id: "video.openai-compatible",
    label: "OpenAI 兼容",
    hint: "自定义 videos endpoint",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "",
    apiRootPath: "/v1",
    apiActionPath: "/videos",
    suggestedModelId: "sora-2",
    modelOptions: ["sora-2", "sora_video2"],
    fields: [DURATION_AGNES, RESOLUTION_TIER, ASPECT_COMMON],
  },
  {
    id: "video.openai-generations",
    label: "OpenAI Generations",
    hint: "sora_video2 · /videos/generations",
    modality: "video",
    tier: "extended",
    suggestedBaseUrl: "https://api.openai.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/videos/generations",
    suggestedModelId: "sora_video2",
    modelOptions: ["sora_video2"],
    fields: [DURATION_5_10, RESOLUTION_TIER, ASPECT_COMMON],
  },
  {
    id: "video.mock",
    label: "Mock",
    hint: "本地演示",
    modality: "video",
    tier: "extended",
    suggestedBaseUrl: "mock://video",
    suggestedModelId: "mock-video",
    modelOptions: ["mock-video"],
    fields: [DURATION_AGNES, RESOLUTION_TIER, ASPECT_COMMON],
  },

  // ── Audio / TTS（国内主流置顶）──
  {
    id: "audio.minimax",
    label: "MiniMax",
    hint: "语音合成 · api.minimaxi.com",
    modality: "audio",
    tier: "core",
    suggestedBaseUrl: "https://api.minimaxi.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/t2a_v2",
    suggestedModelId: "speech-2.8-hd",
    modelOptions: ["speech-2.8-hd", "speech-2.6-hd", "speech-02-hd"],
    fields: AUDIO_MINIMAX_FIELDS,
  },
  {
    id: "audio.qwen",
    label: "千问 TTS",
    hint: "DashScope · 语音合成",
    modality: "audio",
    tier: "core",
    suggestedBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    apiRootPath: "/api/v1",
    suggestedModelId: "qwen3-tts-flash",
    modelOptions: ["qwen3-tts-flash", "qwen-audio-3.0-tts-flash"],
    fields: AUDIO_QWEN_FIELDS,
  },
  {
    id: "audio.openai-compatible",
    label: "OpenAI 兼容",
    hint: "自定义 TTS endpoint",
    modality: "audio",
    tier: "core",
    suggestedBaseUrl: "",
    apiRootPath: "/v1",
    apiActionPath: "/audio/speech",
    suggestedModelId: "tts-1",
    modelOptions: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
    fields: AUDIO_OPENAI_FIELDS,
  },

  // ── Music（国内主流置顶）──
  {
    id: "music.minimax",
    label: "MiniMax",
    hint: "音乐生成 · api.minimaxi.com",
    modality: "music",
    tier: "core",
    suggestedBaseUrl: "https://api.minimaxi.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/music_generation",
    suggestedModelId: "music-3.0",
    modelOptions: ["music-3.0", "music-2.5"],
    fields: MUSIC_COMMON_FIELDS,
  },
  {
    id: "music.openai-compatible",
    label: "OpenAI 兼容",
    hint: "自定义音乐 endpoint",
    modality: "music",
    tier: "core",
    suggestedBaseUrl: "",
    apiRootPath: "/v1",
    suggestedModelId: "",
    modelOptions: [],
    fields: MUSIC_COMMON_FIELDS,
  },
];

const BY_ID = new Map(API_FORMATS.map((f) => [f.id, f]));

export function getApiFormat(id: string | null | undefined): ApiFormatDef | null {
  if (!id) return null;
  // Legacy alias: image.shiguang → OpenAI 异步图
  if (id === "image.shiguang") return BY_ID.get("image.openai-async") ?? null;
  return BY_ID.get(id) ?? null;
}

export function apiFormatsForModality(
  modality: string,
  options?: {
    includeExtended?: boolean;
    includeRelay?: boolean;
  },
): ApiFormatDef[] {
  const includeExtended = options?.includeExtended ?? false;
  const includeRelay = options?.includeRelay ?? false;
  return API_FORMATS.filter((f) => {
    if (f.modality !== modality) return false;
    const tier = f.tier ?? "extended";
    if (tier === "core") return true;
    if (tier === "extended") return includeExtended;
    if (tier === "relay") return includeRelay;
    return false;
  });
}

export function defaultApiFormatId(modality: string): string {
  const list = apiFormatsForModality(modality, {
    includeExtended: false,
    includeRelay: false,
  });
  if (modality === "text") {
    return list.find((f) => f.id === "text.deepseek")?.id ?? list[0]?.id ?? "";
  }
  if (modality === "image") {
    return (
      list.find((f) => f.id === "image.volcengine-seedream")?.id ??
      list.find((f) => f.id === "image.zhipu-cogview")?.id ??
      list[0]?.id ??
      ""
    );
  }
  if (modality === "video") {
    return (
      list.find((f) => f.id === "video.volcengine-seedance")?.id ??
      list.find((f) => f.id === "video.zhipu-cogvideox")?.id ??
      list[0]?.id ??
      ""
    );
  }
  if (modality === "audio") {
    return list.find((f) => f.id === "audio.minimax")?.id ?? list[0]?.id ?? "";
  }
  if (modality === "music") {
    return list.find((f) => f.id === "music.minimax")?.id ?? list[0]?.id ?? "";
  }
  return list[0]?.id ?? "";
}

/**
 * Resolve api_format from model defaults, with legacy inference from
 * provider / baseUrl / modelId when unset (old rows).
 */
export function resolveApiFormatId(input: {
  modality: string;
  defaults?: Record<string, unknown> | null;
  provider?: string | null;
  baseUrl?: string | null;
  modelId?: string | null;
}): string {
  const raw = input.defaults?.api_format ?? input.defaults?.apiFormat;
  const bits = [input.provider, input.baseUrl, input.modelId]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Legacy Adapter Skill / 拾光 → built-in OpenAI dialects
  if (typeof raw === "string" && raw.startsWith("skill.") && raw.length > 6) {
    return input.modality === "image"
      ? "image.openai-compatible"
      : defaultApiFormatId(input.modality);
  }
  if (typeof raw === "string" && raw === "image.shiguang") {
    return "image.openai-async";
  }

  if (typeof raw === "string" && getApiFormat(raw)) return raw;

  if (input.modality === "video") {
    if (bits.includes("mock://") || bits.includes("mock-video")) {
      return "video.mock";
    }
    if (
      bits.includes("zhipu") ||
      bits.includes("bigmodel") ||
      bits.includes("cogvideox")
    ) {
      return "video.zhipu-cogvideox";
    }
    if (
      bits.includes("wan2") ||
      bits.includes("wan-2") ||
      bits.includes("wan2.1") ||
      bits.includes("wan2-1") ||
      /(?:^|\s)(t2v|i2v)(?:\s|$)/.test(bits)
    ) {
      return "video.volcengine-wan";
    }
    if (
      bits.includes("seedance") ||
      bits.includes("doubao-seedance") ||
      bits.includes("jimeng") ||
      bits.includes("即梦") ||
      /(?:^|\s)(1\.5|2\.5|2\.0)(?:\s|$)/.test(bits)
    ) {
      return "video.volcengine-seedance";
    }
    if (bits.includes("volces.com") || bits.includes("volcengine")) {
      return "video.volcengine-seedance";
    }
    if (bits.includes("agnes")) return "video.agnes";
    return defaultApiFormatId("video");
  }

  if (input.modality === "image") {
    if (bits.includes("mock://") || bits.includes("mock-image")) {
      return "image.mock";
    }
    if (bits.includes("agnes")) return "image.agnes";
    if (
      bits.includes("seedream") ||
      bits.includes("doubao-seedream") ||
      bits.includes("jimeng") ||
      bits.includes("即梦") ||
      bits.includes("seedream-4") ||
      (bits.includes("volces.com") && /(?:^|\s)(4\.5|4\.0)(?:\s|$)/.test(bits)) ||
      (bits.includes("volcengine") && /(?:^|\s)(4\.5|4\.0)(?:\s|$)/.test(bits))
    ) {
      return "image.volcengine-seedream";
    }
    if (
      bits.includes("cogview") ||
      bits.includes("glm-image") ||
      bits.includes("zhipu") ||
      bits.includes("bigmodel")
    ) {
      return "image.zhipu-cogview";
    }
    if (
      bits.includes("nano-banana") ||
      bits.includes("nano banana") ||
      /gemini-.*image/.test(bits) ||
      bits.includes("flash-lite-image") ||
      bits.includes("pro-image") ||
      (bits.includes("generativelanguage") && bits.includes("image"))
    ) {
      return "image.google-nano-banana";
    }
    if (
      bits.includes("openai.com") ||
      bits.includes("gpt-image") ||
      bits.includes("dall-e")
    ) {
      return "image.openai";
    }
    if (bits.includes("xlcsh")) {
      return "image.openai-async";
    }
    return defaultApiFormatId("image");
  }

  if (input.modality === "audio") {
    if (bits.includes("minimax") || bits.includes("hailuo")) {
      return "audio.minimax";
    }
    if (
      bits.includes("qwen") ||
      bits.includes("dashscope") ||
      bits.includes("通义")
    ) {
      return "audio.qwen";
    }
    return defaultApiFormatId("audio");
  }

  if (input.modality === "music") {
    if (bits.includes("minimax") || bits.includes("hailuo")) {
      return "music.minimax";
    }
    return defaultApiFormatId("music");
  }

  if (input.modality === "text") {
    if (bits.includes("deepseek")) return "text.deepseek";
    if (
      bits.includes("zhipu") ||
      bits.includes("bigmodel") ||
      bits.includes("glm-")
    ) {
      return "text.zhipu";
    }
    if (bits.includes("anthropic") || bits.includes("claude")) {
      return "text.anthropic";
    }
    if (bits.includes("gemini") || bits.includes("generativelanguage")) {
      return "text.gemini";
    }
    if (bits.includes("openai.com")) return "text.openai";
    return "text.openai-compatible";
  }
  return defaultApiFormatId(input.modality);
}

/** Build string-valued form state from a format (+ optional model defaults override). */
export function buildParamsForApiFormat(
  formatId: string,
  modelDefaults: Record<string, unknown> = {},
  formatOverride?: { fields: readonly import("./run-params").RunParamField[] } | null,
): Record<string, string> {
  const format = formatOverride ?? getApiFormat(formatId);
  if (!format) return {};
  const out: Record<string, string> = {};
  for (const field of format.fields) {
    const v = modelDefaults[field.key];
    if (v !== undefined && v !== null && String(v) !== "") {
      out[field.key] = typeof v === "boolean" ? (v ? "true" : "false") : String(v);
    } else {
      out[field.key] = field.defaultValue;
    }
    if (field.type === "image_pair") {
      const endKey = field.endKey ?? "reference_image_end";
      const endV = modelDefaults[endKey];
      out[endKey] =
        endV !== undefined && endV !== null && String(endV) !== ""
          ? String(endV)
          : "";
    }
  }
  return out;
}

export function fieldsForApiFormat(
  formatId: string | null | undefined,
  formatOverride?: { fields: readonly import("./run-params").RunParamField[] } | null,
): readonly import("./run-params").RunParamField[] {
  if (formatOverride?.fields) return formatOverride.fields;
  return getApiFormat(formatId)?.fields ?? [];
}

/** Whether this modality should show API 格式 picker. */
export function modalityUsesApiFormatPicker(modality: string): boolean {
  return (
    modality === "image" ||
    modality === "video" ||
    modality === "text" ||
    modality === "audio" ||
    modality === "music"
  );
}
