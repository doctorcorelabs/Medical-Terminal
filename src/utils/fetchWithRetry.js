/**
 * A robust fetch wrapper that retries on network errors and transient server errors (5xx).
 * Includes exponential backoff.
 * 
 * @param {string|Request} url - The URL or Request object to fetch
 * @param {Object} options - Standard fetch options plus retry-specific ones
 * @param {number} options.retries - Number of retry attempts (default: 3)
 * @param {number} options.backoff - Initial backoff delay in ms (default: 1000)
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}) {
  const { retries = 3, backoff = 1000, ...fetchOptions } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Retry on 5xx server errors or 408 Timeout
      if (response.status >= 500 || response.status === 408) {
        if (attempt < retries) {
          const delay = backoff * Math.pow(2, attempt);
          console.warn(`[FetchRetry] Attempt ${attempt + 1} failed with status ${response.status}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error;
      
      // Check if it's a network error (e.g., "Failed to fetch", "NetworkError", "CORS error" that's actually a network drop)
      // Browsers often report network failures as "TypeError: Failed to fetch"
      const isNetworkError = error instanceof TypeError || 
                             error.name === 'NetworkError' || 
                             error.message.includes('Failed to fetch') ||
                             error.message.includes('CORS');

      if (isNetworkError && attempt < retries) {
        const delay = backoff * Math.pow(2, attempt);
        console.warn(`[FetchRetry] Attempt ${attempt + 1} failed with network error: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
