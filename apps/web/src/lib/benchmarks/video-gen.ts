/**
 * Video Generation Model Benchmark — temporal / motion / camera / physics focused.
 * Used by Single/Compare presets, Suites seed, and one-click suite fill.
 */

export type VideoBenchmarkCase = {
  id: string;
  label: string;
  dimension: string;
  stars: number;
  checklist: string[];
  prompt: string;
  category: string;
  weight?: number;
  /** Hint for duration when models support it */
  durationHintSec?: number;
};

const STRESS_PROMPT = `一段约 15 秒的超写实电影级镜头。

一位穿米色风衣的年轻亚洲女性，撑着透明雨伞，走在夜晚下着雨的东京街头。

镜头从广角全景开始，缓慢推进靠近她，再环绕一周，最后落到特写。

她注意到一只金毛寻回犬朝她跑来。狗跳过水洼，溅起真实水花。

她微笑着蹲下抚摸狗，然后直视镜头说：

「欢迎来到 AI 的未来。」

她身后有车辆驶过并带出真实倒影，行人撑着彩色雨伞过马路，霓虹招牌自然发光，细雨贯穿全程。

保持完美人物一致性、真实表情、准确口型同步、物理正确的水花、稳定手部结构、电影光影、平滑运镜、浅景深、超高写实、4K。`;

/** Core dimensions + stress composite (9 cases; I2V / editing reserved for later). */
export const VIDEO_GEN_BENCHMARK_CASES: VideoBenchmarkCase[] = [
  {
    id: "character-consistency",
    label: "① 人物一致性",
    dimension: "character_consistency",
    stars: 5,
    category: "character_consistency",
    weight: 1.5,
    checklist: ["脸有没有变", "衣服有没有换", "身高比例", "发型", "配饰是否一致"],
    prompt: `一位年轻亚洲女性，齐肩黑发，穿米色风衣、蓝色牛仔裤和白色运动鞋。

视频由四个连续镜头组成：

场景 1：她走在雨中街道上。
场景 2：她走进一家咖啡馆。
场景 3：她坐下喝咖啡。
场景 4：她微笑并向镜头挥手。

整段视频中面部特征、发型、服装、身材比例与配饰必须保持一致。`,
  },
  {
    id: "complex-motion",
    label: "② 复杂运动",
    dimension: "motion",
    stars: 5,
    category: "motion",
    weight: 1.5,
    checklist: ["跑步", "起跳", "腾空", "落地", "身体连续性（无抽搐）"],
    prompt: `一只金毛寻回犬跑过草地，跳过木栅栏，在空中接住飞盘，自然落地，再跑回主人身边。

镜头以电影感运动平滑跟随。`,
  },
  {
    id: "camera-control",
    label: "③ 镜头控制",
    dimension: "camera_control",
    stars: 5,
    category: "camera_control",
    weight: 1.5,
    checklist: ["Dolly / 推进", "Crane / 航拍下降", "Orbit / 环绕", "Zoom / 推近", "运动是否平滑"],
    prompt: `日出时的一座中世纪城堡。

镜头从广角航拍开始，缓缓飞向城堡，穿过大门，环绕中央塔楼，最后落到阳台上国王的特写。

运镜平滑、电影感。`,
  },
  {
    id: "physics",
    label: "④ 物理模拟",
    dimension: "physics",
    stars: 5,
    category: "physics",
    weight: 1.5,
    checklist: ["水花", "重力", "碎裂", "惯性", "摩擦 / 碎片滑动"],
    prompt: `一只装满水的玻璃杯从木桌上掉落。

杯子砸到地板后碎成许多真实碎片，水花向四周自然飞溅，碎片因惯性继续滑动。

超写实物理模拟。`,
  },
  {
    id: "multi-character",
    label: "⑤ 多人交互",
    dimension: "multi_character",
    stars: 4,
    category: "multi_character",
    checklist: ["多人物一致", "视线交流", "手部动作", "互动自然度"],
    prompt: `三位朋友围坐在木桌旁。

一人把茶倒进三只杯子。
一人拿起杯子喝一口。
第三人边笑边指向窗户。

他们交谈时自然地看向彼此。`,
  },
  {
    id: "complex-prompt",
    label: "⑥ 复杂 Prompt 理解",
    dimension: "prompt_following",
    stars: 5,
    category: "prompt_following",
    weight: 1.2,
    checklist: ["多元素是否齐全", "时间变化（中途下雨）", "倒影", "行人开伞", "飞行汽车 / 无人机"],
    prompt: `日落时的未来城市。

飞行汽车在摩天楼间穿梭。

人们走在透明空中廊桥上。

霓虹广告牌播放动态广告。

小型配送无人机从头顶飞过。

视频中途开始下雨，街道出现倒影，行人打开彩色雨伞。`,
  },
  {
    id: "lip-sync",
    label: "⑦ 人物说话 / Lip Sync",
    dimension: "lip_sync",
    stars: 5,
    category: "lip_sync",
    weight: 1.5,
    checklist: ["嘴型同步", "牙齿", "表情（笑/眨眼/抬眉）", "口型是否乱抖"],
    prompt: `一位年轻女性自然地对着镜头说话的特写。

她微笑、眨眼、抬眉，并说道：

「欢迎来到我们的 AI 大会。今天我们将一起探索人工智能的未来。」

表情自然，口型同步准确。`,
  },
  {
    id: "long-take",
    label: "⑧ 长镜头稳定性",
    dimension: "long_horizon",
    stars: 5,
    category: "long_horizon",
    weight: 1.5,
    durationHintSec: 20,
    checklist: [
      "全程无切镜",
      "5s 后是否崩",
      "10s 后人物是否变",
      "15s 后菜品是否变",
      "20s 场景是否漂移",
    ],
    prompt: `生成一个连续 20 秒、中间不切镜的长镜头。

一位厨师在餐厅厨房煎牛排。

他给肉撒调料、翻面、加入黄油、用勺子浇汁，再装盘、用香草点缀，并端给客人。

全程不要切镜。`,
  },
  {
    id: "stress-composite",
    label: "★ 极限压力测试",
    dimension: "stress_composite",
    stars: 5,
    category: "stress_composite",
    weight: 2,
    durationHintSec: 15,
    checklist: [
      "人物一致性",
      "镜头运动",
      "狗的动作",
      "人物动作",
      "手部解剖",
      "雨 / 水花物理",
      "光影反射",
      "口型同步",
      "表情",
      "长时间一致性",
      "Prompt 遵循",
    ],
    prompt: STRESS_PROMPT,
  },
];

export const VIDEO_GEN_BENCHMARK_SUITE = {
  id: "suite-video-gen-benchmark",
  name: "Video Gen Benchmark",
  capability: "text2video" as const,
  description:
    "视频生成模型标准化评测：人物一致性、复杂运动、镜头控制、物理模拟、多人交互、复杂指令、口型表情、长镜头与综合压力测试。",
  version: "1",
} as const;

export function videoGenBenchmarkSuiteCases() {
  return VIDEO_GEN_BENCHMARK_CASES.map((c) => ({
    id: `case-video-${c.id}`,
    prompt: c.prompt,
    category: c.category,
    weight: c.weight ?? 1,
    expected: {
      dimension: c.dimension,
      label: c.label,
      stars: c.stars,
      checklist: c.checklist,
      ...(c.durationHintSec != null
        ? { durationHintSec: c.durationHintSec }
        : {}),
    },
    ...(c.durationHintSec != null
      ? { input: { duration_sec: c.durationHintSec } }
      : {}),
  }));
}

export function videoGenBenchmarkPresets() {
  return VIDEO_GEN_BENCHMARK_CASES.map((c) => ({
    id: `video-${c.id}`,
    label: c.label,
    focus: c.checklist.join("；"),
    text: c.prompt,
  }));
}
