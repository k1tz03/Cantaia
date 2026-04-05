import React from "react";
import { Composition } from "remotion";
import { VIDEO } from "./design-tokens";
import { TheProblem } from "./videos/TheProblem";
import { TheSolution } from "./videos/TheSolution";
import { TheProof } from "./videos/TheProof";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Video 1 — "Le Problème" — 15 seconds */}
      <Composition
        id="TheProblem"
        component={TheProblem}
        durationInFrames={15 * VIDEO.fps}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />

      {/* Video 2 — "La Solution" — 30 seconds */}
      <Composition
        id="TheSolution"
        component={TheSolution}
        durationInFrames={30 * VIDEO.fps}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />

      {/* Video 3 — "La Preuve" — 20 seconds */}
      <Composition
        id="TheProof"
        component={TheProof}
        durationInFrames={20 * VIDEO.fps}
        fps={VIDEO.fps}
        width={VIDEO.width}
        height={VIDEO.height}
      />
    </>
  );
};
