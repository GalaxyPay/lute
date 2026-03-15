import { mod } from "@noble/curves/abstract/modular.js";
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToNumberLE, numberToBytesLE } from "@noble/curves/utils.js";

// ===========================
// Libsodium Constants
// ===========================

const crypto_scalarmult_ed25519_SCALARBYTES = 32;

// ===========================
// Ed25519 Point Operations
// ===========================

/**
 * Scalar multiplication with base point (no clamping)
 */
export function crypto_scalarmult_ed25519_base_noclamp(
  scalar: Uint8Array
): Uint8Array {
  // Input validation - only validate length
  if (scalar.length !== crypto_scalarmult_ed25519_SCALARBYTES) {
    throw new Error(
      `scalar must be ${crypto_scalarmult_ed25519_SCALARBYTES} bytes`
    );
  }

  // Convert scalar bytes to bigint (little-endian)
  const scalarBigint = bytesToNumberLE(scalar);

  // Reject zero scalars to match libsodium behavior
  if (scalarBigint === 0n) {
    throw new Error("scalar is 0");
  }

  try {
    // Try multiplication directly
    const point = ed25519.Point.BASE.multiply(scalarBigint);
    return point.toBytes();
  } catch {
    // For edge cases (scalar >= curve order), reduce modulo curve order
    // This maintains compatibility with libsodium's noclamp behavior

    // Clear top bit from scalar using bitwise AND with bitmask:
    // 1n << 255n creates a bigint with only bit 255 set
    // Subtracting 1n gives you all bits 0-254 set (0x7FFF...FFFF)
    // Bitwise & operation with the resulting mask clears bit 255
    const clearedTopBitScalar = scalarBigint & ((1n << 255n) - 1n);
    const reducedScalar = mod(clearedTopBitScalar, ed25519.Point.Fn.ORDER);

    // Reject zero after reduction
    if (reducedScalar === 0n) {
      throw new Error("scalar is 0");
    }

    const point = ed25519.Point.BASE.multiply(reducedScalar);
    return point.toBytes();
  }
}

/**
 * Add two Ed25519 points
 */
export function crypto_core_ed25519_add(
  pointA: Uint8Array,
  pointB: Uint8Array
): Uint8Array {
  try {
    const a = ed25519.Point.fromBytes(pointA);
    const b = ed25519.Point.fromBytes(pointB);
    const result = a.add(b);
    return result.toBytes();
  } catch {
    throw new Error("invalid point");
  }
}

// ===========================
// Ed25519 Scalar Operations
// ===========================

/**
 * Add two scalars modulo the curve order
 */
export function crypto_core_ed25519_scalar_add(
  scalarA: Uint8Array,
  scalarB: Uint8Array
): Uint8Array {
  // Convert little-endian bytes to bigint
  const a = bytesToNumberLE(scalarA);
  const b = bytesToNumberLE(scalarB);
  const result = mod(a + b, ed25519.Point.Fn.ORDER);

  // Convert back to little-endian bytes
  return numberToBytesLE(result, 32);
}

/**
 * Multiply two scalars modulo the curve order
 */
export function crypto_core_ed25519_scalar_mul(
  scalarA: Uint8Array,
  scalarB: Uint8Array
): Uint8Array {
  const a = bytesToNumberLE(scalarA);
  const b = bytesToNumberLE(scalarB);
  const result = mod(a * b, ed25519.Point.Fn.ORDER);

  return numberToBytesLE(result, 32);
}

/**
 * Reduce a scalar modulo the curve order
 */
export function crypto_core_ed25519_scalar_reduce(
  scalar: Uint8Array
): Uint8Array {
  // crypto_core_ed25519_scalar_reduce can handle inputs of any size, commonly 64 bytes from hash output
  // No length validation needed, matches libsodium behavior

  const scalarNum = bytesToNumberLE(scalar);
  const result = mod(scalarNum, ed25519.Point.Fn.ORDER);

  return numberToBytesLE(result, 32);
}
