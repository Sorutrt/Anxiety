// テストデータは Anxiety/voice/stt-test/sample.wav と Anxiety/voice/stt-test/sample.txt に配置

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { shutdownKotobaWhisperPool, transcribeAudio } from "./openaiWhisper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const defaultAudioPath = path.resolve(projectRoot, "voice", "stt-test", "sample.wav");
const defaultExpectedPath = path.resolve(projectRoot, "voice", "stt-test", "sample.txt");
const audioPath = process.env.STT_TEST_AUDIO_PATH
  ? path.resolve(projectRoot, process.env.STT_TEST_AUDIO_PATH)
  : defaultAudioPath;
const expectedTextPath = process.env.STT_TEST_EXPECTED_PATH
  ? path.resolve(projectRoot, process.env.STT_TEST_EXPECTED_PATH)
  : defaultExpectedPath;
const cerThresholdRaw = process.env.STT_TEST_CER_THRESHOLD ?? "75";
const timeoutSec = process.env.STT_TEST_TIMEOUT_SEC ?? "120";

if (!process.env.OPENAI_WHISPER_TIMEOUT_SEC) {
  process.env.OPENAI_WHISPER_TIMEOUT_SEC = timeoutSec;
}

after(() => {
  shutdownKotobaWhisperPool();
});

// CER計算用に空白・句読点を除去し、全角/半角を統一する。
function normalizeForCer(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, "").replace(/[\p{P}]/gu, "");
}

// 文字単位のレーベンシュタイン距離でCERを計算する。
function calculateCharacterErrorRate(expected: string, actual: string): {
  cer: number;
  distance: number;
  expectedChars: number;
  actualChars: number;
} {
  const expectedTokens = Array.from(expected);
  const actualTokens = Array.from(actual);
  const expectedLength = expectedTokens.length;
  const actualLength = actualTokens.length;
  const distanceMatrix: number[][] = Array.from({ length: expectedLength + 1 }, () =>
    Array.from({ length: actualLength + 1 }, () => 0)
  );

  for (let i = 0; i <= expectedLength; i += 1) {
    distanceMatrix[i][0] = i;
  }
  for (let j = 0; j <= actualLength; j += 1) {
    distanceMatrix[0][j] = j;
  }

  for (let i = 1; i <= expectedLength; i += 1) {
    for (let j = 1; j <= actualLength; j += 1) {
      const substitutionCost = expectedTokens[i - 1] === actualTokens[j - 1] ? 0 : 1;
      distanceMatrix[i][j] = Math.min(
        distanceMatrix[i - 1][j] + 1,
        distanceMatrix[i][j - 1] + 1,
        distanceMatrix[i - 1][j - 1] + substitutionCost
      );
    }
  }

  const distance = distanceMatrix[expectedLength][actualLength];
  const cer = expectedLength === 0 ? (actualLength === 0 ? 0 : 1) : distance / expectedLength;
  return { cer, distance, expectedChars: expectedLength, actualChars: actualLength };
}

test(
  "stt transcribes audio with expected text",
  { timeout: Number.parseInt(timeoutSec, 10) * 1000 },
  async (t) => {
    if (!fs.existsSync(audioPath)) {
      throw new Error(
        `STT test audio not found: ${audioPath}. Place a wav file at the path or set STT_TEST_AUDIO_PATH.`
      );
    }
    if (!fs.existsSync(expectedTextPath)) {
      throw new Error(
        `STT expected text not found: ${expectedTextPath}. Place a text file at the path.`
      );
    }
    const expectedText = fs.readFileSync(expectedTextPath, "utf8").trim();
    if (!expectedText) {
      throw new Error(`STT expected text is empty: ${expectedTextPath}`);
    }
    const cerThresholdValue = Number.parseFloat(cerThresholdRaw);
    if (!Number.isFinite(cerThresholdValue) || cerThresholdValue < 0) {
      throw new Error(`Invalid STT_TEST_CER_THRESHOLD: ${cerThresholdRaw}`);
    }
    const cerThreshold =
      cerThresholdValue > 1 && cerThresholdValue <= 100
        ? cerThresholdValue / 100
        : cerThresholdValue;
    if (cerThreshold > 1) {
      throw new Error(`Invalid STT_TEST_CER_THRESHOLD: ${cerThresholdRaw}`);
    }

    const rawText = await transcribeAudio(audioPath, "stt-test");
    const normalizedExpected = normalizeForCer(expectedText);
    const normalizedActual = normalizeForCer(rawText);
    const { cer, distance, expectedChars, actualChars } = calculateCharacterErrorRate(
      normalizedExpected,
      normalizedActual
    );

    t.diagnostic(
      `CER=${cer.toFixed(3)} (distance=${distance}, expectedChars=${expectedChars}, actualChars=${actualChars})`
    );

    assert.ok(
      cer <= cerThreshold,
      `CER above threshold: ${cer.toFixed(3)} > ${cerThreshold.toFixed(3)} actual="${normalizedActual}" expected="${normalizedExpected}"`
    );
  }
);

