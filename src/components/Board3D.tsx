"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { board, seatColours } from "../content/board";
import { PublicGame } from "../engine/game";
import { grid } from "./Board";
import { outlines } from "./Token";
export default function Board3D({
  game,
  onInspect,
  onFallback,
}: {
  game: PublicGame;
  onInspect: (id: number) => void;
  onFallback: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pose = useRef<{ position: number[]; target: number[] } | null>(null);
  const last = useRef(game.eventSeq);
  const moves = useRef<
    { seat: string; from: number; steps: number; start: number; end: number }[]
  >([]);
  useEffect(() => {
    const root = ref.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      onFallback();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    root.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      "aria-label",
      "3D board: drag to pan; pinch or scroll to zoom; click a deed",
    );
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#17383a");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 14, 13);
    if (pose.current) camera.position.fromArray(pose.current.position);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.minDistance = 10;
    controls.maxDistance = 35;
    controls.target.set(0, 0, 0);
    if (pose.current) controls.target.fromArray(pose.current.target);
    controls.update();
    scene.add(new THREE.HemisphereLight("#ffffff", "#173d3c", 3));
    const light = new THREE.DirectionalLight("#ffe4bb", 3);
    light.position.set(8, 15, 10);
    scene.add(light);
    const clickable: THREE.Mesh[] = [];
    const dispose: THREE.Texture[] = [];
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.2, 12),
      new THREE.MeshStandardMaterial({ color: "#c9d7bd" }),
    );
    ground.position.y = -0.2;
    scene.add(ground);
    for (const t of board) {
      const [x, y] = grid(t.id);
      const material = new THREE.MeshStandardMaterial({
        color: t.colour || "#e3d6b9",
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 0.18, 0.95),
        material,
      );
      mesh.position.set(x - 5, 0, y - 5);
      mesh.userData.tile = t.id;
      scene.add(mesh);
      clickable.push(mesh);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#183537";
      ctx.font = "bold 25px sans-serif";
      ctx.textAlign = "center";
      const words = t.name.split(" ");
      let line = "";
      let yy = 40;
      for (const word of words) {
        if ((line + word).length > 14) {
          ctx.fillText(line.trim(), 128, yy);
          yy += 30;
          line = "";
        }
        line += word + " ";
      }
      ctx.fillText(line.trim(), 128, yy);
      const texture = new THREE.CanvasTexture(canvas);
      dispose.push(texture);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.92, 0.46),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(x - 5, 0.1, y - 5);
      scene.add(label);
      const deed = game.deeds[t.id];
      if (deed.level) {
        for (let n = 0; n < (deed.level === 5 ? 1 : deed.level); n++) {
          const house = new THREE.Mesh(
            new THREE.BoxGeometry(
              deed.level === 5 ? 0.3 : 0.13,
              deed.level === 5 ? 0.42 : 0.2,
              0.2,
            ),
            new THREE.MeshStandardMaterial({
              color: deed.level === 5 ? "#ce5050" : "#378c6d",
            }),
          );
          house.position.set(x - 5 + (n - 1.5) * 0.17, 0.25, y - 5 + 0.3);
          scene.add(house);
        }
      }
    }
    const pieces = new Map<string, THREE.Mesh>();
    game.seats
      .filter((s) => s.active)
      .forEach((s, n) => {
        const points = outlines[s.token],
          shape = new THREE.Shape();
        points.forEach(([x, y], n) =>
          n
            ? shape.lineTo((x - 32) / 80, (y - 25) / 80)
            : shape.moveTo((x - 32) / 80, (y - 25) / 80),
        );
        shape.closePath();
        const token = new THREE.Mesh(
          new THREE.ExtrudeGeometry(shape, {
            depth: 0.12,
            bevelEnabled: true,
            bevelSegments: 1,
            steps: 1,
            bevelSize: 0.025,
            bevelThickness: 0.02,
          }),
          new THREE.MeshStandardMaterial({
            color: seatColours[n],
            metalness: 0.35,
            roughness: 0.3,
          }),
        );
        const [x, y] = grid(s.position);
        token.rotation.x = -Math.PI / 2;
        token.position.set(x - 5 + (n % 2) * 0.15, 0.35, y - 5);
        scene.add(token);
        pieces.set(s.id, token);
      });
    const resize = () => {
      renderer.setSize(root.clientWidth, Math.max(450, root.clientHeight));
      camera.aspect = root.clientWidth / Math.max(450, root.clientHeight);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    resize();
    const ray = new THREE.Raycaster();
    let down: [number, number] = [0, 0];
    const pointerDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const click = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray.intersectObjects(clickable)[0];
      if (hit) onInspect(hit.object.userData.tile);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", click);
    const now = performance.now();
    moves.current = moves.current.filter((m) => m.end > now);
    let cursor = Math.max(now, moves.current.at(-1)?.end ?? 0);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      for (const e of game.events.filter(
        (e) => e.id > last.current && e.type === "move",
      )) {
        if (e.seat && e.from !== undefined && e.steps !== undefined) {
          const duration = Math.min(1400, Math.abs(e.steps) * 85);
          moves.current.push({
            seat: e.seat,
            from: e.from,
            steps: e.steps,
            start: cursor,
            end: cursor + duration,
          });
          cursor += duration;
        }
      }
    last.current = game.eventSeq;
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      const now = performance.now();
      for (const [seat, token] of pieces) {
        const pending = moves.current.filter(
          (m) => m.seat === seat && m.end > now,
        );
        const motion = pending.find((m) => m.start <= now) ?? pending[0];
        if (motion) {
          const fraction =
            Math.max(
              0,
              Math.min(1, (now - motion.start) / (motion.end - motion.start)),
            ) * Math.abs(motion.steps);
          const step = Math.floor(fraction),
            direction = Math.sign(motion.steps);
          const [x, y] = grid(
            (((motion.from + step * direction) % 40) + 40) % 40,
          );
          const [xx, yy] = grid(
            (((motion.from + (step + 1) * direction) % 40) + 40) % 40,
          );
          token.position.x = x - 5 + (xx - x) * (fraction - step);
          token.position.z = y - 5 + (yy - y) * (fraction - step);
        }
      }
      renderer.render(scene, camera);
    };
    render();
    return () => {
      pose.current = {
        position: camera.position.toArray(),
        target: controls.target.toArray(),
      };
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
      dispose.forEach((t) => t.dispose());
      renderer.dispose();
      root.replaceChildren();
    };
  }, [game, onInspect, onFallback]);
  return <div className="webgl-board" ref={ref} />;
}
