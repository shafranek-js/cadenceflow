export function MatrixResetMenu({
  onResetCurrentModule,
  onResetAllModules,
}: {
  readonly onResetCurrentModule: () => void;
  readonly onResetAllModules: () => void;
}) {
  return (
    <details className="matrix-reset-menu">
      <summary>Reset cards</summary>
      <div>
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
