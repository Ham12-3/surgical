import * as THREE from 'three';
import type { Disposer } from '../disposal';
import type { ModelLibrary } from '../modelLibrary';
import type { Materials } from '../palette';

/**
 * The surgeon's gloved right hand (anat_hand_right, blender/scripts/build_hand.py),
 * hung on whatever instrument is held.
 *
 * The model is built in the instrument frame: the point pinched between
 * thumb and index at its origin, the shaft it grips running up +y, the palm
 * facing +x. So it goes at the instrument's `grip_point` with no turn of its
 * own, and follows the instrument's tilt and every move the animator makes.
 */
export class HandRig {
  readonly group: THREE.Group;
  readonly available: boolean;

  constructor(materials: Materials, models: ModelLibrary, disposer: Disposer) {
    const hand = models.instantiate('anat_hand_right', materials);
    this.available = hand !== null;
    this.group = hand ?? new THREE.Group();
    this.group.name = 'hand';
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    disposer.track(this.group);
  }

  /**
   * Hang the hand on `tool`: at its `grip_point` node, or, for a code-built
   * stand-in without one, three fifths of the way up its length. Null puts
   * the hand away.
   */
  attachTo(tool: THREE.Group | null): void {
    this.group.removeFromParent();
    if (!tool || !this.available) return;
    const grip = tool.getObjectByName('grip_point');
    const position = new THREE.Vector3();
    if (grip) {
      tool.updateMatrixWorld(true);
      grip.getWorldPosition(position);
      tool.worldToLocal(position);
    } else {
      const bounds = new THREE.Box3().setFromObject(tool);
      position.set(0, bounds.max.y * 0.6, 0);
    }
    this.group.position.copy(position);
    tool.add(this.group);
  }
}
