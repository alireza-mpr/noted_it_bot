// Captured from the live API: POST /v1beta/models/gemini-3.1-flash-lite:generateContent
// at 2026-09-25T06:13:11Z, HTTP 503. No retry-after header, no quota details.
export const GEMINI_503_UNAVAILABLE = {
  httpStatus: 503,
  body: `{
  "error": {
    "code": 503,
    "message": "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    "status": "UNAVAILABLE"
  }
}
`,
};
