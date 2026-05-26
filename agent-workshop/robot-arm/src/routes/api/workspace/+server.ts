import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({
    workspace: {
      x: [0.2, 0.7],
      y: [-0.4, 0.4],
      z: [0.02, 0.6],
      table_z: 0
    },
    gripper: {
      min: 0,
      max: 255,
      closed_max: 120,
      open_suggested: 200,
      grip_suggested: 40
    },
    units: 'meters'
  });
};
