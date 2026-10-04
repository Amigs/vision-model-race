import * as THREE from "three";
import { LANES, GOAL, RANGE, createRun, seeded } from "./physics.mjs";
export function createReplayWorld(width = 1280, height = 1720) {
  let run = createRun();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e2129);
  scene.fog = new THREE.FogExp2(0x0e2129, 0.018);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 260),
    eye = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 80);
  const imageTarget = new THREE.WebGLRenderTarget(640, 360);
  imageTarget.texture.colorSpace = THREE.SRGBColorSpace;
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = 640;
  imageCanvas.height = 360;
  const imageContext = imageCanvas.getContext("2d");
  scene.add(new THREE.HemisphereLight(0xd8f0fa, 0x122526, 2));
  const sun = new THREE.DirectionalLight(0xd3ede3, 3);
  sun.position.set(-10, 25, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -18,
    right: 18,
    top: 25,
    bottom: -25,
    far: 65,
  });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(0x70ffc8, 1.5);
  rim.position.set(10, 8, -20);
  scene.add(rim);
  const materials = {
    road: new THREE.MeshStandardMaterial({ color: 0x152b31, roughness: 0.8 }),
    rail: new THREE.MeshStandardMaterial({
      color: 0x41606a,
      metalness: 0.7,
      roughness: 0.4,
    }),
    wall: new THREE.MeshStandardMaterial({ color: 0xd7e0d6, roughness: 0.6 }),
    red: new THREE.MeshStandardMaterial({
      color: 0xec765a,
      emissive: 0xc95236,
      emissiveIntensity: 0.22,
    }),
    low: new THREE.MeshStandardMaterial({
      color: 0xf2b859,
      emissive: 0x8f4b06,
      emissiveIntensity: 0.2,
    }),
    mint: new THREE.MeshStandardMaterial({
      color: 0xb2f583,
      emissive: 0x82ec61,
      emissiveIntensity: 0.5,
    }),
    ink: new THREE.MeshStandardMaterial({
      color: 0x162629,
      metalness: 0.5,
      roughness: 0.3,
    }),
  };
  function box(w, h, d, mat) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      typeof mat === "string" ? materials[mat] : mat,
    );
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  const road = box(8.8, 0.25, 170, "road");
  road.position.set(0, -0.16, -70);
  scene.add(road);
  for (const x of [-4.5, 4.5]) {
    const rail = box(0.15, 0.12, 165, "rail");
    rail.position.set(x, 0.04, -70);
    scene.add(rail);
    const strip = box(0.035, 0.018, 165, "mint");
    strip.position.set(x, 0.11, -70);
    scene.add(strip);
  }
  for (const x of [-1.2, 1.2])
    for (let z = 2; z > -137; z -= 4) {
      const dash = box(
        0.045,
        0.012,
        1.25,
        new THREE.MeshStandardMaterial({ color: 0x688080, roughness: 0.9 }),
      );
      dash.position.set(x, 0, z);
      scene.add(dash);
    }
  const landscape = new THREE.Group();
  scene.add(landscape);
  const random = seeded(910);
  for (let i = 0; i < 50; i++) {
    const side = i % 2 ? 1 : -1;
    const rock = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.8 + random() * 3,
        2 + random() * 5,
        2 + random() * 12,
        5,
      ),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.53, 0.22, 0.08 + random() * 0.055),
        roughness: 1,
      }),
    );
    rock.position.set(side * (9 + random() * 20), -2, -random() * 170 + 12);
    rock.rotation.y = random() * 6;
    landscape.add(rock);
  }
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x10232a, roughness: 1 }),
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = -0.7;
  scene.add(base);
  for (let z = -5; z > -125; z -= 12)
    for (const x of [-4, 4]) {
      const post = box(0.13, 2, 0.13, "rail");
      post.position.set(x, 0.3, z);
      scene.add(post);
      const lamp = box(0.2, 0.15, 0.2, "mint");
      lamp.position.set(x, 1.35, z);
      scene.add(lamp);
    }
  const finishGate = new THREE.Group();
  for (const x of [-4, 4]) {
    const pole = box(0.3, 5, 0.3, "mint");
    pole.position.set(x, 2.5, -GOAL);
    finishGate.add(pole);
  }
  const beam = box(8.3, 0.35, 0.3, "mint");
  beam.position.set(0, 5, -GOAL);
  finishGate.add(beam);
  const textCanvas = document.createElement("canvas");
  textCanvas.width = 512;
  textCanvas.height = 128;
  const tx = textCanvas.getContext("2d");
  tx.fillStyle = "#c6ff99";
  tx.font = "700 72px system-ui";
  tx.textAlign = "center";
  tx.fillText("120 m / META", 256, 90);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 1.25),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(textCanvas),
      transparent: true,
      side: THREE.DoubleSide,
    }),
  );
  label.position.set(0, 4.2, -GOAL);
  finishGate.add(label);
  scene.add(finishGate);
  const robot = new THREE.Group();
  scene.add(robot);
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 32, 24),
    new THREE.MeshStandardMaterial({
      color: 0xe5ede4,
      metalness: 0.35,
      roughness: 0.3,
    }),
  );
  shell.castShadow = true;
  shell.position.y = 0.49;
  robot.add(shell);
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.465, 0.055, 10, 40),
    materials.ink,
  );
  band.position.y = 0.49;
  band.rotation.y = Math.PI / 2;
  robot.add(band);
  const lidar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.13, 24),
    materials.ink,
  );
  lidar.position.y = 1.02;
  robot.add(lidar);
  const scanLight = new THREE.Mesh(
    new THREE.TorusGeometry(0.182, 0.025, 8, 32),
    materials.mint,
  );
  scanLight.rotation.x = Math.PI / 2;
  scanLight.position.y = 1.04;
  robot.add(scanLight);
  const eyeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 12, 12),
    materials.mint,
  );
  eyeMesh.position.set(0, 0.57, -0.44);
  robot.add(eyeMesh);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 32),
    new THREE.MeshBasicMaterial({
      color: 0x020709,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  scene.add(shadow);
  let obstacleGroup = new THREE.Group();
  scene.add(obstacleGroup);
  function buildCourse() {
    scene.remove(obstacleGroup);
    obstacleGroup.traverse((o) => o.geometry?.dispose());
    obstacleGroup = new THREE.Group();
    scene.add(obstacleGroup);
    for (const o of run.objects) {
      const group = new THREE.Group();
      group.position.set(o.x, 0, -o.z);
      const m = box(o.width, o.height, o.depth, "wall");
      m.position.y = o.height / 2;
      group.add(m);
      for (const x of [-o.width / 2 + 0.1, o.width / 2 - 0.1]) {
        const side = box(0.17, o.height, 0.025, "red");
        side.position.set(x, o.height / 2, o.depth / 2 + 0.017);
        group.add(side);
      }
      for (const y of [0.35, o.height - 0.3]) {
        const stripe = box(o.width - 0.1, 0.15, 0.025, "red");
        stripe.position.set(0, y, o.depth / 2 + 0.035);
        group.add(stripe);
      }
      const slit = box(0.5, 0.035, 0.03, "ink");
      slit.position.set(0, 1.35, o.depth / 2 + 0.04);
      group.add(slit);
      obstacleGroup.add(group);
    }
  }
  const lasers = new THREE.Group();
  scene.add(lasers);
  const laserLines = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const l = new THREE.Line(
      g,
      new THREE.LineBasicMaterial({
        color: 0xaef886,
        transparent: true,
        opacity: 0.55,
      }),
    );
    lasers.add(l);
    laserLines.push(l);
  }
  const pulse = new THREE.PointLight(0xb0ff7b, 1.5, 6);
  pulse.position.set(0, 1, 0);
  robot.add(pulse);

  lasers.visible = false;
  function pose(s) {
    run = s;
    robot.position.set(s.x, 0, -s.z);
    shell.rotation.x = -s.z * 1.8;
    band.rotation.x = -s.z * 1.8;
    scanLight.rotation.z = s.time * 4;
    shadow.position.set(s.x, 0.012, -s.z);
    sun.position.set(s.x - 10, 25, -s.z + 10);
    sun.target.position.set(s.x, 0, -s.z - 8);
    camera.position.set(s.x * 0.45, 5.1, -s.z + 8.5);
    camera.lookAt(s.x * 0.5, 0.5, -s.z - 13);
    renderer.render(scene, camera);
  }
  return {
    canvas: renderer.domElement,
    load(seed, speed) {
      run = createRun(seed, speed);
      buildCourse();
    },
    render: pose,
  };
}
