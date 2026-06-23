import { Canvas } from "./render/Canvas.tsx";
import { useGameStore } from "./store/useGameStore.ts";

function Stats() {
  const cash = useGameStore(s => s.cash);
  const served = useGameStore(s => s.servedPerMin);
  const arrivals = useGameStore(s => s.arrivalsPerMin);
  const paused = useGameStore(s => s.paused);
  const togglePause = useGameStore(s => s.togglePause);

  return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8 }}>
        <span>${cash.toFixed(0)}</span>
        <span>served/min: {served.toFixed(1)}</span>
        <span>arrivals/min: {arrivals.toFixed(1)}</span>
        <button onClick={togglePause}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
      </div>
  );
}

export default function App() {
  return (
      <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
        <h1 style={{ fontSize: 18, margin: '0 0 18px' }}>QSR Sim</h1>
        <Stats />
        <Canvas />
      </div>
  );
}