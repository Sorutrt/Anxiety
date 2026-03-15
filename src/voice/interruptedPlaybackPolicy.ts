export type InterruptedPlayback = {
  filePath: string;
  offsetMs: number;
};

export function shouldResumeInterruptedPlayback(
  normalizedText: string | null
): normalizedText is null {
  return normalizedText === null;
}

export function createInterruptedPlayback(
  filePath: string,
  playbackDurationMs: number,
  resumable: boolean
): InterruptedPlayback | null {
  if (!resumable) {
    return null;
  }
  const offsetMs = Math.max(0, Math.floor(playbackDurationMs));
  if (offsetMs === 0) {
    return null;
  }
  return {
    filePath,
    offsetMs,
  };
}
