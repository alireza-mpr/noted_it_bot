const SECRET_TOKEN_HEADER = "X-Telegram-Bot-Api-Secret-Token";
const TEXT_ENCODER = new TextEncoder();

// Returns true if the request carries the webhook secret, so it comes from
// Telegram.
export function isFromTelegram(request: Request, webhookSecret: string): boolean {
  const secretToken = request.headers.get(SECRET_TOKEN_HEADER);
  if (secretToken === null) {
    return false;
  }
  const givenBytes = TEXT_ENCODER.encode(secretToken);
  const expectedBytes = TEXT_ENCODER.encode(webhookSecret);
  // A constant-time compare, so the time taken does not give the secret away.
  return (
    givenBytes.byteLength === expectedBytes.byteLength &&
    crypto.subtle.timingSafeEqual(givenBytes, expectedBytes)
  );
}
