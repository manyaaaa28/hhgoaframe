import React from "react";
import { Group, Rect, Circle, Line, Path, Text, RegularPolygon } from "react-konva";

// Color palette matched to the reference frame
const C = {
  greenDark: "#0b5c39",
  greenShade: "#084a2e",
  greenLight: "#146b44",
  cream: "#f6f0de",
  yellow: "#f4d913",
  yellowDeep: "#d9bf10",
  pink: "#ec1876",
  pinkDeep: "#c4135e",
  red: "#d83a4a",
  redDeep: "#a82b39",
  roofRed: "#a03820",
  roofBrown: "#7a2a18",
  wallWhite: "#f2ebd5",
  wallShade: "#d8d1bc",
  woodTrunk: "#8a5a34",
  woodTrunkDark: "#6a4525",
  windowGreen: "#0b5c39",
  windowShutter: "#b4303a",
  scooterRed: "#e03050",
  scooterRedDark: "#a8223e",
  scooterCream: "#f4ecd2",
  laptopBody: "#e8e3cf",
  laptopScreen: "#1a1a1a",
  surfPink: "#e8457a",
  surfYellow: "#f4c430",
  surfBlue: "#3b9dbf",
  textLight: "#cde6d6",
};

function WavyTopEdge({ width, height }: { width: number; height: number }) {
  const pts: string[] = [];
  const steps = 60;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const wobble =
      Math.sin(i * 0.55) * 4 +
      Math.sin(i * 0.22 + 1.3) * 6 +
      Math.cos(i * 0.11) * 3;
    const y = 8 + wobble;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  pts.push(`L${width} ${height}`);
  pts.push(`L0 ${height}`);
  pts.push("Z");
  return <Path data={pts.join(" ")} fill={C.greenDark} />;
}

function CodeLines({
  x,
  y,
  dir = "ltr",
  count = 6,
}: {
  x: number;
  y: number;
  dir?: "ltr" | "rtl";
  count?: number;
}) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const w = 30 + ((i * 37) % 60);
    const yy = y + i * 10;
    const xx = dir === "rtl" ? x - w : x;
    const opacity = 0.28 + ((i * 7) % 5) * 0.05;
    lines.push(
      <Line
        key={i}
        points={[xx, yy, xx + w, yy]}
        stroke={C.textLight}
        strokeWidth={3}
        lineCap="round"
        opacity={opacity}
      />
    );
    if (i % 3 === 1) {
      const w2 = 18 + ((i * 11) % 22);
      lines.push(
        <Line
          key={`s${i}`}
          points={[xx, yy + 5, xx + w2, yy + 5]}
          stroke={C.yellow}
          strokeWidth={2.5}
          lineCap="round"
          opacity={0.35}
        />
      );
    }
  }
  return <Group>{lines}</Group>;
}

function PalmTree({
  x,
  y,
  scale = 1,
  leaves = 7,
  trunkHeight = 260,
}: {
  x: number;
  y: number;
  scale?: number;
  leaves?: number;
  trunkHeight?: number;
}) {
  return (
    <Group x={x} y={y} scaleX={scale} scaleY={scale}>
      {/* trunk segments */}
      {(() => {
        const segs = [];
        const segsN = Math.round(trunkHeight / 22);
        for (let i = 0; i < segsN; i++) {
          const t = i / segsN;
          const yy = trunkHeight - i * 22;
          const tilt = Math.sin(i * 0.6) * 2;
          segs.push(
            <Line
              key={i}
              points={[tilt - 2, yy, tilt + 2, yy - 24]}
              stroke={i % 2 === 0 ? C.woodTrunk : C.woodTrunkDark}
              strokeWidth={14}
              lineCap="round"
            />
          );
        }
        return segs;
      })()}
      {/* palm crown — layered leaves */}
      <Group y={-trunkHeight + 6}>
        {[...Array(leaves)].map((_, i) => {
          const a = (i / leaves) * Math.PI * 2 - Math.PI / 2;
          const spread = 0.42 + ((i * 13) % 3) * 0.06;
          const cx = Math.cos(a) * 6;
          const cy = Math.sin(a) * 6 - 10;
          const lx = cx + Math.cos(a - spread) * 95;
          const ly = cy + Math.sin(a - spread) * 55 - 18;
          const rx = cx + Math.cos(a + spread) * 95;
          const ry = cy + Math.sin(a + spread) * 55 - 18;
          const tipX = cx + Math.cos(a) * 118;
          const tipY = cy + Math.sin(a) * 48 - 60;
          const d = `M${cx} ${cy} Q${lx} ${ly} ${tipX} ${tipY} Q${rx} ${ry} ${cx} ${cy} Z`;
          return (
            <Path
              key={i}
              data={d}
              fill={i % 2 === 0 ? C.greenDark : C.greenLight}
              stroke={C.greenShade}
              strokeWidth={1.2}
            />
          );
        })}
        <Circle x={0} y={-6} radius={10} fill={C.woodTrunkDark} />
      </Group>
    </Group>
  );
}

function GoanHouse({
  x,
  y,
  scale = 1,
  variant = 0,
}: {
  x: number;
  y: number;
  scale?: number;
  variant?: 0 | 1 | 2 | 3;
}) {
  const W = 180 * scale;
  const Hwall = 150 * scale;
  const Hroof = 70 * scale;
  const bodyColor = variant === 2 ? C.greenLight : C.wallWhite;
  const shadeColor = variant === 2 ? C.greenShade : C.wallShade;
  return (
    <Group x={x} y={y}>
      {/* side shade */}
      <Rect
        x={W * 0.72}
        y={0}
        width={W * 0.28}
        height={Hwall}
        fill={shadeColor}
      />
      {/* wall */}
      <Rect x={0} y={0} width={W} height={Hwall} fill={bodyColor} stroke={C.greenShade} strokeWidth={2.5} />
      {/* roof tiles shape */}
      <Path
        d={`M${-10 * scale} ${0} L${W / 2} ${-Hroof} L${W + 10 * scale} ${0} Z`}
        fill={variant === 1 ? "#4a4a4a" : C.roofRed}
        stroke={C.roofBrown}
        strokeWidth={2}
      />
      {/* roof tile lines */}
      {[...Array(5)].map((_, i) => {
        const t = (i + 1) / 6;
        const y = -Hroof * t;
        const x1 = (W / 2) * t;
        const x2 = W - (W / 2) * t;
        return (
          <Line
            key={i}
            points={[x1, y, x2, y]}
            stroke={C.roofBrown}
            strokeWidth={1.5}
            opacity={0.55}
          />
        );
      })}
      {/* window(s) based on variant */}
      {variant === 0 ? (
        <>
          <Rect
            x={W * 0.18}
            y={Hwall * 0.3}
            width={W * 0.26}
            height={Hwall * 0.34}
            fill={C.windowShutter}
            stroke={C.roofBrown}
            strokeWidth={2}
          />
          <Rect
            x={W * 0.18 + 3}
            y={Hwall * 0.3 + 3}
            width={W * 0.08}
            height={Hwall * 0.28}
            fill={C.windowGreen}
            opacity={0.85}
          />
          <Rect
            x={W * 0.36}
            y={Hwall * 0.3 + 3}
            width={W * 0.06}
            height={Hwall * 0.28}
            fill={C.windowGreen}
            opacity={0.75}
          />
          <Rect
            x={W * 0.2}
            y={Hwall * 0.67}
            width={W * 0.6}
            height={Hwall * 0.04}
            fill={C.cream}
            stroke={C.greenShade}
            strokeWidth={1.5}
          />
          {/* balcony railing bars */}
          {[...Array(7)].map((_, i) => (
            <Line
              key={`r${i}`}
              points={[
                W * (0.2 + i * 0.085),
                Hwall * 0.71,
                W * (0.2 + i * 0.085),
                Hwall * 0.98,
              ]}
              stroke={C.cream}
              strokeWidth={3}
            />
          ))}
          <Line
            points={[W * 0.18, Hwall * 0.84, W * 0.8, Hwall * 0.84]}
            stroke={C.cream}
            strokeWidth={3}
          />
        </>
      ) : variant === 1 ? (
        <>
          <Rect
            x={W * 0.25}
            y={Hwall * 0.22}
            width={W * 0.18}
            height={Hwall * 0.32}
            fill={C.windowGreen}
            stroke={C.greenShade}
            strokeWidth={2}
          />
          <Rect
            x={W * 0.57}
            y={Hwall * 0.22}
            width={W * 0.18}
            height={Hwall * 0.32}
            fill={C.windowGreen}
            stroke={C.greenShade}
            strokeWidth={2}
          />
          <Rect
            x={W * 0.38}
            y={Hwall * 0.62}
            width={W * 0.26}
            height={Hwall * 0.38}
            fill={C.roofBrown}
            stroke={C.wallShade}
            strokeWidth={2}
          />
        </>
      ) : variant === 2 ? (
        <>
          <Circle
            x={W * 0.3}
            y={Hwall * 0.26}
            radius={W * 0.05}
            fill={C.cream}
            stroke={C.greenShade}
            strokeWidth={2}
          />
          <Rect
            x={W * 0.5}
            y={Hwall * 0.32}
            width={W * 0.2}
            height={Hwall * 0.3}
            fill={C.cream}
            stroke={C.greenShade}
            strokeWidth={2}
          />
          <Rect
            x={W * 0.32}
            y={Hwall * 0.66}
            width={W * 0.36}
            height={Hwall * 0.34}
            fill={C.wallShade}
            stroke={C.greenShade}
            strokeWidth={2}
          />
        </>
      ) : (
        <>
          <Rect
            x={W * 0.52}
            y={Hwall * 0.22}
            width={W * 0.18}
            height={Hwall * 0.28}
            fill={C.windowGreen}
            stroke={C.greenShade}
            strokeWidth={2}
          />
          <Rect
            x={W * 0.52 + 2}
            y={Hwall * 0.22 + 2}
            width={W * 0.07}
            height={Hwall * 0.1}
            fill={C.cream}
            opacity={0.3}
          />
          <Rect
            x={W * 0.52}
            y={Hwall * 0.52}
            width={W * 0.18}
            height={Hwall * 0.3}
            fill={C.windowShutter}
            stroke={C.roofBrown}
            strokeWidth={2}
          />
          <Rect
            x={W * 0.15}
            y={Hwall * 0.66}
            width={W * 0.28}
            height={Hwall * 0.34}
            fill={C.wallShade}
            stroke={C.greenShade}
            strokeWidth={2}
          />
          <Rect
            x={W * 0.28}
            y={Hwall * 0.08}
            width={W * 0.14}
            height={Hwall * 0.08}
            fill={C.yellow}
            stroke={C.greenShade}
            strokeWidth={1.5}
          />
        </>
      )}
    </Group>
  );
}

function Surfboard({
  x,
  y,
  rot = 0,
  scale = 1,
  variant = 0,
}: {
  x: number;
  y: number;
  rot?: number;
  scale?: number;
  variant?: 0 | 1 | 2;
}) {
  const L = 220 * scale;
  const W = 52 * scale;
  return (
    <Group x={x} y={y} rotation={rot}>
      <Path
        d={`M0 ${-L / 2} Q${W * 0.9} ${-L / 4} ${W * 0.55} 0 Q${W * 0.9} ${L / 4} 0 ${L / 2} Q${-W * 0.9} ${L / 4} ${-W * 0.55} 0 Q${-W * 0.9} ${-L / 4} 0 ${-L / 2} Z`}
        fill={
          variant === 0
            ? C.surfYellow
            : variant === 1
            ? C.surfBlue
            : C.surfPink
        }
        stroke={C.greenShade}
        strokeWidth={2.5}
      />
      <Path
        d={`M0 ${-L / 2 + 8} Q${W * 0.45} 0 0 ${L / 2 - 8}`}
        stroke={C.cream}
        strokeWidth={2.5}
        opacity={0.7}
      />
      {variant === 2 && (
        <Rect
          x={-W * 0.55}
          y={-8 * scale}
          width={W * 1.1}
          height={28 * scale}
          fill={C.surfYellow}
          opacity={0.98}
        />
      )}
    </Group>
  );
}

function Scooter({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const S = scale;
  return (
    <Group x={x} y={y} scaleX={S} scaleY={S}>
      {/* rear wheel */}
      <Circle x={-100} y={40} radius={38} fill="#202020" />
      <Circle x={-100} y={40} radius={26} fill="#3a3a3a" />
      <Circle x={-100} y={40} radius={14} fill="#888" />
      {/* front wheel */}
      <Circle x={110} y={40} radius={38} fill="#202020" />
      <Circle x={110} y={40} radius={26} fill="#3a3a3a" />
      <Circle x={110} y={40} radius={14} fill="#888" />
      {/* footboard */}
      <Rect
        x={-90}
        y={22}
        width={200}
        height={22}
        cornerRadius={6}
        fill={C.scooterRedDark}
        stroke={C.greenShade}
        strokeWidth={2}
      />
      {/* rear body */}
      <Path
        d={`M-110 22 Q-130 -30 -80 -50 Q-30 -65 10 -60 Q40 -56 50 -30 L50 22 L-110 22 Z`}
        fill={C.scooterRed}
        stroke={C.greenShade}
        strokeWidth={2.5}
      />
      {/* seat */}
      <Path
        d={`M-70 -48 Q0 -80 40 -56 Q40 -44 30 -40 Q-20 -42 -60 -40 Q-72 -42 -70 -48 Z`}
        fill="#2a2018"
        stroke="#1a1208"
        strokeWidth={1.5}
      />
      {/* front legshield */}
      <Path
        d={`M40 -30 Q50 -90 70 -100 Q95 -104 100 -86 L108 -10 L80 22 L50 22 Z`}
        fill={C.scooterRed}
        stroke={C.greenShade}
        strokeWidth={2.5}
      />
      {/* cream stripe */}
      <Path
        d={`M-70 -18 Q-20 -30 30 -22 L38 0 L-75 6 Z`}
        fill={C.scooterCream}
        opacity={0.95}
      />
      {/* handlebars */}
      <Line
        points={[60, -95, 110, -95]}
        stroke="#333"
        strokeWidth={6}
        lineCap="round"
      />
      <Circle x={60} y={-95} radius={7} fill="#222" />
      <Circle x={110} y={-95} radius={7} fill="#222" />
      {/* headlight */}
      <Circle x={88} y={-72} radius={12} fill={C.cream} stroke={C.greenShade} strokeWidth={2} />
      {/* rear carrier */}
      <Rect x={-115} y={-52} width={36} height={10} fill={C.scooterRedDark} stroke={C.greenShade} strokeWidth={1.5} />
    </Group>
  );
}

function Laptop({
  x,
  y,
  scale = 1,
}: {
  x: number;
  y: number;
  scale?: number;
}) {
  const S = scale;
  return (
    <Group x={x} y={y} scaleX={S} scaleY={S} rotation={-8}>
      {/* base */}
      <Path
        d={`M-150 60 L150 90 L170 40 L-130 30 Z`}
        fill={C.laptopBody}
        stroke={C.greenShade}
        strokeWidth={2.5}
      />
      {/* keyboard base */}
      <Path
        d={`M-135 50 L138 72 L130 48 L-122 34 Z`}
        fill="#d5cfb8"
      />
      {/* keys */}
      {[...Array(4)].map((_, r) =>
        [...Array(10)].map((_, c) => (
          <Rect
            key={`k${r}-${c}`}
            x={-120 + c * 25}
            y={40 + r * 7}
            width={20}
            height={4.5}
            fill={C.greenDark}
            opacity={0.85}
            cornerRadius={1}
          />
        ))
      )}
      {/* trackpad */}
      <Rect
        x={-30}
        y={74}
        width={75}
        height={18}
        fill={C.greenDark}
        opacity={0.78}
        cornerRadius={3}
      />
      {/* screen */}
      <Group rotation={-12} x={-10} y={-50}>
        <Path
          d={`M-140 40 L140 40 L155 -95 L-125 -95 Z`}
          fill={C.laptopBody}
          stroke={C.greenShade}
          strokeWidth={2.5}
        />
        <Path
          d={`M-126 30 L126 30 L138 -84 L-114 -84 Z`}
          fill={C.laptopScreen}
        />
        {/* code lines on screen */}
        {[...Array(8)].map((_, i) => {
          const yy = -74 + i * 12;
          const ww = i % 4 === 0 ? 180 : 70 + ((i * 41) % 120);
          const col =
            i % 5 === 0
              ? C.yellow
              : i % 3 === 0
              ? C.cream
              : C.textLight;
          return (
            <Line
              key={`sl${i}`}
              points={[-100, yy, -100 + ww, yy]}
              stroke={col}
              strokeWidth={3}
              lineCap="round"
              opacity={i % 2 === 0 ? 0.95 : 0.6}
            />
          );
        })}
      </Group>
    </Group>
  );
}

function TopWordmark({ W }: { W: number }) {
  const topY = 58;
  const center = W / 2;
  return (
    <Group y={topY}>
      {/* HACKER */}
      <Text
        text="HACKER"
        x={0}
        y={0}
        width={center - 80}
        align="right"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="bold"
        fontSize={128}
        fill={C.yellow}
        stroke={C.yellowDeep}
        strokeWidth={1.2}
      />
      {/* गोव badge */}
      <Group x={center - 60} y={12}>
        <Rect
          x={0}
          y={0}
          width={120}
          height={74}
          cornerRadius={12}
          fill={C.red}
          stroke={C.cream}
          strokeWidth={3}
        />
        <Text
          text="गोव"
          x={0}
          y={22}
          width={120}
          align="center"
          fontFamily="Arial Unicode MS, Noto Sans Devanagari, sans-serif"
          fontStyle="bold"
          fontSize={38}
          fill={C.cream}
        />
      </Group>
      {/* HOUSE */}
      <Text
        text="HOUSE"
        x={center + 60}
        y={0}
        width={W / 2 - 80}
        align="left"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="bold"
        fontSize={128}
        fill={C.yellow}
        stroke={C.yellowDeep}
        strokeWidth={1.2}
      />
    </Group>
  );
}

export default function HackerHouseFrame({ W, H }: { W: number; H: number }) {
  return (
    <>
      {/* Wavy carved green background */}
      <WavyTopEdge width={W} height={H} />
      {/* subtle inner shadow */}
      <Rect
        x={10}
        y={10}
        width={W - 20}
        height={H - 20}
        cornerRadius={18}
        stroke={C.greenShade}
        strokeWidth={4}
        opacity={0.4}
      />

      {/* ========== TOP WORDMARK ========== */}
      <TopWordmark W={W} />

      {/* ========== LEFT SIDE ========== */}
      {/* code snippet texture top-left */}
      <CodeLines x={140} y={250} count={7} />
      {/* tall palm (top left) */}
      <PalmTree x={185} y={510} scale={1.22} leaves={8} trunkHeight={370} />
      {/* Goan house (left mid) */}
      <GoanHouse x={55} y={565} scale={1.05} variant={0} />
      {/* surfboards (between house and photo slot) */}
      <Surfboard x={218} y={695} rot={-12} scale={0.78} variant={1} />
      <Surfboard x={235} y={688} rot={-5} scale={0.74} variant={0} />
      {/* shorter palm bottom-left */}
      <PalmTree x={210} y={910} scale={1.05} leaves={7} trunkHeight={250} />

      {/* ========== RIGHT SIDE ========== */}
      {/* code snippet texture top-right */}
      <CodeLines x={W - 230} y={250} dir="rtl" count={7} />
      {/* twin palms (top right) */}
      <PalmTree x={W - 230} y={490} scale={1.12} leaves={7} trunkHeight={355} />
      <PalmTree x={W - 160} y={490} scale={1.02} leaves={7} trunkHeight={335} />
      {/* Goan house (right mid) */}
      <GoanHouse x={W - 245} y={560} scale={1.05} variant={3} />
      {/* pink/yellow surfboard (between photo and right house) */}
      <Surfboard x={W - 235} y={695} rot={10} scale={0.76} variant={2} />
      {/* laptop (bottom right) */}
      <Laptop x={W - 280} y={970} scale={1.1} />

      {/* ========== BOTTOM ROW ========== */}
      {/* houses street */}
      <GoanHouse x={170} y={905} scale={1.22} variant={1} />
      <GoanHouse x={440} y={970} scale={1.12} variant={2} />
      <GoanHouse x={690} y={945} scale={1.17} variant={1} />
      <GoanHouse x={940} y={965} scale={1.08} variant={2} />
      <GoanHouse x={1050} y={925} scale={1.12} variant={3} />
      {/* palms between bottom houses */}
      <PalmTree x={615} y={990} scale={0.72} leaves={6} trunkHeight={165} />
      <PalmTree x={875} y={1000} scale={0.68} leaves={6} trunkHeight={155} />
      {/* scooter */}
      <Scooter x={775} y={1075} scale={1.18} />
      {/* code lines bottom center above houses */}
      <CodeLines x={580} y={865} count={4} />
      <CodeLines x={W - 610} y={875} dir="rtl" count={4} />
    </>
  );
}
