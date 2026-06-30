import {createOrder, createWorld, spawnCustomer} from './world';
import type {Candidate, Policy, Station, StationType, TaskInstance, WorldState, Worker} from "./types.ts";
import {fifo} from "./dispatch.ts";

export const PASSIVE_STATIONS = new Set<StationType>(['grill', 'fryer']);
export const isPassive = (t: StationType) => PASSIVE_STATIONS.has(t);
export const LOAD_S = 10;
export const UNLOAD_S = 10;
export const HYSTERESIS_TICKS = 40;
export const FLEX_GRAPH: Partial<Record<StationType, StationType[]>> = {
    drinks: ['bagging'],
    bagging: ['drinks'],
    fryer: ['grill'],
    grill: ['fryer'],
}

const postedAt = (w: Worker): number | undefined => w.currentStation ?? w.homeStation;

export class Simulation {
    state: WorldState;
    metrics = { servedPerMin: 0, arrivalsPerMin: 0 };
    private nextArrivalIn: number = 0;
    private policy: Policy;

    constructor(opts: { seed?: number, policy?: Policy, unstaffedStationTypes?: StationType[] } = {}) {
        const { seed, policy = fifo, unstaffedStationTypes } = opts;
        this.state = createWorld({ seed, unstaffedStationTypes });
        this.policy = policy;
    }

    tick(delta: number) { // time delta in seconds
        this.state.now += delta;

        this.spawnArrivals(delta);
        this.advance();
        this.settleUnloads();
        this.staff();
        this.dispatch();
    }

    private spawnArrivals(delta: number) {
        this.nextArrivalIn -= delta;
        if (this.nextArrivalIn <= 0) {
            spawnCustomer(this.state);
            // TEMP: spawn custoemrs
            const customer = this.state.customers[this.state.customers.length - 1];
            createOrder(this.state, customer ,[this.state.menu[Math.floor(this.state.rng() * this.state.menu.length)]])
            const perSec = this.state.arrivalRate / 60;
            this.nextArrivalIn = -Math.log(1 - this.state.rng()) / perSec;
        }
    }

    private toCandidate(t: TaskInstance): Candidate {
        const order = this.state.orders.find((o) => o.id === t.orderId);
        return {
            task: t,
            arrivalKey: order?.placedAt ?? Infinity,
            duration: t.template.durationS,
            parentRemaining: order?.tasksRemaining ?? Infinity,
        }
    }

    private freeWorkerAt(station: Station): Worker | undefined {
        return this.state.workers.find(
            w => postedAt(w) === station.id && w.assignedTaskId == null
        );
    }

    private advance() {
        for (const c of this.state.customers) {
            if (c.state === 'queueing' && this.state.now - c.arrivedAt > c.patienceS) {
                c.state = 'left_angry';
            }
        }

        for (const t of this.state.tasks) {
            if (t.status !== 'inProgress') continue;
            if (this.state.now < t.finishAt) continue; // timer not yet over

            const station = this.state.stations.find(s => s.id === t.stationId);
            if (!station) continue;
            if (!isPassive(station?.type)) {
                this.complete(t);
                continue;
            }

            if (t.phase === 'loading') {
                const w = this.state.workers.find(w => w.assignedTaskId === t.id);
                if (w) w.assignedTaskId = undefined;
                this.state.staffingDirty = true;
                t.phase = 'processing';
                t.finishAt = this.state.now + t.template.durationS;
            } else if (t.phase === 'processing') {
                t.phase = 'awaitingUnload';
            } else if (t.phase === 'unloading') {
                this.complete(t);
            }
        }
    }

    private complete(t: TaskInstance) {
        t.status = 'done';
        const worker = this.state.workers.find(w => w.assignedTaskId == t.id);
        if (worker) {
            worker.assignedTaskId = undefined;
            this.state.staffingDirty = true;
        }
        const station = this.state.stations.find((station) => station.id === t.stationId);
        if (station) {
            const i = station.inProgress.findIndex(task => task.id === t.id);
            if (i !== -1) station.inProgress.splice(i, 1);
        }
        const order = this.state.orders.find(o => o.id === t.orderId);
        if (order && --order.tasksRemaining === 0) {
            order.readyAt = this.state.now;
            const customer = this.state.customers.find(c => c.id === order.customerId);
            if (customer && customer.state === 'queueing') {
                customer.state = 'satisfied';
            }
        }
    }

    private settleUnloads() {
        for (const t of this.state.tasks) {
            if (t.status !== 'inProgress' || t.phase !== 'awaitingUnload') continue;
            const station = this.state.stations.find(s => s.id === t.stationId);
            if (!station) continue;
            const w = this.freeWorkerAt(station);
            if (w) {
                w.assignedTaskId = t.id;
                t.phase = 'unloading';
                t.finishAt = this.state.now + UNLOAD_S;
            }
        }
    }

    private staff() {
        const readyByType = this.readyByStationType();

        for (const station of this.state.stations) {
            const manned = this.state.workers.some(w => postedAt(w) === station.id);
            const hasDemand = (readyByType.get(station.type)?.length ?? 0) > 0;

            if (!manned && hasDemand) {
                station.unmannedTicks = (station.unmannedTicks ?? 0) + 1;
                if (station.unmannedTicks >= HYSTERESIS_TICKS) {
                    this.state.staffingDirty = true;
                }
            } else {
                station.unmannedTicks = 0;
            }
        }

        if (!this.state.staffingDirty) return;

        const justFlexed = new Set<number>();
        // flex pass
        for (const station of this.state.stations) {
            if ((station.unmannedTicks ?? 0) < HYSTERESIS_TICKS) continue;
            const hasDemand = (readyByType.get(station.type)?.length ?? 0) > 0;
            if (!hasDemand) continue;

            const neighbourTypes = FLEX_GRAPH[station.type] ?? [];
            const neighbourStations = this.state.stations.filter(s => neighbourTypes.includes(s.type));
            const availableWorker = this.state.workers.find(w => w.assignedTaskId == null && neighbourStations.some(s => s.id === postedAt(w)));
            if (availableWorker) {
                availableWorker.currentStation = station.id === availableWorker.homeStation
                    ? undefined
                    : station.id;
                justFlexed.add(availableWorker.id);
                station.unmannedTicks = 0;
            }
        }

        // flex-back pass
        for (const worker of this.state.workers) {
            if (worker.currentStation === undefined) continue;
            if (worker.assignedTaskId != null) continue;
            if (justFlexed.has(worker.id)) continue;

            const flexedStation = this.state.stations.find(s => s.id === worker.currentStation);
            if (flexedStation && flexedStation.inProgress.length > 0) continue;

            const homeStation = this.state.stations.find(s => s.id === worker.homeStation);
            if (!homeStation) continue;
            const homeManned = this.state.workers.some(w => w.id !== worker.id && postedAt(w) === homeStation.id);
            const hasDemand = (readyByType.get(homeStation.type)?.length ?? 0) > 0;
            if (homeManned || !hasDemand) continue;

            worker.currentStation = undefined;
        }

        this.state.staffingDirty = false;
    }

    private dispatch() {
        const readyByType = this.readyByStationType();
        for (const [type, candidates] of readyByType) {
            const stations = this.state.stations.filter(s => s.type === type);
            const freeSlots = stations.reduce((n, s) => n + (s.slots - s.inProgress.length), 0);
            const freeWorkers = this.state.workers.filter(w => w.assignedTaskId == null && stations.some(s => s.id === postedAt(w))).length;
            const capacity = Math.min(freeSlots, freeWorkers);
            if (capacity <= 0) continue;

            const selected = this.policy(candidates, capacity);

            for (const task of selected) {
                const station = stations.find(s => s.inProgress.length < s.slots && this.freeWorkerAt(s));
                if (!station) break;
                const worker = this.freeWorkerAt(station)!;
                this.assign(task, station, worker);
            }
        }
    }

    private readyByStationType(): Map<StationType, Candidate[]> {
        const readyByType = new Map<StationType, Candidate[]>();
        for (const t of this.state.tasks) {
            if (t.status !== "pending") continue;
            const ready = t.dependsOn.every(
                depId => this.state.tasks.find(x => x.id === depId)?.status === "done"
            );
            if (!ready) continue;

            const type = t.template.stationType;
            let bucket = readyByType.get(type);
            if (!bucket) readyByType.set(type, (bucket = []));
            bucket.push(this.toCandidate(t));
        }
        return readyByType;
    }

    private assign(t: TaskInstance, station: Station, worker: Worker) {
        t.status = 'inProgress';
        t.stationId = station.id;
        t.startedAt = this.state.now;
        if (isPassive(station.type)) {
            t.phase = 'loading';
            t.finishAt = this.state.now + LOAD_S;
        } else {
            t.finishAt = this.state.now + t.template.durationS;
        }
        station.inProgress.push(t);
        worker.assignedTaskId = t.id;
    }
}
