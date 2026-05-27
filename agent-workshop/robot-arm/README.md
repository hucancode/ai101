# Robot Arm Server

## Run

```bash
npm install
npm run dev
```

## REST API

All POST bodies are JSON.

### `GET /api/world`
Single consolidated world snapshot. Optional `?fields=a,b,c` query trims response to
the requested keys (default: all).

```json
{
  "cubes": [
    { "index": 0, "name": "cube0", "pos": [x,y,z],
      "size": [0.02,0.02,0.02], "rgba": [0.8,0.1,0.1,1] }
  ],
  "trays": [
    { "name": "stack_base", "pos": [0.6,0,0], "size": [0.1,0.1,0.005],
      "cubes": [
        { "name": "cube0", "pos": [...], "size": [...], "rgba": [...] }
      ]
    }
  ],
  "ee": [x,y,z],
  "gripper": 0,
  "holding": { "name": "cube0", "pos": [...], "size": [...], "rgba": [...] },
  "idle": true,
  "workspace": { "x": [0.2,0.7], "y": [-0.4,0.4], "z": [0.02,0.6], "table_z": 0 }
}
```

Field semantics:
- `cubes`: every cube body (name starts with `cube`). `size` is half-extents; world AABB = `pos ± size`.
- `trays[].cubes`: cubes fully inside the tray AABB-XY and at/above its top face.
- `holding`: full cube object the gripper is grasping (`null` if none). Detected by jaws-closed + ee within cube footprint + ee Z within one cube height.
- `idle`: sim has settled (queue drained + EE stationary). Use `?fields=idle` for cheap polling.
- `workspace`: reachable Cartesian box (meters).

### `POST /api/move_to`
Move IK target end-effector to Cartesian point.

```bash
curl -X POST localhost:3000/api/move_to \
  -d '{"x":0.4,"y":0.0,"z":0.3,"duration":1500}'
```

### `POST /api/pickup`
Run pick-and-place sequence on a list of world coordinates.

```bash
curl -X POST localhost:3000/api/pickup \
  -d '{"targets":[{"x":0.4,"y":-0.1,"z":0.04}]}'
```

### `POST /api/ctrl`
Raw actuator setpoints OR gripper-only.

```bash
curl -X POST localhost:3000/api/ctrl -d '{"ctrl":[1.7,-1.7,0,-2.7,0,0.95,2.49]}'
curl -X POST localhost:3000/api/ctrl -d '{"gripper":255}'
```

### `POST /api/gripper`
Set gripper aperture. `0` = closed, `255` = fully open. Clamped server-side.

```bash
curl -X POST localhost:3000/api/gripper -d '{"value":255}'
```
