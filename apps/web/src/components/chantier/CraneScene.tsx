"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  /** Ref of the scroll container (section.scene). Scroll progress is derived
   *  from its getBoundingClientRect relative to the viewport. */
  scrollRef?: React.RefObject<HTMLElement | null>;
  className?: string;
};

export default function CraneScene({ scrollRef, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let disposed = false;
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(obj: T): T => {
      disposables.push(obj);
      return obj;
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);
    scene.fog = new THREE.Fog(0x0a0a0c, 22, 68);

    const camera = new THREE.PerspectiveCamera(
      42,
      wrap.clientWidth / wrap.clientHeight,
      0.1,
      200,
    );
    camera.position.set(20, 11, 26);
    camera.lookAt(0, 6, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);

    scene.add(new THREE.AmbientLight(0x1a1a20, 0.8));
    const key = new THREE.DirectionalLight(0xf97316, 1.2);
    key.position.set(10, 16, 8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x3b82f6, 0.4);
    rim.position.set(-10, 8, -8);
    scene.add(rim);

    // Ground grid
    const groundGeo = track(new THREE.PlaneGeometry(90, 90, 36, 36));
    const groundMat = track(
      new THREE.MeshBasicMaterial({
        color: 0x27272a,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
      }),
    );
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    scene.add(ground);

    // Orange survey axes
    const axisMat = track(
      new THREE.LineBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.6,
      }),
    );
    const axisGeo1 = track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-22, -0.49, 0),
        new THREE.Vector3(22, -0.49, 0),
      ]),
    );
    const axisGeo2 = track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.49, -22),
        new THREE.Vector3(0, -0.49, 22),
      ]),
    );
    scene.add(new THREE.Line(axisGeo1, axisMat));
    scene.add(new THREE.Line(axisGeo2, axisMat));

    // Site fence (5-corner perimeter)
    const fenceMat = track(
      new THREE.LineBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.68,
      }),
    );
    const fenceCorners: [number, number][] = [
      [-15, -10],
      [15, -10],
      [16, 10],
      [-14, 11],
      [-15, -10],
    ];
    for (let i = 0; i < fenceCorners.length - 1; i++) {
      const [x1, z1] = fenceCorners[i];
      const [x2, z2] = fenceCorners[i + 1];
      const segs = 7;
      for (let s = 0; s <= segs; s++) {
        const px = x1 + ((x2 - x1) * s) / segs;
        const pz = z1 + ((z2 - z1) * s) / segs;
        const postGeo = track(new THREE.BoxGeometry(0.1, 1.6, 0.1));
        const postEdges = track(new THREE.EdgesGeometry(postGeo));
        const post = new THREE.LineSegments(postEdges, fenceMat);
        post.position.set(px, 0.3, pz);
        scene.add(post);
      }
      const topRail = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x1, 1.05, z1),
          new THREE.Vector3(x2, 1.05, z2),
        ]),
      );
      scene.add(new THREE.Line(topRail, fenceMat));
      const midRail = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x1, 0.5, z1),
          new THREE.Vector3(x2, 0.5, z2),
        ]),
      );
      scene.add(new THREE.Line(midRail, fenceMat));
    }

    // Surveyor stakes (yellow flags)
    const stakeMat = track(
      new THREE.LineBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.85,
      }),
    );
    const stakes: [number, number][] = [
      [-13, -8],
      [13, -8],
      [-13, 8],
      [13, 8],
      [-8, -12],
      [8, -12],
      [0, 13],
      [-6, -6],
      [6, 6],
    ];
    for (const [x, z] of stakes) {
      const pole = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, 0, z),
          new THREE.Vector3(x, 1.45, z),
        ]),
      );
      scene.add(new THREE.Line(pole, stakeMat));
      const flag = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, 1.45, z),
          new THREE.Vector3(x + 0.55, 1.22, z + 0.3),
          new THREE.Vector3(x, 1.0, z),
        ]),
      );
      scene.add(new THREE.Line(flag, stakeMat));
    }

    // Excavation pit
    const pitGeo = track(new THREE.BoxGeometry(10, 1.2, 6));
    const pitEdges = track(new THREE.EdgesGeometry(pitGeo));
    const pitMat = track(new THREE.LineBasicMaterial({ color: 0x52525b }));
    const pit = new THREE.LineSegments(pitEdges, pitMat);
    pit.position.set(0, -1.1, 0);
    scene.add(pit);

    // Safety cones
    const coneMat = track(
      new THREE.LineBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.9,
      }),
    );
    const cones: [number, number][] = [
      [-6.5, -3.5],
      [-6.5, 3.5],
      [6.5, -3.5],
      [6.5, 3.5],
      [-4, 0],
      [4, 0],
      [0, -4],
      [0, 4],
    ];
    for (const [cx, cz] of cones) {
      const coneGeo = track(new THREE.ConeGeometry(0.28, 0.7, 4, 1));
      const coneEdges = track(new THREE.EdgesGeometry(coneGeo));
      const cone = new THREE.LineSegments(coneEdges, coneMat);
      cone.position.set(cx, 0.35, cz);
      cone.rotation.y = Math.PI / 4;
      scene.add(cone);
    }

    // Material stacks
    const stackSpots: [number, number][] = [
      [-12, 5],
      [-10, -7],
      [11, -6],
      [10, 5],
    ];
    for (const [sx, sz] of stackSpots) {
      const sMat = track(
        new THREE.LineBasicMaterial({
          color: 0x71717a,
          transparent: true,
          opacity: 0.7,
        }),
      );
      for (let k = 0; k < 3; k++) {
        const g = track(new THREE.BoxGeometry(1.8, 0.38, 0.9));
        const e = track(new THREE.EdgesGeometry(g));
        const m = new THREE.LineSegments(e, sMat);
        m.position.set(sx, 0.2 + k * 0.4, sz);
        m.rotation.y = Math.random() * 0.3;
        scene.add(m);
      }
    }

    // Site trailer (baraquement)
    const trailerMat = track(
      new THREE.LineBasicMaterial({
        color: 0x71717a,
        transparent: true,
        opacity: 0.78,
      }),
    );
    const trailerGeo = track(new THREE.BoxGeometry(4.2, 2.3, 2.2));
    const trailerEdges = track(new THREE.EdgesGeometry(trailerGeo));
    const trailer = new THREE.LineSegments(trailerEdges, trailerMat);
    trailer.position.set(12, 1.15, 7);
    scene.add(trailer);

    const doorGeo = track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(13.5, 0.1, 8.1),
        new THREE.Vector3(13.5, 1.9, 8.1),
        new THREE.Vector3(14, 1.9, 8.1),
        new THREE.Vector3(14, 0.1, 8.1),
        new THREE.Vector3(13.5, 0.1, 8.1),
      ]),
    );
    const doorMat = track(
      new THREE.LineBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.7,
      }),
    );
    scene.add(new THREE.Line(doorGeo, doorMat));

    // Building — 10 floors, progressive reveal driven by scrollProgress
    type FloorObj = {
      obj: THREE.LineSegments | THREE.Line;
      mat: THREE.LineBasicMaterial;
      delay: number;
      targetOpacity: number;
    };
    const floors: FloorObj[] = [];
    const FLOORS = 10;
    const FW = 9;
    const FD = 5.5;
    const FH = 1.1;

    for (let i = 0; i < FLOORS; i++) {
      const g = track(
        new THREE.BoxGeometry(FW - i * 0.05, FH, FD - i * 0.05),
      );
      const edges = track(new THREE.EdgesGeometry(g));
      const mat = track(
        new THREE.LineBasicMaterial({
          color: i === 2 ? 0xf97316 : 0x71717a,
          transparent: true,
          opacity: 0,
        }),
      );
      const floor = new THREE.LineSegments(edges, mat);
      floor.position.set(0, i * FH + 0.1, 0);
      floors.push({
        obj: floor,
        mat,
        delay: i * 0.06,
        targetOpacity: i === 2 ? 1 : 0.8,
      });
      scene.add(floor);

      if (i % 2 === 0 && i < FLOORS - 1) {
        for (const side of [1, -1]) {
          const pGeo = track(new THREE.BoxGeometry(0.15, FH * 2, 0.15));
          const pEdges = track(new THREE.EdgesGeometry(pGeo));
          const pMat = track(
            new THREE.LineBasicMaterial({
              color: 0x52525b,
              transparent: true,
              opacity: 0,
            }),
          );
          const pillar = new THREE.LineSegments(pEdges, pMat);
          pillar.position.set(side * (FW / 2 - 1), i * FH + FH, FD / 2 - 1);
          floors.push({
            obj: pillar,
            mat: pMat,
            delay: i * 0.06 + 0.03,
            targetOpacity: 0.55,
          });
          scene.add(pillar);
        }
      }
    }

    // Rebar cage on R+3 (i=2)
    const rebarMat = track(
      new THREE.LineBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0,
      }),
    );
    for (let rx = -3.5; rx <= 3.5; rx += 0.8) {
      const rGeo = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(rx, 2 * FH + 0.22, -2.2),
          new THREE.Vector3(rx, 2 * FH + 0.22, 2.2),
        ]),
      );
      const r = new THREE.Line(rGeo, rebarMat);
      floors.push({ obj: r, mat: rebarMat, delay: 0.26, targetOpacity: 0.65 });
      scene.add(r);
    }
    for (let rz = -2; rz <= 2; rz += 0.7) {
      const rGeo = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-3.8, 2 * FH + 0.22, rz),
          new THREE.Vector3(3.8, 2 * FH + 0.22, rz),
        ]),
      );
      const r = new THREE.Line(rGeo, rebarMat);
      floors.push({ obj: r, mat: rebarMat, delay: 0.28, targetOpacity: 0.5 });
      scene.add(r);
    }

    // Crane
    const craneGroup = new THREE.Group();
    const craneMat = track(
      new THREE.LineBasicMaterial({
        color: 0xf97316,
        transparent: true,
        opacity: 0.9,
      }),
    );

    const mastGeo = track(new THREE.BoxGeometry(0.45, 18, 0.45));
    const mastEdges = track(new THREE.EdgesGeometry(mastGeo));
    const mast = new THREE.LineSegments(mastEdges, craneMat);
    mast.position.y = 9;
    craneGroup.add(mast);

    for (let y = 0; y < 17.5; y += 1.5) {
      const x1 = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.22, y, -0.22),
          new THREE.Vector3(0.22, y + 1.5, 0.22),
        ]),
      );
      craneGroup.add(new THREE.Line(x1, craneMat));
      const x2 = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0.22, y, -0.22),
          new THREE.Vector3(-0.22, y + 1.5, 0.22),
        ]),
      );
      craneGroup.add(new THREE.Line(x2, craneMat));
      const h1 = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.22, y + 1.5, -0.22),
          new THREE.Vector3(0.22, y + 1.5, 0.22),
        ]),
      );
      craneGroup.add(new THREE.Line(h1, craneMat));
    }

    const guyMat = track(
      new THREE.LineBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.28,
      }),
    );
    for (const [gx, gz] of [
      [3.5, 3.5],
      [-3.5, 3.5],
      [3.5, -3.5],
      [-3.5, -3.5],
    ]) {
      const g = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 12, 0),
          new THREE.Vector3(gx, 0, gz),
        ]),
      );
      craneGroup.add(new THREE.Line(g, guyMat));
    }

    // Jib (rotates)
    const jibGroup = new THREE.Group();
    const jibGeo = track(new THREE.BoxGeometry(16, 0.45, 0.45));
    const jibEdges = track(new THREE.EdgesGeometry(jibGeo));
    const jib = new THREE.LineSegments(jibEdges, craneMat);
    jib.position.x = 5;
    jibGroup.add(jib);

    for (let x = -3; x <= 12; x += 1) {
      const j1 = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, -0.22, 0),
          new THREE.Vector3(x + 1, 0.22, 0),
        ]),
      );
      jibGroup.add(new THREE.Line(j1, craneMat));
      const j2 = track(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x + 1, -0.22, 0),
          new THREE.Vector3(x, 0.22, 0),
        ]),
      );
      jibGroup.add(new THREE.Line(j2, craneMat));
    }

    const cjGeo = track(new THREE.BoxGeometry(4, 0.45, 0.45));
    const cjEdges = track(new THREE.EdgesGeometry(cjGeo));
    const cj = new THREE.LineSegments(cjEdges, craneMat);
    cj.position.x = -2.5;
    jibGroup.add(cj);

    const cwGeo = track(new THREE.BoxGeometry(1.4, 0.9, 1.0));
    const cwEdges = track(new THREE.EdgesGeometry(cwGeo));
    const cwMat = track(
      new THREE.LineBasicMaterial({
        color: 0xa1a1aa,
        transparent: true,
        opacity: 0.8,
      }),
    );
    const cw = new THREE.LineSegments(cwEdges, cwMat);
    cw.position.set(-4.5, -0.45, 0);
    jibGroup.add(cw);

    const cabGeo = track(new THREE.BoxGeometry(1.2, 1.0, 1.0));
    const cabEdges = track(new THREE.EdgesGeometry(cabGeo));
    const cab = new THREE.LineSegments(cabEdges, craneMat);
    cab.position.set(0.5, 0, 0);
    jibGroup.add(cab);

    // Hook + cable (bobs vertically)
    const hookGroup = new THREE.Group();
    const cableGeo = track(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, -6, 0),
      ]),
    );
    const cable = new THREE.Line(cableGeo, craneMat);
    hookGroup.add(cable);

    const hookBoxGeo = track(new THREE.BoxGeometry(0.42, 0.42, 0.42));
    const hookEdges = track(new THREE.EdgesGeometry(hookBoxGeo));
    const hook = new THREE.LineSegments(hookEdges, craneMat);
    hook.position.y = -6;
    hookGroup.add(hook);

    hookGroup.position.set(10, 0, 0);
    jibGroup.add(hookGroup);

    jibGroup.position.y = 18;
    craneGroup.add(jibGroup);

    craneGroup.position.set(-11, 0, -4);
    scene.add(craneGroup);

    // Floating particles (orange embers rising)
    const pCount = 110;
    const pGeo = track(new THREE.BufferGeometry());
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 34;
      pPos[i * 3 + 1] = Math.random() * 20;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 24;
    }
    pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
    const pMat = track(
      new THREE.PointsMaterial({
        color: 0xf97316,
        size: 0.09,
        transparent: true,
        opacity: 0.5,
      }),
    );
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Scroll / mouse state
    let scrollProgress = 0;
    let mouseX = 0,
      mouseY = 0;
    let targetMouseX = 0,
      targetMouseY = 0;

    const updateScroll = () => {
      const target = scrollRef?.current ?? wrap;
      const rect = target.getBoundingClientRect();
      const sectionH = rect.height - window.innerHeight;
      const scrolled = -rect.top;
      scrollProgress =
        sectionH > 0 ? Math.max(0, Math.min(1, scrolled / sectionH)) : 0;
    };

    const onMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const onResize = () => {
      camera.aspect = wrap.clientWidth / wrap.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(wrap.clientWidth, wrap.clientHeight, false);
    };

    window.addEventListener("scroll", updateScroll, { passive: true });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let raf = 0;

    const animate = () => {
      if (disposed) return;
      const t = clock.getElapsedTime();

      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      const orbitRadius = 28 - scrollProgress * 7;
      const orbitAngle = scrollProgress * Math.PI * 0.8 + mouseX * 0.15;
      const camHeight = 10 + scrollProgress * 6 + mouseY * -1.2;
      camera.position.x = Math.sin(orbitAngle) * orbitRadius;
      camera.position.z = Math.cos(orbitAngle) * orbitRadius;
      camera.position.y = camHeight;
      camera.lookAt(0, 4 + scrollProgress * 3, 0);

      for (const f of floors) {
        const threshold = 0.1 + f.delay;
        if (scrollProgress > threshold) {
          const localProgress = Math.min(1, (scrollProgress - threshold) * 8);
          f.mat.opacity = f.targetOpacity * localProgress;
        } else {
          f.mat.opacity = 0;
        }
      }

      jibGroup.rotation.y = t * 0.12 + scrollProgress * Math.PI * 0.5;
      hookGroup.position.y =
        -6 + Math.sin(t * 0.7) * 0.4 - scrollProgress * 2;

      const posAttr = particles.geometry.attributes.position as THREE.BufferAttribute;
      const pPositions = posAttr.array as Float32Array;
      for (let i = 0; i < pCount; i++) {
        pPositions[i * 3 + 1] += 0.008 + scrollProgress * 0.012;
        if (pPositions[i * 3 + 1] > 22) pPositions[i * 3 + 1] = 0;
      }
      posAttr.needsUpdate = true;
      particles.rotation.y = t * 0.02;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };

    updateScroll();
    raf = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          // noop
        }
      }
      renderer.dispose();
    };
  }, [scrollRef]);

  return (
    <div ref={wrapRef} className={`absolute inset-0 ${className}`}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
