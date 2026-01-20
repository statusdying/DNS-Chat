// client.ts
import { json } from "node:stream/consumers";
import { encodeMessage } from "../dns-server/protocol.ts";
import { Message } from "../dns-server/protocol.ts";
const print = console.log;
const domain = ".chat.local"
const SERVER_PORT = 5300;
const SERVER_IP = "127.0.0.1";
const socket = Deno.listenDatagram({ port: 0, transport: "udp" , hostname: "0.0.0.0"});
let lastMsgId:number = 0;
let username: string = ""
const allMessages: Message[] = [];

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

async function receiveMessages(username: string, lastMsgId: number){
    const encodedHex:string = encodeMessage(`${username}-ping-${lastMsgId}`);
    const dnsQuery = `${encodedHex}${domain}`; //
    print("domain refresh query:",dnsQuery);

    // 3. Odeslání
    const packet = createQueryPacket(dnsQuery);
    await socket.send(packet, { transport: "udp", hostname: SERVER_IP, port: SERVER_PORT });
};

function displayMessages(allMsgs: Message[]):void{
    print("\n📬 --- CHAT HISTORY ---");
    allMsgs.forEach(msg => {
        if(msg.user !== username){
            print(`\t\t\t${msg.user}: ${msg.text}`);
        }else{
            print(`You:${msg.text}`)
        }
    });
    print("-----------------------");
}

async function listenLoop() {
    const decoder = new TextDecoder();
    for await(const [data] of socket){
        try{
            const rawString = decoder.decode(data);
            //looking for JSON in response
            print("rawString:" + rawString)
            const jsonStartIndex = rawString.indexOf("[{");
            const jsonEndIndex = rawString.lastIndexOf("}]");
            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                const jsonStr = rawString.substring(jsonStartIndex, jsonEndIndex + 2);
                const chatHistory: Message[] = JSON.parse(jsonStr);
                chatHistory.forEach((msg: Message) =>{
                    //console.log(`>${msg.user} ${msg.text} ${msg.id}`);
                    if(msg.id>lastMsgId){
                        allMessages.push(msg);
                        lastMsgId = msg.id;
                    }
                    
                    
                });
                displayMessages(allMessages);
            }
        } catch(e){
            print("Malformed packets " + e);
        }
    }    
};



function usernamePrompt():string{
    let usernameTmp;
    while(usernameTmp == "" || usernameTmp == null){
        usernameTmp = prompt("Username:");
    }
    return usernameTmp;
}

Deno.serve({
  port: 8081,
  async handler(request) {
    if (request.headers.get("upgrade") !== "websocket") {
      // If the request is a normal HTTP request,
      // we serve the client HTML file.
      const file = await Deno.open("./index-copy.html", { read: true });
      return new Response(file.readable);
    }
    // If the request is a websocket upgrade,
    // we need to use the Deno.upgradeWebSocket helper
    const { socket, response } = Deno.upgradeWebSocket(request);

    socket.onopen = () => {
      console.log("CONNECTED");
    };
    socket.onmessage = (event) => {
      console.log("RECEIVED: "+ JSON.stringify(event.data));
      let ownMsg: Message = {
        id: 0,
        text: JSON.stringify(event.data),
        user: username
      };
      allMessages.push(ownMsg);
      //TODO move from onmessage to DNS Client Message Received
      socket.send(JSON.stringify(allMessages));
    };
    socket.onclose = () => console.log("DISCONNECTED");
    socket.onerror = (error) => console.error("ERROR:", error);

    return response;
  },
});


username = usernamePrompt();

setInterval(async() => {
    await receiveMessages(username, lastMsgId);    
}, 5000);

listenLoop();
const decoder = new TextDecoder();

for await(const chunk of Deno.stdin.readable){
    const rawtext = decoder.decode(chunk, { stream: true })
    const text = rawtext.trim();
    const userText = `${username}-${text}`
    print("sending text:",userText)
    if(text == "exit"){
        socket.close();
        break;
    }
    const sendMsg:Message = {  
        text: text,
        id: 0,
        user: username
    } 
    allMessages.push(sendMsg);
    await sendMessage(userText);
}

const messages: Message[] = 
[
    {
        text: "msg1",
        id: 1,
        user: "Ja"
    },
    {
        text: "msg2",
        id: 2,
        user: "User2"
    },
        {
        text: "msg3",
        id: 3,
        user: "User3"
    }
];



//use chcp 65001 on Windows for Czech
