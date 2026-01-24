import React, { useState, useEffect } from 'react';

export default function AnimatedOpSyncProLogo({ isLooping = false }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isLooping && stage > 5) return;
    
    const timings = [400, 400, 400, 400, 600, 800, 3000];
    const timer = setTimeout(() => {
      if (stage < 6) {
        setStage(s => s + 1);
      } else if (isLooping) {
        setStage(0);
      }
    }, timings[stage] || 400);
    
    return () => clearTimeout(timer);
  }, [stage, isLooping]);

  const hexagonPath = (cx, cy, size) => {
    const points = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 6) + (i * Math.PI / 3);
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  };

  const hexagons = [
    { cx: 85, cy: 60, color: '#f97316', delay: 0 },
    { cx: 135, cy: 90, color: '#ef4444', delay: 1 },
    { cx: 85, cy: 120, color: '#fbbf24', delay: 2 },
    { cx: 135, cy: 150, color: '#fdba74', opacity: 0.7, delay: 3 },
  ];

  return (
    <svg 
      width="200" 
      height="190" 
      viewBox="0 0 220 260"
      style={{ overflow: 'visible' }}
      className="mx-auto"
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        <linearGradient id="shimmer" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="white" stopOpacity="0">
            <animate attributeName="offset" values="-1;2" dur="2s" repeatCount="indefinite"/>
          </stop>
          <stop offset="50%" stopColor="white" stopOpacity="0.3">
            <animate attributeName="offset" values="-0.5;2.5" dur="2s" repeatCount="indefinite"/>
          </stop>
          <stop offset="100%" stopColor="white" stopOpacity="0">
            <animate attributeName="offset" values="0;3" dur="2s" repeatCount="indefinite"/>
          </stop>
        </linearGradient>
      </defs>

      <g>
        {hexagons.map((hex, i) => (
          <g key={i}>
            <polygon
              points={hexagonPath(hex.cx, hex.cy, 38)}
              fill={hex.color}
              opacity={stage > hex.delay ? (hex.opacity || 1) : 0}
              style={{
                transform: stage > hex.delay ? 'scale(1)' : 'scale(0)',
                transformOrigin: `${hex.cx}px ${hex.cy}px`,
                transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                filter: stage > hex.delay ? 'url(#glow)' : 'none'
              }}
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0,0; 0,${-3 + i}; 0,0`}
                dur={`${2 + i * 0.3}s`}
                repeatCount="indefinite"
                begin={`${hex.delay * 0.4}s`}
              />
            </polygon>
            
            {stage > hex.delay && (
              <polygon
                points={hexagonPath(hex.cx, hex.cy, 38)}
                fill="url(#shimmer)"
                opacity={hex.opacity || 1}
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        ))}
      </g>

      <g opacity={stage > 4 ? 1 : 0} style={{ transition: 'opacity 0.5s ease' }}>
        <line 
          x1="100" y1="75" x2="118" y2="88" 
          stroke="white" 
          strokeWidth="2.5" 
          strokeLinecap="round"
          opacity="0.6"
        >
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite"/>
        </line>
        <line 
          x1="100" y1="108" x2="118" y2="122" 
          stroke="white" 
          strokeWidth="2.5" 
          strokeLinecap="round"
          opacity="0.6"
        >
          <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" begin="0.5s"/>
        </line>
      </g>

      <g 
        opacity={stage > 4 ? 1 : 0}
        style={{ 
          transition: 'opacity 0.6s ease',
          transitionDelay: '0.2s'
        }}
      >
        <text 
          x="110" 
          y="220" 
          textAnchor="middle" 
          fontFamily="Inter, -apple-system, sans-serif" 
          fontSize="36" 
          fontWeight="700"
          className="fill-gray-800 dark:fill-gray-100"
        >
          <tspan>Op</tspan>
          <tspan fill="#f97316">Sync</tspan>
          <tspan>Pro</tspan>
        </text>
        
        <text 
          x="110" 
          y="248" 
          textAnchor="middle" 
          fontFamily="Inter, -apple-system, sans-serif" 
          fontSize="24" 
          fontWeight="400"
          fill="#9ca3af"
        >
          .io
        </text>
      </g>
    </svg>
  );
}
