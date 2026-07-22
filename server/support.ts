import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { nanoid } from "nanoid";

export const now = () => new Date().toISOString();
export const id = () => nanoid();

export function json<T>(value: string): T {
  return JSON.parse(value) as T;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A JSON object is required");
  return value as Record<string, unknown>;
}

export function text(value: unknown, name: string, max = 120): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${name} is required`);
  return value.trim();
}

export function optionalText(value: unknown, name: string, max = 120): string | undefined {
  if (value === undefined) return undefined;
  return text(value, name, max);
}

export function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${name} must be true or false`);
  return value;
}

export function oneOf<T extends string>(value: unknown, values: readonly T[], name: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) throw new Error(`${name} is invalid`);
  return value as T;
}

export function secureRequest(request: FastifyRequest, baseUrl: string): boolean {
  const forwarded = request.headers["x-forwarded-proto"];
  return request.protocol === "https" || forwarded === "https" || baseUrl.startsWith("https://");
}

export function studentToken(secret: string, classId: string, studentId: string): string {
  const payload = Buffer.from(JSON.stringify({ classId, studentId, nonce: randomBytes(12).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readStudentToken(secret: string, token?: string): { classId: string; studentId: string } | null {
  if (!token) return null;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return null;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let signature: Buffer;
  try {
    signature = Buffer.from(supplied, "base64url");
  } catch {
    return null;
  }
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Record<string, unknown>;
    if (typeof parsed.classId !== "string" || typeof parsed.studentId !== "string") return null;
    return { classId: parsed.classId, studentId: parsed.studentId };
  } catch {
    return null;
  }
}

export interface RosterEntry {
  displayName: string;
  avatar?: { emoji?: string; color?: string; shape?: string };
}

// PII-free by design: roster errors identify only row numbers and generic rules, never submitted names or values.
export function validateRoster(value: unknown): { entries?: RosterEntry[]; errors?: string[] } {
  if (!Array.isArray(value)) return { errors: ["Roster must be an array"] };
  if (value.length > 500) return { errors: ["Roster cannot exceed 500 rows"] };
  const errors: string[] = [];
  const entries: RosterEntry[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`Row ${index + 1}: invalid entry`);
      return;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.displayName !== "string" || !row.displayName.trim() || row.displayName.trim().length > 80) {
      errors.push(`Row ${index + 1}: display name is required and must be 80 characters or fewer`);
      return;
    }
    const avatar = row.avatar && typeof row.avatar === "object" && !Array.isArray(row.avatar)
      ? row.avatar as RosterEntry["avatar"]
      : undefined;
    entries.push({ displayName: row.displayName.trim(), avatar });
  });
  return errors.length ? { errors } : { entries };
}
