# Robot Arm Server

## Run

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
node build
```

## REST API

All POST bodies are JSON.

### `GET /api/state`
Returns latest cached world state.

```json
{
  "state": {
    "time": 12.34,
    "paused": false,
    "speedMultiplier": 1,
    "ikEnabled": false,
    "sequenceRunning": false,
    "qpos": [...7 joint angles...],
    "ctrl": [...actuator setpoints...],
    "gripper": 0,
    "ee": { "pos": [x,y,z], "rot": [rx,ry,rz] },
    "bodies": [
      {
        "name": "cube0",
        "pos": [x,y,z],
        "quat": [w,x,y,z],
        "geoms": [
          { "type": 6, "size": [0.02,0.02,0.02], "rgba": [0.8,0.1,0.1,1] }
        ]
      }
    ],
    "trays": [
      {
        "name": "stack_base",
        "pos": [0.6, 0, 0],
        "quat": [1,0,0,0],
        "size": [0.1, 0.1, 0.005],
        "geomType": 6
      }
    ]
  },
  "staleMs": 134,
  "pending": 0
}
```

Notes:
- Cubes are bodies whose `name` starts with `cube`. First entry of `geoms` carries their color (`rgba`) and half-extents (`size`).
- `geomType` follows MuJoCo `mjtGeom` (6 = box). For box, `size` is half-extents; world AABB = `pos ± size`.
- `trays` lists tray / stack-base bodies. Use `/api/trays` for server-side containment.

### `GET /api/cubes`
Flat list of cubes with color + size.

```json
{
  "cubes": [
    { "name": "cube0", "pos": [x,y,z], "quat": [w,x,y,z],
      "size": [0.02,0.02,0.02], "rgba": [0.8,0.1,0.1,1], "geomType": 6 }
  ],
  "staleMs": 134
}
```

### `GET /api/trays`
Trays with cubes currently inside (AABB-XY + above-top test).

```json
{
  "trays": [
    {
      "name": "stack_base",
      "pos": [0.6,0,0], "quat": [1,0,0,0],
      "size": [0.1,0.1,0.005], "geomType": 6,
      "cubes": [
        { "name": "cube0", "pos": [...], "quat": [...],
          "size": [...], "rgba": [...], "geomType": 6 }
      ]
    }
  ],
  "staleMs": 134
}
```

### `GET /api/gripping`
Cube currently between the gripper jaws (nearest cube whose center is within
its half-extents + tolerance of the end-effector). `null` if none.

```json
{
  "gripping": {
    "name": "cube0", "pos": [x,y,z], "quat": [w,x,y,z],
    "size": [...], "rgba": [...], "geomType": 6
  },
  "gripper": 0,
  "ee": [x,y,z],
  "staleMs": 134
}
```

### `GET /api/tray`
Trays with their top-face area (m²) and cubes whose AABB is **fully inside**
the tray (stricter than `/api/trays`, which allows tolerance overflow).

```json
{
  "trays": [
    {
      "name": "stack_base",
      "pos": [0.6,0,0], "quat": [1,0,0,0],
      "size": [0.1,0.1,0.005],
      "area": 0.04,
      "geomType": 6,
      "cubes": [
        { "name": "cube0", "pos": [...], "quat": [...],
          "size": [...], "rgba": [...], "geomType": 6 }
      ]
    }
  ],
  "staleMs": 134
}
```

### `POST /api/move_to`
Move IK target end-effector to Cartesian point.

```bash
curl -X POST localhost:3000/api/move_to \
  -H 'content-type: application/json' \
  -d '{"x":0.4,"y":0.0,"z":0.3,"duration":1500}'
```

### `POST /api/pickup`
Run pick-and-place sequence on a list of world coordinates.

```bash
curl -X POST localhost:3000/api/pickup \
  -H 'content-type: application/json' \
  -d '{"targets":[{"x":0.4,"y":-0.1,"z":0.04}]}'
```

### `POST /api/ctrl`
Raw actuator setpoints OR gripper-only.

```bash
curl -X POST localhost:3000/api/ctrl -d '{"ctrl":[1.7,-1.7,0,-2.7,0,0.95,2.49]}' -H 'content-type: application/json'
curl -X POST localhost:3000/api/ctrl -d '{"gripper":255}' -H 'content-type: application/json'
```

### `POST /api/gripper`
Set gripper openness. `0` = closed, `255` = fully open. Clamped server-side.

```bash
curl -X POST localhost:3000/api/gripper \
  -H 'content-type: application/json' \
  -d '{"value":255}'
```

### `POST /api/pause`
```bash
curl -X POST localhost:3000/api/pause -d '{"paused":true}' -H 'content-type: application/json'
```

### `POST /api/speed`
Sim speed multiplier (1 = realtime).
```bash
curl -X POST localhost:3000/api/speed -d '{"speed":5}' -H 'content-type: application/json'
```

### `POST /api/reset`
```bash
curl -X POST localhost:3000/api/reset
```

### `GET /api/commands`
Drain pending commands. Used by the browser viewer — external clients
generally do not call this.

## Caveats

- The sim runs in **one** browser tab. If no tab is open, commands queue up
  but nothing executes. Open the page in a browser to run the sim.
- State is whatever the most recent connected tab reported. Multiple tabs
  will race.
- Robot XML + meshes served from `static/`. MuJoCo WASM blob still loads from `unpkg.com` on first run.
