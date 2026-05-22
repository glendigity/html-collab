import type { Actor, ReviewOp, ReviewState } from "./state";

export type MergeResult = {
  state: ReviewState;
  addedOps: number;
  addedActors: number;
};

export function mergeReviewStates(states: ReviewState[]): MergeResult {
  if (states.length === 0) {
    throw new Error("Expected at least one review state to merge");
  }

  const [base] = states;
  const actors: Record<string, Actor> = { ...base.actors };
  const opsById = new Map<string, ReviewOp>();
  let addedOps = 0;
  let addedActors = 0;

  for (const op of base.ops) {
    opsById.set(op.opId, op);
  }

  for (const state of states.slice(1)) {
    if (state.docId !== base.docId) {
      throw new Error(`Cannot merge ${state.docId}: expected docId ${base.docId}`);
    }
    if (state.sourceFingerprint !== base.sourceFingerprint) {
      throw new Error(`Cannot merge ${state.docId}: source fingerprint mismatch`);
    }

    for (const [actorId, actor] of Object.entries(state.actors)) {
      if (!actors[actorId]) {
        addedActors += 1;
      }
      actors[actorId] = actors[actorId] ?? actor;
    }

    for (const op of state.ops) {
      if (!opsById.has(op.opId)) {
        addedOps += 1;
      }
      opsById.set(op.opId, opsById.get(op.opId) ?? op);
    }
  }

  return {
    state: {
      ...base,
      actors,
      ops: Array.from(opsById.values()).sort(compareOpsForMerge),
    },
    addedOps,
    addedActors,
  };
}

function compareOpsForMerge(left: ReviewOp, right: ReviewOp): number {
  if (left.clock !== right.clock) {
    return left.clock - right.clock;
  }

  const time = left.time.localeCompare(right.time);
  if (time !== 0) {
    return time;
  }

  return left.opId.localeCompare(right.opId);
}
