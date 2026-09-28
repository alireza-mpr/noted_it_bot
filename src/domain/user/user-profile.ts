// Represents what Telegram says about a user: the names, and the language of
// the user's Telegram app, as Telegram sends it (e.g. "en-US"). It arrives
// with every update.
export interface UserProfile {
  username: string | null;
  firstName: string;
  lastName: string | null;
  telegramLanguageCode: string | null;
}

// Returns the user's full name: the first name, and the last name if there
// is one.
export function fullNameOf(userProfile: UserProfile): string {
  return userProfile.lastName === null
    ? userProfile.firstName
    : `${userProfile.firstName} ${userProfile.lastName}`;
}

// Returns true if the two profiles are the same.
export function isSameProfile(
  firstProfile: UserProfile | null,
  secondProfile: UserProfile,
): boolean {
  return (
    firstProfile !== null &&
    firstProfile.username === secondProfile.username &&
    firstProfile.firstName === secondProfile.firstName &&
    firstProfile.lastName === secondProfile.lastName &&
    firstProfile.telegramLanguageCode === secondProfile.telegramLanguageCode
  );
}
