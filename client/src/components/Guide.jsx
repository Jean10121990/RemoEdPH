const CHARACTER_SRC = {
  ed: "/images/ed-boy.png",
  remo: "/images/remo-robot.png",
  sophia: "/images/sophia-girl.png",
};

const CHARACTER_ALT = {
  ed: "Ed",
  remo: "Remo robot",
  sophia: "Sophia",
};

/**
 * Reusable mascot / guide image. Keeps paths consistent across the SPA.
 * @param {'ed'|'remo'|'sophia'} character
 */
export default function Guide({ character = "remo", className = "", alt }) {
  const src = CHARACTER_SRC[character] || CHARACTER_SRC.remo;
  const label = alt || CHARACTER_ALT[character] || "Guide";
  return (
    <img
      src={src}
      alt={label}
      className={`guide ${className}`.trim()}
      loading="lazy"
    />
  );
}
