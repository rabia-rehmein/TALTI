import * as THREE from 'three'

function updateSkinnedMeshesAndBounds(fitRoot: THREE.Object3D): void {
  fitRoot.traverse((obj) => {
    const skin = obj as THREE.SkinnedMesh
    if (skin.isSkinnedMesh && skin.skeleton) {
      skin.skeleton.update()
    }
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.geometry) {
      const g = mesh.geometry
      if (!g.boundingBox) g.computeBoundingBox()
    }
  })
}

/** When `setFromObject` is empty (some multi-mesh GLBs), union per-geometry boxes in world space. */
function unionBoundsFromDrawables(root: THREE.Object3D): THREE.Box3 {
  const acc = new THREE.Box3()
  const tmp = new THREE.Box3()
  let any = false
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    const g = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
    if (!g) return
    if (!(obj as THREE.Mesh).isMesh && !(obj as THREE.Line).isLine && !(obj as THREE.Points).isPoints)
      return
    if (!g.boundingBox) g.computeBoundingBox()
    if (!g.boundingBox || g.boundingBox.isEmpty()) return
    tmp.copy(g.boundingBox).applyMatrix4((obj as THREE.Object3D).matrixWorld)
    if (!any) {
      acc.copy(tmp)
      any = true
    } else {
      acc.union(tmp)
    }
  })
  return any ? acc : new THREE.Box3().makeEmpty()
}

/**
 * Centers `fitRoot` contents at the origin and scales uniformly so the largest
 * axis matches `targetMax` (from `getFitTarget` in `garmentView.ts`).
 *
 * Uses `Box3.setFromObject(..., true)` (precise geometry bounds) so results stay
 * consistent across reloads. Skinned meshes get `skeleton.update()` first so the
 * collar (and similar GLBs) size correctly on the first frames. If precise bounds
 * are still empty, falls back to the coarse `setFromObject` path once.
 *
 * @returns `false` if bounds are not yet available (empty box — retry next frame).
 */
export function applyGarmentFit(fitRoot: THREE.Object3D, targetMax: number): boolean {
  fitRoot.position.set(0, 0, 0)
  fitRoot.scale.set(1, 1, 1)
  fitRoot.rotation.set(0, 0, 0)
  fitRoot.updateMatrixWorld(true)

  updateSkinnedMeshesAndBounds(fitRoot)
  fitRoot.updateMatrixWorld(true)

  let box = new THREE.Box3().setFromObject(fitRoot, true)
  if (box.isEmpty()) {
    box = new THREE.Box3().setFromObject(fitRoot, false)
  }
  if (box.isEmpty()) {
    box = unionBoundsFromDrawables(fitRoot)
  }
  if (box.isEmpty()) return false

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6)

  fitRoot.position.set(-center.x, -center.y, -center.z)
  fitRoot.scale.setScalar(targetMax / maxDim)
  return true
}
