export async function request(body: object) {
  const retries =
    "op" in body && ["act", "heartbeat", "renew"].includes(String(body.op))
      ? 3
      : 1;
  for (let attempt = 0; attempt < retries; attempt++) {
    let response: Response;
    try {
      response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (attempt + 1 === retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
      continue;
    }
    if (response.status >= 500 && attempt + 1 < retries) {
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
      continue;
    }
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "Could not reach room");
    return result;
  }
  throw Error("Could not reach room");
}
export function sound(type: string, muted: boolean) {
  if (muted || typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator(),
      gain = ctx.createGain();
    const notes: Record<string, number[]> = {
      dice: [180, 320],
      move: [240, 300],
      purchase: [460, 580],
      money: [380, 520],
      building: [400, 600],
      card: [620, 420],
      jail: [220, 140],
      bankruptcy: [160, 110],
      victory: [400, 500, 600, 800],
    };
    const sequence = notes[type] || [340];
    oscillator.type = "sine";
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    sequence.forEach((n, index) =>
      oscillator.frequency.setValueAtTime(n, ctx.currentTime + index * 0.08),
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      ctx.currentTime + sequence.length * 0.08 + 0.12,
    );
    oscillator.start();
    oscillator.stop(ctx.currentTime + sequence.length * 0.08 + 0.14);
    oscillator.onended = () => void ctx.close();
  } catch {}
}
