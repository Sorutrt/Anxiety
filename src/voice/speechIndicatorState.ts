export type SpeechIndicatorResult = {
  totalOnMs: number;
  isValid: boolean;
};

export type SpeechIndicatorConfig = {
  minOnMs: number;
  gapMs: number;
};

// State machine for speech indicator on/off events and utterance boundaries.
export class SpeechIndicatorState {
  private readonly minOnMs: number;
  private readonly gapMs: number;
  private totalOnMs = 0;
  private indicatorOnAt: number | null = null;
  private silenceDeadline: number | null = null;
  private completed: SpeechIndicatorResult | null = null;

  constructor(config: SpeechIndicatorConfig) {
    this.minOnMs = config.minOnMs;
    this.gapMs = config.gapMs;
  }

  start(atMs: number): void {
    if (this.completed) {
      return;
    }
    this.indicatorOnAt = atMs;
    this.silenceDeadline = null;
  }

  onIndicatorOn(atMs: number): void {
    if (this.completed) {
      return;
    }
    if (this.indicatorOnAt === null) {
      this.indicatorOnAt = atMs;
    }
    this.silenceDeadline = null;
  }

  onIndicatorOff(atMs: number): number | null {
    if (this.completed) {
      return null;
    }
    if (this.indicatorOnAt !== null) {
      const duration = Math.max(0, atMs - this.indicatorOnAt);
      this.totalOnMs += duration;
      this.indicatorOnAt = null;
      this.silenceDeadline = atMs + this.gapMs;
      return this.silenceDeadline;
    }
    if (this.silenceDeadline === null) {
      this.silenceDeadline = atMs + this.gapMs;
    }
    return this.silenceDeadline;
  }

  shouldEnd(atMs: number): boolean {
    if (this.completed || this.silenceDeadline === null) {
      return false;
    }
    return atMs >= this.silenceDeadline;
  }

  complete(atMs: number): SpeechIndicatorResult {
    if (this.completed) {
      return this.completed;
    }
    if (this.indicatorOnAt !== null) {
      const duration = Math.max(0, atMs - this.indicatorOnAt);
      this.totalOnMs += duration;
      this.indicatorOnAt = null;
    }
    this.silenceDeadline = null;
    const isValid = this.totalOnMs > this.minOnMs;
    this.completed = { totalOnMs: this.totalOnMs, isValid };
    return this.completed;
  }
}
