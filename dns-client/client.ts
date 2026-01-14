// client.ts
import { encodeMessage } from "../dns-server/protocol.ts";
import { Message } from "../dns-server/protocol.ts";
const print = console.log;
const domain = ".chat.local"
const SERVER_PORT = 5300;
const SERVER_IP = "127.0.0.1";
const socket = Deno.listenDatagram({ port: 0, transport: "udp" , hostname: "0.0.0.0"});
let lastMsgId = 0;

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

async function sendMessage(input:string){
    // 1. Vstup od uživatele (zpráva)
    //const input = prompt("Message: ");
    let myText:string = "empty message";
    if(input != null){
        myText = input;
    }

    console.log(`📝 Píšu zprávu: "${myText}"`);

    // 2. Zakódování
    let encodedHex:string = encodeMessage(myText);

    // 2.5 Rozdělení po 63 znacích
    const encodedHexArray = encodedHex.match(/.{1,63}/g);
    if(encodedHexArray != null){
        encodedHex = encodedHexArray.join(".");    
    }
    const dnsQuery = `${encodedHex}${domain}`;
    print("domain msg query:",dnsQuery);

    // 3. Odeslání
    const packet = createQueryPacket(dnsQuery);
    await socket.send(packet, { transport: "udp", hostname: SERVER_IP, port: SERVER_PORT });
};




async function receiveMessages(lastMsgId: number){

    const dnsQuery = `${lastMsgId}${domain}`;
    print("domain refresh query:",dnsQuery);

    // 3. Odeslání
    const packet = createQueryPacket(dnsQuery);
    await socket.send(packet, { transport: "udp", hostname: SERVER_IP, port: SERVER_PORT });
};

async function listenLoop() {
    const decoder = new TextDecoder();
    for await(const [data] of socket){
        try{
            const rawString = decoder.decode(data);
            //looking for JSON in response
            const jsonStartIndex = rawString.indexOf("[");
            const jsonEndIndex = rawString.lastIndexOf("]");
            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                const jsonStr = rawString.substring(jsonStartIndex, jsonEndIndex + 1);
                const chatHistory: Message[] = JSON.parse(jsonStr);
                console.log("\n📬 --- CHAT HISTORY ---");
                chatHistory.forEach((msg: Message) => console.log(`> ${msg.text} ${msg.id}`));
                console.log("-----------------------");
            }
        } catch(e){
            print("Malformed packets " + e);
        }
    }    
}

setInterval(async() => {
    await receiveMessages(lastMsgId);    
}, 10000);

listenLoop();

const decoder = new TextDecoder();

for await(const chunk of Deno.stdin.readable){
    const text = decoder.decode(chunk).trim();
    print("sending text:",text)
    if(text == "exit"){
        socket.close();
        break;
    }
    await sendMessage(text);
}


