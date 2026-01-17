export async function withTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    task()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function retryOnce<T>(task: () => Promise<T>, delayMs = 300): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return await task();
  }
}
