import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF, Center, useTexture } from "@react-three/drei";
import { Suspense, useEffect } from "react";
import { useRef } from "react";
import * as THREE from "three";


function DesignOverlay({
  designUrl,
  designPosition,
  setDesignPosition,
  dragging,
  setDragging,
}) {
  const texture = useTexture(designUrl);
  const dragOffset = useRef([0, 0]);

  return (
    <mesh
      position={designPosition}
      rotation={[0, 0, 0]}
      scale={[0.8, 0.8, 1]}
      renderOrder={10}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);
        setDragging(true);

        dragOffset.current = [
          e.point.x - designPosition[0],
          e.point.y - designPosition[1],
        ];
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        e.target.releasePointerCapture(e.pointerId);
        setDragging(false);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        e.stopPropagation();

        const newX = e.point.x - dragOffset.current[0];
        const newY = e.point.y - dragOffset.current[1];

        const clampedX = Math.max(-1.2, Math.min(1.2, newX));
        const clampedY = Math.max(-1.2, Math.min(1.2, newY));

        setDesignPosition([clampedX, clampedY, 0.6]);
      }}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}


function ShirtModel({
  modelPath,
  color,
  designUrl,
  designPosition,
  setDesignPosition,
  designScale,
  designRotation,
  dragging,
    setDragging,
}) {
  const { scene } = useGLTF(modelPath);

  useEffect(() => {
    scene.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.color.set(color);
        child.material.needsUpdate = true;
      }
    });
  }, [scene, color]);

  return (
    <Center>
      <group scale={4}>
        <primitive object={scene} />

        {designUrl && (
  <DesignOverlay
    designUrl={designUrl}
    designPosition={designPosition}
    setDesignPosition={setDesignPosition}
    dragging={dragging}
    setDragging={setDragging}
  />
)}
      </group>
    </Center>
  );
}

function Shirtviewer({
  modelPath,
  color,
  designUrl,
  designPosition,
  designScale,
  designRotation,
  setDesignPosition,
  dragging,
  setDragging,

}) {
  return (
    <div
      style={{
        width: "100%",
        height: "500px",
        marginTop: "30px",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <Canvas camera={{ position: [0, 0, 8], fov: 45, near: 0.1, far: 1000 }}>
        <ambientLight intensity={2} />
        <directionalLight position={[2, 2, 5]} intensity={2} />

        <Suspense fallback={null}>
          <ShirtModel
            modelPath={modelPath}
            color={color}
            designUrl={designUrl}
            designPosition={designPosition}
            designScale={designScale}
            designRotation={designRotation}
             setDesignPosition={setDesignPosition}
              dragging={dragging}
  setDragging={setDragging}

          />
        </Suspense>

        <OrbitControls minDistance={5} maxDistance={12} enabled={!dragging} />

      </Canvas>
    </div>
  );
}

export default Shirtviewer;