/**
 * Music Generation Model Benchmark — composition / arrangement / vocal / lyric focused.
 * Used by Single/Compare presets, Suites seed, and one-click suite fill.
 */

export type MusicBenchmarkCase = {
  id: string;
  label: string;
  dimension: string;
  stars: number;
  checklist: string[];
  prompt: string;
  category: string;
  weight?: number;
  durationHintSec?: number;
  /** Exact lyrics for lyric-fidelity cases (passed as run params). */
  lyrics?: string;
  isInstrumental?: boolean;
};

const LYRICS_EXACT = `主歌：
今夜城市的灯火在呼唤我。

副歌：
我们可以飞过天际线，
再也不回头。`;

const STRESS_PROMPT = `创作一首约 2 分钟的电影感流行歌曲。

风格：
Coldplay × Hans Zimmer × 现代流行。

结构：

0–15 秒：
柔和钢琴前奏。

15–40 秒：
男声进入。

40–60 秒：
鼓与贝斯逐渐铺开。

60–90 秒：
强劲副歌，多层人声。

90–110 秒：
电吉他器乐间奏。

110–120 秒：
终曲副歌，加入完整管弦与合唱。

要求：

全程保持同一条主旋律。

人声自然，呼吸真实。

专业混音。

立体声像清晰。

段落过渡平滑。

情绪从平静 → 充满希望 → 史诗感递进。`;

/** 9 core cases covering genre, lyrics, emotion, instruments, structure, vocals. */
export const MUSIC_GEN_BENCHMARK_CASES: MusicBenchmarkCase[] = [
  {
    id: "genre-control",
    label: "① 风格控制",
    dimension: "genre_control",
    stars: 5,
    category: "genre_control",
    weight: 1.5,
    durationHintSec: 90,
    checklist: [
      "是否真的 Synth-pop / 80s",
      "有无完整结构（Intro→Verse→Chorus…）",
      "乐器是否符合年代（模拟合成器/鼓机等）",
      "Tempo 是否接近 118 BPM",
    ],
    prompt: `创作一首 90 秒、1980 年代合成器流行（synth-pop）风格的歌曲。

速度：118 BPM。

乐器：
- 模拟合成器
- 鼓机
- 电贝斯
- 明亮 Pad

歌曲结构应包含：
前奏 → 主歌 → 副歌 → 主歌 → 副歌 → 尾奏。

充满活力与怀旧感。`,
  },
  {
    id: "lyric-following",
    label: "② 歌词遵循",
    dimension: "lyric_following",
    stars: 5,
    category: "lyric_following",
    weight: 1.5,
    lyrics: LYRICS_EXACT,
    checklist: ["是否改歌词", "是否漏字", "是否乱唱 / 重复", "断句是否正确"],
    prompt: `创作一首流行歌曲，严格使用以下歌词，不要改词、漏字或乱重复。

主歌：
今夜城市的灯火在呼唤我。

副歌：
我们可以飞过天际线，
再也不回头。`,
  },
  {
    id: "emotion-arc",
    label: "③ 情绪变化",
    dimension: "emotion",
    stars: 5,
    category: "emotion",
    weight: 1.2,
    isInstrumental: true,
    checklist: [
      "开场是否 lonely / soft piano",
      "中段是否 hopeful / strings",
      "结尾是否 epic / orchestra+choir",
      "情绪递进是否自然",
    ],
    prompt: `创作一首情绪逐渐变化的纯音乐。

开头：
孤独、柔和钢琴

中段：
充满希望、弦乐进入

结尾：
史诗感、完整管弦与合唱`,
  },
  {
    id: "instrument-constraint",
    label: "④ 乐器理解",
    dimension: "instrument_realism",
    stars: 4,
    category: "instrument_realism",
    isInstrumental: true,
    checklist: [
      "仅 Piano / Double Bass / Brush Drum",
      "无吉他",
      "无萨克斯偷跑",
      "音色是否自然",
    ],
    prompt: `创作一首爵士三重奏。

仅使用：

钢琴
低音提琴
刷子鼓

不要吉他。
不要萨克斯。`,
  },
  {
    id: "timed-arrangement",
    label: "⑤ 复杂 Prompt / 时间编曲",
    dimension: "arrangement",
    stars: 5,
    category: "arrangement",
    weight: 1.2,
    isInstrumental: true,
    durationHintSec: 80,
    checklist: [
      "开场 solo cello",
      "约 20s 小提琴加入",
      "约 40s 圆号加入",
      "约 60s 全编制+合唱",
      "结尾渐弱 fade out",
    ],
    prompt: `创作一段管弦电影配乐。

开头：
大提琴独奏

约 20 秒后：
小提琴加入

约 40 秒后：
圆号进入

约 60 秒后：
完整管弦与合唱

结尾逐渐淡出。`,
  },
  {
    id: "genre-fusion",
    label: "⑥ 多风格融合",
    dimension: "genre_fusion",
    stars: 4,
    category: "genre_fusion",
    isInstrumental: true,
    checklist: [
      "古筝是否出现",
      "Jazz Piano 是否出现",
      "Electronic Drum / Ambient Synth",
      "融合是否连贯（不各唱各的）",
    ],
    prompt: `融合以下元素：

中国传统古筝
爵士钢琴
电子鼓
氛围合成器

整体听感要连贯统一。`,
  },
  {
    id: "vocal-quality",
    label: "⑦ 人声质量",
    dimension: "vocal_quality",
    stars: 5,
    category: "vocal_quality",
    weight: 1.5,
    checklist: ["呼吸自然", "共鸣", "尾音 / 颤音", "无机械发音", "末段 soft whisper"],
    prompt: `创作一首柔和的情感流行抒情曲，由女声演唱。

温暖有情绪的音色。
呼吸自然。
轻微颤音。
不要机械发音。
终曲副歌用轻声耳语。

主唱清晰，伴奏平衡。`,
  },
  {
    id: "long-structure",
    label: "⑧ 长音乐结构",
    dimension: "song_structure",
    stars: 5,
    category: "song_structure",
    weight: 1.5,
    durationHintSec: 180,
    checklist: [
      "是否完整 3 分钟结构",
      "副歌旋律是否复用",
      "中后段是否崩 / 换歌",
      "Bridge / Outro 是否存在",
    ],
    prompt: `生成一首完整的 3 分钟流行歌。

结构：

前奏
主歌
预副歌
副歌
主歌
桥段
终曲副歌
尾奏

每一段副歌都应复用同一条旋律。`,
  },
  {
    id: "stress-composite",
    label: "★ 极限 Benchmark",
    dimension: "stress_composite",
    stars: 5,
    category: "stress_composite",
    weight: 2,
    durationHintSec: 120,
    checklist: [
      "作曲 / 主旋律一致性",
      "编曲层次与时间结构",
      "人声自然度与呼吸",
      "乐器真实性",
      "情绪 calm→hopeful→epic",
      "长音乐一致性",
      "Prompt 遵循",
      "混音与立体声像",
      "副歌复现",
    ],
    prompt: STRESS_PROMPT,
  },
];

export const MUSIC_GEN_BENCHMARK_SUITE = {
  id: "suite-music-gen-benchmark",
  name: "Music Gen Benchmark",
  capability: "text2music" as const,
  description:
    "音乐生成模型标准化评测：风格控制、歌词遵循、情绪弧线、乐器约束、时间编曲、风格融合、人声、长结构与综合压力测试。",
  version: "1",
} as const;

export function musicGenBenchmarkSuiteCases() {
  return MUSIC_GEN_BENCHMARK_CASES.map((c) => {
    const input: Record<string, unknown> = {};
    if (c.durationHintSec != null) input.duration_sec = c.durationHintSec;
    if (c.isInstrumental) input.is_instrumental = true;
    if (c.lyrics) {
      input.lyrics = c.lyrics;
      input.lyrics_optimizer = false;
    }

    return {
      id: `case-music-${c.id}`,
      prompt: c.prompt,
      category: c.category,
      weight: c.weight ?? 1,
      ...(Object.keys(input).length > 0 ? { input } : {}),
      expected: {
        dimension: c.dimension,
        label: c.label,
        stars: c.stars,
        checklist: c.checklist,
        ...(c.durationHintSec != null
          ? { durationHintSec: c.durationHintSec }
          : {}),
        ...(c.lyrics ? { lyricsExact: true } : {}),
        ...(c.isInstrumental ? { instrumental: true } : {}),
      },
    };
  });
}

export function musicGenBenchmarkPresets() {
  return MUSIC_GEN_BENCHMARK_CASES.map((c) => {
    const params: Record<string, string> = {};
    if (c.isInstrumental) {
      params.is_instrumental = "true";
      params.lyrics_optimizer = "false";
      params.lyrics = "";
    } else if (c.lyrics) {
      params.is_instrumental = "false";
      params.lyrics_optimizer = "false";
      params.lyrics = c.lyrics;
    } else {
      params.is_instrumental = "false";
    }
    if (c.durationHintSec != null) {
      params.duration_sec = String(c.durationHintSec);
    }
    return {
      id: `music-${c.id}`,
      label: c.label,
      focus: c.checklist.join("；"),
      text: c.prompt,
      params,
    };
  });
}
