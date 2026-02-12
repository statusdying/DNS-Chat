import { config } from "./config-example.ts";
import { encodeMessage, Message } from "./dns-server/protocol.ts";

const msg: Message = { 
  user: "User0", 
  text: "Hello How are you?",
  id: 0,
  nonDupId: 0  
}

const encryptMsg: Message = {
  user: "User1",
  text: "kF94YCU0EQ8+3TS7TiFqK9ctBuAeQ3DcIxHSoRsRGX8=",
  id: 0,
  nonDupId: 0
}


// 1. Your shared human-readable password
const password = "my-super-secret-password";

// 2. A "Salt" makes the password harder to crack. 
// Ideally, this should be random and shared, but for a hardcoded app, 
// you can use a fixed string (though less secure against rainbow tables).
const salt = new TextEncoder().encode("dns-chat-application-salt"); 

async function deriveKeyFromPassword(pass: string, encodedSalt: Uint8Array) {
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

// --- Usage ---

// Get the actual crypto Key object
const key = await deriveKeyFromPassword(password, salt);
// Now use this 'key' with the encrypt/decrypt functions from the previous answer.

// 2. Define a Static IV (Initialization Vector)
// Since your ID is always the same/reused, we can just use a zero-filled IV
// or derive it from your 1-2 byte ID.
const STATIC_IV = new Uint8Array(16); // 16 bytes of zeros

// Optional: If you have a 2-byte ID (e.g., 500), you can put it in the IV
// just to bind it to that channel, even if it doesn't change.
const channelId = 500;
new DataView(STATIC_IV.buffer).setUint16(0, channelId); 

/**
 * ENCRYPT
 */
export async function encryptMessage(text: string, key: CryptoKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv: STATIC_IV, // Reusing this is okay in CBC (unlike CTR), but leaks patterns.
    },
    key,
    data
  );

  return new Uint8Array(ciphertext);
}

/**
 * DECRYPT
 */
export async function decryptMessage(ciphertext: Uint8Array, key: CryptoKey) {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-CBC",
      iv: STATIC_IV,
    },
    key,
    ciphertext as BufferSource
  );

  return new TextDecoder().decode(decrypted);
}



// to add string to IV 
const id = "aa"; 

// 1. Create a 16-byte buffer filled with zeros
const customIvFromString = new Uint8Array(16);

// 2. Convert string "aa" to bytes and copy them into the IV
const idBytes = new TextEncoder().encode(id); // "aa" becomes [97, 97]
customIvFromString.set(idBytes, 0);

// to add number to IV
const idNumber = 0xAAAA; // or 43690

const customIvfromNumber = new Uint8Array(16);
const view = new DataView(customIvfromNumber.buffer);

// Write the 2-byte number at the start (index 0)
// 'false' means Big Endian (standard network byte order)
view.setUint16(0, idNumber, false);


// --- Usage Example ---

const msg1 = "Hello World";
const msg2 = "Hello Deno"; // Similar start

// Notice: We use the same Logic/ID for both
const enc1 = await encryptMessage(msg1, key);
const enc2 = await encryptMessage(msg2, key);

console.log("Encrypted 1:", enc1, new TextDecoder().decode(enc1));
console.log("Encrypted 2:", enc2);

// Because the messages start with "Hello ", the first 16-byte block
// might actually be different because CBC XORs the plaintext with the IV.
// But if you sent "Hello World" TWICE, the output would be identical.

console.log("Decrypted 1:", await decryptMessage(enc1, key));



const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function base36ToBigInt(str: string): bigint {
  return [...str.toLowerCase()].reduce(
    (acc, char) => acc * 36n + BigInt(parseInt(char, 36)),
    0n
  );
}

export function EncodeByBase36(bytes: Uint8Array): string {
  //const bytes = textEncoder.encode(text);

  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");

  return BigInt("0x" + hex).toString(36);
}

export function DecodeByBase36(encoded: string): Uint8Array {  
  let hex = base36ToBigInt(encoded).toString(16);
  
  if (hex.length % 2) hex = '0' + hex;
  
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );
  
  return bytes;//textDecoder.decode(bytes);
}

const encr21 = await encryptMessage(msg1, key);
const encr22 = await encryptMessage(msg2, key);

const encod21 = EncodeByBase36(encr21);
const encod22 = EncodeByBase36(encr22)

const decod21 = DecodeByBase36(encod21);
const decod22 = DecodeByBase36(encod22);

const decr21 = await decryptMessage(decod21,key);
const decr22 = await decryptMessage(decod22,key);







console.log("Encrypted 11:", encr21);
console.log("Encrypted 11:", encr22);

console.log("Encoded 11", encod21)
console.log("Encoded 11", encod22)

console.log("Encoded 11", decod21)
console.log("Encoded 11", decod22)

console.log("Decrypted 11:", decr21);
console.log("Decrypted 11:", decr22);

let test_encrypt_bytes:Uint8Array = new Uint8Array();

export async function encodeAndEncryptClient(msg: Message, key: CryptoKey){
  const encryptText = await encryptMessage(msg.text, key);
  console.log(encryptText, encryptText.length, encryptText.toBase64());
  test_encrypt_bytes = encryptText;
  const textEncoder = new TextEncoder();
  const usernamePart = textEncoder.encode(msg.user + "-");
  const nonDupIdPart = textEncoder.encode("-" + msg.nonDupId);
  const totalLength = usernamePart.length + encryptText.length  + nonDupIdPart.length;

  let result = new Uint8Array(totalLength);
  result.set(usernamePart, 0);
  result.set(encryptText, usernamePart.length);
  result.set(nonDupIdPart, usernamePart.length + encryptText.length);
  console.log(result);

  const encodedString =  EncodeByBase36(result); 
  console.log(encodedString);
  return encodedString;
}




export async function decodeAndDecryptServer(encodedString: string, key: CryptoKey){
  let textDecoder = new TextDecoder();
  let textEncoder = new TextEncoder();
  const decodedMsg: Uint8Array = DecodeByBase36(encodedString);

  let hyphenUint8 = textEncoder.encode("-");
  let firstHyphenIndex = decodedMsg.indexOf(hyphenUint8[0]);
  let lastHyphenIndex = decodedMsg.lastIndexOf(hyphenUint8[0]);
  const userPart = textDecoder.decode(decodedMsg.slice(0,firstHyphenIndex));
  const textPart = decodedMsg.slice(firstHyphenIndex + 1,lastHyphenIndex);
  const nonDupIdPart = textDecoder.decode(decodedMsg.slice(lastHyphenIndex + 1));
  console.log(userPart, textPart, nonDupIdPart);
  const decryptText = await decryptMessage(textPart, key);
  console.log(userPart + "-" + decryptText + "-" + nonDupIdPart);
}

let x = await encodeAndEncryptClient(msg, key);
let y = await decodeAndDecryptServer(x, key);

console.log("test bytes:", test_encrypt_bytes);

const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
const encoded = data.toBase64();
const decoded = Uint8Array.fromBase64(encoded);
console.log(encoded, decoded);

//let stringed = test_encrypt_bytes.toBase64()


export async function decryptClient(message:Message, key: CryptoKey) {
  let encryptBytes = Uint8Array.fromBase64(message.text); //msg.text;
  let decryptedText = await decryptMessage(encryptBytes,key);
  console.log(decryptedText);
  message.text = decryptedText;
  return message;
}

let decryptMsg = await decryptClient(encryptMsg, key);
console.log(decryptMsg);

export async function decodeAndNotDecryptServer(encodedString: string) {
  let textDecoder = new TextDecoder();
  let textEncoder = new TextEncoder();
  const decodedMsg: Uint8Array = DecodeByBase36(encodedString);

  let hyphenUint8 = textEncoder.encode("-");
  let firstHyphenIndex = decodedMsg.indexOf(hyphenUint8[0]);
  let lastHyphenIndex = decodedMsg.lastIndexOf(hyphenUint8[0]);
  const userPart = textDecoder.decode(decodedMsg.slice(0,firstHyphenIndex));
  const textPart = decodedMsg.slice(firstHyphenIndex + 1,lastHyphenIndex);
  const nonDupIdPart = textDecoder.decode(decodedMsg.slice(lastHyphenIndex + 1));
  console.log("raw:", userPart, textPart.toBase64(), nonDupIdPart);
  //const decryptText = await decryptMessage(textPart, key);
  //console.log(userPart + "-" + decryptText + "-" + nonDupIdPart);
}

let o = decodeAndNotDecryptServer(x);