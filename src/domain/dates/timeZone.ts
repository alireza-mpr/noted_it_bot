declare const checkedZone: unique symbol;

// Represents an IANA time zone name that has been checked, such as
// "Asia/Tehran". Only the function that checks a name can create one, so a
// plain string cannot be used where a checked zone is needed.
export type IanaZone = string & { readonly [checkedZone]: true };
