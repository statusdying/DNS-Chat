// client.ts
import { EncodeByBase36, EncodeByBase36FromBytes, encryptMessage, decryptClient, decodeByBase64, deriveKeyFromPassword, idGenerator } from "../dns-server/protocol.ts";
import { Message } from "../dns-server/protocol.ts";
import { config } from "../config.ts"
const print = console.log;
const domain = config.dns_server_domain;
const password = config.password;
const salt = new TextEncoder().encode(config.salt); 
const STATIC_IV = new Uint8Array(16);
const idGen: Generator = idGenerator();
let encryption = false;
let logging = false;
let local = true;
let lastMsgId: number = 0;
let sendMsgIndex = 0;
let username: string = ""
let websocketAddr: WebSocket;
const allMessages: Message[] = [];


function fixDnsEncoding(binaryString: string): string {
    // create a buffer of a same length
    const bytes = new Uint8Array(binaryString.length);
    
    // convert each symbol to byte value (0-255)
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    // decode it back as UTF8
    return new TextDecoder("utf-8").decode(bytes);
}

function generateUniqueIV(id: string|number, username: string): Uint8Array{
    const customIvFromString = new Uint8Array(16);
    print("randomIV:", id+username.substring(0,10));
    const idBytes = new TextEncoder().encode(id+username.substring(0,10));
    customIvFromString.set(idBytes, 0);
    return customIvFromString;
}

async function sendMessage(input: string){
    input = input ?? "empty message"
    const sendMsg: Message = {  
        text: input.trim(),
        id: 0,
        user: username,
        nonDupId: idGen.next().value
    };
    allMessages.push(sendMsg);
    
        let encodedMsgString;
        if (encryption) {
            const dynamic_IV:Uint8Array = generateUniqueIV(sendMsg.nonDupId, sendMsg.user);
            const encodedUsername:string = EncodeByBase36(sendMsg.user);
            const encryptedText = await encryptMessage(sendMsg.text, key, dynamic_IV);
            let encodedAndEncryptedText = EncodeByBase36FromBytes(encryptedText);
            const encodedNonDupId = sendMsg.nonDupId;
    
            const encodedTextArray = encodedAndEncryptedText.match(/.{1,63}/g);
            if(encodedTextArray){
                encodedAndEncryptedText = encodedTextArray.join(".");    
            }
            encodedMsgString = `${encodedUsername}.${encodedAndEncryptedText}.${encodedNonDupId}`;
        }else{
            const encodedUsername = EncodeByBase36(sendMsg.user);
            let encodedText = EncodeByBase36(sendMsg.text);
            const encodedNonDupId = EncodeByBase36(String(sendMsg.nonDupId));
    
            const encodedTextArray = encodedText.match(/.{1,63}/g);
            if(encodedTextArray){
                encodedText = encodedTextArray.join(".");    
            }
            encodedMsgString = `${encodedUsername}.${encodedText}.${encodedNonDupId}`;
        }


    sendMsgIndex++;
    if(sendMsgIndex > 10) sendMsgIndex = 0; 
    
    const dnsQuery = `${encodedMsgString}${domain}`;
    print("domain msg query:",dnsQuery);
    print(`Decoded: ${sendMsg.user}-${sendMsg.text}-${sendMsg.nonDupId}`)
    try{
        //using Deno.resolveDNS to send packets through DNS resolver and not directly to DNS server
        if(local == true){
            await Deno.resolveDns(dnsQuery, "TXT", {nameServer: { ipAddr: "127.0.0.1", port: 5300 }});
        } else{
            await Deno.resolveDns(dnsQuery, "TXT");
        }

    }catch(e){
        print(e);
    }
};

async function receiveMessages(username: string){
    const encodedPing:string = EncodeByBase36(username) + "." + EncodeByBase36("ping") + "." + EncodeByBase36(String(lastMsgId));
    const dnsQuery = `${encodedPing}${domain}`;

    if(logging) print("domain refresh query:", dnsQuery);

    let responses: string[][];
    if(local == true){
        responses = await Deno.resolveDns(dnsQuery, "TXT", {nameServer: { ipAddr: "127.0.0.1", port: 5300 }});
    } else{
        responses = await Deno.resolveDns(dnsQuery, "TXT");
    }

    const rawString = responses.flat().join("");

    if(logging == true){
        print("DNS raw response:" + rawString);
    }

    const fixedString = fixDnsEncoding(rawString);
    const jsonStartIndex = fixedString.indexOf("[{");
    const jsonEndIndex = fixedString.lastIndexOf("}]");
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        const jsonStr = fixedString.substring(jsonStartIndex, jsonEndIndex + 2);
        const chatHistory: Message[] = JSON.parse(jsonStr);
        chatHistory.forEach(async (msg: Message) =>{
            //console.log(`>${msg.user} ${msg.text} ${msg.id}`);
            if(encryption){
                try{
                    const dynamic_IV = generateUniqueIV(msg.nonDupId,msg.user);
                    msg = await decryptClient(msg, key, dynamic_IV);
                }catch(e){
                    print(`User: ${msg.user} is probably not using encryption!`);
                    const TextInBase64Uint8 = Uint8Array.fromBase64(msg.text);
                    msg.text = new TextDecoder().decode(TextInBase64Uint8);
                }
            }else{
                const TextInBase64Uint8 = Uint8Array.fromBase64(msg.text);
                msg.text = new TextDecoder().decode(TextInBase64Uint8);
            }

            if(msg.id>lastMsgId){
                allMessages.push(msg);
                lastMsgId = msg.id;
            }
            
        });
        websocketAddr.send(JSON.stringify(allMessages));  
        displayMessages(allMessages);
    }


};

function displayMessages(allMsgs: Message[]):void{
    if(logging == false){
        print("\x1Bc"); // clears console
    }
    print("📬 --- CHAT HISTORY ---");
    allMsgs.forEach(msg => {
        if(msg.user !== username){
            print(`\t\t\t${msg.user}: ${msg.text}`);
        }else{
            print(`You:${msg.text}`)
        }
    });
    print("-----------------------");
};
const key = await deriveKeyFromPassword(password, salt);

Deno.serve({
  port: 8081,
  async handler(request) {
    if (request.headers.get("upgrade") !== "websocket") {

        const url = new URL(request.url);
        const usernameRaw: string|null = url.searchParams.get("username");
        
        if(username === "" && usernameRaw !== null){
            username = usernameRaw;
        }

      //let file = await Deno.open("./index.html", { read: true });
      let file = await Deno.readTextFile("index.html");
      if(!encryption){
        file = file.replace(`<h1>DNS Secure Chat</h1>`,`<h1>DNS <s style="text-decoration-color: red;">Secure</s> Chat</h1>`);
      }
      return new Response(file, {
        headers: { "content-type": "text/html" },
      });
    }
    // If the request is a websocket upgrade,
    // we need to use the Deno.upgradeWebSocket helper
    const { socket, response } = Deno.upgradeWebSocket(request);

    socket.onopen = () => {
      console.log("CONNECTED");
      websocketAddr = socket;
    };
    socket.onmessage = (event) => {
      console.log("RECEIVED: "+ event.data + JSON.stringify(event.data));

      const parsedMsg = JSON.parse(event.data);
      const ownMsg: Message = {
        id: 0,
        text: parsedMsg.text,
        user: parsedMsg.user,
        nonDupId: parsedMsg.nonDupId
      };

      sendMessage(ownMsg.text);
      print("ALL MESSAGES: " + JSON.stringify(allMessages));    
      
      socket.send(JSON.stringify(allMessages));
    };
    socket.onclose = () => console.log("DISCONNECTED");
    socket.onerror = (error) => console.error("ERROR:", error);

    return response;
  },
});



try {
  const command = new Deno.Command(Deno.build.os === "windows" ? "explorer" : "open", {
    args: ["http://127.0.0.1:8081"],
  });
  command.spawn();
} catch (e) {
    print("error opening a browser:" + e);
}


setInterval(async() => {
    if(username == ""){
        return;
    }
    await receiveMessages(username);    
}, 5000);

const decoder = new TextDecoder();

for await(const chunk of Deno.stdin.readable){
    const rawtext = decoder.decode(chunk, { stream: true })
    const text = rawtext.trim();
    if(text == "exit()"){
        break;
    }

    await sendMessage(text);
}

//use chcp 65001 on Windows for Czech
