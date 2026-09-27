export const LOCAL_ORIGIN = Symbol("eppt.local");
export class LocalTextOrigin {}
export function isLocalContentOrigin(origin: unknown): boolean {
  return origin === LOCAL_ORIGIN || origin instanceof LocalTextOrigin;
}
export const REMOTE_ORIGIN = Symbol("eppt.remote");
export const BOOTSTRAP_ORIGIN = Symbol("eppt.bootstrap");

export type TransactionOrigin =
  | typeof LOCAL_ORIGIN
  | typeof REMOTE_ORIGIN
  | typeof BOOTSTRAP_ORIGIN;
