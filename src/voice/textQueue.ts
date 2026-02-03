export const TEXT_QUEUE_LIMIT = 5;

export type TextQueueState<T> = {
  items: T[];
  processing: boolean;
};

// テキストメッセージ処理を直列化するためのキュー状態を作る。
export function createTextQueueState<T>(): TextQueueState<T> {
  return { items: [], processing: false };
}

// キューに追加できたかどうかを返し、上限超過時は追加しない。
export function enqueueTextQueue<T>(
  state: TextQueueState<T>,
  item: T,
  limit = TEXT_QUEUE_LIMIT
): boolean {
  if (state.items.length >= limit) {
    return false;
  }
  state.items.push(item);
  return true;
}

// 先頭要素を参照するだけで取り出しはしない。
export function peekTextQueue<T>(state: TextQueueState<T>): T | undefined {
  return state.items[0];
}

// 先頭要素を取り出してFIFOで処理する。
export function shiftTextQueue<T>(state: TextQueueState<T>): T | undefined {
  return state.items.shift();
}
