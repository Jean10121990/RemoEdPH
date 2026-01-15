// Remo AI Icon Generator - Reusable function for all pages
function getRemoAIIcon(size = 28, strokeColor = '#1a1a1a', fillColor = 'white', uniqueId = null) {
    const id = uniqueId || 'remoEye' + Date.now() + Math.random().toString(36).substr(2, 9);
    return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" style="width: ${size}px; height: ${size}px;">
        <defs>
            <radialGradient id="${id}" cx="50%" cy="50%">
                <stop offset="0%" stop-color="#4FC3F7" stop-opacity="1"/>
                <stop offset="100%" stop-color="#29B6F6" stop-opacity="0.8"/>
            </radialGradient>
        </defs>
        <line x1="50" y1="5" x2="50" y2="15" stroke="${strokeColor}" stroke-width="2"/>
        <circle cx="50" cy="5" r="2" fill="${strokeColor}"/>
        <ellipse cx="50" cy="30" rx="25" ry="20" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>
        <path d="M 45 20 L 50 25 L 55 20" stroke="${strokeColor}" stroke-width="1.5" fill="none"/>
        <rect x="35" y="25" width="30" height="20" rx="3" fill="${strokeColor}"/>
        <circle cx="42" cy="33" r="4" fill="url(#${id})"/>
        <circle cx="58" cy="33" r="4" fill="url(#${id})"/>
        <path d="M 40 40 Q 50 45 60 40" stroke="#4FC3F7" stroke-width="2" fill="none" stroke-linecap="round"/>
        <ellipse cx="25" cy="30" rx="8" ry="12" fill="#29B6F6" stroke="${strokeColor}" stroke-width="1.5"/>
        <ellipse cx="25" cy="30" rx="4" ry="6" fill="${strokeColor}"/>
        <ellipse cx="75" cy="30" rx="8" ry="12" fill="#29B6F6" stroke="${strokeColor}" stroke-width="1.5"/>
        <ellipse cx="75" cy="30" rx="4" ry="6" fill="${strokeColor}"/>
        <rect x="30" y="50" width="40" height="35" rx="5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2"/>
        <rect x="38" y="58" width="24" height="18" rx="2" fill="#29B6F6" stroke="#4FC3F7" stroke-width="1"/>
        <circle cx="42" cy="62" r="1.5" fill="#ff4444"/>
        <circle cx="45" cy="62" r="1.5" fill="${fillColor}"/>
        <circle cx="50" cy="66" r="3" fill="#FFD700"/>
        <ellipse cx="50" cy="70" rx="2" ry="3" fill="#4FC3F7"/>
        <rect x="30" y="82" width="40" height="4" fill="${strokeColor}"/>
        <rect x="20" y="55" width="12" height="20" rx="3" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        <rect x="20" y="60" width="12" height="3" fill="${strokeColor}"/>
        <rect x="68" y="55" width="12" height="20" rx="3" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        <rect x="68" y="60" width="12" height="3" fill="${strokeColor}"/>
        <ellipse cx="26" cy="78" rx="4" ry="5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        <ellipse cx="74" cy="78" rx="4" ry="5" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        <rect x="35" y="88" width="12" height="20" rx="3" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        <rect x="35" y="93" width="12" height="3" fill="${strokeColor}"/>
        <rect x="53" y="88" width="12" height="20" rx="3" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        <rect x="53" y="93" width="12" height="3" fill="${strokeColor}"/>
        <ellipse cx="41" cy="110" rx="6" ry="4" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
        <ellipse cx="59" cy="110" rx="6" ry="4" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5"/>
    </svg>`;
}
