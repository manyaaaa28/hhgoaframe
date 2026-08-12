import React from "react";
import { Circle, Group, Line, Path, RegularPolygon, Text, Rect } from "react-konva";
import type { StickerKind } from "./stickerTypes";

export type { StickerKind } from "./stickerTypes";
export { STICKER_LABELS } from "./stickerTypes";

const GREEN = "#0b5c39";
const YELLOW = "#f4d913";
const PINK = "#ec1876";
const CREAM = "#f6f0de";

// Each renderer draws a self-contained sticker centered at (0,0) at a base
// size of ~100px; the parent Group applies position/scale/rotation.
export function StickerArt({ kind }: { kind: StickerKind }) {
  switch (kind) {
    case "sun":
      return (
        <Group>
          <Circle radius={34} fill={YELLOW} />
          {[...Array(8)].map((_, i) => {
            const angle = (i / 8) * Math.PI * 2;
            const r1 = 42;
            const r2 = 56;
            return (
              <Line
                key={i}
                points={[
                  Math.cos(angle) * r1,
                  Math.sin(angle) * r1,
                  Math.cos(angle) * r2,
                  Math.sin(angle) * r2,
                ]}
                stroke={YELLOW}
                strokeWidth={5}
                lineCap="round"
              />
            );
          })}
        </Group>
      );
    case "palm":
      return (
        <Group>
          <Line points={[0, 40, -4, -30]} stroke={CREAM} strokeWidth={7} lineCap="round" />
          {[
            [-40, -50, -70, -70],
            [40, -50, 70, -70],
            [-30, -60, -20, -95],
            [30, -60, 20, -95],
            [0, -55, 0, -95],
          ].map(([, y1, x2, y2], i) => (
            <Line
              key={i}
              points={[-4, -30, x2, y2]}
              stroke={GREEN}
              strokeWidth={10}
              lineCap="round"
              tension={0.5}
            />
          ))}
        </Group>
      );
    case "wave":
      return (
        <Path
          data="M -60 0 Q -30 -20 0 0 T 60 0"
          stroke={CREAM}
          strokeWidth={8}
          lineCap="round"
        />
      );
    case "badge":
      return (
        <Group>
          <Rect
            x={-70}
            y={-18}
            width={140}
            height={36}
            cornerRadius={18}
            fill={PINK}
            stroke={CREAM}
            strokeWidth={2}
          />
          <Text
            text="#FrameInGoa"
            x={-70}
            y={-8}
            width={140}
            align="center"
            fontFamily="var(--font-mono)"
            fontStyle="bold"
            fontSize={14}
            fill={CREAM}
          />
        </Group>
      );
    case "builder":
      return (
        <Group>
          <Rect
            x={-55}
            y={-16}
            width={110}
            height={32}
            cornerRadius={16}
            fill={YELLOW}
            stroke={GREEN}
            strokeWidth={2}
          />
          <Text
            text="BUILDER"
            x={-55}
            y={-7}
            width={110}
            align="center"
            fontFamily="var(--font-mono)"
            fontStyle="bold"
            fontSize={13}
            fill={GREEN}
          />
        </Group>
      );
    case "coconut":
      return (
        <Group>
          <Circle radius={26} fill="#5b3a22" />
          <Circle radius={26} stroke={CREAM} strokeWidth={2} dash={[2, 4]} />
        </Group>
      );
    case "star":
      return <RegularPolygon sides={5} radius={30} fill={PINK} rotation={-18} />;
    default:
      return null;
  }
}
