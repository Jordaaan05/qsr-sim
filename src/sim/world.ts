import type {WorldState, MenuItem, Station, Worker} from "./types.ts";

let _id = 0;
export const nextId = () => ++_id;

const menu: MenuItem[] = [
    {
        id: nextId(),
        name: 'Classic Burger Combo',
        price: 9.5,
        ingredientCost: 4,
        tasks: [
            { stationType: 'register', durationS: 15, dependsOn: [] },      // 0 take order
            { stationType: 'grill', durationS: 45, dependsOn: [0] },        // 1 cook patty
            { stationType: 'fryer', durationS: 180, dependsOn: [0] },       // 2 fries
            { stationType: 'drinks', durationS: 15, dependsOn: [0] },       // 3 drink (duh)
            { stationType: 'assembly', durationS: 30, dependsOn: [1] },     // 4 assemble burger, patty must be cooked and ready
            { stationType: 'bagging', durationS: 10, dependsOn: [2,3,4] },  // 5 assembly order, requires burger drink and fries.
        ],
    },
];

function createStations(): Station[] {
    const make = (type: Station['type'], x: number, y: number, slots: number): Station => ({
        id: nextId(), type, x, y, slots, queue: [], inProgress: [],
    });
    return [
        make('register', 100, 400, 1),
        make('grill', 500, 200, 4),
        make('fryer', 500, 600, 2),
        make('drinks', 300, 200, 2),
        make('assembly', 500, 400, 2),
        make('bagging', 300, 400, 1),
    ];
}

function createWorkers(): Worker[] {
    const make = (x: number, y: number): Worker => ({
        id: nextId(), homeStation: undefined, x, y, wage: 18,
    });
    return [
        make(200, 400),
        make(500, 300),
    ];
}

export function createWorld(): WorldState {
    return {
        now: 0,
        economy: { cash: 500, rentPerDay: 200 },
        menu: menu,
        stations: createStations(),
        workers: createWorkers(),
        customers: [],
        orders: [],
        tasks: [],
        arrivalRate: 6,
    };
}

export function spawnCustomer(world: WorldState): void {
    world.customers.push({
        id: nextId(),
        arrivedAt: world.now,
        patienceS: 120,
        state: "queueing",
    });
}