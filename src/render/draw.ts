import type { WorldState } from "../sim/types.ts";

const stationW = 90;
const stationH = 60;

export function draw(ctx: CanvasRenderingContext2D, state: WorldState) {
    const { width, height } = ctx.canvas;

    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, width, height);

    for (const s of state.stations) {
        ctx.fillStyle = '#2e3b4e';
        ctx.fillRect(s.x - stationW / 2, s.y - stationH / 2, stationW, stationH);

        ctx.fillStyle = '#e0e0e0';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(s.type, s.x, s.y);
        ctx.fillStyle = '#88aa88';
        ctx.font = '10px sans-serif';
        ctx.fillText(`${s.inProgress.length}/${s.slots}`, s.x, s.y + 18);
    }

    for (const w of state.workers) {
        ctx.fillStyle = "#f0c040";
        ctx.beginPath();
        ctx.arc(w.x, w.y, 7, 0, Math.PI * 2);
        ctx.fill();
    }

    state.customers.forEach((c, i) => {
        ctx.fillStyle = c.state === 'left_angry' ? "#cc4444" : "#4488cc";
        ctx.beginPath();
        ctx.arc(40, 100 + i * 22, 8, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = "#777";
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`t=${state.now.toFixed(1)}s`, 10, 20);
}