import { Pause, Play } from "lucide-react";
import { Button } from "@renderer/components/ui/button";

export interface JobFinderActivityControlState {
  activeApplicationCount: number;
  activeBrowserCount: number;
  paused: boolean;
  pausedAt: string | null;
  pending: boolean;
}

export function JobFinderActivityControl(props: {
  onPause: () => void;
  onResume: () => void;
  state: JobFinderActivityControlState;
}) {
  const activeCount =
    props.state.activeApplicationCount + props.state.activeBrowserCount;
  const detailId = "job-finder-activity-control-detail";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        aria-describedby={detailId}
        onClick={props.state.paused ? props.onResume : props.onPause}
        pending={props.state.pending}
        size="sm"
        type="button"
        variant={props.state.paused ? "primary" : "outline"}
      >
        {props.state.paused ? (
          <Play aria-hidden="true" className="size-4" />
        ) : (
          <Pause aria-hidden="true" className="size-4" />
        )}
        {props.state.paused ? "Resume activity" : "Pause activity"}
      </Button>
      <span
        className="text-(length:--text-small) text-foreground-muted"
        id={detailId}
      >
        {props.state.paused
          ? "New browser and application work is paused. Review and local edits still work."
          : activeCount > 0
            ? `${activeCount} background ${activeCount === 1 ? "operation" : "operations"} running`
            : "No browser or application work is running"}
      </span>
    </div>
  );
}
