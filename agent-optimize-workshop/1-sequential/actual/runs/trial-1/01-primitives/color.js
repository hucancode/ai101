// Identity coloring: hash a shape's `id` into a curated palette. Identical
// pieces get the same color, lego-style. A new seed reshuffles which palette
// slot each hash bucket points to, but the mapping stays a pure function of
// `id`, so identical ids always still match each other after a reshuffle.
import { mulberry32 } from "./math.js";

// Curated, saturated, lego-ish palette (0..1 floats for MeshPhongMaterial).
const PALETTE = [
  [0.86, 0.16, 0.16], // red
  [0.15, 0.45, 0.86], // blue
  [0.96, 0.78, 0.10], // yellow
  [0.16, 0.62, 0.28], // green
  [0.92, 0.50, 0.10], // orange
  [0.55, 0.30, 0.75], // purple
  [0.10, 0.68, 0.68], // teal
  [0.85, 0.40, 0.60], // pink
  [0.45, 0.32, 0.20], // brown
  [0.70, 0.70, 0.72], // grey
  [0.20, 0.20, 0.24], // near-black
  [0.92, 0.92, 0.90], // near-white
  [0.30, 0.78, 0.35], // lime
  [0.35, 0.40, 0.86], // indigo
];

// deterministic string hash -> uint32 (FNV-1a)
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Build a colorer for a given seed: a memoized `id -> [r,g,b]` function.
// Re-seeding permutes which palette slot each hash bucket lands on (a fresh
// shuffle) while keeping the "same id -> same color" property intact.
export function makeColorer(seed = 0) {
  const rng = mulberry32(seed >>> 0);
  const order = PALETTE.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }
  const cache = new Map();
  return function colorOf(id) {
    let c = cache.get(id);
    if (c) return c;
    const slot = order[hashStr(id) % order.length];
    c = PALETTE[slot];
    cache.set(id, c);
    return c;
  };
}
