export function parseSseChunk(
  chunk: string,
  onEvent: (event: string, data: unknown) => void,
): string {
  const parts = chunk.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const block of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) continue;
    const raw = dataLines.join("\n");
    try {
      onEvent(event, JSON.parse(raw));
    } catch {
      onEvent(event, raw);
    }
  }
  return rest;
}

export function formatCost(cost: number | null | undefined): string {
  if (cost == null || Number.isNaN(cost)) return "—";
  if (cost < 0.0001) return `$${cost.toExponential(2)}`;
  return `$${cost.toFixed(6)}`;
}
