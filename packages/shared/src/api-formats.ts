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

/** xAI Grok Imagine Image — 官方 aspect_ratio 枚举（generations / edits 共用） */
const ASPECT_GROK_IMAGE: RunParamField = {
  key: "aspect_ratio",
  label: "画幅",
  type: "select",
  defaultValue: "16:9",
  options: [
    { value: "16:9", label: "16:9" },
    { value: "9:16", label: "9:16" },
    { value: "1:1", label: "1:1" },
    { value: "4:3", label: "4:3" },
    { value: "3:4", label: "3:4" },
    { value: "3:2", label: "3:2" },
    { value: "2:3", label: "2:3" },
    { value: "2:1", label: "2:1" },
    { value: "1:2", label: "1:2" },
    { value: "20:9", label: "20:9" },
    { value: "9:20", label: "9:20" },
    { value: "19.5:9", label: "19.5:9" },
    { value: "9:19.5", label: "9:19.5" },
    { value: "auto", label: "auto（自动）" },
  ],
  hint: "官方 aspect_ratio；文生图与图生图均支持",
};

/** xAI Grok Imagine Video — 官方 aspect_ratio（无 auto / 超宽） */
const ASPECT_GROK_VIDEO: RunParamField = {
  key: "aspect_ratio",
  label: "画幅",
  type: "select",
  defaultValue: "16:9",
  options: [
    { value: "16:9", label: "16:9" },
    { value: "9:16", label: "9:16" },
    { value: "1:1", label: "1:1" },
    { value: "4:3", label: "4:3" },
    { value: "3:4", label: "3:4" },
    { value: "3:2", label: "3:2" },
    { value: "2:3", label: "2:3" },
  ],
  hint: "官方 aspect_ratio",
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

/** OpenAI 兼容中转（常挂 Grok/Sora）：秒级 duration，勿用 Agnes 的帧数换算。 */
const DURATION_COMPAT_VIDEO: RunParamField = {
  key: "duration_sec",
  label: "时长",
  type: "select",
  defaultValue: "5",
  options: [
    { value: "1", label: "1 秒" },
    { value: "3", label: "3 秒" },
    { value: "5", label: "5 秒" },
    { value: "8", label: "8 秒" },
    { value: "10", label: "10 秒" },
    { value: "15", label: "15 秒" },
  ],
  hint: "写入 duration（秒）；勿与 Agnes 帧数混用",
};

/** Agnes Video 2.5 / 2.5 Flash：官方 seconds 字符串 4–12。 */
const DURATION_AGNES_25: RunParamField = {
  key: "duration_sec",
  label: "时长",
  type: "select",
  defaultValue: "5",
  options: [
    { value: "4", label: "4 秒" },
    { value: "5", label: "5 秒" },
    { value: "6", label: "6 秒" },
    { value: "7", label: "7 秒" },
    { value: "8", label: "8 秒" },
    { value: "9", label: "9 秒" },
    { value: "10", label: "10 秒" },
    { value: "11", label: "11 秒" },
    { value: "12", label: "12 秒" },
  ],
  hint: "写入官方 seconds（字符串）；Flash 支持 4–12 秒",
};

const ASPECT_AGNES_25: RunParamField = {
  key: "aspect_ratio",
  label: "画幅",
  type: "select",
  defaultValue: "16:9",
  options: [
    { value: "21:9", label: "21:9 超宽" },
    { value: "16:9", label: "16:9 横屏" },
    { value: "4:3", label: "4:3" },
    { value: "1:1", label: "1:1 方形" },
    { value: "3:4", label: "3:4" },
    { value: "9:16", label: "9:16 竖屏" },
  ],
  hint: "输出像素由画幅 + 分辨率档位共同决定",
};

/** Agnes Video 2.5 / Flash：官方 size 枚举（Flash 仅 720P）。 */
const RESOLUTION_AGNES_25: RunParamField = {
  key: "resolution",
  label: "分辨率",
  type: "select",
  defaultValue: "720P",
  options: [
    { value: "720P", label: "720P" },
    { value: "960P", label: "960P" },
    { value: "2K", label: "2K" },
  ],
  hint: "写入官方 size；Flash 固定 720P",
};

const RESOLUTION_AGNES_25_FLASH: RunParamField = {
  ...RESOLUTION_AGNES_25,
  options: [{ value: "720P", label: "720P（Flash 固定）" }],
};

const RESOLUTION_TIER: RunParamField = {
  key: "resolution",
  label: "分辨率",
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

/** 图生图参考图列表：分槽位添加，每张可本地上传或填 URL。 */
const REFERENCE_IMAGES: RunParamField = {
  key: "reference_images",
  label: "参考图",
  type: "image_list",
  defaultValue: "",
  hint: "每张参考图单独一格：上传本地或粘贴 URL；满额前会多出「待添加」格",
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
 * 可选 listKey：多参考图（与首尾帧互斥，如 Seedance role=reference_image）。
 */
const REFERENCE_IMAGE_PAIR: RunParamField = {
  key: "reference_image",
  label: "参考输入",
  type: "image_pair",
  defaultValue: "",
  endKey: "reference_image_end",
  refModeLabel: "首帧",
  hint: "无参考图 / 首帧 / 首尾帧",
};

/** MiniMax H3：首尾帧（i2va）或 多参参考图+可选音频（r2va，与首尾帧互斥）. */
const REFERENCE_IMAGE_PAIR_MINIMAX: RunParamField = {
  ...REFERENCE_IMAGE_PAIR,
  listKey: "reference_images",
  listMax: 9,
  audioListKey: "reference_audios",
  audioListMax: 3,
  audioOnlyInRefsMode: true,
  hint: "无 / 首帧 / 首尾帧 / 多参（≤9 张参考图；参考音频仅多参可用，与首尾帧互斥）",
};

/** Seedance 2.x：多参考图（1–9）+ 可选参考音频（须搭配图；role=reference_audio）。 */
const REFERENCE_IMAGE_PAIR_SEEDANCE: RunParamField = {
  ...REFERENCE_IMAGE_PAIR,
  listKey: "reference_images",
  listMax: 9,
  audioListKey: "reference_audios",
  audioListMax: 3,
  hint: "无 / 首帧 / 首尾帧 / 多参图；可附带参考音频（须同时有图，公网 URL）",
};

/** Grok：I2V 单张 image.url，或 R2V 多张 reference_images（互斥；无首尾帧；R2V 仅 1.5）。 */
const REFERENCE_IMAGE_PAIR_GROK: RunParamField = {
  key: "reference_image",
  label: "参考输入",
  type: "image_pair",
  defaultValue: "",
  endKey: "reference_image_end",
  listKey: "reference_images",
  listMax: 7,
  allowPair: false,
  refModeLabel: "首帧",
  hint: "无参考图 / 首帧 I2V（任意型号 1 张）/ 多参 R2V（仅 1.5，最多 7；prompt 可用 <IMAGE_1>）",
};

/** Seedance 中转：所有参考图都走 multipart `input_reference`（多图重复同名字段）。 */
const REFERENCE_IMAGE_PAIR_SEEDANCE_RELAY: RunParamField = {
  ...REFERENCE_IMAGE_PAIR,
  listKey: "reference_images",
  listMax: 9,
  hint: "无 / 首帧 / 首尾帧 / 多参图 → 均写入 input_reference（多图重复字段）",
};

/** OpenAI 官方 Videos：仅单张首帧 input_reference。 */
const REFERENCE_IMAGE_PAIR_OPENAI: RunParamField = {
  key: "reference_image",
  label: "参考输入",
  type: "image_pair",
  defaultValue: "",
  endKey: "reference_image_end",
  allowPair: false,
  refModeLabel: "首帧",
  hint: "无 / 首帧图（官方 input_reference）",
};

/**
 * OpenAI 兼容中转：按 Grok 风格精简字段（严格 schema 拒 unknown field）。
 * 首帧 → image:{url}；多参考 → reference_images；不支持首尾帧。
 */
const REFERENCE_IMAGE_PAIR_OPENAI_COMPAT: RunParamField = {
  key: "reference_image",
  label: "参考输入",
  type: "image_pair",
  defaultValue: "",
  endKey: "reference_image_end",
  listKey: "reference_images",
  listMax: 7,
  allowPair: false,
  refModeLabel: "首帧",
  hint: "无 / 首帧（image.url）/ 多参考（reference_images；视上游是否支持）",
};

/** Agnes Video 2.5 Flash：无→text；首/尾帧→keyframe；多参→reference（images≤5 + audios）。 */
const REFERENCE_IMAGE_PAIR_AGNES_25_FLASH: RunParamField = {
  ...REFERENCE_IMAGE_PAIR,
  listKey: "reference_images",
  listMax: 5,
  audioListKey: "reference_audios",
  audioListMax: 3,
  hint: "无=文生；首帧/首尾帧=首尾帧模式；多参=参考图（≤5）+ 可选音频。提交时自动推断官方 mode",
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

/** Xiaomi MiMo V2.5 TTS（限时免费）：预置音色 / 音色克隆 / 音色设计. */
const AUDIO_XIAOMI_MIMO_FIELDS: readonly RunParamField[] = [
  {
    key: "voice",
    label: "预置音色",
    type: "select",
    defaultValue: "mimo_default",
    excludeModels: ["voiceclone", "voicedesign"],
    hint: "仅 mimo-v2.5-tts；国内默认偏「冰糖」，海外偏 Mia",
    options: [
      { value: "mimo_default", label: "MiMo 默认" },
      { value: "冰糖", label: "女 · 冰糖（中）" },
      { value: "茉莉", label: "女 · 茉莉（中）" },
      { value: "苏打", label: "男 · 苏打（中）" },
      { value: "白桦", label: "男 · 白桦（中）" },
      { value: "Mia", label: "女 · Mia（英）" },
      { value: "Chloe", label: "女 · Chloe（英）" },
      { value: "Milo", label: "男 · Milo（英）" },
      { value: "Dean", label: "男 · Dean（英）" },
    ],
  },
  {
    key: "reference_audio",
    label: "参考音频",
    type: "audio",
    defaultValue: "",
    models: ["voiceclone"],
    hint: "音色克隆：数秒 mp3/wav（≤10MB），本地上传为 data URI，也可粘贴公网 URL",
  },
  {
    key: "instruction",
    label: "风格 / 音色描述",
    type: "textarea",
    defaultValue: "",
    hint: "可选风格指令（user）。音色设计模型必填：一句话描述年龄/口音/气质等",
  },
  {
    key: "optimize_text_preview",
    label: "优化文本预览",
    type: "boolean",
    defaultValue: "true",
    models: ["voicedesign"],
    hint: "voicedesign 官方示例默认开启",
  },
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
    id: "image.dashscope-wanxiang",
    label: "通义万相",
    hint: "阿里云百炼 DashScope · 非 OpenAI 兼容（同步 multimodal / 异步 tasks）",
    modality: "image",
    tier: "core",
    suggestedBaseUrl: "https://dashscope.aliyuncs.com/api/v1",
    apiRootPath: "/api/v1",
    apiActionPath: "/services/aigc/image-generation/generation",
    suggestedModelId: "wan2.6-t2i",
    modelOptions: [
      "wan2.7-image-pro",
      "wan2.7-image",
      "wan2.6-t2i",
      "wan2.5-t2i-preview",
      "wan2.2-t2i-flash",
      "wan2.2-t2i-plus",
      "wanx2.1-t2i-turbo",
      "wanx2.1-t2i-plus",
    ],
    modelOptionLabels: {
      "wan2.7-image-pro": "wan2.7-image-pro",
      "wan2.7-image": "wan2.7-image",
      "wan2.6-t2i": "wan2.6-t2i（推荐）",
      "wan2.5-t2i-preview": "wan2.5-t2i-preview",
      "wan2.2-t2i-flash": "wan2.2-t2i-flash（极速）",
      "wan2.2-t2i-plus": "wan2.2-t2i-plus（专业）",
      "wanx2.1-t2i-turbo": "wanx2.1-t2i-turbo",
      "wanx2.1-t2i-plus": "wanx2.1-t2i-plus",
    },
    fields: [
      {
        key: "size",
        label: "分辨率",
        type: "select",
        defaultValue: "1280*1280",
        options: [
          { value: "1280*1280", label: "1280×1280 · 1:1" },
          { value: "1696*960", label: "1696×960 · 16:9" },
          { value: "960*1696", label: "960×1696 · 9:16" },
          { value: "1472*1104", label: "1472×1104 · 4:3" },
          { value: "1104*1472", label: "1104×1472 · 3:4" },
          { value: "1024*1024", label: "1024×1024（2.2 / 2.1 常用）" },
        ],
        hint: "官方 size 为 宽*高（星号）；总像素与单边限制随型号变化",
      },
      {
        key: "prompt_extend",
        label: "智能改写",
        type: "select",
        defaultValue: "true",
        options: [
          { value: "true", label: "开启" },
          { value: "false", label: "关闭" },
        ],
        hint: "对应 parameters.prompt_extend",
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
          { value: "3:4", label: "3:4" },
          { value: "4:3", label: "4:3" },
          { value: "9:16", label: "9:16" },
          { value: "16:9", label: "16:9" },
          { value: "2:3", label: "2:3" },
          { value: "3:2", label: "3:2" },
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
    id: "image.grok",
    label: "Grok",
    hint: "xAI · api.x.ai/v1 · grok-imagine-image",
    modality: "image",
    tier: "core",
    suggestedBaseUrl: "https://api.x.ai/v1",
    apiRootPath: "/v1",
    apiActionPath: "/images/generations",
    suggestedModelId: "grok-imagine-image-quality",
    modelOptions: [
      "grok-imagine-image-quality",
      "grok-imagine-image-fast",
    ],
    modelOptionLabels: {
      "grok-imagine-image-quality": "grok-imagine-image-quality（高质量）",
      "grok-imagine-image-fast": "grok-imagine-image-fast（快速）",
    },
    fields: [
      ASPECT_GROK_IMAGE,
      {
        key: "resolution",
        label: "分辨率",
        type: "select",
        defaultValue: "1k",
        options: [
          { value: "1k", label: "1K" },
          { value: "2k", label: "2K" },
        ],
        hint: "官方仅 1k / 2k（不支持 4k）",
      },
      {
        key: "n",
        label: "张数",
        type: "select",
        defaultValue: "1",
        options: [
          { value: "1", label: "1 张" },
          { value: "2", label: "2 张" },
          { value: "4", label: "4 张" },
        ],
        hint: "单次请求 n，官方上限以文档为准",
      },
      {
        ...REFERENCE_IMAGES,
        max: 4,
        hint: "图生图：单张→image.url；多张→官方 images[] / 中转 multipart；prompt 可用 <IMAGE_0>…",
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

  // ── Video（国内主流置顶：即梦 → 可灵 → 海螺 → Vidu → 智谱 → 万相）──
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
        type: "range",
        defaultValue: "5",
        min: 4,
        max: 15,
        step: 1,
        hint: "Seedance 2.0：4–15 秒；2.5：4–30 秒；可开「自动」(-1)",
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
        ...REFERENCE_IMAGE_PAIR_SEEDANCE,
        hint: "无 / 首帧 / 首尾帧 / 多参图（最多 9）；可附参考音频（最多 3，须有图；TOS 公网 URL）",
      },
    ],
  },
  {
    id: "video.kling",
    label: "可灵 Kling",
    hint: "api.klingai.com · API Key 填 AccessKey:SecretKey（服务端签发 JWT）",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://api.klingai.com",
    apiRootPath: "/v1",
    apiActionPath: "/videos/text2video",
    suggestedModelId: "kling-v2-6",
    modelOptions: [
      "kling-v2-6",
      "kling-v2-5-turbo",
      "kling-v2-1-master",
      "kling-v2-master",
      "kling-v1-6",
      "kling-v1",
    ],
    fields: [
      {
        key: "duration_sec",
        label: "时长",
        type: "select",
        defaultValue: "5",
        options: [
          { value: "5", label: "5 秒" },
          { value: "10", label: "10 秒" },
        ],
        hint: "官方 duration：5 / 10",
      },
      {
        key: "mode",
        label: "模式",
        type: "select",
        defaultValue: "std",
        options: [
          { value: "std", label: "标准 std" },
          { value: "pro", label: "专业 pro" },
        ],
      },
      {
        ...ASPECT_COMMON,
        options: [
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "1:1", label: "1:1" },
        ],
      },
      {
        key: "with_audio",
        label: "生成声音",
        type: "boolean",
        defaultValue: "false",
        hint: "sound=on（较新型号；旧型号可能忽略）",
      },
      {
        ...REFERENCE_IMAGE_PAIR,
        label: "参考输入",
        hint: "单张 → image；首尾帧 → image + image_tail（尾帧时建议 mode=pro）",
      },
    ],
  },
  {
    id: "video.minimax-hailuo",
    label: "MiniMax 海螺 / H3",
    hint: "api.minimaxi.com · MiniMax-H3（v2）/ Hailuo（v1）",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://api.minimaxi.com",
    apiActionPath: "/v2/video_generation",
    suggestedModelId: "MiniMax-H3",
    modelOptions: [
      "MiniMax-H3",
      "MiniMax-Hailuo-2.3",
      "MiniMax-Hailuo-02",
      "T2V-01-Director",
      "T2V-01",
    ],
    modelOptionLabels: {
      "MiniMax-H3": "MiniMax-H3（v2 · 2K）",
      "MiniMax-Hailuo-2.3": "Hailuo-2.3（v1）",
      "MiniMax-Hailuo-02": "Hailuo-02（v1）",
      "T2V-01-Director": "T2V-01-Director",
      "T2V-01": "T2V-01",
    },
    fields: [
      {
        key: "duration_sec",
        label: "时长",
        type: "select",
        defaultValue: "5",
        options: [
          { value: "4", label: "4 秒", models: ["h3"] },
          { value: "5", label: "5 秒", models: ["h3"] },
          { value: "6", label: "6 秒" },
          { value: "7", label: "7 秒", models: ["h3"] },
          { value: "8", label: "8 秒", models: ["h3"] },
          { value: "9", label: "9 秒", models: ["h3"] },
          { value: "10", label: "10 秒" },
          { value: "11", label: "11 秒", models: ["h3"] },
          { value: "12", label: "12 秒", models: ["h3"] },
          { value: "13", label: "13 秒", models: ["h3"] },
          { value: "14", label: "14 秒", models: ["h3"] },
          { value: "15", label: "15 秒", models: ["h3"] },
        ],
        hint: "H3：4–15 秒整数；Hailuo-2.3/02：6 或 10（1080P 仅 6）",
      },
      {
        key: "resolution",
        label: "分辨率",
        type: "select",
        defaultValue: "2K",
        options: [
          {
            value: "720P",
            label: "720P（旧型号）",
            excludeModels: ["h3"],
          },
          { value: "768P", label: "768P" },
          {
            value: "1080P",
            label: "1080P（Hailuo 6s）",
            excludeModels: ["h3"],
          },
          { value: "2K", label: "2K（H3）", models: ["h3"] },
        ],
        hint: "H3 仅 768P / 2K；选 1080P 时适配器会映射为 2K",
      },
      {
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
          { value: "21:9", label: "21:9 超宽", models: ["h3"] },
        ],
        hint: "H3 文生必填且不能 adaptive；图生由首帧决定（adaptive）",
      },
      {
        ...REFERENCE_IMAGE_PAIR_MINIMAX,
        hint: "Hailuo：首帧；H3：首帧/首尾帧仅图；「多参」才可加参考图≤9 + 可选参考音频（与首尾帧互斥）",
      },
    ],
  },
  {
    id: "video.vidu",
    label: "Vidu 生数",
    hint: "api.vidu.cn · Authorization: Token {key}（非 Bearer）",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://api.vidu.cn/ent/v2",
    apiRootPath: "/ent/v2",
    apiActionPath: "/text2video",
    suggestedModelId: "viduq3-pro",
    modelOptions: ["viduq3-pro", "viduq3-turbo", "viduq2", "viduq1"],
    fields: [
      {
        key: "duration_sec",
        label: "时长",
        type: "select",
        defaultValue: "5",
        options: [
          { value: "4", label: "4 秒" },
          { value: "5", label: "5 秒" },
          { value: "8", label: "8 秒" },
          { value: "10", label: "10 秒" },
        ],
      },
      ASPECT_COMMON,
      {
        key: "resolution",
        label: "分辨率",
        type: "select",
        defaultValue: "720p",
        options: [
          { value: "540p", label: "540p" },
          { value: "720p", label: "720p" },
          { value: "1080p", label: "1080p" },
        ],
      },
      {
        key: "with_audio",
        label: "生成声音",
        type: "boolean",
        defaultValue: "true",
        hint: "文生视频 audio 字段",
      },
      {
        ...REFERENCE_IMAGE_PAIR,
        hint: "单张 → img2video；首尾帧 → start-end2video",
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
    id: "video.agnes-25-flash",
    label: "Agnes 2.5 Flash",
    hint: "https://apihub.agnes-ai.com/v1 · 2.5 Flash（mode/seconds/720P，/agnesapi 轮询）",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://apihub.agnes-ai.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/videos",
    suggestedModelId: "agnes-video-2.5-flash",
    modelOptions: ["agnes-video-2.5-flash"],
    modelOptionLabels: {
      "agnes-video-2.5-flash": "agnes-video-2.5-flash（限时免费）",
    },
    fields: [
      DURATION_AGNES_25,
      RESOLUTION_AGNES_25_FLASH,
      ASPECT_AGNES_25,
      REFERENCE_IMAGE_PAIR_AGNES_25_FLASH,
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
    hint: "sora-2 · /videos（中转 POST /v1/videos 也选这个）",
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
      { ...REFERENCE_IMAGE_PAIR_OPENAI },
    ],
  },
  {
    id: "video.openai-compatible",
    label: "OpenAI 兼容",
    hint: "中转 · /videos/generations（若是 /videos 请选「OpenAI」）",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://api.example.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/videos/generations",
    suggestedModelId: "sora-2",
    modelOptions: ["sora-2", "sora_video2"],
    fields: [
      DURATION_COMPAT_VIDEO,
      RESOLUTION_TIER,
      ASPECT_COMMON,
      { ...REFERENCE_IMAGE_PAIR_OPENAI_COMPAT },
    ],
  },
  {
    id: "video.grok",
    label: "Grok",
    hint: "xAI · api.x.ai/v1 · grok-imagine-video",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://api.x.ai/v1",
    apiRootPath: "/v1",
    apiActionPath: "/videos/generations",
    suggestedModelId: "grok-imagine-video-1.5",
    modelOptions: ["grok-imagine-video-1.5", "grok-imagine-video"],
    fields: [
      {
        key: "duration",
        label: "时长",
        type: "select",
        defaultValue: "8",
        options: [
          { value: "1", label: "1 秒" },
          { value: "3", label: "3 秒" },
          { value: "5", label: "5 秒" },
          { value: "8", label: "8 秒（默认）" },
          { value: "10", label: "10 秒" },
          { value: "15", label: "15 秒" },
        ],
        hint: "官方 duration：1–15 秒，默认 8",
      },
      ASPECT_GROK_VIDEO,
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
            label: "1080p（仅 1.5）",
            models: ["1.5"],
          },
        ],
        hint: "官方 480p / 720p；1080p 仅 grok-imagine-video-1.5",
      },
      {
        ...REFERENCE_IMAGE_PAIR_GROK,
      },
    ],
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
    fields: [
      DURATION_COMPAT_VIDEO,
      RESOLUTION_TIER,
      ASPECT_COMMON,
      { ...REFERENCE_IMAGE_PAIR_OPENAI_COMPAT },
    ],
  },
  {
    id: "video.seedance-relay",
    label: "Seedance 中转",
    hint: "POST /v1/videos multipart · seedance-2.0-mini 等（如 new.xlcsh.top）",
    modality: "video",
    tier: "core",
    suggestedBaseUrl: "https://new.xlcsh.top/v1",
    apiRootPath: "/v1",
    apiActionPath: "/videos",
    suggestedModelId: "seedance-2.0-mini",
    modelOptions: ["seedance-2.0-mini"],
    fields: [
      {
        key: "duration_sec",
        label: "时长",
        type: "select",
        defaultValue: "5",
        options: [
          { value: "5", label: "5 秒" },
          { value: "10", label: "10 秒" },
        ],
        hint: "写入 seconds；mini 常用 5/10（480p）或 5（720p）",
      },
      {
        key: "resolution",
        label: "分辨率",
        type: "select",
        defaultValue: "720p",
        options: [
          { value: "480p", label: "480p" },
          { value: "720p", label: "720p" },
        ],
        hint: "映射为 size=宽x高；mini 不支持 1080p",
      },
      {
        ...ASPECT_COMMON,
        options: [
          { value: "16:9", label: "16:9" },
          { value: "9:16", label: "9:16" },
          { value: "1:1", label: "1:1" },
        ],
      },
      {
        key: "with_audio",
        label: "生成声音",
        type: "boolean",
        defaultValue: "false",
        hint: "generate_audio",
      },
      { ...REFERENCE_IMAGE_PAIR_SEEDANCE_RELAY },
    ],
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
    id: "audio.xiaomi-mimo",
    label: "小米 MiMo TTS",
    hint: "限时免费 · api.xiaomimimo.com · chat/completions",
    modality: "audio",
    tier: "core",
    suggestedBaseUrl: "https://api.xiaomimimo.com/v1",
    apiRootPath: "/v1",
    apiActionPath: "/chat/completions",
    suggestedModelId: "mimo-v2.5-tts",
    modelOptions: [
      "mimo-v2.5-tts",
      "mimo-v2.5-tts-voiceclone",
      "mimo-v2.5-tts-voicedesign",
    ],
    fields: AUDIO_XIAOMI_MIMO_FIELDS,
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
    suggestedModelId: "music-3.0-free",
    modelOptions: ["music-3.0-free", "music-2.6-free"],
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
      bits.includes("kling") ||
      bits.includes("klingai") ||
      bits.includes("可灵")
    ) {
      return "video.kling";
    }
    if (
      bits.includes("vidu") ||
      bits.includes("vidu.cn") ||
      bits.includes("vidu.com") ||
      bits.includes("生数")
    ) {
      return "video.vidu";
    }
    if (
      bits.includes("hailuo") ||
      bits.includes("minimaxi.com") ||
      bits.includes("minimax.io") ||
      bits.includes("minimax-h3") ||
      bits.includes("minimax-hailuo") ||
      bits.includes("mimaxh3") ||
      bits.includes("minimaxh3") ||
      (bits.includes("minimax") &&
        (bits.includes("video") || bits.includes("t2v") || bits.includes("h3")))
    ) {
      return "video.minimax-hailuo";
    }
    if (
      bits.includes("grok") ||
      bits.includes("x.ai") ||
      bits.includes("imagine-video")
    ) {
      return "video.grok";
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
    // Agnes 2.5 Flash 须在 Seedance「2.5」启发式之前匹配
    if (
      bits.includes("agnes-video-2.5-flash") ||
      (bits.includes("agnes") && bits.includes("2.5-flash"))
    ) {
      return "video.agnes-25-flash";
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
      bits.includes("grok-imagine-image") ||
      (bits.includes("grok") && bits.includes("image")) ||
      (bits.includes("x.ai") && bits.includes("image"))
    ) {
      return "image.grok";
    }
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
      bits.includes("wanxiang") ||
      bits.includes("万相") ||
      bits.includes("wanx2") ||
      bits.includes("wanx-") ||
      /(?:^|\s)wan2\.[0-9]/.test(bits) ||
      (bits.includes("dashscope") &&
        (bits.includes("t2i") || bits.includes("wan")))
    ) {
      return "image.dashscope-wanxiang";
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
      bits.includes("xiaomimimo") ||
      bits.includes("mimo.mi.com") ||
      bits.includes("mimo-v2.5-tts") ||
      bits.includes("小米") ||
      (bits.includes("mimo") && bits.includes("tts"))
    ) {
      return "audio.xiaomi-mimo";
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
      const listKey = field.listKey?.trim();
      if (listKey) {
        const listV = modelDefaults[listKey];
        if (Array.isArray(listV)) {
          out[listKey] = JSON.stringify(listV.filter((x) => typeof x === "string"));
        } else if (typeof listV === "string" && listV.trim()) {
          out[listKey] = listV;
        } else {
          out[listKey] = "";
        }
      }
    }
  }
  return out;
}

function isBlankParam(v: unknown): boolean {
  return (
    v === undefined ||
    v === null ||
    (typeof v === "string" && !v.trim())
  );
}

/**
 * Map legacy modality knobs onto format keys when the format does not define
 * the legacy key (e.g. UI still has `ratio`/`size` but `image.grok` expects
 * `aspect_ratio`/`resolution`). No-op for formats that already own `ratio`/`size`.
 */
export function applyFormatParamAliases(
  formatId: string | null | undefined,
  overrides: Record<string, unknown> | null | undefined,
  formatOverride?: { fields: readonly import("./run-params").RunParamField[] } | null,
): Record<string, unknown> {
  const ov: Record<string, unknown> = { ...(overrides ?? {}) };
  const format = formatOverride ?? getApiFormat(formatId);
  if (!format) return ov;
  const keys = new Set(format.fields.map((f) => f.key));

  if (
    keys.has("aspect_ratio") &&
    !keys.has("ratio") &&
    isBlankParam(ov.aspect_ratio)
  ) {
    const ratio = ov.ratio;
    if (typeof ratio === "string" && ratio.trim()) {
      ov.aspect_ratio = ratio.trim();
    }
  }
  if (
    keys.has("resolution") &&
    !keys.has("size") &&
    isBlankParam(ov.resolution)
  ) {
    const size = typeof ov.size === "string" ? ov.size.trim() : "";
    if (/^(1k|2k)$/i.test(size)) {
      ov.resolution = size.toLowerCase();
    }
  }
  // Grok video uses `duration`; most other video formats use `duration_sec`.
  if (
    keys.has("duration") &&
    !keys.has("duration_sec") &&
    isBlankParam(ov.duration) &&
    !isBlankParam(ov.duration_sec)
  ) {
    ov.duration = ov.duration_sec;
  }
  if (
    keys.has("duration_sec") &&
    !keys.has("duration") &&
    isBlankParam(ov.duration_sec) &&
    !isBlankParam(ov.duration)
  ) {
    ov.duration_sec = ov.duration;
  }
  // Video：Gateway / OpenAI 别名 → ModelDesk reference_*（Agnes 2.5 等）
  const modality = getApiFormat(formatId ?? "")?.modality;
  if (modality === "video") {
    const mapInputRef = (value: unknown): string | string[] | undefined => {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value)) {
        const items = value
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean);
        if (items.length === 1) return items[0];
        if (items.length > 1) return items;
      }
      return undefined;
    };
    if (isBlankParam(ov.reference_image)) {
      const fromIr = mapInputRef(ov.input_reference);
      if (typeof fromIr === "string") ov.reference_image = fromIr;
    }
    if (
      keys.has("reference_image") &&
      isBlankParam(ov.reference_image) &&
      typeof ov.first_frame === "string" &&
      ov.first_frame.trim()
    ) {
      ov.reference_image = ov.first_frame.trim();
    }
    if (
      keys.has("reference_image_end") &&
      isBlankParam(ov.reference_image_end) &&
      typeof ov.last_frame === "string" &&
      ov.last_frame.trim()
    ) {
      ov.reference_image_end = ov.last_frame.trim();
    }
    const listKey =
      format.fields.find((f) => f.type === "image_pair" && f.listKey?.trim())
        ?.listKey ?? "reference_images";
    if (keys.has(listKey) && isBlankParam(ov[listKey])) {
      const fromIr = mapInputRef(ov.input_reference);
      if (Array.isArray(fromIr)) {
        ov[listKey] = fromIr;
      } else if (Array.isArray(ov.images)) {
        const imgs = ov.images
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean);
        if (imgs.length > 0) ov[listKey] = imgs;
      }
    }
    if (
      formatId === "video.agnes-25-flash" &&
      keys.has("resolution") &&
      isBlankParam(ov.resolution)
    ) {
      const size = typeof ov.size === "string" ? ov.size.trim() : "";
      if (size) ov.resolution = size;
    }
  }
  return ov;
}

/** Submit/persist only keys the active api_format declares (+ image_pair endKey). */
export function pickRunParamsForApiFormat(
  formatId: string | null | undefined,
  runParams: Record<string, unknown>,
  formatOverride?: { fields: readonly import("./run-params").RunParamField[] } | null,
): Record<string, unknown> {
  const aliased = applyFormatParamAliases(formatId, runParams, formatOverride);
  const fields = fieldsForApiFormat(formatId, formatOverride);
  if (!formatId || fields.length === 0) return aliased;

  const keys = new Set<string>();
  for (const f of fields) {
    keys.add(f.key);
    if (f.type === "image_pair") {
      keys.add(f.endKey ?? "reference_image_end");
      if (f.listKey?.trim()) keys.add(f.listKey.trim());
    }
  }
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (
      Object.prototype.hasOwnProperty.call(aliased, k) &&
      aliased[k] !== undefined
    ) {
      out[k] = aliased[k];
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
