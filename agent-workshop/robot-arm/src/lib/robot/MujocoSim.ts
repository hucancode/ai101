/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { IkSystem } from './IkSystem';
import { RenderSystem } from './RenderSystem';
import { RobotLoader } from './RobotLoader';
import { SequenceAnimator } from './SequenceAnimator';
import { BodyInfo, GeomInfo, MujocoData, MujocoModel, MujocoModule, Tray, RobotState } from './types';
import { getName } from './StringUtils';

/**
 * MujocoSim: central orchestrator. Bridges MuJoCo WASM engine and Three.js viz.
 */
export class MujocoSim {
    mujoco: MujocoModule;
    mjModel: MujocoModel | null = null;
    mjData: MujocoData | null = null;
    mjvOption: InstanceType<MujocoModule['MjvOption']>;

    renderSys: RenderSystem;
    ikSys: IkSystem;
    sequenceAnimator: SequenceAnimator;

    pickupGizmo: THREE.Mesh;
    pickupControl: TransformControls;
    pickupControlHelper: THREE.Object3D;

    frameId: number | null = null;
    paused = false;
    gripperActuatorId = -1;
    speedMultiplier = 1;

    private userIkEnabled = false;
    private firstIkEnable = true;

    viewerMode = false;
    private pendingExternalState: RobotState | null = null;

    private gizmoAnim = {
        active: false,
        startPos: new THREE.Vector3(),
        endPos: new THREE.Vector3(),
        startRot: new THREE.Quaternion(),
        endRot: new THREE.Quaternion(),
        startTime: 0,
        duration: 1000
    };

    constructor(container: HTMLElement, mujocoInstance: MujocoModule) {
        this.mujoco = mujocoInstance;
        this.mjvOption = new this.mujoco.MjvOption();

        this.renderSys = new RenderSystem(container, this.mujoco);

        this.ikSys = new IkSystem(this.mujoco, this.renderSys.camera, this.renderSys.renderer.domElement, this.renderSys.controls);
        this.renderSys.simGroup.add(this.ikSys.target);
        this.renderSys.scene.add(this.ikSys.controlHelper);

        this.sequenceAnimator = new SequenceAnimator();

        this.pickupGizmo = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x78350f, transparent: true, opacity: 0.85 })
        );
        this.pickupGizmo.position.set(0.4, -0.1, 0.04);
        this.pickupGizmo.visible = false;
        this.renderSys.scene.add(this.pickupGizmo);

        this.pickupControl = new TransformControls(this.renderSys.camera, this.renderSys.renderer.domElement);
        this.pickupControl.setMode('translate');
        this.pickupControl.setSpace('world');
        this.pickupControl.addEventListener('dragging-changed', (event) => {
            const e = event as unknown as { value: boolean };
            this.renderSys.controls.enabled = !e.value;
        });
        this.pickupControl.attach(this.pickupGizmo);
        this.pickupControlHelper = this.pickupControl.getHelper();
        this.pickupControlHelper.visible = false;
        this.pickupControl.enabled = false;
        this.renderSys.scene.add(this.pickupControlHelper);

        this.renderSys.initLights();
    }

    setPickupGizmoVisible(visible: boolean) {
        this.pickupGizmo.visible = visible;
        this.pickupControlHelper.visible = visible;
        this.pickupControl.enabled = visible;
    }

    getPickupGizmoPosition(): { x: number; y: number; z: number } {
        const p = this.pickupGizmo.position;
        return { x: p.x, y: p.y, z: p.z };
    }

    pickupAtGizmo(mode: 'pickup' | 'place' | 'both' = 'both') {
        const p = this.pickupGizmo.position.clone();
        this.pickupItems([p], [Date.now()], undefined, mode);
    }

    async init(onProgress?: (msg: string) => void) {
        const loader = new RobotLoader(this.mujoco);
        await loader.load(onProgress);

        try {
            this.mjModel = this.mujoco.MjModel.loadFromXML('/working/scene.xml');
            this.mjData = new this.mujoco.MjData(this.mjModel);
        } catch (e: unknown) {
            throw new Error(`Failed to load model: ${(e as Error).message}`);
        }

        if (this.mjModel) {
            this.ikSys.gripperSiteId = -1;
            this.gripperActuatorId = -1;
            for (let i = 0; i < this.mjModel.nsite; i++) {
                if (getName(this.mjModel, this.mjModel.name_siteadr[i]).includes('tcp')) {
                    this.ikSys.gripperSiteId = i; break;
                }
            }
            for (let i = 0; i < this.mjModel.nu; i++) {
                if (getName(this.mjModel, this.mjModel.name_actuatoradr[i]).includes('gripper')) {
                    this.gripperActuatorId = i; break;
                }
            }

            this.setInitialPose();

            this.mujoco.mj_forward(this.mjModel, this.mjData!);
            this.renderSys.initScene(this.mjModel);
            this.ikSys.init();
            this.ikSys.syncToSite(this.mjData!);

            this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
            this.ikSys.target.position.set(0, 0, 0.45);

            this.firstIkEnable = true;

            this.sequenceAnimator.init(this.mjModel, (addr) => getName(this.mjModel!, addr));

            this.startLoop();
        }
    }

    private setInitialPose() {
        if (!this.mjModel || !this.mjData) return;
        const initVals = [1.707, -1.754, 0.003, -2.702, 0.003, 0.951, 2.490, 0.000];

        for (let i = 0; i < Math.min(initVals.length, this.mjModel.nu); i++) {
            this.mjData.ctrl[i] = initVals[i];
            if (this.mjModel.actuator_trnid[2 * i + 1] === 1) {
                const jointId: number = this.mjModel.actuator_trnid[2 * i];
                if (jointId >= 0 && jointId < this.mjModel.njnt) {
                    const qposAdr = this.mjModel.jnt_qposadr[jointId];
                    this.mjData.qpos[qposAdr] = initVals[i];
                }
            }
        }
    }

    private randomizeCubes() {
        if (!this.mjModel || !this.mjData) return;
        const positions: Array<{ x: number, y: number }> = [];

        for (let i = 0; i < this.mjModel.nbody; i++) {
            const name = getName(this.mjModel, this.mjModel.name_bodyadr[i]);
            if (name.startsWith('cube')) {
                let x = 0;
                let y = 0;
                let valid = false;
                let attempts = 0;
                while (!valid && attempts < 100) {
                    const minR = 0.35;
                    const maxR = 0.8;
                    const r = Math.sqrt(Math.random() * (maxR * maxR - minR * minR) + minR * minR);
                    const theta = Math.random() * 2 * Math.PI;
                    x = r * Math.cos(theta);
                    y = r * Math.sin(theta);
                    valid = true;
                    const distStack = Math.sqrt((x - 0.6) ** 2 + (y - 0) ** 2);
                    if (distStack < 0.35) valid = false;
                    if (valid) {
                        for (const p of positions) {
                            if ((p.x - x) ** 2 + (p.y - y) ** 2 < 0.004) { valid = false; break; }
                        }
                    }
                    attempts++;
                }
                if (valid) {
                    positions.push({ x, y });

                    const jntIdVal: number = this.mjModel.body_jntadr[i];
                    if (jntIdVal >= 0) {
                        const qp = this.mjModel.jnt_qposadr[jntIdVal];
                        this.mjData.qpos[qp] = x;
                        this.mjData.qpos[qp + 1] = y;
                        this.mjData.qpos[qp + 2] = 0.02;
                        this.mjData.qpos[qp + 3] = 1;
                        this.mjData.qpos[qp + 4] = 0;
                        this.mjData.qpos[qp + 5] = 0;
                        this.mjData.qpos[qp + 6] = 0;
                    }
                }
            }
        }
    }

    private startLoop() {
        if (this.frameId) cancelAnimationFrame(this.frameId);

        const loop = () => {
            if (!this.mjModel || !this.mjData) {
                this.frameId = requestAnimationFrame(loop);
                return;
            }

            if (this.gizmoAnim.active) {
                const now = performance.now();
                const elapsed = now - this.gizmoAnim.startTime;
                const t = Math.min(elapsed / this.gizmoAnim.duration, 1.0);
                const ease = 1 - Math.pow(1 - t, 3);

                this.ikSys.target.position.lerpVectors(this.gizmoAnim.startPos, this.gizmoAnim.endPos, ease);
                this.ikSys.target.quaternion.slerpQuaternions(this.gizmoAnim.startRot, this.gizmoAnim.endRot, ease);

                if (t >= 1.0) {
                    this.gizmoAnim.active = false;
                }
            }

            if (this.viewerMode) {
                if (this.pendingExternalState) {
                    this.applyExternalStateNow(this.pendingExternalState);
                    this.pendingExternalState = null;
                }
            } else if (!this.paused) {
                if (this.sequenceAnimator.running) {
                    this.sequenceAnimator.update((1 / 60) * this.speedMultiplier, this.ikSys.target, this.mjData, this.gripperActuatorId, this.ikSys);
                    this.setIkEnabled(false);
                } else {
                    this.syncIkState();
                    this.ikSys.update(this.mjModel, this.mjData);
                }

                const startSimTime = this.mjData.time;
                while (this.mjData.time - startSimTime < (1.0 / 60.0) * this.speedMultiplier) {
                    this.mujoco.mj_step(this.mjModel, this.mjData);
                }
            }

            this.renderSys.update(this.mjData, this.renderSys.contactMarkers.visible);
            this.frameId = requestAnimationFrame(loop);
        };
        this.frameId = requestAnimationFrame(loop);
    }

    private syncIkState() {
        const shouldCalculate = this.userIkEnabled;
        const shouldShowGizmo = this.userIkEnabled && !this.gizmoAnim.active && !this.sequenceAnimator.running;

        this.ikSys.setCalculating(shouldCalculate);
        this.ikSys.setGizmoVisible(shouldShowGizmo);

        if (this.sequenceAnimator.running) {
            this.ikSys.setTargetVisible(true);
        } else if (shouldCalculate) {
            this.ikSys.setTargetVisible(true);
        }
    }

    moveIkTargetTo(pos: THREE.Vector3, duration = 0) {
        if (!this.userIkEnabled) {
            this.setIkEnabled(true);
        }

        const targetPos = new THREE.Vector3(pos.x, pos.y, pos.z);
        const targetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));

        if (duration > 0) {
            this.gizmoAnim.active = true;
            this.gizmoAnim.startPos.copy(this.ikSys.target.position);
            this.gizmoAnim.endPos.copy(targetPos);
            this.gizmoAnim.startRot.copy(this.ikSys.target.quaternion);
            this.gizmoAnim.endRot.copy(targetRot);
            this.gizmoAnim.startTime = performance.now();
            this.gizmoAnim.duration = duration;
        } else {
            this.gizmoAnim.active = false;
            this.ikSys.target.position.copy(targetPos);
            this.ikSys.target.quaternion.copy(targetRot);
        }
    }

    pickupItems(positions: THREE.Vector3[], markerIds: number[], onFinished?: () => void,
                mode: 'pickup' | 'place' | 'both' = 'both') {
        if (this.sequenceAnimator && this.mjData) {
            this.ikSys.syncToSite(this.mjData);
            // place-only doesn't consult a pickup location, so skip marker placement
            if (mode !== 'place') {
                positions.forEach((p, idx) => {
                    this.renderSys.addErMarker(p, `target_${idx}`, markerIds[idx]);
                });
            }
            this.sequenceAnimator.start(
                this.ikSys.target,
                this.mjData,
                this.ikSys,
                { positions, markerIds },
                (markerId) => {
                    this.renderSys.removeMarkerById(markerId);
                },
                onFinished,
                mode
            );
            this.setIkEnabled(false);
        }
    }

    setCtrl(values: number[]) {
        if (!this.mjData) return;
        const n = Math.min(values.length, this.mjData.ctrl.length);
        for (let i = 0; i < n; i++) this.mjData.ctrl[i] = values[i];
    }

    setGripper(value: number) {
        if (!this.mjData || this.gripperActuatorId === -1) return;
        this.mjData.ctrl[this.gripperActuatorId] = value;
    }

    reset() {
        if (!this.mjModel || !this.mjData) return;
        this.renderSys.clearErMarkers();
        this.gizmoAnim.active = false;
        this.sequenceAnimator.reset();
        this.mujoco.mj_resetData(this.mjModel, this.mjData);
        this.setInitialPose();
        this.randomizeCubes();
        this.mujoco.mj_forward(this.mjModel, this.mjData);
        this.ikSys.syncToSite(this.mjData);

        this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
        this.ikSys.target.position.set(0, 0, 0.45);
        this.firstIkEnable = true;
    }

    togglePause() { return this.paused = !this.paused; }
    setPaused(p: boolean) { this.paused = p; }

    setIkEnabled(enabled: boolean) {
        this.userIkEnabled = enabled;
        this.syncIkState();
        if (enabled && this.mjData && !this.gizmoAnim.active && !this.sequenceAnimator.running) {
            if (this.firstIkEnable) {
                this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(Math.PI, 0, 0));
                this.ikSys.target.position.set(0, 0, 0.45);
                this.firstIkEnable = false;
            } else {
                this.ikSys.syncToSite(this.mjData);
            }
        }
    }

    setSpeedMultiplier(speed: number) {
        this.speedMultiplier = speed;
    }

    setViewerMode(enabled: boolean) {
        this.viewerMode = enabled;
        if (enabled) {
            this.sequenceAnimator.reset();
            this.gizmoAnim.active = false;
            this.ikSys.setCalculating(false);
            this.ikSys.setGizmoVisible(false);
            this.ikSys.setTargetVisible(false);
            this.setPickupGizmoVisible(false);
        }
    }

    applyExternalState(state: RobotState) {
        this.pendingExternalState = state;
    }

    private applyExternalStateNow(state: RobotState) {
        if (!this.mjModel || !this.mjData) return;
        const n = Math.min(state.bodies.length, this.mjModel.nbody);
        const xpos = this.mjData.xpos as Float64Array;
        const xquat = this.mjData.xquat as Float64Array;
        for (let i = 0; i < n; i++) {
            const b = state.bodies[i];
            if (!b) continue;
            xpos[i * 3] = b.pos[0];
            xpos[i * 3 + 1] = b.pos[1];
            xpos[i * 3 + 2] = b.pos[2];
            xquat[i * 4] = b.quat[0];
            xquat[i * 4 + 1] = b.quat[1];
            xquat[i * 4 + 2] = b.quat[2];
            xquat[i * 4 + 3] = b.quat[3];
        }
        this.paused = state.paused;
        this.speedMultiplier = state.speedMultiplier;
        this.ikSys.target.position.set(state.ee.pos[0], state.ee.pos[1], state.ee.pos[2]);
        const eu = state.ee.rot;
        this.ikSys.target.quaternion.setFromEuler(new THREE.Euler(eu[0], eu[1], eu[2]));
        this.ikSys.setTargetVisible(state.ikEnabled || state.sequenceRunning);
    }

    /**
     * Snapshot of world state for external consumers.
     */
    getWorldState(): RobotState | null {
        if (!this.mjModel || !this.mjData) return null;
        const qpos = Array.from(this.mjData.qpos.subarray(0, 7));
        const ctrl = Array.from(this.mjData.ctrl.subarray(0, this.mjModel.nu));
        const ee = this.ikSys.target.position;
        const eeRot = new THREE.Euler().setFromQuaternion(this.ikSys.target.quaternion);
        const safe = (n: number) => Number.isFinite(n) ? n : 0;
        const eePos: [number, number, number] = [safe(ee.x), safe(ee.y), safe(ee.z)];
        const eeRotTuple: [number, number, number] = [safe(eeRot.x), safe(eeRot.y), safe(eeRot.z)];

        const bodies: BodyInfo[] = [];
        const trays: Tray[] = [];
        const px = this.mjData.xpos, qx = this.mjData.xquat;
        const gType = this.mjModel.geom_type;
        const gSize = this.mjModel.geom_size;
        const gRgba = this.mjModel.geom_rgba;
        const gMatId = this.mjModel.geom_matid;
        const gBodyId = this.mjModel.geom_bodyid;
        const matRgba = this.mjModel.mat_rgba;
        const ngeom = this.mjModel.ngeom;

        const geomsByBody: GeomInfo[][] = Array.from({ length: this.mjModel.nbody }, () => []);
        for (let g = 0; g < ngeom; g++) {
            const bodyId = gBodyId[g];
            if (bodyId < 0 || bodyId >= geomsByBody.length) continue;
            const matId = gMatId ? gMatId[g] : -1;
            const rgba: [number, number, number, number] = matId >= 0 && matRgba
                ? [matRgba[matId * 4], matRgba[matId * 4 + 1], matRgba[matId * 4 + 2], matRgba[matId * 4 + 3]]
                : [gRgba[g * 4], gRgba[g * 4 + 1], gRgba[g * 4 + 2], gRgba[g * 4 + 3]];
            geomsByBody[bodyId].push({
                type: gType[g],
                size: [gSize[g * 3], gSize[g * 3 + 1], gSize[g * 3 + 2]],
                rgba
            });
        }

        for (let i = 0; i < this.mjModel.nbody; i++) {
            const name = getName(this.mjModel, this.mjModel.name_bodyadr[i]);
            const pos: [number, number, number] = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
            const quat: [number, number, number, number] = [qx[i * 4], qx[i * 4 + 1], qx[i * 4 + 2], qx[i * 4 + 3]];
            const geoms = geomsByBody[i];
            bodies.push({ name, pos, quat, geoms });

            if (name === 'stack_base' || name === 'tray') {
                const primary = geoms[0];
                if (primary) {
                    trays.push({
                        name,
                        pos,
                        quat,
                        size: primary.size,
                        geomType: primary.type
                    });
                }
            }
        }

        return {
            time: this.mjData.time,
            paused: this.paused,
            speedMultiplier: this.speedMultiplier,
            ikEnabled: this.userIkEnabled,
            sequenceRunning: this.sequenceAnimator.running,
            qpos,
            ctrl,
            gripper: this.gripperActuatorId !== -1 ? this.mjData.ctrl[this.gripperActuatorId] : null,
            ee: { pos: eePos, rot: eeRotTuple },
            bodies,
            trays
        };
    }

    getGizmoStats() { return this.ikSys.calculating && this.ikSys.target ? { pos: this.ikSys.target.position.clone(), rot: new THREE.Euler().setFromQuaternion(this.ikSys.target.quaternion) } : null; }

    dispose() {
        if (this.frameId) cancelAnimationFrame(this.frameId);
        this.pickupControl.dispose();
        this.renderSys.dispose();
        this.ikSys.dispose();
        if (this.mjvOption) this.mjvOption.delete();
        if (this.mjModel) this.mjModel.delete();
        if (this.mjData) this.mjData.delete();
        try { this.mujoco.FS.unmount('/working'); } catch (e) { /* ignore */ }
    }
}
