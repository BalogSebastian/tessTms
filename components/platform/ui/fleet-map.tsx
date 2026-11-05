"use client";
import { useId, useState } from "react";
import { useTms } from "../store";
import { Icon } from "./icon";

// A schematic projection of the coordinates stored on the vehicle record.
// No live tracking, road geometry or external map provider is implied.
const project = (lat: number, lng: number) => ({
  x: Math.max(36, Math.min(714, ((lng - 14.5) / 8.5) * 750)),
  y: Math.max(48, Math.min(294, ((49.2 - lat) / 4) * 350)),
});

export function FleetMap({ compact = false }: { compact?: boolean }) {
  const { state, companyId } = useTms();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const gridId = useId();
  const vehicles = state.vehicles.filter(
    (vehicle) => companyId === "all" || vehicle.companyId === companyId,
  );
  const selected = vehicles.find((vehicle) => vehicle.id === selectedId);
  return (
    <div className={`fleet-map ${compact ? "compact" : ""}`}>
      <svg
        viewBox="0 0 750 350"
        preserveAspectRatio="xMidYMid slice"
        role="group"
        aria-label="Sematikus regionális térkép a járműveken rögzített koordinátákkal. A helyzetek nem élő GPS-adatok."
      >
        <defs>
          <pattern
            id={gridId}
            width="25"
            height="25"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".8" fill="#c9d7cc" />
          </pattern>
        </defs>
        <rect width="750" height="350" fill="#edf2e9" />
        <rect width="750" height="350" fill={`url(#${gridId})`} />
        <path
          d="M0 60 98 91 183 61 275 95 347 73 459 106 570 64 750 98V0H0Z"
          fill="#e4ebdf"
        />
        <path
          d="M0 280 72 244 193 264 235 234 318 280 435 251 570 281 750 254V350H0Z"
          fill="#e1eadd"
        />
        <path
          d="M50 0 126 75 113 139 167 194 153 268 202 350M0 88 98 91 183 61 275 95 347 73 459 106 570 64 750 98M0 280 72 244 193 264 235 234 318 280 435 251 570 281 750 254"
          fill="none"
          stroke="#c9d5c5"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
        <path
          d="M193 0C212 40 196 77 236 102S363 115 381 159S370 210 407 249 430 300 445 350"
          fill="none"
          stroke="#bad6da"
          strokeWidth="6"
        />
        <path
          d="M112 85 265 131 405 150 507 244M265 131 305 48M405 150 636 117M405 150 349 267"
          fill="none"
          stroke="#fff"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M112 85 265 131 405 150 507 244"
          fill="none"
          stroke="#d1dcbf"
          strokeWidth="1.5"
        />
        <g
          fill="#5a6c52"
          fontSize="10"
          fontFamily="Arial, sans-serif"
          letterSpacing="2"
        >
          <text x="23" y="224">
            AUSZTRIA
          </text>
          <text x="383" y="77">
            SZLOVÁKIA
          </text>
          <text x="430" y="203">
            MAGYARORSZÁG
          </text>
          <text x="565" y="317">
            ROMÁNIA
          </text>
        </g>
        {[
          { name: "WIEN", lat: 48.21, lng: 16.37 },
          { name: "BUDAPEST", lat: 47.49, lng: 19.04 },
          { name: "SZEGED", lat: 46.25, lng: 20.15 },
          { name: "DEBRECEN", lat: 47.53, lng: 21.63 },
          { name: "GRAZ", lat: 47.07, lng: 15.44 },
        ].map((city) => {
          const { x, y } = project(city.lat, city.lng);
          return (
            <g key={city.name}>
              <circle cx={x} cy={y} r="2.5" fill="#71816a" />
              <text
                x={x + 8}
                y={y + 5}
                fill="#53684b"
                fontSize="10"
                fontFamily="Arial, sans-serif"
                letterSpacing="1"
              >
                {city.name}
              </text>
            </g>
          );
        })}
        {vehicles.map((vehicle, index) => {
          const { x, y } = project(vehicle.lat, vehicle.lng);
          const labelY = index % 2 ? -35 : 17;
          const selected = selectedId === vehicle.id;
          return (
            <g
              key={vehicle.id}
              transform={`translate(${x},${y})`}
              tabIndex={0}
              role="button"
              aria-label={`${vehicle.plate}, rögzített hely: ${vehicle.lastCity}. Részletek megjelenítése.`}
              aria-pressed={selected}
              className="map-vehicle"
              onClick={() => setSelectedId(selected ? null : vehicle.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(selected ? null : vehicle.id);
                }
              }}
            >
              <title>
                {vehicle.plate} · {vehicle.lastCity} · rögzített koordináta
              </title>
              <circle
                r={selected ? 19 : 15}
                fill="#087f70"
                opacity={selected ? ".17" : ".09"}
              />
              <circle
                r="7"
                fill={selected ? "#163d31" : "#087f70"}
                stroke="white"
                strokeWidth="3"
              />
              <path
                d={`M0 ${labelY < 0 ? -8 : 8}V${labelY < 0 ? -13 : 17}`}
                stroke="#087f70"
                strokeWidth="1"
              />
              <rect
                x="-36"
                y={labelY}
                rx="4"
                width="73"
                height="23"
                fill={selected ? "#163d31" : "white"}
                stroke={selected ? "#163d31" : "#ccd9ce"}
              />
              <text
                x="0"
                y={labelY + 15}
                fill={selected ? "white" : "#244d3f"}
                fontSize="10"
                fontFamily="Arial, sans-serif"
                fontWeight="bold"
                textAnchor="middle"
              >
                {vehicle.plate}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-legend">
        <i /> {vehicles.length} rögzített járműpozíció
      </div>
      <div className="map-label">
        <Icon name="map" size={13} /> Sematikus térkép · nincs élő GPS-kapcsolat
      </div>
      {selected ? (
        <div className="map-detail" role="status">
          <Icon name="truck" size={17} />
          <div>
            <strong>{selected.plate}</strong>
            <span>
              {selected.lastCity} · {selected.model}
            </span>
          </div>
          <button
            className="icon-btn"
            aria-label="Járműrészletek bezárása"
            onClick={() => setSelectedId(null)}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
