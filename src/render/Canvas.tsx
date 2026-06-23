import { useEffect, useRef } from "react";
import { Simulation } from '../sim/simulation';
import { draw } from './draw';
import { useGameStore } from '../store/useGameStore';

const simHz = 8;
const simDelta = 1000 / simHz; // sim ticks every 125 ms
const statsInt = 250; // UI refreshes every 250ms

export function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simRef = useRef<Simulation | null>(null);

    useEffect(() => {
        const ctx = canvasRef.current!.getContext('2d')!;
        const sim = new Simulation();
        simRef.current = sim;

        let rafId: number;
        let last = performance.now();
        let simAcc = 0;
        let statsAcc = 0;

        const frame = (now: number) => {
            const elapsed = now - last;
            last = now;

            // sim clock
            if (!useGameStore.getState().paused) {
                simAcc += elapsed;
                while (simAcc >= simDelta) {
                    sim.tick(simDelta / 1000); // delta in seconds
                    simAcc -= simDelta;
                }
            }

            // draw clock, read sim state once per frame
            draw(ctx, sim.state);

            // sync clock, push numbers to the UI
            statsAcc += elapsed;
            if (statsAcc >= statsInt) {
                statsAcc = 0;
                useGameStore.getState().syncStats({
                    cash: sim.state.economy.cash,
                    servedPerMin: sim.metrics.servedPerMin,
                    arrivalsPerMin: sim.metrics.arrivalsPerMin,
                });
            }

            rafId = requestAnimationFrame(frame);
        };

        rafId = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(rafId);
    }, []);

    return <canvas ref={canvasRef} width={1280} height={720} />;
}