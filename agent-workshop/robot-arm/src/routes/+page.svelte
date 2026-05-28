<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import Move3d from 'lucide-svelte/icons/move-3d';
  import MapPin from 'lucide-svelte/icons/map-pin';
  import ArrowUpFromDot from 'lucide-svelte/icons/arrow-up-from-dot';
  import ArrowDownToDot from 'lucide-svelte/icons/arrow-down-to-dot';
  import Workflow from 'lucide-svelte/icons/workflow';
  import Grip from 'lucide-svelte/icons/grip';
  import PanelRightClose from 'lucide-svelte/icons/panel-right-close';
  import PanelRightOpen from 'lucide-svelte/icons/panel-right-open';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Pause from 'lucide-svelte/icons/pause';
  import Play from 'lucide-svelte/icons/play';
  import Boxes from 'lucide-svelte/icons/boxes';
  import type { Command, RobotState } from '$lib/robot/types';
  import type { MujocoSim as MujocoSimType } from '$lib/robot/MujocoSim';
  import type { SceneMode } from '$lib/robot/RobotLoader';

  type CubeSummary = {
    name: string;
    pos: [number, number, number];
    quat: [number, number, number, number];
    size: [number, number, number];
    rgba: [number, number, number, number];
    geomType: number;
  };
  type TraySummary = {
    name: string;
    pos: [number, number, number];
    size: [number, number, number];
    cubes: CubeSummary[];
  };

  let container: HTMLDivElement;
  let sim: MujocoSimType | null = null;
  let loadStatus = 'Booting...';
  let loadError = '';
  let state: RobotState | null = null;
  let gripping: CubeSummary | null = null;
  let trays: TraySummary[] = [];
  let markerCounter = 1;
  let pushTimer: number | null = null;
  let leaseTimer: number | null = null;
  let pollTimer: number | null = null;
  let darkMode = true;
  let ikGizmo = false;
  let pickGizmo = false;
  let spawnMode = false;
  let ikPos = { x: 0, y: 0, z: 0 };
  let pickPos = { x: 0.4, y: -0.1, z: 0.04 };

  let gripVal = 0;
  let speedVal = 1;
  let flakyVal = 0;
  let panelOpen = true;

  let sceneMode: SceneMode = 'standard';
  let sceneReloading = false;
  const SCENE_MODES: SceneMode[] = ['clean', 'standard', 'cluttered', 'chaos', 'impossible'];

  type ToolMode = 'easy' | 'medium' | 'hard';
  const TOOL_MODES: ToolMode[] = ['easy', 'medium', 'hard'];
  let toolMode: ToolMode = 'easy';
  $: pickLocVisible = toolMode === 'easy';
  $: pickPlaceVisible = toolMode === 'easy';
  $: pickVisible = toolMode !== 'hard';
  $: placeVisible = toolMode !== 'hard';

  function selectToolMode(m: ToolMode) {
    toolMode = m;
    try { localStorage.setItem('toolMode', m); } catch (_) { /* ignore */ }
    if (m !== 'easy' && pickGizmo) {
      pickGizmo = false;
      sim?.setPickupGizmoVisible(false);
    }
  }
  let mujocoModule: unknown = null;
  let MujocoSimCtor: typeof import('$lib/robot/MujocoSim').MujocoSim | null = null;

  let sessionId = '';
  let isLeader = false;
  let leaderId: string | null = null;
  let eventSource: EventSource | null = null;

  function genSessionId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function toggleIkGizmo() {
    if (!sim || !isLeader) return;
    ikGizmo = !ikGizmo;
    sim.setIkEnabled(ikGizmo);
  }

  function togglePickGizmo() {
    if (!sim || !isLeader) return;
    pickGizmo = !pickGizmo;
    sim.setPickupGizmoVisible(pickGizmo);
  }

  function toggleSpawnMode() {
    if (!sim || !isLeader) return;
    spawnMode = !spawnMode;
    sim.setSpawnModeEnabled(spawnMode);
  }

  function runAtGizmo(mode: 'pickup' | 'place' | 'both') {
    if (!sim || !isLeader) return;
    sim.pickupAtGizmo(mode);
  }

  async function postJson(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {})
    });
    return res.json();
  }

  function applyCommand(cmd: Command) {
    if (!sim) return;
    const p = cmd.payload as Record<string, unknown> | undefined;
    switch (cmd.type) {
      case 'move_to': {
        const v = new THREE.Vector3(p!.x as number, p!.y as number, p!.z as number);
        sim.moveIkTargetTo(v, (p!.duration as number) ?? 1500);
        break;
      }
      case 'pickup': {
        const targets = (p!.targets as Array<{ x: number, y: number, z: number }>).map(
          t => new THREE.Vector3(t.x, t.y, t.z)
        );
        const ids = targets.map(() => markerCounter++);
        sim.pickupItems(targets, ids);
        break;
      }
      case 'reset':
        sim.reset();
        break;
      case 'pause':
        sim.setPaused(true);
        break;
      case 'resume':
        sim.setPaused(false);
        break;
      case 'ctrl':
        sim.setCtrl((p!.values as number[]) ?? []);
        break;
      case 'gripper':
        sim.setGripper((p!.value as number) ?? 0);
        break;
      case 'speed':
        sim.setSpeedMultiplier((p!.value as number) ?? 1);
        break;
      case 'flakiness':
        sim.setFlakiness((p!.value as number) ?? 0);
        break;
    }
  }

  function fmt(n: number) {
    return Number.isFinite(n) ? n.toFixed(3) : '—';
  }

  async function pushState() {
    if (!sim || !isLeader) return;
    const s = sim.getWorldState();
    if (!s) return;
    state = s;
    ikPos = { x: s.ee.pos[0] ?? 0, y: s.ee.pos[1] ?? 0, z: s.ee.pos[2] ?? 0 };
    const p = sim.getPickupGizmoPosition();
    pickPos = { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 };
    try {
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(s)
      });
    } catch (_) { /* ignore */ }
  }

  async function pollScene() {
    try {
      const w = await (await fetch('/api/world?fields=holding,trays')).json();
      gripping = w.holding ?? null;
      trays = w.trays ?? [];
    } catch (_) { /* transient */ }
  }

  function rgbCss(rgba: [number, number, number, number] | undefined) {
    if (!rgba) return '#64748b';
    const [r, g, b] = rgba;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  }

  async function claimLease() {
    try {
      const r = await postJson('/api/lease', { sessionId });
      leaderId = r.leaderId;
      const nowLeader = !!r.isLeader;
      if (nowLeader !== isLeader) {
        isLeader = nowLeader;
        if (sim) sim.setViewerMode(!isLeader);
        if (isLeader) {
          ikGizmo = false;
          pickGizmo = false;
          spawnMode = false;
        }
      }
    } catch (_) { /* transient */ }
  }

  function openStream() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/stream?sid=${encodeURIComponent(sessionId)}`);

    eventSource.addEventListener('hello', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        leaderId = data.leaderId;
      } catch (_) { /* ignore */ }
    });

    eventSource.addEventListener('leader', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data);
        leaderId = data.leaderId;
        if (leaderId !== sessionId && isLeader) {
          isLeader = false;
          if (sim) sim.setViewerMode(true);
        }
      } catch (_) { /* ignore */ }
    });

    eventSource.addEventListener('state', (ev: MessageEvent) => {
      try {
        const s = JSON.parse(ev.data) as RobotState;
        state = s;
        if (sim && !isLeader) sim.applyExternalState(s);
      } catch (_) { /* ignore */ }
    });

    eventSource.addEventListener('command', (ev: MessageEvent) => {
      try {
        const cmd = JSON.parse(ev.data) as Command;
        if (isLeader) applyCommand(cmd);
      } catch (_) { /* ignore */ }
    });
  }

  async function buildSim(mode: SceneMode) {
    if (!MujocoSimCtor || !mujocoModule) throw new Error('sim deps not loaded');
    sim = new MujocoSimCtor(container, mujocoModule as never);
    await sim.init((m) => (loadStatus = m), mode);
    sim.renderSys.setDarkMode(darkMode);
    sim.setIkEnabled(false);
    ikGizmo = false;
    pickGizmo = false;
    spawnMode = false;
    loadStatus = '';
    sim.setViewerMode(!isLeader);
  }

  async function reloadSim(mode: SceneMode) {
    if (sceneReloading) return;
    sceneReloading = true;
    try {
      loadStatus = `Loading ${mode} scene...`;
      sim?.dispose();
      sim = null;
      while (container?.firstChild) container.removeChild(container.firstChild);
      await buildSim(mode);
    } catch (e) {
      loadError = (e as Error).message || 'scene reload failed';
    } finally {
      sceneReloading = false;
    }
  }

  async function selectScene(mode: SceneMode) {
    if (mode === sceneMode || sceneReloading) return;
    sceneMode = mode;
    try { localStorage.setItem('sceneMode', mode); } catch (_) { /* ignore */ }
    await reloadSim(mode);
  }

  onMount(async () => {
    sessionId = genSessionId();
    try {
      const { MujocoSim } = await import('$lib/robot/MujocoSim');
      MujocoSimCtor = MujocoSim;
      const loadMujoco = (await import('mujoco_wasm')).default as (cfg?: unknown) => Promise<unknown>;
      loadStatus = 'Loading MuJoCo WASM...';
      mujocoModule = await loadMujoco({
        locateFile: (path: string) => path.endsWith('.wasm') ? 'https://unpkg.com/mujoco-js@0.0.7/dist/mujoco_wasm.wasm' : path
      });

      try {
        const stored = localStorage.getItem('sceneMode') as SceneMode | null;
        if (stored && SCENE_MODES.includes(stored)) sceneMode = stored;
      } catch (_) { /* ignore */ }

      try {
        const storedTool = localStorage.getItem('toolMode') as ToolMode | null;
        if (storedTool && TOOL_MODES.includes(storedTool)) toolMode = storedTool;
      } catch (_) { /* ignore */ }

      await claimLease();
      await buildSim(sceneMode);
      openStream();

      pushTimer = window.setInterval(pushState, 200);
      leaseTimer = window.setInterval(claimLease, 2000);
      pollTimer = window.setInterval(pollScene, 500);
      pollScene();
    } catch (e) {
      loadError = (e as Error).message || 'init failed';
    }
  });

  onDestroy(() => {
    if (pushTimer) clearInterval(pushTimer);
    if (leaseTimer) clearInterval(leaseTimer);
    if (pollTimer) clearInterval(pollTimer);
    if (eventSource) eventSource.close();
    if (isLeader && sessionId) {
      navigator.sendBeacon?.('/api/lease', new Blob(
        [JSON.stringify({ sessionId, release: true })],
        { type: 'application/json' }
      ));
    }
    sim?.dispose();
  });

  function toggleDark() {
    darkMode = !darkMode;
    sim?.renderSys.setDarkMode(darkMode);
  }
</script>

<svelte:window on:beforeunload={() => {
  if (isLeader && sessionId) {
    navigator.sendBeacon?.('/api/lease', new Blob(
      [JSON.stringify({ sessionId, release: true })],
      { type: 'application/json' }
    ));
  }
}} />

<div class="root">
  <div class="viewport" bind:this={container}></div>

  <div class="hud">
    <button
      class="hud-btn"
      class:on={ikGizmo}
      on:click={toggleIkGizmo}
      disabled={!isLeader}
      title="EE control"
      aria-label="EE control"
    >
      <Move3d size={20} />
    </button>
    {#if pickLocVisible}
    <button
      class="hud-btn"
      class:on={pickGizmo}
      on:click={togglePickGizmo}
      disabled={!isLeader}
      title="Pickup Location (click to place)"
      aria-label="Pickup Location (click to place)"
    >
      <MapPin size={20} />
    </button>
    {/if}
    <button
      class="hud-btn"
      class:on={spawnMode}
      on:click={toggleSpawnMode}
      disabled={!isLeader}
      title="Spawn mode (right-click ground to drop blue cube)"
      aria-label="Spawn mode"
    >
      <Boxes size={20} />
    </button>
    {#if pickVisible || placeVisible || pickPlaceVisible}
    <span class="hud-group">
      {#if pickVisible}
      <button
        class="hud-btn"
        on:click={() => runAtGizmo('pickup')}
        disabled={!isLeader || !pickGizmo}
        title="Pickup at Marker"
        aria-label="Pickup at Marker"
      >
        <ArrowUpFromDot size={20} />
      </button>
      {/if}
      {#if placeVisible}
      <button
        class="hud-btn"
        on:click={() => runAtGizmo('place')}
        disabled={!isLeader}
        title="Place Held Cube"
        aria-label="Place Held Cube"
      >
        <ArrowDownToDot size={20} />
      </button>
      {/if}
      {#if pickPlaceVisible}
      <button
        class="hud-btn"
        on:click={() => runAtGizmo('both')}
        disabled={!isLeader || !pickGizmo}
        title="Pickup and Place"
        aria-label="Pickup and Place"
      >
        <Workflow size={20} />
      </button>
      {/if}
    </span>
    {/if}
    <span class="hud-group">
      <button
        class="hud-btn"
        on:click={() => postJson('/api/reset')}
        title="Reset"
        aria-label="Reset"
      >
        <RotateCcw size={20} />
      </button>
      <button
        class="hud-btn"
        on:click={() => postJson('/api/pause', { paused: !(state?.paused ?? false) })}
        title={state?.paused ? 'Resume' : 'Pause'}
        aria-label={state?.paused ? 'Resume' : 'Pause'}
      >
        {#if state?.paused}
          <Play size={20} />
        {:else}
          <Pause size={20} />
        {/if}
      </button>
    </span>
    <span class="hud-slider" title="Gripper Aperture">
      <span class="hud-slider-icon" aria-hidden="true"><Grip size={18} /></span>
      <input
        type="range"
        min="0"
        max="255"
        bind:value={gripVal}
        on:input={() => postJson('/api/ctrl', { gripper: gripVal })}
        aria-label="Gripper Aperture"
      />
      <span class="hud-slider-val">{gripVal}</span>
    </span>
  </div>

  {#if !panelOpen}
    <div class="hud hud-right">
      <button
        class="hud-btn"
        on:click={() => (panelOpen = true)}
        title="Show panel"
        aria-label="Show panel"
      >
        <PanelRightOpen size={20} />
      </button>
    </div>
  {/if}

  {#if loadStatus}
    <div class="overlay">
      <div class="card">
        <h3>Robot Arm</h3>
        <p>{loadStatus}</p>
      </div>
    </div>
  {/if}

  {#if loadError}
    <div class="overlay">
      <div class="card error">
        <h3>Init Failed</h3>
        <pre>{loadError}</pre>
        <button on:click={() => location.reload()}>Reload</button>
      </div>
    </div>
  {/if}

  {#if panelOpen}
  <aside class="panel">
    <header>
      <h1>Robot Arm</h1>
      <div class="header-actions">
        <button on:click={toggleDark}>{darkMode ? 'Light' : 'Dark'}</button>
        <button
          class="panel-close"
          on:click={() => (panelOpen = false)}
          title="Hide panel"
          aria-label="Hide panel"
        >
          <PanelRightClose size={18} />
        </button>
      </div>
    </header>

    <section>
      <div class="role">
        <span class="badge" class:leader={isLeader} class:viewer={!isLeader}>
          {isLeader ? 'SIM HOST' : 'VIEWER'}
        </span>
        <span class="hint">{isLeader ? 'This tab runs physics' : 'Mirroring host tab'}</span>
      </div>
    </section>

    <section>
      <h2>Scene</h2>
      <div class="scene-grid">
        {#each SCENE_MODES as mode}
          <button
            class="scene-btn"
            class:on={sceneMode === mode}
            on:click={() => selectScene(mode)}
            disabled={sceneReloading}
          >{mode}</button>
        {/each}
      </div>
      {#if sceneReloading}<p class="hint">Reloading...</p>{/if}
    </section>

    <section>
      <h2>Speed</h2>
      <div class="row">
        <input type="range" min="0.1" max="5" step="0.1" bind:value={speedVal}
          on:input={() => postJson('/api/speed', { speed: speedVal })} />
        <span>{speedVal.toFixed(1)}x</span>
      </div>
    </section>

    <section>
      <h2>Flakiness</h2>
      <div class="row">
        <input type="range" min="0" max="1" step="0.01" bind:value={flakyVal}
          on:input={() => postJson('/api/flakiness', { flakiness: flakyVal })} />
        <span>{flakyVal.toFixed(2)}</span>
      </div>
      <p class="hint">Random ±y offset on pickup/place. 0 = perfect, 1 = flaky.</p>
    </section>

    <section>
      <h2>Tools</h2>
      <div class="scene-grid tool-grid">
        {#each TOOL_MODES as m}
          <button
            class="scene-btn"
            class:on={toolMode === m}
            on:click={() => selectToolMode(m)}
          >{m}</button>
        {/each}
      </div>
      <p class="hint">
        {#if toolMode === 'easy'}all tools visible{:else if toolMode === 'medium'}pickup location + pick-and-place hidden{:else}pickup, place, pickup-and-place, pickup location hidden{/if}
      </p>
    </section>

    <section>
      <h2>Gripping</h2>
      {#if gripping}
        <div class="item">
          <span class="swatch" style="background:{rgbCss(gripping.rgba)}"></span>
          <span class="name">{gripping.name}</span>
          <span class="pos">{gripping.pos.map(v => v.toFixed(3)).join(', ')}</span>
        </div>
      {:else}
        <p class="dim">nothing held</p>
      {/if}
    </section>

    <section>
      <h2>Trays</h2>
      {#if trays.length === 0}
        <p class="dim">no trays</p>
      {:else}
        {#each trays as tray}
          <div class="tray">
            <div class="tray-head">
              <span class="name">{tray.name}</span>
              <span class="count">{tray.cubes.length} cube{tray.cubes.length === 1 ? '' : 's'}</span>
            </div>
            {#if tray.cubes.length > 0}
              <ul class="cubes">
                {#each tray.cubes as c}
                  <li class="item">
                    <span class="swatch" style="background:{rgbCss(c.rgba)}"></span>
                    <span class="name">{c.name}</span>
                    <span class="pos">{c.pos.map(v => v.toFixed(2)).join(', ')}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      {/if}
    </section>

    <section class="state">
      <h2>State</h2>
      {#if state}
        <div class="kv">
          <span>time</span><span>{state.time.toFixed(3)}</span>
          <span>ee</span><span>{state.ee.pos.map(v => v.toFixed(3)).join(', ')}</span>
          <span>gripper</span><span>{state.gripper?.toFixed(1) ?? '-'}</span>
          <span>paused</span><span>{state.paused}</span>
          <span>speed</span><span>{state.speedMultiplier}x</span>
          <span>seq</span><span>{state.sequenceRunning}</span>
          <span>idle</span><span>{state.idle}</span>
        </div>
        <details>
          <summary>qpos[0..6]</summary>
          <pre>{state.qpos.map(v => v.toFixed(3)).join(', ')}</pre>
        </details>
        <details>
          <summary>bodies ({state.bodies.length})</summary>
          <pre>{state.bodies.filter(b => b.name).map(b => `${b.name}: ${b.pos.map(v => v.toFixed(2)).join(',')}`).join('\n')}</pre>
        </details>
      {:else}
        <p class="dim">awaiting first tick...</p>
      {/if}
    </section>
  </aside>
  {/if}
</div>

<style>
  .root { position: fixed; inset: 0; }
  .viewport { position: absolute; inset: 0; }
  .overlay {
    position: absolute; inset: 0;
    display: grid; place-items: center;
    background: rgba(15,23,42,0.6); backdrop-filter: blur(6px);
    z-index: 10;
  }
  .card {
    background: #1e293b; border: 1px solid #334155;
    padding: 2rem; border-radius: 12px; min-width: 280px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  }
  .card h3 { margin: 0 0 0.5rem; }
  .card.error pre { color: #fca5a5; white-space: pre-wrap; }

  .hud {
    position: absolute;
    top: 0.75rem; left: 0.75rem;
    display: flex; gap: 0.4rem;
    z-index: 6;
  }
  .hud-right {
    left: auto;
    right: 0.75rem;
  }
  .hud-btn {
    width: 2.25rem; height: 2.25rem;
    display: inline-grid; place-items: center;
    padding: 0;
    background: rgba(15, 23, 42, 0.75);
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 6px;
    backdrop-filter: blur(8px);
    cursor: pointer;
  }
  .hud-btn:hover:not(:disabled) {
    background: rgba(79, 70, 229, 0.25);
    border-color: #4f46e5;
    color: #c7d2fe;
  }
  .hud-btn.on {
    background: #4f46e5;
    border-color: #6366f1;
    color: white;
  }
  .hud-btn.on:hover:not(:disabled) {
    background: #6366f1;
    border-color: #818cf8;
    color: white;
  }
  .hud-btn:disabled {
    color: #64748b;
    border-color: #1e293b;
    cursor: not-allowed;
    opacity: 0.6;
  }
  .hud-group {
    display: inline-flex;
    gap: 1px;
    background: #334155;
    border-radius: 6px;
    overflow: hidden;
  }
  .hud-group .hud-btn { border-radius: 0; border: 0; }

  .hud-slider {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 2.25rem;
    padding: 0 0.6rem;
    background: rgba(15, 23, 42, 0.75);
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 6px;
    backdrop-filter: blur(8px);
  }
  .hud-slider-icon { display: inline-grid; place-items: center; color: #cbd5e1; }
  .hud-slider input[type="range"] { width: 130px; }
  .hud-slider-val {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: #e2e8f0;
    min-width: 1.8rem;
    text-align: right;
  }

  .panel {
    position: absolute; top: 0; right: 0; bottom: 0;
    width: 360px;
    background: rgba(15,23,42,0.85);
    backdrop-filter: blur(12px);
    border-left: 1px solid #1e293b;
    padding: 1rem;
    overflow-y: auto;
    z-index: 5;
  }
  .panel header { display: flex; justify-content: space-between; align-items: center; }
  .header-actions { display: flex; gap: 0.4rem; align-items: center; }
  .panel-close {
    background: transparent;
    color: #cbd5e1;
    border: 1px solid #334155;
    padding: 0.25rem;
    width: 1.9rem; height: 1.9rem;
    display: inline-grid; place-items: center;
    border-radius: 6px;
  }
  .panel-close:hover {
    background: rgba(79, 70, 229, 0.25);
    border-color: #4f46e5;
    color: #c7d2fe;
  }
  .panel h1 { font-size: 1rem; margin: 0; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
  .panel section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #1e293b; }
  .panel h2 { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin: 0 0 0.5rem; }

  .role { display: flex; align-items: center; gap: 0.5rem; }
  .badge {
    font-size: 0.65rem; letter-spacing: 0.1em; padding: 0.2rem 0.5rem;
    border-radius: 3px; font-weight: 700;
  }
  .badge.leader { background: #16a34a; color: white; }
  .badge.viewer { background: #475569; color: #cbd5e1; }

  .row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
  input[type="range"] { flex: 1; }
  button {
    background: #4f46e5; color: white; border: 0;
    padding: 0.4rem 0.8rem; border-radius: 4px; cursor: pointer;
    font-family: inherit; font-size: 0.8rem;
  }
  button:hover { background: #6366f1; }
  button.on { background: #16a34a; }
  button.on:hover { background: #22c55e; }
  button:disabled { background: #475569; cursor: not-allowed; }
  .hint { font-size: 0.7rem; color: #64748b; }
  .kv.small { font-size: 0.7rem; margin-bottom: 0.5rem; }

  .state .kv {
    display: grid; grid-template-columns: 5rem 1fr;
    gap: 0.25rem 0.5rem; font-size: 0.75rem;
  }
  .state .kv span:nth-child(odd) { color: #64748b; }
  .state pre { font-size: 0.7rem; background: #0f172a; padding: 0.5rem; border-radius: 4px; overflow-x: auto; }
  .state details { margin-top: 0.5rem; }
  .state summary { cursor: pointer; font-size: 0.75rem; color: #94a3b8; }
  .dim { color: #64748b; font-size: 0.8rem; }

  .item {
    display: grid;
    grid-template-columns: 0.9rem 1fr auto;
    gap: 0.5rem;
    align-items: center;
    font-size: 0.75rem;
    padding: 0.2rem 0;
  }
  .item .name { color: #e2e8f0; }
  .item .pos { color: #64748b; font-variant-numeric: tabular-nums; }
  .swatch {
    width: 0.9rem; height: 0.9rem;
    border-radius: 3px;
    border: 1px solid rgba(255,255,255,0.15);
  }
  .tray { margin-bottom: 0.5rem; }
  .tray-head {
    display: flex; justify-content: space-between;
    font-size: 0.75rem; color: #cbd5e1;
    border-bottom: 1px dashed #334155;
    padding-bottom: 0.2rem; margin-bottom: 0.2rem;
  }
  .tray-head .count { color: #94a3b8; font-size: 0.7rem; }
  .cubes { list-style: none; padding: 0; margin: 0; }

  .scene-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.3rem;
  }
  .tool-grid { grid-template-columns: repeat(3, 1fr); }
  .scene-btn {
    background: #1e293b;
    color: #cbd5e1;
    border: 1px solid #334155;
    text-transform: capitalize;
    font-size: 0.75rem;
    padding: 0.4rem 0.5rem;
  }
  .scene-btn:hover:not(:disabled) { background: #334155; color: #f1f5f9; }
  .scene-btn.on { background: #4f46e5; color: white; border-color: #6366f1; }
  .scene-btn.on:hover:not(:disabled) { background: #6366f1; }
</style>
