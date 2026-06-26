import type {Policy} from "./types.ts";

export const fifo: Policy = (candidates, capacity) => {
    return [...candidates]
        .sort((a,b) => a.arrivalKey - b.arrivalKey || a.task.id - b.task.id)
        .slice(0, capacity)
        .map(c => c.task)
}