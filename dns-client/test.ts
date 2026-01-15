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

export interface Message{
  text: string;
  id: number;
}

// Otestování (jen pro debug, když to spustíš přímo)
//if (import.meta.main) {
//  const original = "Ahoj světe! 🚀";
//  const encoded = encodeMessage(original);
//  console.log(`Original: ${original}`);
//  console.log(`Encoded:  ${encoded}`);
//  console.log(`Decoded:  ${decodeMessage(encoded)}`);
//}

//console.log("Napiš 'č' a stiskni Enter:");
//for await (const chunk of Deno.stdin.readable) {
//    console.log(chunk);
//}

//const decoder = new TextDecoder();
//const textStream = Deno.stdin.readable.pipeThrough(new TextDecoderStream());
//for await (const text of textStream) {
//    console.log(text.trim());
//}


//for await(const chunk of Deno.stdin.readable){
//    
//    const rawtext = decoder.decode(chunk,  { stream: true })
//    const text = rawtext.trim();
//    console.log(text)
//
//    const encoded = encodeMessage(text);
//    console.log(`Original: ${text}`);
//    console.log(`Encoded:  ${encoded}`);
//    console.log(`Decoded:  ${decodeMessage(encoded)}`);
//
//}


// Otestování (jen pro debug, když to spustíš přímo)
//if (import.meta.main) {
//  const original = "Ahoj světe! 🚀";
//  const encoded = encodeMessage(original);
//  console.log(`Original: ${original}`);
//  console.log(`Encoded:  ${encoded}`);
//  console.log(`Decoded:  ${decodeMessage(encoded)}`);
//}




// Mapa pro překlad CP852 bajtů na české znaky
const cp852Table = {
    159: 'č', 172: 'Č',
    231: 'š', 230: 'Š',
    167: 'ž', 166: 'Ž',
    253: 'ř', 252: 'Ř',
    216: 'ě', 183: 'Ě',
    229: 'ň', 210: 'Ň',
    156: 'ť', 155: 'Ť',
    212: 'ď', 211: 'Ď',
    160: 'á', 143: 'Á',
    161: 'í', 214: 'Í',
    130: 'é', 144: 'É',
    236: 'ý', 237: 'Ý',
    163: 'ú', 233: 'Ú',
    133: 'ů', 222: 'Ů',
    148: 'ö', 153: 'Ö',
    129: 'ü', 154: 'Ü',
    132: 'ä', 142: 'Ä',
    147: 'ô', 226: 'Ô'
};

function decodeCP852(chunk) {
    let result = "";
    for (const byte of chunk) {
        // Pokud je bajt v naší tabulce, použijeme znak z tabulky
        if (cp852Table[byte]) {
            result += cp852Table[byte];
        } else {
            // Jinak použijeme standardní ASCII (funguje pro a-z, 0-9 atd.)
            result += String.fromCharCode(byte);
        }
    }
    return result;
}

console.log("Můžeš psát (CP852 fix):");

for await (const chunk of Deno.stdin.readable) {
    // Místo TextDecoderu použijeme naši funkci
    const text = decodeCP852(chunk); 
    console.log("Napsal jsi:", text.trim());
}