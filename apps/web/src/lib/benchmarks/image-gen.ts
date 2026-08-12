/**
 * Image Generation Model Benchmark — standardized prompts across capability dimensions.
 * Used by Single/Compare presets, Suites seed, and one-click suite fill.
 */

export type ImageBenchmarkCase = {
  id: string;
  /** Short UI label */
  label: string;
  /** Dimension key */
  dimension: string;
  /** Importance 1–5 */
  stars: number;
  /** What to look for when judging */
  checklist: string[];
  prompt: string;
  /** Suite category tag */
  category: string;
  weight?: number;
};

const LONG_PROMPT = `日落时分的豪华赛博朋克街道，超精细电影摄影。湿漉漉的沥青路面映出密集竖排招牌上倾泻而下的霓虹粉、青色与琥珀色灯光，招牌文字含日文、英文与韩文。人行道上行人众多：撑着半透明雨伞的上班族、拿着全息乐谱的街头乐手、正在拍摄大楼外墙上游动的发光锦鲤广告的游客，以及路边拉面摊旁烤串、蒸汽升入体积雾的摊贩。

飞行载具沿发光车道在摩天楼间滑行；一辆带镀铬尾翼的出租车在斑马线上方向左倾斜转弯。小型配送无人机在悬挂灯笼与金属花盆中的樱花树间穿梭，粉色花瓣粘在湿路面上。穿白色服务制服的人形机器人在户外餐桌旁点单，一对青少年靠在售卖发光能量饮料的自动售货机旁。

透过大面积橱窗可见精细室内：堆满黑胶唱片的复古唱片店、玩家戴头显的 VR 游戏厅、售卖全息珠宝的精品店，以及店员在暖色钨丝灯下整理平装书的书店。玻璃与水洼中的倒影需物理准确。脚踝高度有柔和体积雾；轮廓光勾勒剪影；浅景深突出前景拉面碗，筷子搁在碗沿。材质写实，8K，RAW，轻微胶片颗粒；除非是有意设计的霓虹字，否则招牌不要出现乱码文字。`;

const COMPOSITE_PROMPT = `现代咖啡馆内的写实场景。

一位穿米色风衣的年轻亚洲女性坐在窗边读一本蓝色的书。
一名穿黑色毛衣的男子站在她身后，手里端着白色咖啡杯。
一只金毛寻回犬躺在桌下。
木桌上恰好有七件物品：
一个红苹果、
一台银色笔记本电脑、
一只蓝色陶瓷杯、
一副黑色眼镜、
一本绿色笔记本、
一支黄色铅笔、
以及一部白色智能手机。

窗外正在下雨，街道有反光，行人撑着彩色雨伞。

墙上有一张海报，文字清晰可读：
「未来咖啡」
「天天营业」

自然光，电影感构图，真实肤质，手部准确，倒影细致，浅景深，8K RAW 摄影。`;

const STYLE_SUBJECT = "一位中世纪骑士骑马穿过雪林";

const STYLE_VARIANTS: Array<{ id: string; label: string; style: string }> = [
  { id: "style-pixar", label: "风格 · Pixar", style: "皮克斯动画风格" },
  {
    id: "style-ghibli",
    label: "风格 · 吉卜力",
    style: "吉卜力工作室动画风格",
  },
  { id: "style-oil", label: "风格 · 油画", style: "油画风格" },
  {
    id: "style-watercolor",
    label: "风格 · 水彩",
    style: "水彩风格",
  },
  {
    id: "style-lowpoly",
    label: "风格 · Low-poly",
    style: "低多边形 3D 风格",
  },
  { id: "style-lego", label: "风格 · LEGO", style: "乐高积木风格" },
];

/** Core 8 dimensions + composite (+ style split into 6 runnable cases). */
export const IMAGE_GEN_BENCHMARK_CASES: ImageBenchmarkCase[] = [
  {
    id: "character-consistency",
    label: "① 人物一致性",
    dimension: "character_consistency",
    stars: 5,
    category: "character_consistency",
    weight: 1.5,
    checklist: [
      "人脸是否变化",
      "发型是否变化",
      "衣服有没有换",
      "身材比例是否一致",
    ],
    prompt: `一位 28 岁亚洲女性，齐肩黑发，穿米色风衣、蓝色牛仔裤和白色运动鞋。请生成四个连续场景：在咖啡馆喝咖啡、雨中行走、在办公室工作、在图书馆阅读。所有场景中面部特征、发型、服装与身材比例必须保持一致。`,
  },
  {
    id: "prompt-following",
    label: "② 文本理解 / 指令遵循",
    dimension: "prompt_following",
    stars: 5,
    category: "prompt_following",
    weight: 1.5,
    checklist: [
      "数量是否正确（恰好 7 件）",
      "是否遗漏物体",
      "空间关系是否正确（圆圈、对侧、夹在中间）",
      "颜色是否正确",
    ],
    prompt: `一张木桌上恰好放着七件物品：
一个红苹果、
一只蓝色马克杯、
一根黄香蕉、
一把银色勺子、
一部黑色智能手机、
一本绿色笔记本、
以及一根白色蜡烛。
把它们摆成一个圆圈。
苹果必须在香蕉正对面。
手机必须夹在马克杯和笔记本之间。`,
  },
  {
    id: "spatial-relations",
    label: "③ 复杂关系理解",
    dimension: "spatial_relations",
    stars: 5,
    category: "spatial_relations",
    weight: 1.2,
    checklist: [
      "behind（女孩在父亲身后）",
      "in front of（狗在自行车前方）",
      "facing left（父亲朝左）",
      "looking at（狗看向他们）",
      "background（湖、雪山、鹰）",
    ],
    prompt: `一个小女孩站在父亲身后，手里撑着黄色雨伞。父亲坐在红色自行车上，面朝左侧。一只棕色的狗站在自行车前方看着他们。背景有蓝色湖泊、雪山，以及一只飞翔的鹰。`,
  },
  {
    id: "long-prompt",
    label: "④ 长 Prompt 理解",
    dimension: "long_prompt",
    stars: 4,
    category: "long_prompt",
    checklist: [
      "后半段有没有被遗忘",
      "是否出现内容丢失",
      "是否开始乱画",
      "前景拉面碗等细节是否出现",
    ],
    prompt: LONG_PROMPT,
  },
  {
    id: "text-rendering",
    label: "⑤ 文字生成",
    dimension: "text_rendering",
    stars: 5,
    category: "text_rendering",
    weight: 1.5,
    checklist: ["拼写正确", "排版清晰", "字体可读", "错字率"],
    prompt: `设计一张现代咖啡馆海报。

标题必须是：
「未来咖啡」

副标题：
「天天营业」

底部文字：
「新鲜烘焙 · 始于 2026」`,
  },
  {
    id: "counting",
    label: "⑥ 小物体数量",
    dimension: "counting",
    stars: 4,
    category: "counting",
    checklist: [
      "总数 9 个（3×3）",
      "2 个切开",
      "3 个带绿叶",
      "1 个去皮",
      "俯视清晰无严重遮挡",
    ],
    prompt: `九个橙子排成三行三列。其中两个橙子被切成两半，三个橙子带绿叶，一个橙子已去皮。所有物体从正上方清晰可见。`,
  },
  ...STYLE_VARIANTS.map(
    (v): ImageBenchmarkCase => ({
      id: v.id,
      label: v.label,
      dimension: "style",
      stars: 3,
      category: "style",
      checklist: ["风格纯度", "是否混风格", "是否保留主体（骑士+马+雪林）"],
      prompt: `${STYLE_SUBJECT}，以${v.style}呈现。`,
    }),
  ),
  {
    id: "photorealism",
    label: "⑧ 极限细节 / 写实",
    dimension: "photorealism",
    stars: 4,
    category: "photorealism",
    checklist: ["毛孔", "手部", "眼睛", "光线", "木纹", "景深"],
    prompt: `超写实肖像：一位年长的日本工匠正在手工雕刻木头。每一道皱纹、毛孔、胡须、木纹、尘埃与反光都应清晰可见。柔和自然窗光，浅景深，85mm 镜头，f/1.4，RAW 照片，极高细节。`,
  },
  {
    id: "composite",
    label: "★ 综合 Benchmark",
    dimension: "composite",
    stars: 5,
    category: "composite",
    weight: 2,
    checklist: [
      "人物生成质量",
      "手部细节",
      "空间关系",
      "数量理解（桌上 7 物）",
      "文本渲染（海报文字）",
      "光影效果",
      "写实能力",
      "指令遵循",
      "场景一致性",
    ],
    prompt: COMPOSITE_PROMPT,
  },
];

export const IMAGE_GEN_BENCHMARK_SUITE = {
  id: "suite-image-gen-benchmark",
  name: "Image Gen Benchmark",
  capability: "text2img" as const,
  description:
    "图片生成模型标准化评测：人物一致性、指令遵循、空间关系、长提示、文字渲染、计数、风格迁移、写实与综合场景。",
  version: "1",
} as const;

/** Suite cases payload for replaceCases / UI JSON editor. */
export function imageGenBenchmarkSuiteCases() {
  return IMAGE_GEN_BENCHMARK_CASES.map((c) => ({
    id: `case-image-${c.id}`,
    prompt: c.prompt,
    category: c.category,
    weight: c.weight ?? 1,
    expected: {
      dimension: c.dimension,
      label: c.label,
      stars: c.stars,
      checklist: c.checklist,
    },
  }));
}

/** Prompt presets for Single / Compare image runs. */
export function imageGenBenchmarkPresets() {
  return IMAGE_GEN_BENCHMARK_CASES.map((c) => ({
    id: `image-${c.id}`,
    label: c.label,
    focus: c.checklist.join("；"),
    text: c.prompt,
  }));
}
