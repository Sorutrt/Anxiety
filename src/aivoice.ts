// A.I.VOICEの機能関連はこのファイルに
import winax from "winax";
/* import path from "path";
import { fileURLToPath } from "url"; */

type AivoiceState = {
  initialized: boolean;
  serviceName?: string;
  connectPromise: Promise<void> | null;
};

export const HOST_STATUS = {
  NotRunning: 0,
  NotConnected: 1,
  Idle: 2,
  Busy: 3,
} as const;

type HostStatusValue = (typeof HOST_STATUS)[keyof typeof HOST_STATUS];

type TtsControlLike = {
  GetAvailableHostNames: () => string[];
  Initialize: (serviceName: string) => unknown;
  StartHost: () => unknown;
  Connect: () => unknown;
  Status: HostStatusValue;
  Version?: string;
  VoiceNames: string[];
  VoicePresetNames: string[];
  CurrentVoicePresetName: string;
  Text: string;
  SaveAudioToFile: (savePath: string) => unknown;
};

// ActiveXObject を winax から取得
const ActiveX = winax;
let ttsControlInstance: TtsControlLike | null = null;

const defaultState: AivoiceState = createAivoiceState();

/*
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
textToSaveWav("茜ちゃんやで", path.resolve(__dirname, "../voice/"))
*/

export function createAivoiceState(): AivoiceState {
  return { initialized: false, serviceName: undefined, connectPromise: null };
}

function getTtsControl(): TtsControlLike {
  if (!ttsControlInstance) {
    ttsControlInstance = new ActiveX.Object(
      "AI.Talk.Editor.Api.TtsControl"
    ) as TtsControlLike;
  }
  return ttsControlInstance;
}

function resolveHostName(control: TtsControlLike): string {
  const hostNames = control.GetAvailableHostNames();
  if (!hostNames || hostNames.length === 0) {
    throw new Error("利用可能なA.I.VOICEのホストが見つかりません。");
  }
  return hostNames[0];
}

export function resolveVoicePresetName(
  voicePresetNames: string[],
  voiceNames: string[],
  voicePreset?: string
): string {
  const trimmedPreset = (voicePreset ?? "").trim();
  const normalizedPreset = trimmedPreset.toLowerCase() === "auto" ? "" : trimmedPreset;
  const hasPreset =
    normalizedPreset &&
    (voicePresetNames.includes(normalizedPreset) || voiceNames.includes(normalizedPreset));
  return hasPreset ? normalizedPreset : voiceNames[0];
}

// A.I.VOICEの初期化〜接続までを一貫して保証する。
export async function ensureAivoiceConnected(
  control: TtsControlLike,
  state: AivoiceState
): Promise<void> {
  if (state.connectPromise) {
    return state.connectPromise;
  }

  state.connectPromise = (async () => {
    if (!state.initialized) {
      const serviceName = resolveHostName(control);
      state.serviceName = serviceName;
      await Promise.resolve(control.Initialize(serviceName));
      state.initialized = true;
    }

    if (control.Status === HOST_STATUS.NotRunning) {
      await Promise.resolve(control.StartHost());
    }

    if (control.Status === HOST_STATUS.NotConnected) {
      await Promise.resolve(control.Connect());
      if (control.Version) {
        console.log(`ホストバージョン: ${control.Version}`);
      }
      console.log("ホストへの接続を開始しました。");
    }
  })();

  try {
    await state.connectPromise;
  } finally {
    state.connectPromise = null;
  }
}

export async function initializeAivoiceOnStartup(): Promise<void> {
  const control = getTtsControl();
  await ensureAivoiceConnected(control, defaultState);
}

export async function textToSaveWav(
  talkContent: string,
  savePath: string,
  voicePreset?: string
): Promise<void> {
  const control = getTtsControl();
  try {
    await ensureAivoiceConnected(control, defaultState);
  } catch (e) {
    throw new Error(`ホストへの接続に失敗しました。\n${e}`);
  }

  const voiceNames = control.VoiceNames; //利用可能なキャラクター名一覧を取得
  // [ '琴葉 茜', '琴葉 茜（蕾）', '琴葉 葵', '琴葉 葵（蕾）' ]

  const voicePresetNames = control.VoicePresetNames; //標準ボイス、ユーザーボイス名一覧を取得
  // [ '琴葉 茜 - 新規', '琴葉 茜', '琴葉 茜（蕾）', '琴葉 葵', '琴葉 葵（蕾）' ]

  // 指定があれば優先し、無ければ先頭ボイスにフォールバックする。
  const resolvedPreset = resolveVoicePresetName(
    voicePresetNames,
    voiceNames,
    voicePreset
  );

  //ボイスを設定する
  control.CurrentVoicePresetName = resolvedPreset;

  // 喋る部分
  try {
    control.Text = talkContent; // '琴葉 葵やで～'

    // 音声保存
    control.SaveAudioToFile(savePath);
    //control.Stop()で音声を停止
  } catch (e) {
    throw new Error(`音声の再生に失敗しました。\n${e}`);
  }
}
