import "fake-indexeddb/auto";
// Node 24 lacks the Uint8Array base64/hex methods browsers ship.
import "core-js/actual/typed-array/from-base64";
import "core-js/actual/typed-array/to-base64";
import "core-js/actual/typed-array/from-hex";
import "core-js/actual/typed-array/to-hex";
