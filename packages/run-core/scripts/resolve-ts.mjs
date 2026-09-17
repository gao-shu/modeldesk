/**
 * Resolve extensionless relative imports to .ts for node:test + strip-types.
 */
export async function resolve(specifier, context, nextResolve) {
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    !/\.[cm]?[jt]sx?$/.test(specifier)
  ) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      /* fall through */
    }
  }
  return nextResolve(specifier, context);
}
