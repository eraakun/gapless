/**
 * Minimum-cost flow, small and dependency-free.
 *
 * Successive shortest paths with SPFA (Bellman-Ford with a queue), which
 * handles negative arc costs. It keeps augmenting while a path lowers the
 * total cost and stops as soon as the cheapest path would raise it, so the
 * result is a minimum-cost flow of any size, not a forced maximum flow.
 * That is exactly what we need: use a resource only when it saves money.
 */
export interface FlowArc {
  to: number;
  rev: number;
  cap: number;
  cost: number;
}

export class MinCostFlow {
  readonly graph: FlowArc[][];

  constructor(nodeCount: number) {
    this.graph = Array.from({ length: nodeCount }, () => []);
  }

  /** Adds an arc and returns [from, index] so the caller can read its flow later. */
  addArc(from: number, to: number, cap: number, cost: number): [number, number] {
    this.graph[from].push({ to, rev: this.graph[to].length, cap, cost });
    this.graph[to].push({ to: from, rev: this.graph[from].length - 1, cap: 0, cost: -cost });
    return [from, this.graph[from].length - 1];
  }

  /** Flow currently on an arc returned by addArc. */
  flowOn([from, index]: [number, number]): number {
    const arc = this.graph[from][index];
    return this.graph[arc.to][arc.rev].cap;
  }

  /** Runs to a minimum-cost flow. Returns { flow, cost }. */
  solve(source: number, sink: number): { flow: number; cost: number } {
    const n = this.graph.length;
    let flow = 0;
    let cost = 0;

    for (;;) {
      const dist = new Array<number>(n).fill(Infinity);
      const inQueue = new Array<boolean>(n).fill(false);
      const prevNode = new Array<number>(n).fill(-1);
      const prevArc = new Array<number>(n).fill(-1);
      dist[source] = 0;
      const queue = [source];
      inQueue[source] = true;

      while (queue.length > 0) {
        const u = queue.shift()!;
        inQueue[u] = false;
        this.graph[u].forEach((arc, i) => {
          if (arc.cap > 0 && dist[u] + arc.cost < dist[arc.to] - 1e-9) {
            dist[arc.to] = dist[u] + arc.cost;
            prevNode[arc.to] = u;
            prevArc[arc.to] = i;
            if (!inQueue[arc.to]) {
              inQueue[arc.to] = true;
              queue.push(arc.to);
            }
          }
        });
      }

      // Stop when no path exists or the cheapest one no longer saves anything.
      if (dist[sink] === Infinity || dist[sink] >= -1e-9) break;

      let push = Infinity;
      for (let v = sink; v !== source; v = prevNode[v]) push = Math.min(push, this.graph[prevNode[v]][prevArc[v]].cap);
      for (let v = sink; v !== source; v = prevNode[v]) {
        const arc = this.graph[prevNode[v]][prevArc[v]];
        arc.cap -= push;
        this.graph[v][arc.rev].cap += push;
      }
      flow += push;
      cost += push * dist[sink];
    }
    return { flow, cost };
  }
}
