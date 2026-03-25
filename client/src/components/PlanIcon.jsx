export default function PlanIcon({ variant }) {
  const stroke = { stroke: "currentColor", strokeWidth: 2, fill: "none" };
  switch (variant) {
    case "bookLines":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          <path d="M8 6h10M8 10h10M8 14h10" />
        </svg>
      );
    case "chat":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
          <path d="M7 4h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3V6a2 2 0 0 1 2-2z" />
          <path d="M9 8h8M9 11h6" />
          <path d="M14.5 14.5l1.2 1.2 2.3-2.3" />
        </svg>
      );
    case "stack":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
          <path d="M22 10l-10-5-10 5 10 5 10-5z" />
          <path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
          <path d="M22 10v6" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
  }
}
