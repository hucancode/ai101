// ui.js — the slider panel. One range input per pose channel, bound to the SAME
// pose object the choreographer writes into: dragging one writes the pose (and tells
// the choreographer to let that channel go), and every frame the readouts are pushed
// back from the pose, so the panel animates along with the dance.

import { CHANNELS } from "./pose.js";

export function buildPanel(host, pose, { onGrab }) {
  if (!host) throw new Error("buildPanel: no host element");
  const rows = [];

  for (const c of CHANNELS) {
    const label = document.createElement("label");

    const name = document.createElement("span");
    name.textContent = c.label;
    name.style.minWidth = "9ch";
    name.style.textAlign = "left";
    if (c.leg) name.style.opacity = "0.65";   // legs are hand-only: never choreographed

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(c.min);
    input.max = String(c.max);
    input.step = "1";
    input.value = String(pose[c.key]);

    const out = document.createElement("span");
    out.textContent = `${Math.round(pose[c.key])}`;

    input.addEventListener("input", () => {
      pose[c.key] = Number(input.value);
      onGrab(c.key);                          // the hand wins: drop any track on this channel
    });

    label.append(name, input, out);
    host.append(label);
    rows.push({ key: c.key, input, out, shown: NaN });
  }

  // push pose -> widgets (cheap: 14 rows, and only when the rounded value moved)
  return function sync() {
    for (const r of rows) {
      const v = Math.round(pose[r.key]);
      if (v === r.shown) continue;
      r.shown = v;
      r.input.value = String(v);
      r.out.textContent = `${v}`;
    }
  };
}
