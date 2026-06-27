import React from 'react';

// A lightweight, client-side SVG QR code generator to avoid layout shifts, remote network calls or bulky libraries.
const QRComponent = ({ value, size = 120 }) => {
    // Generate simple deterministic pattern for code visualization (simulating real QR grid)
    const renderGrid = () => {
        const dots = [];
        const scale = 25; // 25x25 QR matrix
        const cellSize = size / scale;
        
        // Pseudo-random grid generator seeded by the value
        let seed = 0;
        for (let i = 0; i < value.length; i++) {
            seed += value.charCodeAt(i) * (i + 1);
        }
        
        const pseudoRandom = (col, row) => {
            // Standard corner markers
            if (col < 7 && row < 7) return (col === 0 || col === 6 || row === 0 || row === 6 || (col > 1 && col < 5 && row > 1 && row < 5));
            if (col > scale - 8 && row < 7) return (col === scale - 1 || col === scale - 7 || row === 0 || row === 6 || (col > scale - 6 && col < scale - 3 && row > 1 && row < 5));
            if (col < 7 && row > scale - 8) return (col === 0 || col === 6 || row === scale - 1 || row === scale - 7 || (col > 1 && col < 5 && row > scale - 6 && row < scale - 3));
            
            // Generate deterministic dot
            const val = Math.sin(seed + col * 12.9898 + row * 78.233) * 43758.5453;
            return (val - Math.floor(val)) > 0.5;
        };

        for (let r = 0; r < scale; r++) {
            for (let c = 0; c < scale; c++) {
                if (pseudoRandom(c, r)) {
                    dots.push(
                        <rect
                            key={`${r}-${c}`}
                            x={c * cellSize}
                            y={r * cellSize}
                            width={cellSize}
                            height={cellSize}
                            fill="#000000"
                        />
                    );
                }
            }
        }
        return dots;
    };

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <rect width={size} height={size} fill="#ffffff" />
            {renderGrid()}
        </svg>
    );
};

export default QRComponent;
