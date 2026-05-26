<script lang="ts">
</script>

<slot />

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #0f172a;
    color: #e2e8f0;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    overflow: hidden;
  }
  :global(*) { box-sizing: border-box; }
</style>
