import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { THEME } from "@/game/theme";

/**
 * The 3D stage, lit and finished from the theme: filmic tone mapping, a gradient sky with
 * matching fog, soft environment reflections, a warm key light with soft shadows, a sky/ground
 * fill and a rim light, and bloom. Your world adds meshes to `stage.scene`.
 *
 *   stage.follow(player.position)   // keeps the sun's shadow sharp around the action
 */
export type Stage = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The key light (casts shadows). */
  sun: THREE.DirectionalLight;
  /** The element the canvas lives in (for DOM effects like floating text). */
  parent: HTMLElement;
  /** Move the shadow area with the action. */
  follow(target: THREE.Vector3): void;
  render(): void;
  dispose(): void;
};

function skyDome() {
  const geometry = new THREE.SphereGeometry(400, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(THEME.world3d.skyTop) },
      bottom: { value: new THREE.Color(THEME.world3d.skyBottom) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y * 1.6 + 0.15, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1;
  return mesh;
}

export function createStage(parent: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEME.world3d.skyBottom);
  scene.fog = new THREE.FogExp2(new THREE.Color(THEME.world3d.skyBottom), THEME.world3d.fog);
  scene.add(skyDome());

  // Soft reflections and ambient light from a neutral studio environment.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(new THREE.Color(THEME.world3d.skyTop).lerp(new THREE.Color("#ffffff"), 0.4), new THREE.Color(THEME.world3d.ground), 1.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(new THREE.Color(THEME.world3d.sun), THEME.world3d.sunIntensity);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // A colored rim light from behind makes silhouettes pop.
  const rim = new THREE.DirectionalLight(new THREE.Color(THEME.palette.secondary), 0.9);
  rim.position.set(-6, 6, -10);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  camera.position.set(0, 9, 13);
  camera.lookAt(0, 0, 0);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let bloom: UnrealBloomPass | null = null;
  if (THEME.fx.bloom > 0) {
    bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.25 + THEME.fx.bloom * 0.45, 0.55, 0.82);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    // Keep the scene framed on tall phone screens.
    camera.fov = w / h < 0.8 ? 65 : 50;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(parent);

  const offset = new THREE.Vector3().copy(sun.position);
  return {
    renderer,
    scene,
    camera,
    sun,
    parent,
    follow(target) {
      sun.position.copy(target).add(offset);
      sun.target.position.copy(target);
    },
    render() {
      composer.render();
    },
    dispose() {
      observer.disconnect();
      composer.dispose();
      env.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
