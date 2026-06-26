import {createOrder, createWorld, spawnCustomer} from './world';
import type {Candidate, Policy, Station, StationType, TaskInstance, WorldState} from "./types.ts";
import {fifo} from "./dispatch.ts";

export class Simulation {
    state: WorldState;
    metrics = { servedPerMin: 0, arrivalsPerMin: 0 };
    private nextArrivalIn: number = 0;
    private policy: Policy;

    constructor(opts: { seed?: number, policy?: Policy } = {}) {
        const { seed, policy = fifo } = opts;
        this.state = createWorld({ seed });
        this.policy = policy;
    }

    tick(delta: number) { // time delta in seconds
        this.state.now += delta;

        this.spawnArrivals(delta);
        this.advance(); // add delta back if need be here
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

    private advance() {
        for (const c of this.state.customers) {
            if (c.state === 'queueing' && this.state.now - c.arrivedAt > c.patienceS) {
                c.state = 'left_angry';
            }
        }

        for (const t of this.state.tasks) {
            if (t.status !== 'inProgress') continue;
            if (this.state.now < t.finishAt) continue; // timer not yet over

            t.status = 'done';
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
    }

    private staff() {
        return
    }

    private dispatch() {
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

        for (const [type, candidates] of readyByType) {
            const stations = this.state.stations.filter(s => s.type === type);
            const freeSlots = stations.reduce((n, s) => n + (s.slots - s.inProgress.length), 0);
            if (freeSlots <= 0) continue;

            const selected = this.policy(candidates, freeSlots);

            for (const task of selected) {
                const station = stations.find(s => s.inProgress.length < s.slots);
                if (!station) break;
                this.assign(task, station);
            }
        }
    }

    private assign(t: TaskInstance, station: Station) {
        t.status = 'inProgress';
        t.stationId = station.id;
        t.startedAt = this.state.now;
        t.finishAt = this.state.now + t.template.durationS;
        station.inProgress.push(t);
    }
}
