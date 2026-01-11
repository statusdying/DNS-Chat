// client.ts
import { encodeMessage } from "../dns-server/protocol.ts";
const print = console.log;
const SERVER_PORT = 5300;
const SERVER_IP = "127.0.0.1";

// ... (zde nech funkci createQueryPacket z minula) ...
function createQueryPacket(domain: string): Uint8Array {
    // ... viz minulý kód ...
    const buffer = new Uint8Array(512); const view = new DataView(buffer.buffer);
    view.setUint16(0, 1234); view.setUint16(2, 0x0100); view.setUint16(4, 1);
    let offset = 12; domain.split(".").forEach(l => {
        buffer[offset] = l.length; offset++;
        new TextEncoder().encodeInto(l, buffer.subarray(offset)); offset+=l.length;
    });
    buffer[offset] = 0; offset++; view.setUint16(offset, 1); offset+=2;
    view.setUint16(offset, 1); offset+=2; return buffer.subarray(0, offset);
}

const socket = Deno.listenDatagram({ port: 0, transport: "udp" });

// 1. Vstup od uživatele (zpráva)
let input = prompt("Message: ");
let myText:string = "empty message";
if(input != null){
    myText = input.trim();
}

console.log(`📝 Píšu zprávu: "${myText}"`);

// 2. Zakódování
let encodedHex:string = encodeMessage(myText);

// 2.5 Rozdělení po 63 znacích
const encodedHexArray = encodedHex.match(/.{1,63}/g);
if(encodedHexArray != null){
    encodedHex = encodedHexArray.join(".");    
}
const dnsQuery = `${encodedHex}.chat.local`;
print("domain query:",dnsQuery);

// 3. Odeslání
const packet = createQueryPacket(dnsQuery);
await socket.send(packet, { transport: "udp", hostname: SERVER_IP, port: SERVER_PORT });

// 4. Příjem odpovědi
const [response] = await socket.receive();

// 5. Extrakce TXT (jednoduchý parser odpovědi)
// Najdeme bajt s délkou TXT (před ním je 0x00 0x10 0x00 0x01 ... TTL ... RDLENGTH)
// HACK: Najdeme textovou odpověď tak, že najdeme '[' (začátek JSON pole)
const decoder = new TextDecoder();
const rawString = decoder.decode(response);
const jsonStartIndex = rawString.indexOf("[");
const jsonEndIndex = rawString.lastIndexOf("]");

if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
    const jsonStr = rawString.substring(jsonStartIndex, jsonEndIndex + 1);
    try {
        const chatHistory = JSON.parse(jsonStr);
        console.log("\n📬 --- CHAT HISTORIE ---");
        chatHistory.forEach((msg: string) => console.log(`> ${msg}`));
        console.log("-----------------------");
    } catch (e) {
        console.log("Nepodařilo se parsovat JSON odpověď.", e);
    }
} else {
    console.log("Odpověď neobsahuje JSON data.");
}

socket.close();