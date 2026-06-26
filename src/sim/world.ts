import type {WorldState, MenuItem, Station, Worker, Customer, TaskInstance } from "./types.ts";

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
        id: nextId(), type, x, y, slots, inProgress: [],
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

export function createOrder(world: WorldState, customer: Customer, items: MenuItem[]): void {
    const orderId = nextId()
    const allTasks: TaskInstance[] = [];

    for (const item of items) {
        const steps = item.tasks;
        const localMap = new Map<number, number>(); // recipe-local index -> new instance index

        const instances = steps.map((template, i) => {
            const inst: TaskInstance = {
                id: nextId(),
                orderId,
                template,
                status: "pending",
                finishAt: 0, // placeholder until dispatch stamps (orders not inProgress cannot be marked as done)
                dependsOn: [],
            };
            localMap.set(i, inst.id);
            return inst;
        });

        instances.forEach((inst, i) => {
            inst.dependsOn = steps[i].dependsOn.map(key => localMap.get(key)!);
        });

        allTasks.push(...instances);
    }

    world.tasks.push(...allTasks);
    world.orders.push({
        id: orderId,
        customerId: customer.id,
        items: items.map((i) => i.id),
        placedAt: world.now,
        tasksRemaining: allTasks.length,
    })
}