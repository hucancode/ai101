/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface MujocoModel {
    nbody: number;
    ngeom: number;
    nsite: number;
    nu: number;
    njnt: number;
    name_siteadr: Int32Array;
    name_actuatoradr: Int32Array;
    name_bodyadr: Int32Array;
    names: Int8Array;
    jnt_qposadr: Int32Array;
    actuator_trnid: Int32Array;
    geom_group: Int32Array;
    geom_type: Int32Array;
    geom_size: Float64Array;
    geom_pos: Float64Array;
    geom_quat: Float64Array;
    geom_matid: Int32Array;
    mat_rgba: Float32Array;
    geom_rgba: Float32Array;
    geom_dataid: Int32Array;
    mesh_vertadr: Int32Array;
    mesh_vertnum: Int32Array;
    mesh_faceadr: Int32Array;
    mesh_facenum: Int32Array;
    mesh_vert: Float32Array;
    mesh_face: Int32Array;
    geom_bodyid: Int32Array;
    body_jntadr: Int32Array;
    delete: () => void;
    [key: string]: unknown;
}

export interface MujocoData {
    time: number;
    qpos: Float64Array;
    ctrl: Float64Array;
    xfrc_applied: Float64Array;
    xpos: Float64Array;
    xquat: Float64Array;
    ncon: number;
    contact: unknown;
    site_xpos: Float64Array;
    site_xmat: Float64Array;
    delete: () => void;
    [key: string]: unknown;
}

export interface MujocoModule {
    MjModel: { loadFromXML: (path: string) => MujocoModel;[key: string]: unknown };
    MjData: new (model: MujocoModel) => MujocoData;
    MjvOption: new () => { delete: () => void;[key: string]: unknown };
    mj_forward: (m: MujocoModel, d: MujocoData) => void;
    mj_step: (m: MujocoModel, d: MujocoData) => void;
    mj_resetData: (m: MujocoModel, d: MujocoData) => void;
    mjtGeom: Record<string, number | { value: number }>;
    FS: {
        writeFile: (path: string, content: string | Uint8Array) => void;
        mkdir: (path: string) => void;
        unmount: (path: string) => void;
    };
    [key: string]: unknown;
}

export interface Command {
    id: string;
    type: 'move_to' | 'pickup' | 'reset' | 'pause' | 'resume' | 'ctrl' | 'gripper' | 'speed' | 'ik_enabled' | 'flakiness';
    payload?: unknown;
}

export interface GeomInfo {
    type: number;
    size: [number, number, number];
    rgba: [number, number, number, number];
}

export interface BodyInfo {
    name: string;
    pos: [number, number, number];
    quat: [number, number, number, number];
    geoms: GeomInfo[];
}

export interface Tray {
    name: string;
    pos: [number, number, number];
    quat: [number, number, number, number];
    size: [number, number, number];
    geomType: number;
}

export interface RobotState {
    time: number;
    paused: boolean;
    speedMultiplier: number;
    ikEnabled: boolean;
    sequenceRunning: boolean;
    qpos: number[];
    ctrl: number[];
    gripper: number | null;
    ee: { pos: [number, number, number]; rot: [number, number, number] };
    bodies: BodyInfo[];
    trays: Tray[];
}
