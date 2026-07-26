"use client"

import React from "react"

/** Cute sitting cat on the mobile balance hero — says hai. */
export function HeroSittingCat() {
  return (
    <div
      className="hero-cat-wrap pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 overflow-visible"
      aria-hidden="true"
    >
      {/* speech bubble */}
      <div className="hero-cat-bubble">
        <span className="hero-cat-bubble-text">hai</span>
        <span className="hero-cat-bubble-tail" />
      </div>

      <svg
        viewBox="0 0 72 70"
        width="58"
        height="56"
        fill="none"
        className="hero-cat-svg drop-shadow-[0_3px_6px_rgba(15,23,42,0.35)]"
      >
        {/* shadow under butt */}
        <ellipse cx="36" cy="64.5" rx="16" ry="3.2" fill="#0f172a" opacity="0.18" />

        {/* tail */}
        <g className="hero-cat-tail">
          <path
            d="M50 42c8 2 14-2 16-10 1.2-4.8-1.5-9.5-5.5-10.5"
            stroke="#f59e0b"
            strokeWidth="5.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M50 42c8 2 14-2 16-10 1.2-4.8-1.5-9.5-5.5-10.5"
            stroke="#fbbf24"
            strokeWidth="3.2"
            strokeLinecap="round"
            fill="none"
          />
          {/* tail tip stripe */}
          <circle cx="61.2" cy="22.5" r="3.2" fill="#f59e0b" />
          <circle cx="61.2" cy="22.5" r="1.6" fill="#78350f" opacity="0.35" />
        </g>

        {/* body */}
        <ellipse cx="34" cy="48" rx="17" ry="14.5" fill="#fbbf24" />
        {/* belly */}
        <ellipse cx="34" cy="50" rx="10" ry="9" fill="#fde68a" />

        {/* back paws tucked */}
        <ellipse cx="24" cy="58" rx="5.5" ry="4" fill="#f59e0b" />
        <ellipse cx="44" cy="58" rx="5.5" ry="4" fill="#f59e0b" />
        {/* paw pads hint */}
        <ellipse cx="24" cy="58.5" rx="2.2" ry="1.4" fill="#fcd34d" opacity="0.7" />
        <ellipse cx="44" cy="58.5" rx="2.2" ry="1.4" fill="#fcd34d" opacity="0.7" />

        {/* front paws sitting */}
        <ellipse cx="27" cy="54" rx="4.2" ry="6" fill="#fbbf24" />
        <ellipse cx="41" cy="54" rx="4.2" ry="6" fill="#fbbf24" />
        <ellipse cx="27" cy="57.5" rx="3" ry="2.2" fill="#f59e0b" />
        <ellipse cx="41" cy="57.5" rx="3" ry="2.2" fill="#f59e0b" />

        {/* head */}
        <g className="hero-cat-head">
          {/* ears */}
          <path d="M20 22 L24 8 L31 20 Z" fill="#fbbf24" />
          <path d="M22.2 20.5 L24.3 11.5 L28.5 19.5 Z" fill="#fb7185" opacity="0.85" />
          <path d="M48 22 L44 8 L37 20 Z" fill="#fbbf24" />
          <path d="M45.8 20.5 L43.7 11.5 L39.5 19.5 Z" fill="#fb7185" opacity="0.85" />

          {/* face */}
          <ellipse cx="34" cy="28" rx="15.5" ry="13.5" fill="#fbbf24" />
          {/* cheek fluff */}
          <ellipse cx="21.5" cy="31" rx="4" ry="3.2" fill="#fcd34d" />
          <ellipse cx="46.5" cy="31" rx="4" ry="3.2" fill="#fcd34d" />

          {/* eyes */}
          <g className="hero-cat-eyes">
            <ellipse cx="27.5" cy="27" rx="3.4" ry="4.2" fill="#18181b" />
            <ellipse cx="40.5" cy="27" rx="3.4" ry="4.2" fill="#18181b" />
            {/* shine */}
            <circle cx="28.6" cy="25.6" r="1.15" fill="#fff" />
            <circle cx="41.6" cy="25.6" r="1.15" fill="#fff" />
            <circle cx="26.7" cy="28.2" r="0.55" fill="#fff" opacity="0.55" />
            <circle cx="39.7" cy="28.2" r="0.55" fill="#fff" opacity="0.55" />
          </g>

          {/* nose */}
          <path d="M34 31.2c-1.3 0-2.2 1-2.2 1.6 0 .7.9 1.2 2.2 1.2s2.2-.5 2.2-1.2c0-.6-.9-1.6-2.2-1.6Z" fill="#fb7185" />
          {/* mouth */}
          <path d="M34 33.8v2.2" stroke="#78350f" strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
          <path d="M34 35.6c-1.6 1.4-3.4 1.3-4.2.4" stroke="#78350f" strokeWidth="0.95" strokeLinecap="round" opacity="0.55" />
          <path d="M34 35.6c1.6 1.4 3.4 1.3 4.2.4" stroke="#78350f" strokeWidth="0.95" strokeLinecap="round" opacity="0.55" />

          {/* whiskers */}
          <path d="M12 29h9.5M12 32.5h9M13 36h8" stroke="#78350f" strokeWidth="0.85" strokeLinecap="round" opacity="0.4" />
          <path d="M46.5 29H56M47 32.5h9M47.5 36h8" stroke="#78350f" strokeWidth="0.85" strokeLinecap="round" opacity="0.4" />
        </g>
      </svg>

      <style jsx>{`
        .hero-cat-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 72px;
        }

        .hero-cat-bubble {
          position: relative;
          margin-bottom: 2px;
          padding: 4px 10px 5px;
          border-radius: 999px;
          background: #ffffff;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
          animation: hero-cat-bubble 2.4s ease-in-out infinite;
          transform-origin: bottom center;
        }

        .hero-cat-bubble-text {
          display: block;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.02em;
          color: #6d28d9;
          line-height: 1;
        }

        .hero-cat-bubble-tail {
          position: absolute;
          left: 50%;
          bottom: -5px;
          width: 8px;
          height: 8px;
          margin-left: -4px;
          background: #ffffff;
          transform: rotate(45deg);
          border-radius: 1px;
        }

        .hero-cat-svg {
          display: block;
        }

        .hero-cat-tail {
          transform-origin: 50px 42px;
          animation: hero-cat-tail 1.1s ease-in-out infinite;
        }

        .hero-cat-head {
          transform-origin: 34px 28px;
          animation: hero-cat-head 3.2s ease-in-out infinite;
        }

        .hero-cat-eyes {
          transform-origin: 34px 27px;
          animation: hero-cat-blink 4.5s ease-in-out infinite;
        }

        @keyframes hero-cat-bubble {
          0%,
          100% {
            transform: translateY(0) scale(1);
          }
          50% {
            transform: translateY(-3px) scale(1.05);
          }
        }

        @keyframes hero-cat-tail {
          0%,
          100% {
            transform: rotate(-8deg);
          }
          50% {
            transform: rotate(14deg);
          }
        }

        @keyframes hero-cat-head {
          0%,
          100% {
            transform: rotate(-1.5deg);
          }
          50% {
            transform: rotate(2deg);
          }
        }

        @keyframes hero-cat-blink {
          0%,
          42%,
          48%,
          100% {
            transform: scaleY(1);
          }
          45% {
            transform: scaleY(0.12);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-cat-bubble,
          .hero-cat-tail,
          .hero-cat-head,
          .hero-cat-eyes {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}

export default HeroSittingCat
