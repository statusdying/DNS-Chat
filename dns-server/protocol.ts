// protocol.ts

import { privateEncrypt } from "node:crypto";

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


const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// HELPER: Manually parse Base36 string to BigInt
function base36ToBigInt(str: string): bigint {
  // We use BigInt arithmetic here to avoid precision loss
  return [...str.toLowerCase()].reduce(
    (acc, char) => acc * 36n + BigInt(parseInt(char, 36)),
    0n
  );
}

// ENCODE: String -> Base36
export function EncodeByBase36(text: string): string {
  const bytes = textEncoder.encode(text);
  
  // Convert bytes to hex string
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
    
  // Prefix with '0x' so BigInt treats it as Hex
  return BigInt("0x" + hex).toString(36);
}

// DECODE: Base36 -> String
export function DecodeByBase36(encoded: string): string {
  // 1. Base36 -> BigInt (using our custom helper) -> Hex String
  let hex = base36ToBigInt(encoded).toString(16);
  
  // Ensure even length for hex pairs (fix for leading zeros)
  if (hex.length % 2) hex = '0' + hex;
  
  // 2. Hex String -> Uint8Array
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );
  
  // 3. Bytes -> String
  return textDecoder.decode(bytes);
}

export function EncodeByBase36FromBytes(bytes: Uint8Array): string {
  //const bytes = textEncoder.encode(text);

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return BigInt("0x" + hex).toString(36);
}

export function DecodeByBase36ToBytes(encoded: string): Uint8Array {  
  let hex = base36ToBigInt(encoded).toString(16);
  
  if (hex.length % 2) hex = '0' + hex;
  
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );
  
  return bytes;//textDecoder.decode(bytes);
}

export interface Message{
  text: string;
  id: number;
  user: string;
  nonDupId: number;
}

export async function deriveKeyFromPassword(pass: string, encodedSalt: Uint8Array) {
  const enc = new TextEncoder();
  
  // A. Import the password string as "raw" key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw", 
    enc.encode(pass), 
    { name: "PBKDF2" }, 
    false, 
    ["deriveKey"]
  );

  // B. Run PBKDF2 to stretch it into a strong AES-CBC key
  let derivedKey =  crypto.subtle.deriveKey(
    {
        name: "PBKDF2",
        salt: encodedSalt as BufferSource,
        iterations: 100000, // High number slows down brute-force attacks
        hash: "SHA-256",
    },
        keyMaterial,
        { name: "AES-CBC", length: 128 },
        true, // Key is extractable (optional)
        ["encrypt", "decrypt"]
  );
  return derivedKey;
}

export async function encryptMessage(text: string, key: CryptoKey, iv: Uint8Array) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv: iv as BufferSource, // Reusing this is okay in CBC (unlike CTR), but leaks patterns.
    },
    key,
    data
  );

  return new Uint8Array(ciphertext);
}

export async function decryptMessage(ciphertext: Uint8Array, key: CryptoKey, iv: Uint8Array) {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-CBC",
      iv: iv as BufferSource,
    },
    key,
    ciphertext as BufferSource
  );

  return new TextDecoder().decode(decrypted);
}

export async function encodeAndEncryptClient(msg: Message, key: CryptoKey, iv: Uint8Array){
  const encryptText = await encryptMessage(msg.text, key, iv);
  console.log(encryptText, encryptText.length);
  const textEncoder = new TextEncoder();
  const usernamePart = textEncoder.encode(msg.user + "-");
  const nonDupIdPart = textEncoder.encode("-" + msg.nonDupId);
  const totalLength = usernamePart.length + encryptText.length  + nonDupIdPart.length;

  const result = new Uint8Array(totalLength);
  result.set(usernamePart, 0);
  result.set(encryptText, usernamePart.length);
  result.set(nonDupIdPart, usernamePart.length + encryptText.length);
  console.log(result);

  const encodedString = EncodeByBase36FromBytes(result); 
  console.log(encodedString);
  return encodedString;
}


export function decodeAndNotDecryptServer(encodedString: string) {
  const textDecoder = new TextDecoder();
  const textEncoder = new TextEncoder();
  const decodedMsg: Uint8Array = DecodeByBase36ToBytes(encodedString);

  const hyphenUint8 = textEncoder.encode("-");
  const firstHyphenIndex = decodedMsg.indexOf(hyphenUint8[0]);
  const lastHyphenIndex = decodedMsg.lastIndexOf(hyphenUint8[0]);
  const userPart = textDecoder.decode(decodedMsg.slice(0,firstHyphenIndex));
  const textPart = decodedMsg.slice(firstHyphenIndex + 1,lastHyphenIndex);
  const nonDupIdPart = textDecoder.decode(decodedMsg.slice(lastHyphenIndex + 1));
  
  let textPartFinal;
  console.log("ENC: ", textDecoder.decode(textPart));
  if(textDecoder.decode(textPart) == "ping"){
    console.log("ping")
    textPartFinal = textDecoder.decode(textPart);
  }else{
    textPartFinal = textPart.toBase64();
  }

  console.log("raw:", userPart, textPartFinal, nonDupIdPart);
  //const decryptText = await decryptMessage(textPart, key);
  //console.log(userPart + "-" + decryptText + "-" + nonDupIdPart);
  //const msg: Message = {
  //  user: userPart, 
  //  text: textPart.toBase64(), 
  //  id: 0, 
  //  nonDupId: Number(nonDupIdPart)
  //};
  let msgString = userPart + "-" + textPartFinal + "-" + nonDupIdPart;
  return msgString; 
}

export async function decryptClient(message:Message, key: CryptoKey, iv:Uint8Array) {
  const encryptBytes = Uint8Array.fromBase64(message.text); //msg.text;
  const decryptedText = await decryptMessage(encryptBytes,key, iv);
  console.log(decryptedText);
  message.text = decryptedText;
  return message;
}

// Otestování (jen pro debug, když to spustíš přímo)
if (import.meta.main) {
  const original = "Ahoj světe! 🚀";
  const encoded = encodeMessage(original);
  console.log(`Original: ${original}`);
  console.log(`Encoded:  ${encoded}`);
  console.log(`Decoded:  ${decodeMessage(encoded)}`);


  // --- Test ---
  const input = "Deno is great";
  const encodeB32 = EncodeByBase36(input);
  const decodedB32 = DecodeByBase36(encoded);

  console.log("Encoded:", encodeB32); // "elddogpih798rkezu25w"
  console.log("Decoded:", decodedB32); // "Deno is great"

}