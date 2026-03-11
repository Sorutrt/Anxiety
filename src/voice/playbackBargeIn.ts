import { PLAYBACK_BARGE_IN_MIN_MS } from "../constants";
import { SpeechIndicatorState } from "./speechIndicatorState";

export function hasReachedPlaybackBargeInThreshold(
  indicatorState: SpeechIndicatorState,
  atMs: number,
  thresholdMs = PLAYBACK_BARGE_IN_MIN_MS
): boolean {
  return indicatorState.getTotalOnMs(atMs) >= thresholdMs;
}

export function getPlaybackBargeInDelayMs(
  indicatorState: SpeechIndicatorState,
  atMs: number,
  thresholdMs = PLAYBACK_BARGE_IN_MIN_MS
): number | null {
  if (!indicatorState.isIndicatorOn()) {
    return null;
  }
  return Math.max(0, thresholdMs - indicatorState.getTotalOnMs(atMs));
}
