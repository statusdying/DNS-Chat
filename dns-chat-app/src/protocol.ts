// protocol.ts

// Převede text (včetně emoji) na Hex string
export function encodeMessage(text: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text); // Uint8Array
  
  // Převedeme každý bajt na hex kód (např. 255 -> "ff")
  return Array.from(data)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Převede Hex string zpátky na text
export function decodeMessage(hex: string): string {
  // Odstraníme případné tečky, pokud by tam zůstaly z domény
  const cleanHex = hex.replace(/\./g, "");
  
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

// Otestování (jen pro debug, když to spustíš přímo)
// JUST FOR DENO
//if (import.meta.main) {
//  const original = "Ahoj světe! 🚀";
//  const encoded = encodeMessage(original);
//  console.log(`Original: ${original}`);
//  console.log(`Encoded:  ${encoded}`);
//  console.log(`Decoded:  ${decodeMessage(encoded)}`);
//}