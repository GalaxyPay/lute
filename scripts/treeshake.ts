// algosdk ships without `"sideEffects": false`, so the bundler keeps every
// module it can reach (124 of 134) even when nothing imported from it is used.
// Its only top-level statements are static-property assignments on its own
// classes (`X.encodingSchema = ...`), so it is safe to treat as pure.
export function algosdkSideEffectFree(id: string): boolean | undefined {
  if (
    /[\\/]node_modules[\\/](\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?algosdk[\\/]/.test(
      id
    )
  )
    return false;
  return undefined;
}
