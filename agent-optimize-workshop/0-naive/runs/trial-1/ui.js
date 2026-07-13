// ui.js — the control panel. Plain DOM into the #params div index.html provides.
// No framework, no state store: each control owns one value and calls back.

function row(parent, label) {
  const l = document.createElement("label");
  l.textContent = label;
  parent.appendChild(l);
  return l;
}

export function slider(parent, { label, min, max, step, value, format = (v) => v, onInput }) {
  const l = row(parent, label);
  const input = document.createElement("input");
  input.type = "range";
  input.min = min; input.max = max; input.step = step; input.value = value;
  const out = document.createElement("span");
  out.textContent = format(value);
  l.append(input, out);
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  return { set(v) { input.value = v; out.textContent = format(v); } };
}

export function toggle(parent, { label, value, onChange }) {
  const l = row(parent, label);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  l.prepend(input);
  input.addEventListener("change", () => onChange(input.checked));
  return { set(v) { input.checked = v; } };
}

export function button(parent, { label, onClick }) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = "font:inherit;padding:4px 8px;border-radius:4px;border:1px solid #46506a;background:#232a36;color:inherit;cursor:pointer";
  b.addEventListener("click", onClick);
  parent.appendChild(b);
  return b;
}

export function readout(parent, label) {
  const l = row(parent, label);
  const out = document.createElement("span");
  out.style.cssText = "min-width:0;text-align:right;flex:1;color:#8fd08f";
  l.appendChild(out);
  let last = null;
  return { set(v) { if (v !== last) { last = v; out.textContent = v; } } }; // skip no-op DOM writes
}

export function title(parent, text) {
  const h = document.createElement("div");
  h.textContent = text;
  h.style.cssText = "font-weight:bold;color:#e6ebf5;letter-spacing:.08em";
  parent.appendChild(h);
}
