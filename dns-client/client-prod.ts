// client.ts
import { encodeMessage, EncodeByBase36, encodeAndEncryptClient, decryptClient } from "../dns-server/protocol.ts";
import { encryptMessage, deriveKeyFromPassword } from "../dns-server/protocol.ts"
import { Message } from "../dns-server/protocol.ts";
import { config } from "../config.ts"

const print = console.log;
const domain: string = config.dns_server_domain;
const password: string = config.password;
const salt = new TextEncoder().encode(config.salt); 
const STATIC_IV = new Uint8Array(16);
let logging = true;
let local = true;
let lastMsgId: number = 0;
let username: string = "";
let sendMsgIndex = 0;
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
    let myText:string = "empty message";
    if(input != null){
        myText = input;
    }

    const sendMsg: Message = {  
        text: myText,
        id: 0,
        user: username,
        nonDupId: sendMsgIndex
    };

    allMessages.push(sendMsg);

    let encodedMsgString  = await encodeAndEncryptClient(sendMsg, key, STATIC_IV);
    
    const allTextToEncode = `${sendMsg.user}-${sendMsg.text}-${sendMsg.nonDupId}`;

    sendMsgIndex++;
    if(sendMsgIndex > 10) sendMsgIndex = 0; 

    let encodedHex:string = EncodeByBase36(allTextToEncode);

    // 2.5 Split message by 63 chars
    const encodedHexArray = encodedHex.match(/.{1,63}/g);
    if(encodedHexArray != null){
        encodedHex = encodedHexArray.join(".");    
    }
    const dnsQuery = `${encodedMsgString}${domain}`;

    if(logging == true){
        print(`📝 Sending message: "${allTextToEncode}"`);
        print("domain msg query:",dnsQuery);
    }

    displayMessages(allMessages); 

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
    const dnsQuery = `${encodedHex}${domain}`; 

    if(logging == true){
        print("domain refresh query:",dnsQuery);
    }

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
            msg = await decryptClient(msg, key, STATIC_IV);
            if(msg.id>lastMsgId){
                ///msg.text = decryptClient(msg.text, key, STATIC_IV);
                allMessages.push(msg);
                displayMessages(allMessages);
                lastMsgId = msg.id;
            }
            
        });
        
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

function usernamePrompt():string{
    let usernameTmp;
    while(usernameTmp == "" || usernameTmp == null){
        usernameTmp = prompt("Username:");
    }
    return usernameTmp;
};

const key = await deriveKeyFromPassword(password, salt);



username = usernamePrompt();

await receiveMessages(username);

setInterval(async() => {
    await receiveMessages(username);    
}, 5000);

const decoder = new TextDecoder();

for await(const chunk of Deno.stdin.readable){
    const rawtext = decoder.decode(chunk, { stream: true })
    const text = rawtext.trim();
    const userText = `${username}-${text}`
    if(text == "exit()"){
        break;
    }

    await sendMessage(text);
}

//use chcp 65001 on Windows for Czech
