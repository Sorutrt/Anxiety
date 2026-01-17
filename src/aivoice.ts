// A.I.VOICEの機能関連はこのファイルに
import winax from 'winax';
/* import path from "path";
import { fileURLToPath } from "url"; */

// ActiveXObject を winax から取得
const ActiveX = winax;

// A.I.VOICEを操作するためのObject
const ttsControl = new ActiveX.Object("AI.Talk.Editor.Api.TtsControl");
const HostStatus={
  NotRunning: 0,
  NotConnected: 1,
  Idle: 2,
  Busy: 3
}

/*
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
textToSaveWav("茜ちゃんやで", path.resolve(__dirname, "../voice/"))
*/


export async function textToSaveWav(
  talkContent: string,
  savePath: string,
  voicePreset?: string
): Promise<void> {
  const currentHost = ttsControl.GetAvailableHostNames()[0]; // 利用可能なホストの名称

  await ttsControl.Initialize(currentHost);

  try {
    console.log(ttsControl.Status)
    if(ttsControl.Status===HostStatus.NotRunning){
      await ttsControl.StartHost();
    }
    if (ttsControl.Status===HostStatus.NotConnected){
      ttsControl.Connect();
      console.log(`ホストバージョン: ${ttsControl.Version}`);
      console.log("ホストへの接続を開始しました。");
    }
  }
  catch (e) {
      throw new Error(`ホストへの接続に失敗しました。\n${e}`);
  }

  const voiceNames = ttsControl.VoiceNames;//利用可能なキャラクター名一覧を取得
  // [ '琴葉 茜', '琴葉 茜（蕾）', '琴葉 葵', '琴葉 葵（蕾）' ]

  const voicePresetNames = ttsControl.VoicePresetNames;//標準ボイス、ユーザーボイス名一覧を取得
  // [ '琴葉 茜 - 新規', '琴葉 茜', '琴葉 茜（蕾）', '琴葉 葵', '琴葉 葵（蕾）' ]

  // 指定があれば優先し、無ければ先頭ボイスにフォールバックする。
  const trimmedPreset = (voicePreset ?? "").trim();
  const normalizedPreset = trimmedPreset.toLowerCase() === "auto" ? "" : trimmedPreset;
  const resolvedPreset =
    normalizedPreset &&
    (voicePresetNames.includes(normalizedPreset) || voiceNames.includes(normalizedPreset))
      ? normalizedPreset
      : voiceNames[0];

  //ボイスを設定する
  ttsControl.CurrentVoicePresetName = resolvedPreset;

  // 喋る部分
  try{
    ttsControl.Text = talkContent ;// '琴葉 葵やで～'

    // 音声保存
    ttsControl.SaveAudioToFile(savePath);
    //ttsControl.Stop()で音声を停止
  }
  catch (e) {
    throw new Error(`音声の再生に失敗しました。\n${e}`);
  }
}
