import type { MouseEvent } from "react";
import { CustomizedIndicator } from "./CustomizedIndicator";
import { Icon } from "../common/Icon";

export function ChordCardSettingsButton({
  functionId,
  customizedCount,
  onOpen,
  onReset,
}: {
  readonly functionId: string;
  readonly customizedCount: number;
  readonly onOpen: () => void;
  readonly onReset: () => void;
}) {
  const activate = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      onReset();
      return;
    }
    onOpen();
  };
  return (
    <span className="settings-control">
      <button
        type="button"
        className="card-settings-button"
        onClick={activate}
        title={`Settings for ${functionId}. Ctrl/Cmd+Click: Reset Card to Defaults`}
        aria-label={`Settings for ${functionId}`}
      >
        <Icon name="settings" />
      </button>
      <CustomizedIndicator count={customizedCount} />
    </span>
  );
}
