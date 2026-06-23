import { create } from "zustand";

type Tool = 'select' | 'placeGrill' | 'placeFryer' | 'placeRegister';

interface GameStore {
    tool: Tool;
    setTool: (t: Tool) => void;
    paused: boolean;
    togglePause: () => void;

    cash: number;
    servedPerMin: number;
    arrivalsPerMin: number;
    syncStats: (s: { cash: number; servedPerMin: number; arrivalsPerMin: number }) => void;
}

export const useGameStore = create<GameStore>((set) => ({
    tool: 'select',
    setTool: (tool) => set({ tool }),
    paused: false,
    togglePause: () => set((s) => ({ paused: !s.paused })),

    cash: 0,
    servedPerMin: 0,
    arrivalsPerMin: 0,
    syncStats: (stats) => set(stats),
}));