import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

export function MatrixResetMenu({
  onResetCurrentModule,
  onResetAllModules,
}: {
  readonly onResetCurrentModule: () => void;
  readonly onResetAllModules: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      summaryRef.current?.focus();
    };
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [open]);

  const closeFromKeyboard = (event: ReactKeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    summaryRef.current?.focus();
  };

  return (
    <details ref={menuRef} className="matrix-reset-menu" open={open} onKeyDown={closeFromKeyboard}>
      <summary
        ref={summaryRef}
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
      >
        Reset cards
      </summary>
      <div onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onResetCurrentModule}>
          Reset Current Module
        </button>
        <button type="button" onClick={onResetAllModules}>
          Reset All Modules
        </button>
      </div>
    </details>
  );
}
