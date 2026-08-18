import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DUMMY_HASH = `scrypt$${SCRYPT_N}$${"00".repeat(SALT_LENGTH)}$${"00".repeat(KEY_LENGTH)}`;

function derive(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      { N: cost, r: SCRYPT_R, p: SCRYPT_P },
      (error, result) => {
        if (error) reject(error);
        else resolve(result as Buffer);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await derive(password, salt, SCRYPT_N);
  return `scrypt$${SCRYPT_N}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined) {
  const candidate = encoded ?? DUMMY_HASH;
  const parts = candidate.split("$");
  const cost = Number(parts[1]);
  const saltHex = parts[2];
  const expectedHex = parts[3];
  const validFormat =
    parts.length === 4 &&
    parts[0] === "scrypt" &&
    Number.isInteger(cost) &&
    cost >= 1_024 &&
    /^[0-9a-f]+$/i.test(saltHex) &&
    /^[0-9a-f]+$/i.test(expectedHex) &&
    saltHex.length === SALT_LENGTH * 2 &&
    expectedHex.length === KEY_LENGTH * 2;
  const safeCost = validFormat ? cost : SCRYPT_N;
  const salt = Buffer.from(validFormat ? saltHex : DUMMY_HASH.split("$")[2], "hex");
  const expected = Buffer.from(validFormat ? expectedHex : DUMMY_HASH.split("$")[3], "hex");
  const derived = await derive(password, salt, safeCost);
  return timingSafeEqual(derived, expected) && validFormat;
}
