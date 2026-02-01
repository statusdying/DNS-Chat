// client.ts
import { encodeMessage, EncodeByBase36 } from "../dns-server/protocol.ts";
import { Message } from "../dns-server/protocol.ts";
import { config } from "../config.ts"
const print = console.log;
const domain = config.dns_server_domain;
const password = config.password;
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

async function sendMessage(input:string){
    // 1. Vstup od uživatele (zpráva)
    let nonNullText:string = "empty message";
    if(input != null){
        nonNullText = input;
    }
    const sendMsg:Message = {  
        text: nonNullText.trim(),
        id: 0,
        user: username,
        nonDupId: sendMsgIndex
    } 
    allMessages.push(sendMsg);
    
    // change Index for each message to get rid of duplications on serverside
    // DNS resolver can sometimes send DNS request twice
    sendMsgIndex++;
    if(sendMsgIndex > 10) sendMsgIndex = 0; 
    
    //const text = nonNullText.trim();
    const messageToEncode = `${sendMsg.user}-${sendMsg.text}-${sendMsg.nonDupId}`
    print("sending text:",messageToEncode)
    websocketAddr.send(JSON.stringify(allMessages)); 
    displayMessages(allMessages);

    let encodedHex:string = EncodeByBase36(messageToEncode);

    // Split message by 63 characters
    const encodedHexArray = encodedHex.match(/.{1,63}/g);
    if(encodedHexArray != null){
        encodedHex = encodedHexArray.join(".");    
    }
    const dnsQuery = `${encodedHex}${domain}`;
    print("domain msg query:",dnsQuery);

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
    const encodedHex:string = EncodeByBase36(`${username}-ping-${lastMsgId}`);
    const dnsQuery = `${encodedHex}${domain}`; //
    print("domain refresh query:",dnsQuery);

    let responses: string[][];
    if(local == true){
        responses = await Deno.resolveDns(dnsQuery, "TXT", {nameServer: { ipAddr: "127.0.0.1", port: 5300 }});
    } else{
        responses = await Deno.resolveDns(dnsQuery, "TXT");
    }

    const rawString = responses.flat().join("");
    print("rawString:" + rawString)

    const fixedString = fixDnsEncoding(rawString);
    const jsonStartIndex = fixedString.indexOf("[{");
    const jsonEndIndex = fixedString.lastIndexOf("}]");
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        const jsonStr = fixedString.substring(jsonStartIndex, jsonEndIndex + 2);
        const chatHistory: Message[] = JSON.parse(jsonStr);
        chatHistory.forEach((msg: Message) =>{
            //console.log(`>${msg.user} ${msg.text} ${msg.id}`);
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
    print("\x1Bc"); // clears console
    print("📬 --- CHAT HISTORY ---");
    allMsgs.forEach(msg => {
        if(msg.user !== username){
            print(`\t\t\t${msg.user}: ${msg.text}`);
        }else{
            print(`You:${msg.text}`)
        }
    });
    print("-----------------------");
}


Deno.serve({
  port: 8081,
  async handler(request) {
    if (request.headers.get("upgrade") !== "websocket") {

        const url = new URL(request.url);
        const usernameRaw: string|null = url.searchParams.get("username");
        
        if(username === "" && usernameRaw !== null){
            username = usernameRaw;
        }
        
      // If the request is a normal HTTP request,
      // we serve the client HTML file.
      const file = await Deno.open("./index.html", { read: true });
      return new Response(file.readable);
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
