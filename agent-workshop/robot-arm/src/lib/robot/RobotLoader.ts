/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import { MujocoModule } from "./types";

const SCENE_FILE = 'scene.xml';
const BASE_URL = '/franka_emika_panda/';

/**
 * RobotLoader
 * Fetches the franka_emika_panda scene + meshes and stages them in MuJoCo's
 * in-memory virtual filesystem. Patches scene.xml with stacking cubes + tray
 * and panda.xml with the TCP site + gripper actuator name.
 */
export class RobotLoader {
    private mujoco: MujocoModule;

    constructor(mujocoInstance: MujocoModule) {
        this.mujoco = mujocoInstance;
    }

    async load(onProgress?: (msg: string) => void): Promise<void> {
        try { this.mujoco.FS.unmount('/working'); } catch (e) { /* ignore */ }
        try { this.mujoco.FS.mkdir('/working'); } catch (e) { /* ignore */ }

        const downloaded = new Set<string>();
        const queue: string[] = [SCENE_FILE];
        const parser = new DOMParser();

        while (queue.length > 0) {
            const fname = queue.shift()!;
            if (downloaded.has(fname)) continue;
            downloaded.add(fname);

            if (onProgress) onProgress(`Downloading ${fname}...`);

            const res = await fetch(BASE_URL + fname);
            if (!res.ok) {
                console.warn(`Failed to fetch ${fname}: ${res.status} ${res.statusText}`);
                continue;
            }

            const dirParts = fname.split('/');
            dirParts.pop();
            let currentPath = '/working';
            for (const part of dirParts) {
                currentPath += '/' + part;
                try { this.mujoco.FS.mkdir(currentPath); } catch (e) { /* ignore */ }
            }

            if (fname.endsWith('.xml')) {
                let text = await res.text();
                text = this.patchXml(fname, text);
                this.mujoco.FS.writeFile(`/working/${fname}`, text);
                this.scanDependencies(text, fname, parser, downloaded, queue);
            } else {
                const buffer = new Uint8Array(await res.arrayBuffer());
                this.mujoco.FS.writeFile(`/working/${fname}`, buffer);
            }
        }
    }

    private patchXml(fname: string, text: string): string {
        if (fname === SCENE_FILE) {
            text = text.replace('</worldbody>', this.buildStackingInjection() + '</worldbody>');
        }
        if (fname.endsWith('panda.xml')) {
            text = text
                .replace(/(<body[^>]*name=["']hand["'][^>]*>)/, '$1<site name="tcp" pos="0 0 0.1" size="0.01" rgba="1 0 0 0.5" group="1"/>')
                .replace(/name=["']actuator8["']/, 'name="gripper"');
        }
        return text;
    }

    private buildStackingInjection(): string {
        const colors = [
            '0.8 0.1 0.1 1', // Red
            '0.0 0.8 0.8 1', // Cyan
            '0.1 0.8 0.1 1', // Green
            '0.8 0.8 0.1 1'  // Yellow
        ];
        const positions: { x: number, y: number }[] = [];
        let out = '';

        for (let i = 0; i < 20; i++) {
            let x = 0, y = 0, valid = false, attempts = 0;
            while (!valid && attempts < 200) {
                const minR = 0.35, maxR = 0.8;
                const r = Math.sqrt(Math.random() * (maxR * maxR - minR * minR) + minR * minR);
                const theta = Math.random() * 2 * Math.PI;
                x = r * Math.cos(theta);
                y = r * Math.sin(theta);
                valid = true;
                if (Math.sqrt((x - 0.6) ** 2 + y * y) < 0.35) valid = false;
                if (valid) {
                    for (const p of positions) {
                        if ((p.x - x) ** 2 + (p.y - y) ** 2 < 0.004) { valid = false; break; }
                    }
                }
                attempts++;
            }
            if (!valid) continue;
            positions.push({ x, y });
            const color = colors[i % 4];
            out += `<body name="cube${i}" pos="${x.toFixed(3)} ${y.toFixed(3)} 0.02"><freejoint/><geom type="box" size="0.02 0.02 0.02" rgba="${color}" mass="0.05" friction="1.5 0.3 0.1" solref="0.01 1" solimp="0.95 0.99 0.001 0.5 2" condim="4"/></body>`;
        }
        out += `<body name="stack_base" pos="0.6 0 0.0"><geom type="box" size="0.1 0.1 0.005" rgba="0.3 0.3 0.3 1"/></body>`;
        return out;
    }

    private scanDependencies(xmlString: string, currentFile: string, parser: DOMParser, downloaded: Set<string>, queue: string[]) {
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
        const compiler = xmlDoc.querySelector('compiler');
        const meshDir = compiler?.getAttribute('meshdir') || '';
        const textureDir = compiler?.getAttribute('texturedir') || '';
        const currentDir = currentFile.includes('/') ? currentFile.substring(0, currentFile.lastIndexOf('/') + 1) : '';

        xmlDoc.querySelectorAll('[file]').forEach(el => {
            const fileAttr = el.getAttribute('file');
            if (!fileAttr) return;
            let prefix = '';
            if (el.tagName.toLowerCase() === 'mesh') {
                prefix = meshDir ? meshDir + '/' : '';
            } else if (['texture', 'hfield'].includes(el.tagName.toLowerCase())) {
                prefix = textureDir ? textureDir + '/' : '';
            }
            let fullPath = (currentDir + prefix + fileAttr).replace(/\/\//g, '/');
            const parts = fullPath.split('/');
            const norm: string[] = [];
            for (const p of parts) { if (p === '..') norm.pop(); else if (p !== '.') norm.push(p); }
            fullPath = norm.join('/');
            if (!downloaded.has(fullPath)) queue.push(fullPath);
        });
    }
}
