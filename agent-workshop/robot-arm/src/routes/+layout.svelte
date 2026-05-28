<script lang="ts">
</script>

<slot />

<style>
  :global(:root) {
    --bg: #0f172a;
    --surface: #1e293b;
    --surface-2: rgba(15, 23, 42, 0.75);
    --surface-panel: rgba(15, 23, 42, 0.85);
    --border: #334155;
    --border-soft: #1e293b;
    --text: #e2e8f0;
    --text-dim: #cbd5e1;
    --text-muted: #94a3b8;
    --text-faint: #64748b;
    --accent: #4f46e5;
    --accent-hi: #6366f1;
    --accent-soft: rgba(79, 70, 229, 0.25);
    --accent-text: #c7d2fe;
    --success: #16a34a;
    --success-hi: #22c55e;
    --danger: #fca5a5;
    --radius: 6px;
    --radius-lg: 12px;
    --z-panel: 5;
    --z-hud: 6;
    --z-overlay: 10;
  }
  :global(html.light) {
    --bg: #f8fafc;
    --surface: #ffffff;
    --surface-2: rgba(255, 255, 255, 0.85);
    --surface-panel: rgba(255, 255, 255, 0.9);
    --border: #cbd5e1;
    --border-soft: #e2e8f0;
    --text: #0f172a;
    --text-dim: #334155;
    --text-muted: #475569;
    --text-faint: #94a3b8;
    --accent-soft: rgba(79, 70, 229, 0.15);
    --accent-text: #4338ca;
  }
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }
  :global(*) { box-sizing: border-box; }
</style>
