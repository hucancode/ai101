declare module 'mujoco_wasm' {
  const loadMujoco: (config?: unknown) => Promise<unknown>;
  export default loadMujoco;
}
