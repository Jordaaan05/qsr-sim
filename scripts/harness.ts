// Headless simulation harness for easier testing
// run with npx tsx scripts/harness.ts

import { Simulation, isPassive } from "../src/sim/simulation";
import {WorldState} from "../src/sim/types";
import {createOrder, spawnCustomer} from "../src/sim/world";
import {fifo, oca, spt} from "../src/sim/dispatch";

// config

const deltaTime = 1/8;
const simulatedSeconds = 60*60; // simulate for an hour
const dagTestSeconds = 300; // short run to test the DAG, allowing the order to fully drain
const snapshotEvery = 60; // record a snapshot every 60 sim-seconds
const checkInvariance = true;
const logCompletions = true;

// run loop

interface UnloadProbe {
    enteredAt: Map<number, number>;
    dwells: number[];
    everStalled: Set<number>;
}

interface RunResult {
    snapshots: Snapshot[];
    unloadProbe: UnloadProbe;
}

interface Summary {
    completed: number;
    meanCycleS: number;
    maxCycleS: number;
    served: number;
    enraged: number;
    balked: number;
}

function runHeadless(sim: Simulation, simSeconds: number): RunResult {
    const totalTicks = Math.round(simSeconds / deltaTime);
    const snapshots: Snapshot[] = [];
    const unloadProbe = createUnloadProbe();
    let nextSnapshotAt = 0;
    const alreadyLogged = new Set<number>();

    for (let i = 0; i < totalTicks; i++) {
        sim.tick(deltaTime);
        observeUnloads(sim.state, unloadProbe);

        if (logCompletions) {
            logNewCompletions(sim.state, alreadyLogged)
        }

        if (checkInvariance) {
            const violation = checkInvariants(sim.state);
            if (violation) {
                throw new Error(
                    `Invariant violated at tick ${i} (t=${sim.state.now.toFixed(1)}s): ${violation}`
                );
            }
        }

        if (sim.state.now >= nextSnapshotAt) {
            snapshots.push(snapshot(sim.state));
            nextSnapshotAt += snapshotEvery;
        }
    }

    return { snapshots, unloadProbe };
}

// test setup
function injectTestOrder(sim: Simulation): void {
    spawnCustomer(sim.state);
    const customer = sim.state.customers[sim.state.customers.length - 1];

    const item = sim.state.menu[0];
    if (!item) throw new Error("No menu item could be found");

    createOrder(sim.state, customer, [item]);
    console.log(`Injected 1 order - ${sim.state.tasks.length} tasks created, all should be 'pending'`);
}

// completion logging
function logNewCompletions(w: WorldState, alreadyLogged: Set<number>): void {
    for (const t of w.tasks) {
        if (t.status === 'done' && !alreadyLogged.has(t.id)) {
            alreadyLogged.add(t.id);
            const order = w.orders.find((o) => o.id === t.orderId);
            console.log(
                `t=${w.now.toFixed(1)}s done: task ${t.id} [${t.template.stationType}]
    order=${t.orderId} remaining=${order?.tasksRemaining}`)
        }
    }
}

function createUnloadProbe(): UnloadProbe {
    return { enteredAt: new Map(), dwells: [], everStalled: new Set() };
}

// invariant checks
function checkInvariants(w: WorldState): string | null {
    // 1. An in progress task must have an assigned station
    for (const t of w.tasks) {
        if (t.status !== "inProgress") continue;
        if (t.stationId == null) return `task ${t.id} is inProgress but has no stationId`;

        const held = w.workers.filter(wk => wk.assignedTaskId === t.id).length;
        const passive = isPassive(t.template.stationType);
        const shouldHold = !passive || t.phase === 'loading' || t.phase === 'unloading';

        if (shouldHold && held !== 1) {
            return `task ${t.id} (${t.template.stationType}/${t.phase ?? "active"}) should hold 1 worker, holds ${held}`;
        } else if (!shouldHold && held !== 0) {
            return `task ${t.id} (${t.template.stationType}/${t.phase}) is mid-cook, should hold 0 workers, holds ${held}`;
        }
    }

    // 2. No worker is assigned to two tasks at once
    const claimed = new Set<number>();
    for (const wk of w.workers) {
        if (wk.assignedTaskId == null) continue;

        if (claimed.has(wk.assignedTaskId)) {
            return `task ${wk.assignedTaskId} is claimed by more than one worker`;
        }
        claimed.add(wk.assignedTaskId);

        const task = w.tasks.find(t => t.id === wk.assignedTaskId);
        if (!task) return `worker ${wk.id} holds nonexistent task ${wk.assignedTaskId}`;
        if (task.status !== 'inProgress') return `worker ${wk.id} still holds task ${wk.assignedTaskId} (status: ${task.status}) - leaked`;
    }

    // 3. A station can't have more tasks in progress than it has slots.
    for (const s of w.stations) {
        if (s.inProgress.length > s.slots) {
            return `station ${s.id} has ${s.inProgress.length} tasks active but only ${s.slots} available.`;
        }
    }

    // 4. The tasksRemaining cache must match the real count of active tasks.
    for (const o of w.orders) {
        const open = w.tasks.filter((t) => t.orderId === o.id && t.status !== "done").length;
        if (o.tasksRemaining !== open) {
            return `order ${o.id} has ${o.tasksRemaining} tasks but ${open} tasks are open.`;
        }
    }

    return null;
}

// snapshots of stats
interface Snapshot {
    t: number;
    served: number;
    enraged: number;
    queueLen: number;
    cash: number;
    balked: number;
    pending: number;
    active: number;
    done: number;
}

function snapshot(w: WorldState): Snapshot {
    return {
        t: Math.round(w.now),
        served: w.customers.filter((c) => c.state === "satisfied").length,
        enraged: w.customers.filter((c) => c.state === "left_angry").length,
        queueLen: w.customers.filter((c) => c.state === 'queueing').length,
        cash: Math.round(w.economy.cash),
        balked: w.customers.filter((c) => c.state === "balked").length,
        pending: w.tasks.filter((t) => t.status === 'pending').length,
        active: w.tasks.filter((t) => t.status === 'inProgress').length,
        done: w.tasks.filter((t) => t.status === 'done').length,
    };
}

function printSnapshots(label: string, snapshots: Snapshot[]) {
    console.log(`\n=== ${label} ===`);
    console.table(snapshots);
}

function summarise(w: WorldState): Summary {
    const completed = w.orders.filter(o => o.readyAt !== undefined);
    const cycles = completed.map(o => o.readyAt! - o.placedAt);

    const mean = cycles.length
        ? cycles.reduce((a, c) => a + c, 0) / cycles.length
        : 0;
    const max = cycles.length ? Math.max(...cycles) : 0;
    const round1 = (n: number) => Math.round(n * 10) / 10;

    return {
        completed: completed.length,
        meanCycleS: round1(mean),
        maxCycleS: round1(max),
        served:  w.customers.filter(c => c.state === 'satisfied').length,
        enraged: w.customers.filter(c => c.state === 'left_angry').length,
        balked:  w.customers.filter(c => c.state === 'balked').length,
    };
}

function observeUnloads(w: WorldState, probe: UnloadProbe): void {
    const parkedNow = new Set<number>();
    for (const t of w.tasks) {
        if (t.status === 'inProgress' && t.phase === 'awaitingUnload') {
            parkedNow.add(t.id);
            if (!probe.enteredAt.has(t.id)) {
                probe.enteredAt.set(t.id, w.now);
                probe.everStalled.add(t.id);
            }
        }
    }
    // record dwells
    for (const [taskId, since] of probe.enteredAt) {
        if (!parkedNow.has(taskId)) {
            probe.dwells.push(w.now - since);
            probe.enteredAt.delete(taskId);
        }
    }
}

function summariseUnloads(label: string, probe: UnloadProbe): void {
   const d = probe.dwells;
   const mean = d.length ? d.reduce((a, c) => a + c, 0) / d.length : 0;
   const max = d.length ? Math.max(...d) : 0;
   console.log(
       `[${label}] unload stalls: ${probe.everStalled.size} parked >= 1 tick |` +
       `dwell mean=${mean.toFixed(2)}s max=${max.toFixed(2)}s |` +
       `still parked at end=${probe.enteredAt.size}`
   );
}

// entry point
function main(): void {

    const oneOrderTestSim = new Simulation();
    injectTestOrder(oneOrderTestSim);
    const { snapshots } = runHeadless(oneOrderTestSim, dagTestSeconds);
    printSnapshots("dag test", snapshots);

    const rows: Record<string, Summary> = {};
    for (const [name, policy] of [["fifo", fifo], ["spt", spt], ["oca", oca]] as const) {
        const sim = new Simulation({ seed: 42, policy });
        const { unloadProbe } = runHeadless(sim, simulatedSeconds);
        rows[name] = summarise(sim.state);
        summariseUnloads(name, unloadProbe)
    }
    console.table(rows);
}

main();