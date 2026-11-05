import { useTms } from "../store";
import { Icon } from "./icon";
export function FleetMap({ compact = false }: { compact?: boolean }) {
  const { state, companyId } = useTms();
  const vehicles = state.vehicles.filter(
    (v) => companyId === "all" || v.companyId === companyId,
  );
  return (
    <div className={`fleet-map ${compact ? "compact" : ""}`}>
      <svg
        viewBox="0 0 750 350"
        role="img"
        aria-label="Sematikus közép-európai flottatérkép mintahelyzetekkel"
      >
        <defs>
          <pattern
            id="grid"
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 28 0 L 0 0 0 28"
              fill="none"
              stroke="#dee7de"
              strokeWidth=".5"
            />
          </pattern>
        </defs>
        <rect width="750" height="350" fill="#eff3e9" />
        <rect width="750" height="350" fill="url(#grid)" />
        <path
          d="M0 210L110 190 138 130 250 140 310 85 405 105 480 60 570 85 620 150 750 110M120 350L135 270 250 235 310 275 400 240 520 250 610 205 750 230"
          fill="none"
          stroke="#d3dfce"
          strokeWidth="2"
        />
        <path
          d="M125 0C210 95 165 125 255 173S353 185 410 239S444 286 570 350"
          fill="none"
          stroke="#b6d8dd"
          strokeWidth="5"
        />
        <path
          d="M125 135C235 100 280 175 375 180S515 215 605 273M375 180L445 95M125 135L65 250"
          fill="none"
          stroke="#fff"
          strokeWidth="7"
        />
        <path
          d="M125 135C235 100 280 175 375 180S515 215 605 273"
          fill="none"
          stroke="#7aab8b"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        {[
          ["WIEN", 110, 114],
          ["GYŐR", 255, 153],
          ["BUDAPEST", 378, 167],
          ["SZEGED", 576, 265],
          ["BRATISLAVA", 270, 70],
          ["GRAZ", 100, 270],
          ["DEBRECEN", 615, 120],
        ].map(([name, x, y]) => (
          <g key={name}>
            <circle cx={Number(x)} cy={Number(y) + 10} r="3" fill="#748a72" />
            <text
              x={Number(x) + 8}
              y={Number(y) + 14}
              fill="#788872"
              fontSize="10"
              fontFamily="sans-serif"
              letterSpacing="1"
            >
              {name}
            </text>
          </g>
        ))}
        {vehicles.map((v, i) => (
          <g
            key={v.id}
            transform={`translate(${[270, 315, 565, 400][i % 4]},${[180, 103, 245, 200][i % 4]})`}
          >
            <circle r="20" fill="#00856b" opacity=".1" />
            <circle r="10" fill="#00856b" stroke="white" strokeWidth="3" />
            <rect
              x="14"
              y="-14"
              rx="4"
              width="68"
              height="24"
              fill="white"
              stroke="#d6e1d8"
            />
            <text
              x="21"
              y="1"
              fill="#235341"
              fontSize="9"
              fontFamily="sans-serif"
              fontWeight="bold"
            >
              {v.plate}
            </text>
          </g>
        ))}
      </svg>
      <div className="map-label">
        <Icon name="map" size={13} /> Sematikus térkép · mintahelyzetek
      </div>
      <div className="map-legend">
        <i /> {vehicles.length} megjelenített jármű
      </div>
    </div>
  );
}
