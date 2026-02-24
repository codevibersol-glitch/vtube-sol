/**
 * VRMAvatar
 * Loads a VRM model into a Three.js scene and drives it with MediaPipe
 * Holistic results via kalidokit for face, pose, and hand rigging.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import * as Kalidokit from 'kalidokit'

const clamp01 = v => Math.max(0, Math.min(1, v))

export class VRMAvatar {
  constructor(canvas) {
    this.canvas   = canvas
    this.vrm      = null
    this.clock    = new THREE.Clock()
    this.results  = null
    this.video    = null
    this.active   = false
    this._raf     = null
    this._expr    = {}                        // smoothed expression values
    this._hipPos  = new THREE.Vector3(0, 1, 0) // smoothed hip world position
    this._lookYaw   = 0                       // smoothed eye yaw (degrees)
    this._lookPitch = 0                       // smoothed eye pitch (degrees)

    this._setup()
    this._loop()
  }

  // ── Three.js scene ─────────────────────────────────────────────────────────
  _setup() {
    const W = window.innerWidth, H = window.innerHeight

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(W, H)
    this.renderer.setClearColor(0x0d0d1a)

    this.scene  = new THREE.Scene()

    // Upper-body / bust shot: camera close and aimed at chest-to-head zone
    this.camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 100)
    this.camera.position.set(0, 1.45, 1.6)
    this.camera.lookAt(0, 1.35, 0)   // focus point: neck/chest area

    // Three-point lighting
    const key = new THREE.DirectionalLight(0xffffff, 2.5)
    key.position.set(1, 3, 2)
    this.scene.add(key)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5))
    const rim = new THREE.DirectionalLight(0x88aaff, 0.8)
    rim.position.set(-2, 0, -3)
    this.scene.add(rim)

    // Subtle floor grid (mostly hidden at this camera angle, but nice for depth)
    const grid = new THREE.GridHelper(10, 20, 0x004466, 0x001122)
    grid.position.y = -0.55
    this.scene.add(grid)
  }

  // ── Render loop (always ticking; only renders when active) ─────────────────
  _loop() {
    this._raf = requestAnimationFrame(() => this._loop())
    const delta = this.clock.getDelta()
    if (!this.active) return
    if (this.vrm) {
      if (this.results) this._rig()
      this.vrm.update(delta)
    }
    this.renderer.render(this.scene, this.camera)
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Load a VRM from a File object picked by the user. */
  async load(file) {
    const url = URL.createObjectURL(file)
    try {
      const loader = new GLTFLoader()
      loader.register(p => new VRMLoaderPlugin(p))
      const gltf = await loader.loadAsync(url)
      const vrm  = gltf.userData.vrm
      if (!vrm) throw new Error('File does not contain a VRM model')

      VRMUtils.removeUnnecessaryJoints(vrm.scene)
      if (typeof VRMUtils.combineSkeletons === 'function')
        VRMUtils.combineSkeletons(vrm.scene)

      vrm.scene.rotation.y = Math.PI  // face the camera

      if (this.vrm) {
        this.scene.remove(this.vrm.scene)
        VRMUtils.deepDispose(this.vrm.scene)
      }
      this.vrm = vrm
      this.scene.add(vrm.scene)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  /** Feed the latest MediaPipe results each frame. */
  setResults(results, videoEl) {
    this.results = results
    this.video   = videoEl
  }

  resize(w, h) {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.camera.lookAt(0, 1.35, 0)
  }

  setModelRotation(y) {
    if (this.vrm) this.vrm.scene.rotation.y = y
  }

  setModelScale(s) {
    if (this.vrm) this.vrm.scene.scale.setScalar(s)
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf)
    this.renderer.dispose()
  }

  // ── Rigging ────────────────────────────────────────────────────────────────
  _rig() {
    const r   = this.results
    const vid = this.video ?? { width: 1280, height: 720 }

    const faceLms = r.multiFaceLandmarks?.[0]
    if (faceLms) {
      const rig = Kalidokit.Face.solve(faceLms, { runtime: 'mediapipe', video: vid })
      if (rig) this._applyFace(rig)
    }

    if (r.poseLandmarks) {
      const lm3d = r.poseWorldLandmarks || r.poseLandmarks
      const rig  = Kalidokit.Pose.solve(lm3d, r.poseLandmarks, {
        runtime: 'mediapipe', video: vid, enableLegs: true,
      })
      if (rig) this._applyPose(rig, r.poseLandmarks)
    }

    if (r.multiHandLandmarks) {
      const handedness = r.multiHandedness ?? []
      r.multiHandLandmarks.forEach((lms, i) => {
        const side = handedness[i]?.label ?? 'Right'
        const rig  = Kalidokit.Hand.solve(lms, side)
        if (rig) this._applyHand(rig)
      })
    }
  }

  _b(name) {
    return this.vrm?.humanoid?.getNormalizedBoneNode(name) ?? null
  }

  // Smooth bone rotation with deadzone and NaN guard.
  // Deadzone ignores sub-threshold jitter; NaN guard prevents corrupt values.
  _lerp(bone, rot, a = 0.15) {
    if (!bone || !rot) return
    const tx = rot.x ?? 0, ty = rot.y ?? 0, tz = rot.z ?? 0
    if (!isFinite(tx) || !isFinite(ty) || !isFinite(tz)) return
    const DEAD = 0.001   // ~0.057° — filters sensor noise without adding lag
    if (Math.abs(tx - bone.rotation.x) > DEAD)
      bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, tx, a)
    if (Math.abs(ty - bone.rotation.y) > DEAD)
      bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, ty, a)
    if (Math.abs(tz - bone.rotation.z) > DEAD)
      bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, tz, a)
  }

  // Smooth expression value through a per-key cache
  _lerpExpr(exp, name, target, a = 0.15) {
    const prev = this._expr[name] ?? target
    const val  = THREE.MathUtils.lerp(prev, target, a)
    this._expr[name] = val
    try { exp.setValue(name, val) } catch (_) {}
  }

  _applyFace(rig) {
    this._lerp(this._b('head'), rig.head, 0.25)
    this._lerp(this._b('neck'), {
      x: (rig.head?.x ?? 0) * 0.3,
      y: (rig.head?.y ?? 0) * 0.3,
      z: (rig.head?.z ?? 0) * 0.3,
    }, 0.25)

    // Eye look-at driven from kalidokit pupil data
    if (this.vrm.lookAt && rig.pupil) {
      this._lookYaw   = THREE.MathUtils.lerp(this._lookYaw,   -(rig.pupil.x ?? 0) * 15, 0.08)
      this._lookPitch = THREE.MathUtils.lerp(this._lookPitch,  (rig.pupil.y ?? 0) * 10, 0.08)
      try {
        this.vrm.lookAt.yaw   = this._lookYaw
        this.vrm.lookAt.pitch = this._lookPitch
      } catch (_) {}
    }

    const exp = this.vrm.expressionManager
    if (!exp) return

    // Blink: smoothed so eyes don't snap open/closed
    this._lerpExpr(exp, 'blinkLeft',  1 - clamp01(rig.eye?.l ?? 1), 0.2)
    this._lerpExpr(exp, 'blinkRight', 1 - clamp01(rig.eye?.r ?? 1), 0.2)

    const s = rig.mouth?.shape
    if (s) {
      this._lerpExpr(exp, 'aa', clamp01(s.A ?? 0), 0.2)
      this._lerpExpr(exp, 'ih', clamp01(s.I ?? 0), 0.2)
      this._lerpExpr(exp, 'ou', clamp01(s.O ?? 0), 0.2)
      this._lerpExpr(exp, 'ee', clamp01(s.E ?? 0), 0.2)
      this._lerpExpr(exp, 'oh', clamp01(s.U ?? 0), 0.2)
    }
  }

  _applyPose(rig, lms) {
    // Helper: get visibility of a pose landmark (0 if missing)
    const vis = i => lms?.[i]?.visibility ?? 0

    const hips = this._b('hips')
    if (hips && rig.Hips) {
      const p = rig.Hips.position
      if (p) {
        this._hipPos.x = THREE.MathUtils.lerp(this._hipPos.x, p.x,       0.08)
        this._hipPos.y = THREE.MathUtils.lerp(this._hipPos.y, p.y + 1.0, 0.08)
        this._hipPos.z = THREE.MathUtils.lerp(this._hipPos.z, -p.z,      0.08)
        hips.position.copy(this._hipPos)
      }
      this._lerp(hips, rig.Hips.rotation, 0.07)
    }

    this._lerp(this._b('spine'), rig.Spine,              0.12)
    this._lerp(this._b('chest'), rig.Chest ?? rig.Spine, 0.12)

    // Shoulders (root of the arm chain — improves arm naturalness)
    if (vis(11) > 0.5) this._lerp(this._b('leftShoulder'),  rig.LeftShoulder,  0.18)
    if (vis(12) > 0.5) this._lerp(this._b('rightShoulder'), rig.RightShoulder, 0.18)

    // Arms — only update when both endpoint landmarks are visible enough
    if (vis(11) > 0.5 && vis(13) > 0.4) this._lerp(this._b('leftUpperArm'),  rig.LeftUpperArm,  0.18)
    if (vis(13) > 0.4 && vis(15) > 0.3) this._lerp(this._b('leftLowerArm'),  rig.LeftLowerArm,  0.18)
    if (vis(12) > 0.5 && vis(14) > 0.4) this._lerp(this._b('rightUpperArm'), rig.RightUpperArm, 0.18)
    if (vis(14) > 0.4 && vis(16) > 0.3) this._lerp(this._b('rightLowerArm'), rig.RightLowerArm, 0.18)

    // Legs — only update when both endpoint landmarks are visible enough
    if (vis(23) > 0.5 && vis(25) > 0.4) this._lerp(this._b('leftUpperLeg'),  rig.LeftUpperLeg,  0.18)
    if (vis(25) > 0.4 && vis(27) > 0.3) this._lerp(this._b('leftLowerLeg'),  rig.LeftLowerLeg,  0.18)
    if (vis(24) > 0.5 && vis(26) > 0.4) this._lerp(this._b('rightUpperLeg'), rig.RightUpperLeg, 0.18)
    if (vis(26) > 0.4 && vis(28) > 0.3) this._lerp(this._b('rightLowerLeg'), rig.RightLowerLeg, 0.18)
  }

  _applyHand(rig) {
    for (const [key, rot] of Object.entries(rig)) {
      // Fix: kalidokit emits "[Side]Wrist" but VRM bone is "[side]Hand"
      const fixed    = key.replace(/Wrist$/, 'Hand')
      const boneName = fixed[0].toLowerCase() + fixed.slice(1)
      // Wrist/hand bone needs more damping; finger joints should be snappier
      const isWrist  = /Hand$/.test(fixed)
      this._lerp(this._b(boneName), rot, isWrist ? 0.15 : 0.25)
    }
  }
}
