/**
 * @template T
 * @param {number} milliseconds
 * @param {(signal: AbortSignal) => PromiseLike<T>} request
 * @returns {Promise<T>}
 */
export async function withAbortTimeout(milliseconds, request) {
  const controller = new AbortController();
  /** @type {ReturnType<typeof setTimeout>} */
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('Tiempo de espera agotado'));
    }, milliseconds);
  });
  try {
    return /** @type {T} */ (await Promise.race([request(controller.signal), timeout]));
  } finally {
    clearTimeout(timer);
  }
}
