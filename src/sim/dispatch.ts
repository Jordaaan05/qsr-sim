import type {Policy} from "./types.ts";

// Prioritises the oldest order to be completed first.
export const fifo: Policy = (candidates, capacity) => {
    return [...candidates]
        .sort((a,b) => a.arrivalKey - b.arrivalKey || a.task.id - b.task.id)
        .slice(0, capacity)
        .map(c => c.task)
}

// Prioritises tasks with a shorted processing time
export const spt: Policy = (candidates, capacity) => {
    return [...candidates]
        .sort((a,b) => a.duration - b.duration || a.task.id - b.task.id)
        .slice(0, capacity)
        .map(c => c.task)
}

// Order-completion-aware: Dispatch based on which order is the closest to being complete.
export const oca: Policy = (candidates, capacity) => {
    return [...candidates]
        .sort((a,b) => a.parentRemaining - b.parentRemaining || a.arrivalKey - b.arrivalKey || a.task.id - b.task.id)
        .slice(0, capacity)
        .map(c => c.task)
}