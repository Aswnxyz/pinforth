import { Algorithm, hash, verify } from "@node-rs/argon2";

// OWASP Password Storage Cheat Sheet minimum for argon2id: 19 MiB, 2 iterations.
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export const hashPassword = (password) => hash(password, ARGON2_OPTIONS);

export async function verifyPassword(passwordHash, password) {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Malformed hash in the database: treat as a failed login, never a 500.
    return false;
  }
}

let dummyHash;

// Verifying against a throwaway hash when the user doesn't exist keeps response
// time the same as a wrong password, so login can't be used to find accounts.
export async function verifyAgainstDummy(password) {
  dummyHash ??= hashPassword("pinforth-dummy-password-for-timing");
  await verifyPassword(await dummyHash, password);
  return false;
}
