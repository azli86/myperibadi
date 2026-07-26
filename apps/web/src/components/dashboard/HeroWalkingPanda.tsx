"use client"

import React from "react"

/** Tiny panda that strolls along the mobile balance hero top edge. */
export function HeroWalkingPanda() {
  return (
    <div
      className="hero-panda-track pointer-events-none absolute inset-x-3 -top-1 z-20 h-9 overflow-visible"
      aria-hidden="true"
    >
      <div className="hero-panda-x">
        <div className="hero-panda-flip">
          <div className="hero-panda-bob">
            <svg
              viewBox="0 0 48 40"
              width="36"
              height="30"
              fill="none"
              className="drop-shadow-[0_2px_3px_rgba(15,23,42,0.35)]"
            >
              {/* ears */}
              <circle cx="14" cy="9" r="4.2" fill="#1a1a1a" />
              <circle cx="30" cy="9" r="4.2" fill="#1a1a1a" />
              <circle cx="14" cy="9" r="2" fill="#3f3f46" />
              <circle cx="30" cy="9" r="2" fill="#3f3f46" />

              {/* head */}
              <ellipse cx="22" cy="14.5" rx="11" ry="9.5" fill="#f8fafc" />

              {/* eye patches */}
              <ellipse cx="17.2" cy="13.8" rx="3.1" ry="3.6" fill="#18181b" transform="rotate(-12 17.2 13.8)" />
              <ellipse cx="27.2" cy="13.8" rx="3.1" ry="3.6" fill="#18181b" transform="rotate(12 27.2 13.8)" />
              {/* eyes */}
              <circle cx="17.6" cy="13.6" r="1.15" fill="#fff" />
              <circle cx="27.6" cy="13.6" r="1.15" fill="#fff" />
              <circle cx="17.85" cy="13.75" r="0.55" fill="#09090b" />
              <circle cx="27.85" cy="13.75" r="0.55" fill="#09090b" />

              {/* nose + smile */}
              <ellipse cx="22.2" cy="17.2" rx="1.5" ry="1.1" fill="#18181b" />
              <path
                d="M19.8 19.1c1.1 1.2 3.6 1.2 4.8 0"
                stroke="#18181b"
                strokeWidth="0.9"
                strokeLinecap="round"
              />

              {/* body */}
              <ellipse cx="22.5" cy="28" rx="9.5" ry="7.2" fill="#f8fafc" />
              {/* belly patch */}
              <ellipse cx="22.5" cy="28.5" rx="5.2" ry="4" fill="#ffffff" />

              {/* arms */}
              <g className="hero-panda-arm-front">
                <ellipse cx="13.2" cy="26.5" rx="2.6" ry="4.2" fill="#18181b" transform="rotate(18 13.2 26.5)" />
              </g>
              <g className="hero-panda-arm-back">
                <ellipse cx="31.8" cy="26.5" rx="2.6" ry="4.2" fill="#27272a" transform="rotate(-18 31.8 26.5)" />
              </g>

              {/* legs */}
              <g className="hero-panda-leg-front">
                <ellipse cx="17.5" cy="34.2" rx="2.8" ry="3.4" fill="#18181b" />
              </g>
              <g className="hero-panda-leg-back">
                <ellipse cx="27.5" cy="34.2" rx="2.8" ry="3.4" fill="#27272a" />
              </g>

              {/* tiny bamboo snack */}
              <g className="hero-panda-bamboo">
                <rect x="33.5" y="18" width="2.2" height="12" rx="1.1" fill="#4ade80" transform="rotate(22 34.6 24)" />
                <rect x="33.7" y="20.5" width="1.8" height="1" fill="#86efac" transform="rotate(22 34.6 21)" />
                <rect x="33.7" y="24" width="1.8" height="1" fill="#86efac" transform="rotate(22 34.6 24.5)" />
                <path d="M36.5 17.5c2-1.5 3.2-1.2 3.5.2-1.4.2-2.4.9-3.5 1.8Z" fill="#22c55e" />
              </g>
            </svg>
          </div>
        </div>
      </div>

      <style jsx>{`
        .hero-panda-x {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 36px;
          height: 30px;
          animation: hero-panda-x 7s linear infinite alternate;
        }
        .hero-panda-flip {
          width: 100%;
          height: 100%;
          animation: hero-panda-flip 14s steps(1, end) infinite;
          transform-origin: center;
        }
        .hero-panda-bob {
          width: 100%;
          height: 100%;
          animation: hero-panda-bob 0.38s ease-in-out infinite;
          transform-origin: center bottom;
        }
        .hero-panda-leg-front {
          transform-origin: 17.5px 31px;
          animation: hero-panda-leg 0.38s ease-in-out infinite;
        }
        .hero-panda-leg-back {
          transform-origin: 27.5px 31px;
          animation: hero-panda-leg 0.38s ease-in-out infinite reverse;
        }
        .hero-panda-arm-front {
          transform-origin: 14px 23px;
          animation: hero-panda-arm 0.38s ease-in-out infinite reverse;
        }
        .hero-panda-arm-back {
          transform-origin: 31px 23px;
          animation: hero-panda-arm 0.38s ease-in-out infinite;
        }
        .hero-panda-bamboo {
          transform-origin: 34px 24px;
          animation: hero-panda-bamboo 0.76s ease-in-out infinite;
        }

        @keyframes hero-panda-x {
          0% {
            left: 0%;
          }
          100% {
            left: calc(100% - 36px);
          }
        }
        @keyframes hero-panda-flip {
          0%,
          49.999% {
            transform: scaleX(1);
          }
          50%,
          100% {
            transform: scaleX(-1);
          }
        }
        @keyframes hero-panda-bob {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2px);
          }
        }
        @keyframes hero-panda-leg {
          0%,
          100% {
            transform: rotate(14deg);
          }
          50% {
            transform: rotate(-14deg);
          }
        }
        @keyframes hero-panda-arm {
          0%,
          100% {
            transform: rotate(-10deg);
          }
          50% {
            transform: rotate(12deg);
          }
        }
        @keyframes hero-panda-bamboo {
          0%,
          100% {
            transform: rotate(0deg);
          }
          50% {
            transform: rotate(6deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-panda-x,
          .hero-panda-flip,
          .hero-panda-bob,
          .hero-panda-leg-front,
          .hero-panda-leg-back,
          .hero-panda-arm-front,
          .hero-panda-arm-back,
          .hero-panda-bamboo {
            animation: none !important;
          }
          .hero-panda-x {
            left: 12%;
          }
        }
      `}</style>
    </div>
  )
}

export default HeroWalkingPanda
