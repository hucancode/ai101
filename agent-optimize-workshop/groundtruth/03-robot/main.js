import { createViewer, createDrawer } from "./render.js";
import { atlasModel, ATLAS_POSE } from "./rig.js";

// standing atlas with a slow idle animation layered on the default pose
const SEED = 1;

const viewer = createViewer(document.getElementById("view"), { camDist: 7, camHeight: 0.5, target: [0, 1.8, 0] });
const drawer = createDrawer(viewer.scene);

viewer.onFrame = (t) => {
  const pose = {
    ...ATLAS_POSE,
    headYaw: 25 * Math.sin(t * 0.6),
    headPitch: 8 * Math.sin(t * 0.9),
    twist: 10 * Math.sin(t * 0.4),
    waistBend: 5 * Math.sin(t * 0.35),
    waistTilt: 4 * Math.sin(t * 0.55),
    shoulder: 20 + 18 * Math.sin(t * 0.7),
    armOut: 25 + 12 * Math.sin(t * 0.45),
    elbow: 25 + 20 * Math.sin(t * 0.7 + 1),
    wristBend: 15 * Math.sin(t * 1.1),
    wristTilt: 15 * Math.sin(t * 0.8),
    wristTwist: 40 * Math.sin(t * 0.65),
    curl: 30 + 28 * Math.sin(t * 0.9),
    hip: 6 * Math.sin(t * 0.5),
    knee: 8 + 6 * Math.sin(t * 0.5 + 0.6),
  };
  drawer.draw(atlasModel(SEED, pose).items);
};
