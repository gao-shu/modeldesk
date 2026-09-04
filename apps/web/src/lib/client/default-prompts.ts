/** Default prompts / switchable short cases for single runs. */

import { imageGenBenchmarkPresets } from "@/lib/benchmarks/image-gen";
import { videoGenBenchmarkPresets } from "@/lib/benchmarks/video-gen";

export type PromptPreset = {
  id: string;
  label: string;
  /** What this case is good for testing */
  focus?: string;
  text: string;
  /** Optional run-param overrides when selecting this preset. */
  params?: Record<string, string>;
};

export const PROMPT_PRESETS_BY_MODALITY: Record<string, PromptPreset[]> = {
  text: [
    {
      id: "text-eval",
      label: "多模态评测简介",
      text: "用不超过三句话，解释什么是多模态模型评测，并给出一个实际应用场景。",
    },
  ],
  image: [
    ...imageGenBenchmarkPresets(),
    {
      id: "image-cat",
      label: "快速冒烟 · 雨天橘猫",
      focus: "连通性 / 基础画质",
      text: "一只橘猫坐在雨天的咖啡馆窗边，窗外霓虹模糊反光，画面偏电影感，细节清晰。",
    },
  ],
  video: [
    ...videoGenBenchmarkPresets(),
    {
      id: "video-coast",
      label: "快速冒烟 · 海边公路航拍",
      focus: "连通性 / 基础运动稳定性",
      text: "航拍镜头缓缓掠过清晨海边公路，阳光透过薄雾，车辆很少，画面稳定、自然光。",
    },
  ],
  audio: [
    {
      id: "audio-tech-share",
      label: "综合推荐 · 技术分享（~20s）",
      focus:
        "自然度、韵律停顿、数字/日期、英文、URL/邮箱、长句气息",
      text: `大家好，欢迎来到今天的技术分享。接下来，我们会介绍最新的 AI 模型，以及它在语音合成、代码生成和图像理解方面的能力。请注意，版本号是 v2.3.17，发布时间是 2026 年 7 月 21 日。如果你有任何问题，请发送邮件到 support@example.com，或者访问 https://example.com 查看更多信息。谢谢大家，我们现在开始。`,
    },
    {
      id: "audio-meeting",
      label: "对比易听出差异 · 会议通知（~30s）",
      focus: "易听出模型差异：数字、专名纠正、金额、英文名/GitHub/邮箱",
      text: `今天下午两点半，我们将在 A 栋三楼会议室讨论 AI 项目的最终方案。
请注意，不是 A 一，而是 A 栋；不是 三点半，而是 两点半。
如果一切顺利，预算将从 128 万调整到 156.8 万元。
对了，Jason，请把 GitHub 上最新的 Pull Request 合并一下，然后把 PDF 发到 support@example.com。
最后，我只想说一句：谢谢大家，辛苦了，希望今天一切顺利！`,
    },
    {
      id: "audio-emotion",
      label: "情感表达 · Congratulations",
      focus:
        "前半压抑迟疑；Congratulations 上扬；末句放松带笑意",
      text: `我本来以为这件事情已经结束了。
可当我再次打开那封邮件的时候，心里还是忍不住紧张了一下。
不过，当看到最后一句“Congratulations”时，我终于笑了出来。
原来，一切努力都没有白费。`,
    },
    {
      id: "audio-emotion-plain",
      label: "情感对照 · 飞船质问（纯文本）",
      focus:
        "无标签基线；对比「带标签」预设，听情绪/呼吸差异（任意 TTS）",
      text: `你们竟然私自切断了主控系统的能源！知不知道防护罩一旦失效，整艘飞船的人都会化为灰烬？这就是你们所谓的‘为了大局’吗！简直是不可理喻！`,
    },
    {
      id: "audio-emotion-tags",
      label: "情感对照 · 飞船质问（带标签）",
      focus:
        "Qwen-Audio-3.0 文内标签 [angry]/[laughing]；其它模型可能当普通文字念出",
      text: `[angry] 你们竟然私自切断了主控系统的能源！知不知道防护罩一旦失效，整艘飞船的人都会化为灰烬？这就是你们所谓的‘为了大局’吗！简直是不可理喻！
[laughing] 哈哈，开个玩笑，系统其实还有备用电源。`,
    },
    {
      id: "audio-pronunciation",
      label: "发音准确率 · 多音字/中英切换",
      focus: "多音字（重/长/行）、英文（review/API/README）、地名人名、中英切换",
      text: `重庆的李老师今天去了长安银行，在重阳节之前重新办理了一张银行卡。
他对同事说：“这个项目还行，不过还有很多地方需要调整。”
明天上午十点，我们再一起 review 最新的 API 文档和 README。`,
    },
  ],
};

/** First preset text for a modality (fallback to text). */
export const DEFAULT_PROMPTS_BY_MODALITY: Record<string, string> =
  Object.fromEntries(
    Object.entries(PROMPT_PRESETS_BY_MODALITY).map(([mod, list]) => [
      mod,
      list[0]?.text ?? "",
    ]),
  );

export function promptPresetsForModality(
  modality: string | null | undefined,
): PromptPreset[] {
  if (!modality) return PROMPT_PRESETS_BY_MODALITY.text;
  return (
    PROMPT_PRESETS_BY_MODALITY[modality] ?? PROMPT_PRESETS_BY_MODALITY.text
  );
}

export function defaultPromptForModality(
  modality: string | null | undefined,
): string {
  return promptPresetsForModality(modality)[0]?.text ?? "";
}

export function matchPromptPresetId(
  modality: string | null | undefined,
  text: string,
): string {
  const presets = promptPresetsForModality(modality);
  const hit = presets.find((p) => p.text === text);
  return hit?.id ?? "";
}

export function findPromptPreset(
  modality: string | null | undefined,
  text: string,
): PromptPreset | null {
  const id = matchPromptPresetId(modality, text);
  if (!id) return null;
  return promptPresetsForModality(modality).find((p) => p.id === id) ?? null;
}
