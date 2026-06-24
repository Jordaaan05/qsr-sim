// Headless simulation harness for easier testing
// run with npx tsx scripts/harness.ts

import { Simulation } from "../src/sim/simulation";
import { WorldState } from "../src/sim/types";
import {createOrder, spawnCustomer} from "../src/sim/world";

// config

const deltaTime = 1/8;
const simulatedSeconds = 60*60; // simulate for an hour
const dagTestSeconds = 300; // short run to test the DAG, allowing the order to fully drain
const snapshotEvery = 60; // record a snapshot every 60 sim-seconds
const checkInvariance = true;
const logCompletions = true;
const sim = new Simulation();

// run loop

interface RunResult {
    snapshots: Snapshot[];
}

function runHeadless(simSeconds: number): RunResult {
    const totalTicks = Math.round(simSeconds / deltaTime);
    const snapshots: Snapshot[] = [];
    let nextSnapshotAt = 0;
    const alreadyLogged = new Set<number>();

    for (let i = 0; i < totalTicks; i++) {
        sim.tick(deltaTime);

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

    return { snapshots };
}

// test setup
function injectTestOrder(): void {
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


// invariant checks

function checkInvariants(w: WorldState): string | null {
    // 1. An in progress task must have an assigned station
    for (const t of w.tasks) {
        if (t.status === "inProgress" && t.stationId == null) {
            return `task ${t.id} is inProgress but has no stationId`;
        }
        // Assert worker assignments when exists
        // if (t.status === "inProgress" && t.workerId == null)
    }

    // 2. No worker is assigned to two tasks at once

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

// ---- policy comparison -----------------------------------------------------
// The eventual payoff: run the SAME scenario under two policies and diff.
//
// IMPORTANT: this is only meaningful if both runs see the IDENTICAL arrival
// stream. Without seeded RNG (§10) each createWorld() draws different arrivals
// and you are comparing noise, not policies. This function is the single
// clearest reason to keep seeding on the table — pass the same seed to both.

// function compare(policyA: Policy, policyB: Policy, simSeconds: number): void {
//   const a = runHeadless(createWorld({ policy: policyA, seed: 42 }), simSeconds);
//   const b = runHeadless(createWorld({ policy: policyB, seed: 42 }), simSeconds);
//   console.log("\n=== policy comparison (final snapshot) ===");
//   console.table({ A: a.snapshots.at(-1)!, B: b.snapshots.at(-1)! });
// }

// entry point

function main(): void {
    injectTestOrder();
    const { snapshots } = runHeadless(dagTestSeconds);
    printSnapshots("dag test", snapshots);

    // compare(fifo, spt, simulatedSeconds) once policies implemented.
}

main();