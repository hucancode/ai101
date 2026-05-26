import type { Command, RobotState } from '$lib/robot/types';

const LEASE_TTL_MS = 4000;
const LEASE_GRACE_MS = 1500;

type Subscriber = {
  id: string;
  send: (event: string, data: unknown) => void;
};

let pending: Command[] = [];
let latestState: RobotState | null = null;
let counter = 0;
let lastStateUpdate = 0;

let leaderId: string | null = null;
let leaderExpiresAt = 0;

const subscribers = new Map<string, Subscriber>();

function nextId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter.toString(36)}`;
}

function leaderAlive(now = Date.now()): boolean {
  return leaderId !== null && now < leaderExpiresAt + LEASE_GRACE_MS;
}

function broadcast(event: string, data: unknown, only?: (sub: Subscriber) => boolean) {
  for (const sub of subscribers.values()) {
    if (only && !only(sub)) continue;
    try { sub.send(event, data); } catch (_) { /* ignore */ }
  }
}

export function claimLease(sessionId: string): { isLeader: boolean; leaderId: string | null; ttlMs: number } {
  const now = Date.now();
  if (!leaderAlive(now) || leaderId === sessionId) {
    const wasNew = leaderId !== sessionId;
    leaderId = sessionId;
    leaderExpiresAt = now + LEASE_TTL_MS;
    if (wasNew) broadcast('leader', { leaderId });
    return { isLeader: true, leaderId, ttlMs: LEASE_TTL_MS };
  }
  return { isLeader: false, leaderId, ttlMs: leaderExpiresAt - now };
}

export function releaseLease(sessionId: string): void {
  if (leaderId === sessionId) {
    leaderId = null;
    leaderExpiresAt = 0;
    broadcast('leader', { leaderId: null });
  }
}

export function getLeader(): string | null {
  return leaderAlive() ? leaderId : null;
}

export function hasLeader(): boolean {
  return getLeader() !== null;
}

export function enqueue(type: Command['type'], payload?: unknown): Command {
  const cmd: Command = { id: nextId(), type, payload };
  pending.push(cmd);
  const target = getLeader();
  if (target) {
    broadcast('command', cmd, (sub) => sub.id === target);
  }
  return cmd;
}

export function drain(): Command[] {
  const out = pending;
  pending = [];
  return out;
}

export function setState(state: RobotState): void {
  latestState = state;
  lastStateUpdate = Date.now();
  broadcast('state', state, (sub) => sub.id !== getLeader());
}

export function getState(): { state: RobotState | null; staleMs: number } {
  return {
    state: latestState,
    staleMs: latestState ? Date.now() - lastStateUpdate : -1
  };
}

export function queueDepth(): number {
  return pending.length;
}

export function subscribe(sub: Subscriber): () => void {
  subscribers.set(sub.id, sub);
  sub.send('hello', { leaderId: getLeader(), sessionId: sub.id });
  if (latestState && sub.id !== getLeader()) {
    sub.send('state', latestState);
  }
  return () => {
    subscribers.delete(sub.id);
    if (leaderId === sub.id) releaseLease(sub.id);
  };
}
