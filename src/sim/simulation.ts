import {createWorld, spawnCustomer} from './world';
import type { WorldState } from "./types.ts";

export class Simulation {
    state: WorldState;
    metrics = { servedPerMin: 0, arrivalsPerMin: 0 };
    private nextArrivalIn: number = 0;

    constructor() {
        this.state = createWorld();
    }

    tick(delta: number) { // time delta in seconds
        // advance cook timers, customer patience, staff movements
        // call dispatcher when resources available

        this.state.now += delta;

        this.spawnArrivals(delta);
        this.advance(delta);
        this.staff();
        this.dispatch();
    }

    private spawnArrivals(delta: number) {
        this.nextArrivalIn -= delta;
        if (this.nextArrivalIn <= 0) {
            spawnCustomer(this.state);
            const perSec = this.state.arrivalRate / 60;
            this.nextArrivalIn = -Math.log(1 - Math.random()) / perSec;
        }
    }

    private advance(delta: number) {
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
                // order complete -> customer gets served (soon)
            }
        }
    }

    private staff() {
        return
    }

    private dispatch() {
        for (const t of this.state.tasks) {
            if (t.status !== 'pending') continue;
            const ready = t.dependsOn.every(depId => this.state.tasks.find(task => task.id === depId)?.status === 'done');
            if (!ready) continue;

            const station = this.state.stations.find(s => s.type === t.template.stationType);
            if (!station) continue;

            t.status = 'inProgress';
            t.stationId = station.id;
            t.finishAt = this.state.now + t.template.durationS;
            station.inProgress.push(t);
        }
    }
}
