export interface WorldState {
    now: number;
    economy: Economy;
    menu: MenuItem[];
    stations: Station[];
    workers: Worker[];
    customers: Customer[];
    orders: Order[];
    tasks: TaskInstance[];
    arrivalRate: number;
    rng: () => number;
}

export interface MenuItem {
    id: number;
    name: string;
    price: number;
    ingredientCost: number;
    tasks: TaskTemplate[];
}

export interface TaskTemplate {
    stationType: StationType;
    durationS: number;
    dependsOn: number[]; // indicies of the tasks that must finish before more can start for parallelism
}

export type StationType = 'grill' | 'fryer' | 'drinks' | 'assembly' | 'register' | 'bagging'

export interface Station {
    id: number;
    type: StationType;
    x: number; y: number;
    slots: number;              // how many tasks can occur at once
    inProgress: TaskInstance[]; // tasks in progress
}

export interface Worker {
    id: number;
    homeStation?: number; // if assigned a station or rotating
    x: number; y: number;
    carrying?: TaskInstance; // moving an item between stations
    assignedTaskId?: number; // free when undefined
    wage: number;
}

export interface Order {
    id: number;
    customerId: number;
    items: number[];        // menu item ids
    placedAt: number;
    readyAt?: number;
    tasksRemaining: number;
}

export type PassivePhase = "loading" | "processing" | "awaitingUnload" | "unloading";

export interface TaskInstance {
    id: number;
    orderId: number;
    template: TaskTemplate;
    status: "pending" | "inProgress" | "done";
    stationId?: number;
    startedAt?: number;
    phase?: PassivePhase;
    finishAt: number;
    dependsOn: number[];
}

export interface Customer {
    id: number;
    arrivedAt: number;
    patienceS: number;
    state: 'queueing' | 'ordered' | 'waiting' | 'satisfied' | 'left_angry' | 'balked'; // balked left before ordering, angry left before receiving order.
    order?: Order;
}

export interface Economy {
    cash: number;
    rentPerDay: number;
}

export interface Candidate {
    task: TaskInstance,
    arrivalKey: number,
    duration: number,
    parentRemaining: number;
}

export type Policy = (candidates: Candidate[], capacity: number) => TaskInstance[];