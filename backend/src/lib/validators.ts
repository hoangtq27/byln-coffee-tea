import { z } from "zod";

/** Số (hoặc chuỗi số) -> number; trả NaN nếu không hợp lệ. */
export function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
  return NaN;
}

export const trimmedString = (max: number, requiredMsg: string, tooLongMsg?: string) =>
  z
    .string({ required_error: requiredMsg, invalid_type_error: requiredMsg })
    .transform((s) => s.trim())
    .pipe(
      z
        .string()
        .min(1, requiredMsg)
        .max(max, tooLongMsg ?? `Tối đa ${max} ký tự!`),
    );

export function priceSchema(requiredMsg: string, invalidMsg: string) {
  return z.any().transform((v, ctx) => {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      ctx.addIssue({ code: "custom", message: requiredMsg });
      return z.NEVER;
    }
    const n = toNumber(v);
    if (!Number.isFinite(n) || n <= 0 || n > 1e12) {
      ctx.addIssue({ code: "custom", message: invalidMsg });
      return z.NEVER;
    }
    return n;
  });
}

const PASSWORD_BAD = "Mật khẩu không đạt yêu cầu!";
export function checkPassword(pw: string): boolean {
  return pw.length >= 6 && pw.length <= 50 && /[@#!]/.test(pw);
}
export const passwordMsg = PASSWORD_BAD;

export const intFromAny = (v: unknown): number => {
  const n = toNumber(v);
  return Number.isInteger(n) ? n : NaN;
};
