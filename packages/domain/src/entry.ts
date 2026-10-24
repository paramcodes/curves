export const packageName = "@curves/domain";

export type Brand<T, B extends string> = T & { readonly __brand: B };
