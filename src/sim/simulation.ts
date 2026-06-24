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
    }

    private staff() {
        return
    }

    private dispatch() {
        return
    }
}
