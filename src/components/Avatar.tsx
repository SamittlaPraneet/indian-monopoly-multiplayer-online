import { avatars, seatColours } from "../content/board";
export default function Avatar({
  id,
  size = 30,
}: {
  id: number;
  size?: number;
}) {
  return (
    <svg
      className="avatar-icon"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={avatars[id]}
    >
      <circle cx="20" cy="20" r="20" fill={seatColours[id]} />
      <path
        d={
          id % 2
            ? "M8 32 Q10 19 20 19 Q30 19 32 32"
            : "M8 32 L13 23 L27 23 L32 32"
        }
        fill="#faf4df"
      />
      <circle cx="20" cy="15" r="8" fill="#e1ac75" />
      <path
        d={
          id % 3 === 0
            ? "M12 14 Q11 3 20 5 Q30 4 28 15 L24 10 L16 10Z"
            : id % 3 === 1
              ? "M12 12 Q20 0 28 12 L26 8 L14 8Z"
              : "M11 12 Q20 1 29 12 L29 16 L26 11 L14 11 L11 16Z"
        }
        fill="#243937"
      />
      <circle cx="17" cy="15" r="1" />
      <circle cx="23" cy="15" r="1" />
      <path d="M17 19 Q20 22 23 19" fill="none" stroke="#7b3e2c" />
    </svg>
  );
}
