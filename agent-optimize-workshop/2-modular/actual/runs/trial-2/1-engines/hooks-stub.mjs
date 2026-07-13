// Resolve hook for check-joint.mjs: while another agent is still writing
// engines/modeling.js, redirect that ONE import to the local stub. When the real file
// exists this hook does nothing, so the same check runs against the real engine.
import { existsSync } from "node:fs";

const STUB = new URL("./stub-modeling.js", import.meta.url).href;

export async function resolve(spec, ctx, next) {
  if (spec.endsWith("engines/modeling.js")) {
    const target = new URL(spec, ctx.parentURL);
    if (!existsSync(target)) return { url: STUB, shortCircuit: true };
  }
  return next(spec, ctx);
}
