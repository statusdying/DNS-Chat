// client.ts
import { encodeMessage } from "../dns-server/protocol.ts";
import { Message } from "../dns-server/protocol.ts";
const print = console.log;
const domain = ".my.domain.com"
let local = false;
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
    //const input = prompt("Message: ");
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

    // 2. Zakódování
    let encodedHex:string = encodeMessage(messageToEncode);

    // 2.5 Rozdělení po 63 znacích
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
    const encodedHex:string = encodeMessage(`${username}-ping-${lastMsgId}`);
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

/*
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
                websocketAddr.send(JSON.stringify(allMessages));  
                displayMessages(allMessages);
            }
        } catch(e){
            print("Malformed packets " + e);
        }
    }    
};
*/


function _usernamePrompt():string{
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

        const url = new URL(request.url);
        const usernameRaw: string|null = url.searchParams.get("username");
        
        if(username === "" && usernameRaw !== null){
            username = usernameRaw;
        }
        
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
      websocketAddr = socket;
    };
    socket.onmessage = (event) => {
      console.log("RECEIVED: "+ event.data + JSON.stringify(event.data));
      //const usernameprefix: string = "username: ";
      //if(event.data.startsWith(usernameprefix)){
      //  username = event.data.substring(usernameprefix.length)
      //}

      const parsedMsg = JSON.parse(event.data);
      const ownMsg: Message = {
        id: 0,
        text: parsedMsg.text,
        user: parsedMsg.user,
        nonDupId: parsedMsg.nonDupId
      };
      //username = parsedMsg.user;
      sendMessage(ownMsg.text);
      //allMessages.push(ownMsg);
      print("ALL MESSAGES: " + JSON.stringify(allMessages));    
      //TODO move from onmessage to DNS Client Message Received
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

//username = usernamePrompt();

setInterval(async() => {
    if(username == ""){
        return;
    }
    await receiveMessages(username);    
}, 5000);

//listenLoop();
const decoder = new TextDecoder();

for await(const chunk of Deno.stdin.readable){
    const rawtext = decoder.decode(chunk, { stream: true })
    const text = rawtext.trim();
    //const userText = `${username}-${text}`
    //print("sending text:",userText)
    if(text == "exit"){
        //socket.close();
        break;
    }

    await sendMessage(text);
}



//use chcp 65001 on Windows for Czech
