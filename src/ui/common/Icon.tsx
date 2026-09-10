export type IconName =
  | "add"
  | "alternative"
  | "best"
  | "branch"
  | "close"
  | "count-in"
  | "disclosure"
  | "from-here"
  | "loop"
  | "metronome"
  | "moon"
  | "move-left"
  | "move-right"
  | "pause"
  | "play"
  | "redo"
  | "remove"
  | "reset"
  | "resume"
  | "settings"
  | "stop"
  | "sun"
  | "arrow-down"
  | "arrow-up"
  | "undo";

const PATHS: Readonly<Record<IconName, string>> = {
  add: "M8 2v12M2 8h12",
  alternative:
    "M2.5 8c1.5-4 5.5-5.5 11-3.5M10.5 2.5l3 2-3 2M13.5 8c-1.5 4-5.5 5.5-11 3.5M5.5 13.5l-3-2 3-2",
  best: "M8 1.5l1.85 3.75 4.15.6-3 2.9.7 4.1L8 10.9l-3.7 1.95.7-4.1-3-2.9 4.15-.6L8 1.5z",
  branch:
    "M4 3v4c0 1.1.9 2 2 2h4c1.1 0 2 .9 2 2v2M12 11l2 2-2 2M8 9V5c0-1.1-.9-2-2-2H4M4 1L2 3l2 2",
  close: "M3 3l10 10M13 3L3 13",
  "count-in": "M3 3h10v10H3zM5 10V8M8 10V6M11 10V4",
  disclosure: "M5 3l6 5-6 5",
  "from-here": "M3 3l8.5 5L3 13V3zm8 1h2M11 8h2M11 12h2",
  loop: "M3 6.5A5 5 0 0 1 11.5 4L13 5.5M13 5.5V3M13 5.5h-2.5M13 9.5A5 5 0 0 1 4.5 12L3 10.5M3 10.5V13M3 10.5h2.5",
  metronome: "M5 13.5h6M5.4 13.5 7 4h2l1.6 9.5M8 4V2.5M8 2.5h2.5M8.6 7.5l3.5-2.4",
  moon: "M13 9.5A5.5 5.5 0 0 1 6.5 3 5.5 5.5 0 1 0 13 9.5z",
  "move-left": "M13 8H3M6.5 4.5L3 8l3.5 3.5",
  "move-right": "M3 8h10M9.5 4.5L13 8l-3.5 3.5",
  pause: "M4 2.5h2.5v11H4zM9.5 2.5H12v11H9.5z",
  play: "M4 2.5l8.5 5.5L4 13.5z",
  redo: "M13 6.5V3l-2.5 2.5A5.5 5.5 0 1 0 12 10",
  remove: "M3 3l10 10M13 3L3 13",
  reset: "M13 6a5 5 0 1 0 0 4M13 2v4H9",
  resume: "M3 2.5h2.5v11H3zM7 3l6.5 5L7 13V3z",
  settings:
    "M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4",
  stop: "M3 3h10v10H3z",
  sun: "M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M12.6 3.4l-.7.7M4.1 11.9l-.7.7",
  "arrow-down": "M8 2.5v11M3.8 9.3L8 13.5l4.2-4.2",
  "arrow-up": "M8 13.5v-11M3.8 6.7L8 2.5l4.2 4.2",
  undo: "M3 6.5V3l2.5 2.5A5.5 5.5 0 1 1 4 10",
};

export function Icon({
  name,
  className = "",
}: {
  readonly name: IconName;
  readonly className?: string;
}) {
  return (
    <svg
      className={`ui-icon ui-icon-${name} ${className}`.trim()}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
