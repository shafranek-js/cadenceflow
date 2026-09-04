export function CustomizedIndicator({ count }: { readonly count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="customized-indicator"
      title={`Customized · ${count} overrides`}
      aria-label={`Customized · ${count} overrides`}
    >
      {count}
    </span>
  );
}
