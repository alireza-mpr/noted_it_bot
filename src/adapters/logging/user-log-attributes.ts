import { setLogAttribute } from "./log-session";

// Adds the user's attributes to every later log event of the current log
// session: user.id, user.name (the Telegram username) and user.full_name.
export function setUserLogAttributes(
  userId: number,
  username: string | null,
  fullName: string | null,
): void {
  setLogAttribute("user.id", userId);
  setLogAttribute("user.name", username);
  setLogAttribute("user.full_name", fullName);
}
