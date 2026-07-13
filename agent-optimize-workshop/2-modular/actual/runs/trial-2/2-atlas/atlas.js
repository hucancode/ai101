// atlas — the page subject.
//
// The shared demo page's contract: a subject builds ONCE into the scene and hands back
// its channels and its pose object. The page's sliders and the choreographer both write
// that same object; `update()` reads it and sets bone angles. Nothing is rebuilt.
//
// `choreoChannels` is the subset the choreographer is allowed to see. The legs hold the
// mech up, so they are not in it — hip and knee stay draggable, but no beat moves them.

import { buildAtlas } from "./atlas/rig.js";

export const subjects = [{
  kind: "mech",
  name: "atlas",
  build(scene) {
    const rig = buildAtlas();
    scene.add(rig.root);

    return {
      channels: rig.channels.map((c) => ({ key: c.key, min: c.min, max: c.max })),
      choreoChannels: rig.choreoChannels.map((c) => ({ key: c.key, min: c.min, max: c.max })),
      pose: rig.pose,
      caption:
        "atlas — a humanoid mech: head, torso, pelvis, two arms with 3-finger grippers, " +
        "two legs with feet. Assembled once from a link list; a pose only sets bone " +
        "angles. The choreographer idles the upper body — the legs hold it up, so they " +
        "are hand-only. Drag any slider to take a channel back.",
      update() {
        rig.setPose(rig.pose);
      },
      dispose() {
        scene.remove(rig.root);
      },
    };
  },
}];
